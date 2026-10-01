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
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
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
 * paired device in preferences; runtime permissions are checked by the caller.
 * Proprietary scales are out of scope (RFC 0011).
 */
class BleScaleManager(context: Context) {

  private val appContext: Context = context.applicationContext
  private val preferences =
    appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  private val mainHandler = Handler(Looper.getMainLooper())

  private var listener: BleScaleListener? = null
  private var state: BleState = BleState.IDLE
  private var gatt: BluetoothGatt? = null
  private val found = LinkedHashMap<String, ScaleDevice>()

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

  fun isBluetoothReady(): Boolean = adapter?.isEnabled == true

  /** Start a filtered scan; results are de-duplicated and the scan auto-stops. */
  fun startScan() {
    val current = adapter
    if (current == null || !current.isEnabled) {
      listener?.onError("unavailable", "Bluetooth is turned off")
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
    updateState(BleState.SCANNING)
    current.bluetoothLeScanner?.startScan(filters, settings, scanCallback)
    mainHandler.postDelayed(
      { if (state == BleState.SCANNING) stopScan() },
      SCAN_TIMEOUT_MS,
    )
  }

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      val remote = result.device ?: return
      val device = ScaleDevice(
        deviceId = remote.address,
        name = remote.name ?: "Scale",
        rssi = result.rssi,
      )
      if (!found.containsKey(device.deviceId)) {
        found[device.deviceId] = device
        listener?.onDeviceFound(device)
      }
    }

    override fun onScanFailed(errorCode: Int) {
      updateState(BleState.IDLE)
      listener?.onError("unavailable", "Bluetooth scan failed ($errorCode)")
    }
  }

  fun stopScan() {
    val scanner: BluetoothLeScanner? = adapter?.bluetoothLeScanner
    scanner?.stopScan(scanCallback)
    if (state == BleState.SCANNING) updateState(BleState.IDLE)
  }

  /** Connect to a discovered or previously paired device. */
  fun connect(deviceId: String) {
    val remote = adapter?.getRemoteDevice(deviceId)
    if (remote == null) {
      listener?.onError("invalid-request", "Unknown scale device")
      return
    }
    updateState(BleState.CONNECTING)
    gatt?.close()
    gatt = remote.connectGatt(appContext, false, gattCallback)
  }

  private val gattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(
      gatt: BluetoothGatt,
      status: Int,
      newState: Int,
    ) {
      when (newState) {
        BluetoothGatt.STATE_CONNECTED -> gatt.discoverServices()
        BluetoothGatt.STATE_DISCONNECTED -> {
          if (status != BluetoothGatt.GATT_SUCCESS) {
            listener?.onError("unavailable", "Scale connection failed")
          }
          gatt.close()
          this@BleScaleManager.gatt = null
          updateState(BleState.IDLE)
        }
      }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
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
      gatt.setCharacteristicNotification(characteristic, true)
      val descriptor = characteristic.getDescriptor(CLIENT_CONFIG)
      if (descriptor != null) {
        descriptor.value = BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
        gatt.writeDescriptor(descriptor)
      }
      preferences.edit()
        .putString(KEY_PAIRED_DEVICE, gatt.device.address)
        .apply()
      updateState(BleState.CONNECTED)
    }

    // Characteristic value callback on API < 33.
    @Deprecated("Deprecated in API 33")
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
    ) {
      handleValue(characteristic.value)
    }

    // Characteristic value callback on API >= 33.
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray,
    ) {
      handleValue(value)
    }
  }

  private fun handleValue(value: ByteArray?) {
    if (value == null) return
    val parsed = WeightMeasurementParser.parse(value) ?: return
    val deviceId = gatt?.device?.address ?: return
    listener?.onReading(deviceId, parsed.weightKg)
  }

  fun disconnect() {
    gatt?.disconnect()
  }

  private fun updateState(next: BleState) {
    if (state == next) return
    state = next
    listener?.onStateChanged(next)
  }

  private companion object {
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
