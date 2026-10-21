package com.zzzode.leanon.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.bluetooth.BluetoothStatusCodes
import android.os.Build
import com.lynx.react.bridge.JavaOnlyMap
import com.zzzode.leanon.bridge.PendingRequest
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import java.util.UUID

/** Internal lifecycle state; [wire] maps to the bridge `ScaleConnectionState`. */
enum class BleState {
  IDLE,
  SCANNING,
  CONNECTING,
  CONNECTED,
  ;

  fun wire(): String = name.lowercase()
}

/** A discovered scale, matching the bridge `ScaleDeviceDto`. */
data class ScaleDevice(
  val deviceId: String,
  val name: String,
  val rssi: Int,
)

/** Sink the manager reports through; the native module turns these into events. */
interface BleScaleListener {
  fun onDeviceFound(device: ScaleDevice)
  fun onStateChanged(state: BleState)
  fun onReading(deviceId: String, weightKg: Double)
  /** A stable error code (see RpcErrorCode) plus a human-readable message. */
  fun onError(code: String, message: String)
}

/**
 * Scans for, connects to and receives readings from a standard Bluetooth SIG
 * Weight Scale (`0x181D` / `0x2A9D`). It owns the GATT client and remembers the
 * paired device in preferences; guards permission loss during asynchronous work.
 * Proprietary scales are out of scope (RFC 0011).
 */
class BleScaleManager(context: Context) {

  private val appContext: Context = context.applicationContext
  private val preferences =
    appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  private val mainHandler = Handler(Looper.getMainLooper())

  // RPC ownership is process-wide; a later Lynx module may become the event sink.
  internal val pendingAction = PendingRequest<JavaOnlyMap>()
  private val subscription = BleSubscription()
  private var listener: BleScaleListener? = null
  private var state: BleState = BleState.IDLE
  private var gatt: BluetoothGatt? = null
  private var scanner: BluetoothLeScanner? = null
  private val found = LinkedHashMap<String, ScaleDevice>()
  private val scanTimeout = Runnable { if (state == BleState.SCANNING) stopScan() }

  private val adapter: BluetoothAdapter? by lazy {
    val manager =
      appContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    manager?.adapter
  }

  fun setListener(value: BleScaleListener?) {
    listener = value
  }

  fun getState(): BleState = state

  fun getPairedDeviceId(): String? =
    preferences.getString(KEY_PAIRED_DEVICE, null)

  fun isBluetoothReady(): Boolean = try {
    adapter?.isEnabled == true
  } catch (_: SecurityException) {
    false
  }

