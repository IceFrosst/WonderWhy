package com.junction2026.lens

import org.json.JSONObject

/** What a trigger (pinch, capture button, Explain, Again) may do right now. */
enum class TriggerDecision {
    /** Take the photo (or the next demo answer). */
    RUN,
    /** No session: tap Connect. */
    NOT_CONNECTED,
    /** The glasses cannot be used (taken off, folded, no link, another app): refused, the phone card says why. */
    BLOCKED,
    /** Session up but the display has not reached STARTED yet: wait for it, then run. */
    WAIT_DISPLAY,
    /** A capture or question is already running. */
    BUSY,
    /** No photo has ever been agreed to: show the first-run consent card instead. */
    CONSENT,
}

/**
 * The one place that decides whether a trigger runs (pure, for JVM tests). Order matters: a refusal the
 * wearer can fix (put the glasses on) wins over waiting, and consent is asked only when a photo would
 * really be taken next.
 */
object TriggerGate {
    fun decide(
        connected: Boolean,
        displayReady: Boolean,
        blocking: DeviceAlert?,
        busy: Boolean,
        needsConsent: Boolean,
    ): TriggerDecision = when {
        !connected -> TriggerDecision.NOT_CONNECTED
        blocking != null -> TriggerDecision.BLOCKED
        !displayReady -> TriggerDecision.WAIT_DISPLAY
        busy -> TriggerDecision.BUSY
        needsConsent -> TriggerDecision.CONSENT
        else -> TriggerDecision.RUN
    }

    /** Consent is about photos: demo data takes none, so it never asks. */
    fun needsConsent(agreed: Boolean, demoData: Boolean): Boolean = !agreed && !demoData

    /** The state that makes the glasses unusable (highest priority first), or null. */
    fun blocking(active: Set<DeviceAlert>): DeviceAlert? =
        DeviceAlert.entries.firstOrNull { it in active && DeviceStates.text(it).glasses.let { g -> g == GlassesShow.BLANK || g == GlassesShow.NOTHING } }

    /** The phone log line for a refused trigger. */
    fun refusal(d: TriggerDecision, blocking: DeviceAlert?): String = when (d) {
        TriggerDecision.NOT_CONNECTED -> "Not connected: tap Connect first"
        TriggerDecision.BLOCKED -> when (blocking) {
            DeviceAlert.OFF -> "No photo: the glasses are off. Put them on first"
            DeviceAlert.FOLDED -> "No photo: the glasses are folded. Unfold them first"
            DeviceAlert.DISCONNECTED -> "No photo: the glasses are disconnected"
            DeviceAlert.TAKEN_OVER -> "No photo: another app has the glasses. Tap Connect"
            else -> "No photo: glasses not available"
        }
        TriggerDecision.WAIT_DISPLAY -> "Glasses display is starting: the photo waits for it"
        TriggerDecision.BUSY -> "Busy: ignoring trigger"
        TriggerDecision.CONSENT -> "First photo: asking for consent on the glasses"
        TriggerDecision.RUN -> ""
    }
}

/** Bridge address and token as typed on the phone, cleaned. Read fresh for every request. */
data class BridgeConfig(val baseUrl: String, val token: String) {
    companion object {
        fun from(url: String?, token: String?): BridgeConfig =
            BridgeConfig(url.orEmpty().trim().trimEnd('/'), token.orEmpty().trim())
    }
}

/** PROTOCOL "Phone-only latency": the body of `POST /rendered`. */
object RenderedAck {
    /** `{reqId, renderMs}`; renderMs is never negative (a clock step back gives 0). Null without a reqId. */
    fun body(reqId: String?, renderMs: Long): String? {
        val id = reqId?.trim()?.ifEmpty { null } ?: return null
        return JSONObject().put("reqId", id).put("renderMs", renderMs.coerceAtLeast(0)).toString()
    }
}
