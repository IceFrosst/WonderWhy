package com.junction2026.lens

/*
 * Device and error states (Plan.md section 5, DESIGN.md "States every surface must have").
 * Pure Kotlin: SDK enums come in by name, so JVM tests cover the mapping.
 */

/** One state the wearer must be told about. Order = priority on the phone card (first wins). */
enum class DeviceAlert { DISCONNECTED, TAKEN_OVER, FOLDED, OFF, CAMERA_DENIED, HOT, BATTERY_LOW }

/** What the glasses do for a state (DESIGN.md states table). */
enum class GlassesShow {
    /** Display cleared: the wearer cannot see it anyway (taken off, folded). */
    BLANK,
    /** Card that leaves by itself after [DeviceStates.AUTO_DISMISS_MS]. */
    CARD_AUTO,
    /** Card that waits for a decision (pinch / button). */
    CARD_DECIDE,
    /** The glasses are not ours to draw on (no link, another app has them). */
    NOTHING,
}

/** The one action a phone state card offers. */
enum class PhoneAction { CONNECT, TRY_AGAIN }

/** Words for a state card: title 3 words, body 8 words, says what to do (DESIGN.md word caps). */
data class StateText(val title: String, val body: String, val glasses: GlassesShow, val action: PhoneAction?)

/** Plain view of `Device` from the SDK: names instead of enums so tests need no SDK. */
data class DeviceSnapshot(
    /** null = unknown. */
    val donned: Boolean?,
    val folded: Boolean?,
    val battery: Int,
    /** `ThermalLevel` name. */
    val thermal: String,
    /** `LinkState` CONNECTED = true, DISCONNECTED = false, CONNECTING / unknown = null. */
    val connected: Boolean?,
)

sealed class DeviceChange {
    data class Raise(val alert: DeviceAlert) : DeviceChange()
    data class Clear(val alert: DeviceAlert) : DeviceChange()
}

object DeviceStates {
    const val AUTO_DISMISS_MS = 6_000L
    const val BATTERY_LOW_AT = 15
    const val BATTERY_REARM_AT = 20

    /** `ThermalLevel` in rising order; SEVERE and up counts as hot. */
    val THERMAL_ORDER = listOf("UNKNOWN", "NONE", "LIGHT", "MODERATE", "SEVERE", "CRITICAL", "EMERGENCY", "SHUTDOWN")
    fun isHot(level: String): Boolean = THERMAL_ORDER.indexOf(level) >= THERMAL_ORDER.indexOf("SEVERE")

    fun text(a: DeviceAlert, battery: Int? = null): StateText = when (a) {
        DeviceAlert.OFF -> StateText("Glasses are off", "Put them on to continue.", GlassesShow.BLANK, null)
        DeviceAlert.FOLDED -> StateText("Glasses folded", "Unfold them to continue.", GlassesShow.BLANK, null)
        DeviceAlert.BATTERY_LOW -> StateText(
            "Battery low",
            (if (battery != null && battery in 0..100) "$battery% left. " else "") + "Charge the glasses soon.",
            GlassesShow.CARD_AUTO, null,
        )
        DeviceAlert.HOT -> StateText("Glasses are hot", "Let them cool for a few minutes.", GlassesShow.CARD_AUTO, null)
        DeviceAlert.TAKEN_OVER -> StateText("Glasses busy", "Another app took over. Tap Connect.", GlassesShow.NOTHING, PhoneAction.CONNECT)
        DeviceAlert.DISCONNECTED -> StateText("Glasses disconnected", "Reconnecting. Keep Bluetooth on.", GlassesShow.NOTHING, PhoneAction.CONNECT)
        DeviceAlert.CAMERA_DENIED -> StateText("Camera not allowed", "Allow camera in Meta AI, then try again.", GlassesShow.CARD_DECIDE, PhoneAction.TRY_AGAIN)
    }

    /** The alert the phone card shows: highest priority of [active]. */
    fun top(active: Set<DeviceAlert>): DeviceAlert? = DeviceAlert.entries.firstOrNull { it in active }

    /** True when our content must not be sent to the display. */
    fun suppressesDisplay(active: Set<DeviceAlert>): Boolean =
        active.any { text(it).glasses == GlassesShow.BLANK || text(it).glasses == GlassesShow.NOTHING }

    /** `DeviceSessionError` name to a state, or null when it has no card of its own (logged only). */
    fun forSessionError(name: String): DeviceAlert? = when (name) {
        "BATTERY_CRITICAL", "PEAK_POWER_SHUTDOWN" -> DeviceAlert.BATTERY_LOW
        "THERMAL_CRITICAL", "THERMAL_EMERGENCY" -> DeviceAlert.HOT
        "DEVICE_DISCONNECTED" -> DeviceAlert.DISCONNECTED
        else -> null
    }
}

/** Turns successive device snapshots into raise/clear edges. One per session; [reset] on a new one. */
class DeviceWatch {
    private var prev: DeviceSnapshot? = null
    private var batteryWarned = false
    private var hot = false
    private var linkLost = false
    private var linkSeen = false

    fun reset() { prev = null; batteryWarned = false; hot = false; linkLost = false; linkSeen = false }

    fun update(s: DeviceSnapshot): List<DeviceChange> {
        val out = ArrayList<DeviceChange>()
        val p = prev
        if (s.donned == false && p?.donned != false) out += DeviceChange.Raise(DeviceAlert.OFF)
        if (s.donned == true && p?.donned == false) out += DeviceChange.Clear(DeviceAlert.OFF)
        if (s.folded == true && p?.folded != true) out += DeviceChange.Raise(DeviceAlert.FOLDED)
        if (s.folded == false && p?.folded == true) out += DeviceChange.Clear(DeviceAlert.FOLDED)
        // A link that was up and went down (maybe via CONNECTING); the first snapshots may still be connecting.
        if (s.connected == false && linkSeen && !linkLost) {
            linkLost = true
            out += DeviceChange.Raise(DeviceAlert.DISCONNECTED)
        }
        if (s.connected == true && linkLost) {
            linkLost = false
            out += DeviceChange.Clear(DeviceAlert.DISCONNECTED)
        }
        if (s.connected == true) linkSeen = true
        // 0 can mean "not reported yet", so only 1..15 warns. Warn once until it climbs back over 20.
        if (s.battery in 1..DeviceStates.BATTERY_LOW_AT && !batteryWarned) {
            batteryWarned = true
            out += DeviceChange.Raise(DeviceAlert.BATTERY_LOW)
        } else if (s.battery >= DeviceStates.BATTERY_REARM_AT && batteryWarned) {
            batteryWarned = false
            out += DeviceChange.Clear(DeviceAlert.BATTERY_LOW)
        }
        val hotNow = DeviceStates.isHot(s.thermal)
        if (hotNow && !hot) out += DeviceChange.Raise(DeviceAlert.HOT)
        if (!hotNow && hot) out += DeviceChange.Clear(DeviceAlert.HOT)
        hot = hotNow
        prev = s
        return out
    }
}
