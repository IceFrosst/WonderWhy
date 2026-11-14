package com.junction2026.lens

import android.content.Context

object Prefs {
    const val DEFAULT_BRIDGE = "https://lens.167-71-139-39.sslip.io"
    private fun sp(c: Context) = c.getSharedPreferences("lens", Context.MODE_PRIVATE)
    fun mock(c: Context) = sp(c).getBoolean("mock", true)
    fun setMock(c: Context, v: Boolean) = sp(c).edit().putBoolean("mock", v).apply()
    fun bridge(c: Context) = sp(c).getString("bridge", DEFAULT_BRIDGE) ?: DEFAULT_BRIDGE
    fun setBridge(c: Context, v: String) = sp(c).edit().putString("bridge", v).apply()
    /** "Demo data (no bridge)": fixture answers instead of camera + bridge. Off by default. */
    fun fixture(c: Context) = sp(c).getBoolean("fixture", false)
    /** Camera only: no glasses Display capability, so the Web App can stay on screen and show the result. */
    fun cameraOnly(c: Context) = sp(c).getBoolean("cameraOnly", false)
    fun setCameraOnly(c: Context, v: Boolean) = sp(c).edit().putBoolean("cameraOnly", v).apply()
    fun askWithPhoto(c: Context) = sp(c).getBoolean("askWithPhoto", false)
    fun setAskWithPhoto(c: Context, v: Boolean) = sp(c).edit().putBoolean("askWithPhoto", v).apply()
    fun setFixture(c: Context, v: Boolean) = sp(c).edit().putBoolean("fixture", v).apply()
    fun bridgeToken(c: Context) = sp(c).getString("bridgeToken", "") ?: ""
    fun setBridgeToken(c: Context, v: String) = sp(c).edit().putString("bridgeToken", v).apply()
    /** Language picker on the phone screen: "" = phone language, else one of [Lang.SUPPORTED]. */
    fun lang(c: Context) = sp(c).getString("lang", "") ?: ""
    fun setLang(c: Context, v: String) = sp(c).edit().putString("lang", v).apply()
    /** First-run consent: the wearer agreed to photos being sent to the bridge and a model. */
    fun consent(c: Context) = sp(c).getBoolean("consent", false)
    fun setConsent(c: Context, v: Boolean) = sp(c).edit().putBoolean("consent", v).apply()
    /** "Seen today" as JSON ([Journal.toJson]); no pictures. */
    fun journal(c: Context) = sp(c).getString("journal", "") ?: ""
    fun setJournal(c: Context, v: String) = sp(c).edit().putString("journal", v).apply()
    /** "Glasses check" verdicts and notes as JSON ([GlassesCheck.encode]). */
    fun glassesCheck(c: Context) = sp(c).getString("glassesCheck", "") ?: ""
    fun setGlassesCheck(c: Context, v: String) = sp(c).edit().putString("glassesCheck", v).apply()
}
