package com.junction2026.lens

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TriggerGateTest {
    private fun decide(
        connected: Boolean = true,
        displayReady: Boolean = true,
        blocking: DeviceAlert? = null,
        busy: Boolean = false,
        consent: Boolean = false,
    ) = TriggerGate.decide(connected, displayReady, blocking, busy, consent)

    @Test fun runsWhenEverythingIsReady() {
        assertEquals(TriggerDecision.RUN, decide())
    }

    /** The race seen on the emulator: session up, display not STARTED yet. The trigger waits instead of failing. */
    @Test fun waitsForTheDisplay() {
        assertEquals(TriggerDecision.WAIT_DISPLAY, decide(displayReady = false))
        assertEquals(TriggerDecision.WAIT_DISPLAY, decide(displayReady = false, busy = true, consent = true))
    }

    @Test fun orderOfRefusals() {
        assertEquals(TriggerDecision.NOT_CONNECTED, decide(connected = false, displayReady = false, blocking = DeviceAlert.OFF))
        // A state the wearer can fix wins over waiting for the display.
        assertEquals(TriggerDecision.BLOCKED, decide(displayReady = false, blocking = DeviceAlert.OFF))
        assertEquals(TriggerDecision.BUSY, decide(busy = true, consent = true))
        assertEquals(TriggerDecision.CONSENT, decide(consent = true))
    }

    @Test fun consentOnlyForRealPhotos() {
        assertTrue(TriggerGate.needsConsent(agreed = false, demoData = false))
        assertFalse(TriggerGate.needsConsent(agreed = true, demoData = false))
        assertFalse(TriggerGate.needsConsent(agreed = false, demoData = true)) // demo data takes no photo
    }

    /** Taken off, folded, no link, another app: blocked. Battery, heat, camera denied: not (they are cards). */
    @Test fun whichStatesBlock() {
        assertEquals(DeviceAlert.OFF, TriggerGate.blocking(setOf(DeviceAlert.OFF, DeviceAlert.BATTERY_LOW)))
        assertEquals(DeviceAlert.DISCONNECTED, TriggerGate.blocking(setOf(DeviceAlert.OFF, DeviceAlert.DISCONNECTED)))
        assertEquals(DeviceAlert.FOLDED, TriggerGate.blocking(setOf(DeviceAlert.FOLDED)))
        assertEquals(DeviceAlert.TAKEN_OVER, TriggerGate.blocking(setOf(DeviceAlert.TAKEN_OVER)))
        assertNull(TriggerGate.blocking(setOf(DeviceAlert.BATTERY_LOW, DeviceAlert.HOT, DeviceAlert.CAMERA_DENIED)))
        assertNull(TriggerGate.blocking(emptySet()))
    }

    @Test fun everyRefusalSaysWhatToDo() {
        for (d in TriggerDecision.entries) if (d != TriggerDecision.RUN) {
            assertTrue(d.name, TriggerGate.refusal(d, DeviceAlert.OFF).isNotBlank())
        }
        assertTrue(TriggerGate.refusal(TriggerDecision.BLOCKED, DeviceAlert.OFF).contains("Put them on"))
        assertTrue(TriggerGate.refusal(TriggerDecision.BLOCKED, DeviceAlert.FOLDED).contains("Unfold"))
        assertTrue(TriggerGate.refusal(TriggerDecision.NOT_CONNECTED, null).contains("Connect"))
    }

    @Test fun bridgeConfigIsCleaned() {
        assertEquals(BridgeConfig("http://10.0.2.2:8787", "abc"), BridgeConfig.from("  http://10.0.2.2:8787/ ", " abc "))
        assertEquals(BridgeConfig("", ""), BridgeConfig.from(null, null))
        assertEquals("https://h", BridgeConfig.from("https://h//", "").baseUrl)
    }

    @Test fun renderedAckBody() {
        val o = JSONObject(RenderedAck.body("req-1", 42)!!)
        assertEquals("req-1", o.getString("reqId"))
        assertEquals(42, o.getLong("renderMs"))
        assertEquals(2, o.length()) // exactly PROTOCOL's {reqId, renderMs}
        assertEquals(0, JSONObject(RenderedAck.body("r", -5)!!).getLong("renderMs")) // never negative
        assertNull(RenderedAck.body(null, 10))
        assertNull(RenderedAck.body("  ", 10))
    }

    /** A pasted Web App link must not carry its key into requests, prefs or the log. */
    @Test fun bridgeUrlLosesKeyQueryAndUserInfo() {
        assertEquals("https://lens.example", BridgeConfig.from("https://lens.example/#k=secret", "").baseUrl)
        assertEquals("https://lens.example", BridgeConfig.from("https://lens.example/?k=secret", "").baseUrl)
        assertEquals("http://10.0.2.2:8787", BridgeConfig.from("http://user:pw@10.0.2.2:8787/?k=s#k=t", "").baseUrl)
        assertEquals("https://h/lens", BridgeConfig.from("https://h/lens/?k=x", "").baseUrl)
        val c = BridgeConfig.from("https://u:p@h.example:8443/sub/?k=secret#k=secret", "tok")
        assertEquals("https://h.example:8443", c.origin)
        assertFalse(c.origin.contains("secret") || c.baseUrl.contains("secret") || c.baseUrl.contains("u:p"))
        assertEquals("", BridgeConfig.from("", "").origin)
        assertEquals("http:", BridgeConfig.from("http://", "").baseUrl.trimEnd('/'))
    }

    /** A notice on top of the consent card takes the pinch / Back; consent is not recorded by it. */
    @Test fun noticeWinsOverConsent() {
        assertEquals(InputRoute.NOTICE, InputRouting.route(notice = true, consent = true, answer = false, picker = false, explainer = false))
        assertEquals(InputRoute.CONSENT, InputRouting.route(notice = false, consent = true, answer = true, picker = true, explainer = true))
        assertEquals(InputRoute.ANSWER, InputRouting.route(false, false, answer = true, picker = true, explainer = true))
        assertEquals(InputRoute.PICKER, InputRouting.route(false, false, false, picker = true, explainer = true))
        assertEquals(InputRoute.EXPLAINER, InputRouting.route(false, false, false, false, explainer = true))
        assertEquals(InputRoute.NONE, InputRouting.route(false, false, false, false, false))
    }
}
