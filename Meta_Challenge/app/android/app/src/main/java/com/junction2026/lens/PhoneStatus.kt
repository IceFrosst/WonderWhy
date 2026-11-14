package com.junction2026.lens

/**
 * The phone screen's one status line, "Glasses connected · 100% · Bridge online", as parts; a part that is
 * failing is shown in the hot colour. Pure, for JVM tests.
 */
object PhoneStatus {
    data class Part(val text: String, val bad: Boolean = false)

    /** Session states (`sessionStatus`) in which a session exists: the title button says Disconnect. */
    private val LIVE = setOf("IDLE", "STARTING", "STARTED", "PAUSED", "STOPPING")

    fun connected(session: String): Boolean = session in LIVE

    /**
     * [battery]: "N%" or "-". [health]: HTTP status of the last `GET /health`, -1 when unreachable, null when
     * not checked yet.
     */
    fun parts(session: String, alert: DeviceAlert?, battery: String, fixture: Boolean, urlBlank: Boolean, health: Int?): List<Part> {
        val out = ArrayList<Part>()
        out += when {
            alert == DeviceAlert.DISCONNECTED -> Part("Bluetooth dropped", bad = true)
            connected(session) -> Part("Glasses connected")
            session == "no session" -> Part("No glasses found", bad = true)
            session == "Stopped by the glasses" -> Part("Glasses stopped", bad = true)
            else -> Part("Glasses not connected")
        }
        val level = battery.removeSuffix("%").trim().toIntOrNull()
        if (connected(session) && level != null && level > 0) {
            out += Part("$level%", bad = level <= DeviceStates.BATTERY_LOW_AT)
        }
        out += when {
            fixture -> Part("Demo data")
            urlBlank -> Part("No bridge URL", bad = true)
            health == null -> Part("Checking bridge")
            health in 200..299 -> Part("Bridge online")
            health < 0 -> Part("Bridge offline", bad = true)
            else -> Part("Bridge HTTP $health", bad = true)
        }
        return out
    }

    fun text(parts: List<Part>): String = parts.joinToString(" · ") { it.text }
}
