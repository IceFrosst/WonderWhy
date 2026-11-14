package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The phone's one status line and the title button's Connect / Disconnect. */
class PhoneStatusTest {
    private fun line(session: String, alert: DeviceAlert? = null, battery: String = "-", fixture: Boolean = false,
                     urlBlank: Boolean = false, health: Int? = 200) =
        PhoneStatus.parts(session, alert, battery, fixture, urlBlank, health)

    @Test fun allWell() {
        val p = line("STARTED", battery = "100%")
        assertEquals("Glasses connected · 100% · Bridge online", PhoneStatus.text(p))
        assertTrue(p.none { it.bad })
    }

    @Test fun failingPartsAreMarked() {
        val p = line("STARTED", DeviceAlert.DISCONNECTED, "12%", health = -1)
        assertEquals("Bluetooth dropped · 12% · Bridge offline", PhoneStatus.text(p))
        assertEquals(listOf(true, true, true), p.map { it.bad })
        assertEquals("No bridge URL", line("not connected", urlBlank = true).last().text)
        assertTrue(line("not connected", urlBlank = true).last().bad)
        assertEquals("Bridge HTTP 500", line("not connected", health = 500).last().text)
    }

    @Test fun notConnectedHasNoBatteryAndDemoDataNeedsNoBridge() {
        assertEquals("Glasses not connected · Demo data", PhoneStatus.text(line("Disconnected", battery = "80%", fixture = true, health = -1)))
        assertEquals("Glasses not connected · Checking bridge", PhoneStatus.text(line("not connected", health = null)))
        assertFalse(line("not connected").first().bad)
    }

    @Test fun connectToggle() {
        for (s in listOf("IDLE", "STARTING", "STARTED", "PAUSED", "STOPPING")) assertTrue(s, PhoneStatus.connected(s))
        for (s in listOf("not connected", "Disconnected", "no session", "Stopped by the glasses")) assertFalse(s, PhoneStatus.connected(s))
    }
}