  /** Start a filtered scan; results are de-duplicated and the scan auto-stops. */
  fun startScan() {
    if (!BlePermissions.areGranted(appContext)) {
      permissionDenied()
      return
    }
    try {
      val current = adapter
      if (current == null || !current.isEnabled) {
        listener?.onError("unavailable", "Bluetooth is turned off")
        return
      }
      val currentScanner = current.bluetoothLeScanner
      if (currentScanner == null) {
        listener?.onError("unavailable", "Bluetooth scanning is not available")
        return
      }
      found.clear()
      val filters = listOf(
        ScanFilter.Builder()
          .setServiceUuid(ParcelUuid(WEIGHT_SCALE_SERVICE))
          .build(),
      )
      val settings = ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
        .build()
      currentScanner.startScan(filters, settings, scanCallback)
      scanner = currentScanner
      updateState(BleState.SCANNING)
      mainHandler.removeCallbacks(scanTimeout)
      mainHandler.postDelayed(scanTimeout, SCAN_TIMEOUT_MS)
    } catch (_: SecurityException) {
      permissionDenied()
    }
  }

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      if (state != BleState.SCANNING) return
      val remote = result.device ?: return
      try {
        val device = ScaleDevice(
          deviceId = remote.address,
          name = remote.name ?: "Scale",
          rssi = result.rssi,
        )
        if (!found.containsKey(device.deviceId)) {
          found[device.deviceId] = device
          listener?.onDeviceFound(device)
        }
      } catch (_: SecurityException) {
        permissionDenied()
      }
    }

    override fun onScanFailed(errorCode: Int) {
      scanner = null
      mainHandler.removeCallbacks(scanTimeout)
      updateState(BleState.IDLE)
      listener?.onError("unavailable", "Bluetooth scan failed ($errorCode)")
    }
  }

  fun stopScan() {
    mainHandler.removeCallbacks(scanTimeout)
    val currentScanner = scanner
    scanner = null
    try {
      currentScanner?.stopScan(scanCallback)
    } catch (_: SecurityException) {
      permissionDenied()
    } finally {
      if (state == BleState.SCANNING) updateState(BleState.IDLE)
    }
  }

  /** Connect to a discovered or previously paired device. */
  fun connect(deviceId: String) {
    if (!BlePermissions.areGranted(appContext)) {
      permissionDenied()
      return
    }
    try {
      val remote = adapter?.getRemoteDevice(deviceId)
      if (remote == null) {
        listener?.onError("invalid-request", "Unknown scale device")
        return
      }
      gatt?.close()
      gatt = null
      subscription.reset()
      updateState(BleState.CONNECTING)
      gatt = remote.connectGatt(appContext, false, gattCallback)
    } catch (_: SecurityException) {
      permissionDenied()
    } catch (_: IllegalArgumentException) {
      listener?.onError("invalid-request", "Invalid scale device address")
    }
  }

  private val gattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(
      gatt: BluetoothGatt,
      status: Int,
      newState: Int,
    ) {
      if (this@BleScaleManager.gatt !== gatt) return
      try {
        when (newState) {
          BluetoothGatt.STATE_CONNECTED -> gatt.discoverServices()
          BluetoothGatt.STATE_DISCONNECTED -> {
            if (status != BluetoothGatt.GATT_SUCCESS || state == BleState.CONNECTING) {
              listener?.onError("unavailable", "Scale connection failed before readings were ready")
            }
            subscription.reset()
            gatt.close()
            this@BleScaleManager.gatt = null
            updateState(BleState.IDLE)
          }
        }
      } catch (_: SecurityException) {
        permissionDenied()
      }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      if (this@BleScaleManager.gatt !== gatt) return
      try {
        if (status != BluetoothGatt.GATT_SUCCESS) {
          listener?.onError("unavailable", "Service discovery failed")
          gatt.disconnect()
          return
        }
        val service = gatt.getService(WEIGHT_SCALE_SERVICE)
        val characteristic = service?.getCharacteristic(WEIGHT_MEASUREMENT)
        if (service == null || characteristic == null) {
          listener?.onError(
            "unavailable",
            "This scale does not expose the standard Weight Scale service",
          )
          gatt.disconnect()
          return
        }
        val descriptor = characteristic.getDescriptor(CLIENT_CONFIG)
        if (descriptor == null || !gatt.setCharacteristicNotification(characteristic, true)) {
          listener?.onError("unavailable", "Scale readings cannot be subscribed")
          gatt.disconnect()
          return
        }
        subscription.begin(gatt)
        val accepted = if (Build.VERSION.SDK_INT >= 33) {
          gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_INDICATION_VALUE) == BluetoothStatusCodes.SUCCESS
        } else {
          @Suppress("DEPRECATION")
          descriptor.value = BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
          @Suppress("DEPRECATION")
          gatt.writeDescriptor(descriptor)
        }
        if (!accepted) {
          subscription.reset()
          listener?.onError("unavailable", "Scale subscription request failed")
          gatt.disconnect()
        }
      } catch (_: SecurityException) {
        permissionDenied()
      }
    }

    override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      if (this@BleScaleManager.gatt !== gatt || descriptor.uuid != CLIENT_CONFIG) return
      when (subscription.acknowledge(gatt, status == BluetoothGatt.GATT_SUCCESS)) {
        SubscriptionAcknowledgement.READY -> try {
          preferences.edit().putString(KEY_PAIRED_DEVICE, gatt.device.address).apply()
          updateState(BleState.CONNECTED)
        } catch (_: SecurityException) { permissionDenied() }
        SubscriptionAcknowledgement.FAILED -> {
          listener?.onError("unavailable", "Scale subscription acknowledgement failed")
          try { gatt.disconnect() } catch (_: SecurityException) { permissionDenied() }
        }
        SubscriptionAcknowledgement.IGNORED -> Unit
      }
    }

    // Characteristic value callback on API < 33.
    @Deprecated("Deprecated in API 33")
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
    ) {
      if (this@BleScaleManager.gatt === gatt && state == BleState.CONNECTED) handleValue(characteristic.value)
    }

    // Characteristic value callback on API >= 33.
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray,
    ) {
      if (this@BleScaleManager.gatt === gatt && state == BleState.CONNECTED) handleValue(value)
    }
  }

  private fun handleValue(value: ByteArray?) {
    if (value == null) return
    val parsed = WeightMeasurementParser.parse(value) ?: return
    try {
      val deviceId = gatt?.device?.address ?: return
      listener?.onReading(deviceId, parsed.weightKg)
    } catch (_: SecurityException) {
      permissionDenied()
    }
  }

  fun disconnect() {
    subscription.reset()
    listener?.onError("unavailable", "Scale action cancelled by disconnect")
    try {
      gatt?.disconnect()
    } catch (_: SecurityException) {
      permissionDenied()
    }
  }

  private fun permissionDenied() {
    val connection = gatt
    val currentScanner = scanner
    gatt = null
    scanner = null
    subscription.reset()
    mainHandler.removeCallbacks(scanTimeout)
    updateState(BleState.IDLE)
    // Cleanup may itself require the revoked permission. Drop local ownership
    // regardless, and make one best-effort attempt to release platform resources.
    try {
      currentScanner?.stopScan(scanCallback)
    } catch (error: SecurityException) {
      Log.w(TAG, "Cannot stop Bluetooth scan after permission loss", error)
    }
    try {
      connection?.close()
    } catch (error: SecurityException) {
      Log.w(TAG, "Cannot close Bluetooth connection after permission loss", error)
    }
    listener?.onError("not-authorized", "Bluetooth permission denied")
  }

  private fun updateState(next: BleState) {
    if (state == next) return
    state = next
    listener?.onStateChanged(next)
  }

  private companion object {
    const val TAG = "BleScaleManager"
    const val PREFS_NAME = "leanon-scale"
    const val KEY_PAIRED_DEVICE = "paired-device"
    const val SCAN_TIMEOUT_MS = 15_000L

    val WEIGHT_SCALE_SERVICE: UUID =
      UUID.fromString("0000181D-0000-1000-8000-00805f9b34fb")
    val WEIGHT_MEASUREMENT: UUID =
      UUID.fromString("00002A9D-0000-1000-8000-00805f9b34fb")
    val CLIENT_CONFIG: UUID =
      UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
  }
}
