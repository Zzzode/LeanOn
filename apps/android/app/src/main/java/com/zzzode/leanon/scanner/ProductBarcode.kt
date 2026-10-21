package com.zzzode.leanon.scanner

/** GS1 modulo-10 GTIN validation; UPC-A and its EAN-13 alias share one catalog ID. */
internal object ProductBarcode {
  fun normalize(value: String): String? {
    val digits = value.trim()
    if (digits.length !in listOf(8, 12, 13, 14) || digits.any { it !in '0'..'9' } || digits.all { it == '0' }) return null
    var sum = 0
    digits.dropLast(1).reversed().forEachIndexed { index, c ->
      sum += (c - '0') * if (index % 2 == 0) 3 else 1
    }
    if ((10 - sum % 10) % 10 != digits.last() - '0') return null
    return if (digits.length == 12) "0$digits" else digits
  }

  /** ML Kit marks UPC-E separately: expand its six payload digits before checksum validation. */
  fun normalizeUpcE(value: String): String? {
    if (value.length != 8 || value.any { it !in '0'..'9' } || value[0] !in "01") return null
    val n = value[0]; val d = value.substring(1, 7); val check = value[7]
    val expanded = when (d[5]) {
      '0', '1', '2' -> "$n${d.substring(0, 2)}${d[5]}0000${d.substring(2, 5)}$check"
      '3' -> "$n${d.substring(0, 3)}00000${d.substring(3, 5)}$check"
      '4' -> "$n${d.substring(0, 4)}00000${d[4]}$check"
      else -> "$n${d.substring(0, 5)}0000${d[5]}$check"
    }
    return normalize(expanded)
  }
}
