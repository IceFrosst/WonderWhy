package com.junction2026.lens

import android.content.Context

object Prefs {
    const val DEFAULT_BRIDGE = "https://lens.167-71-139-39.sslip.io"
    private fun sp(c: Context) = c.getSharedPreferences("lens", Context.MODE_PRIVATE)
    fun mock(c: Context) = sp(c).getBoolean("mock", true)
    fun setMock(c: Context, v: Boolean) = sp(c).edit().putBoolean("mock", v).apply()
    fun bridge(c: Context) = sp(c).getString("bridge", DEFAULT_BRIDGE) ?: DEFAULT_BRIDGE
    fun setBridge(c: Context, v: String) = sp(c).edit().putString("bridge", v).apply()
}
