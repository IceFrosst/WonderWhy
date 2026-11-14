package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceStatesTest {
    private fun snap(
        donned: Boolean? = true,
        folded: Boolean? = false,
        battery: Int = 100,
        thermal: String = "NONE",
        connected: Boolean? = true,
    ) = DeviceSnapshot(donned, folded, battery, thermal, connected)

    private fun raise(a: DeviceAlert) = DeviceChange.Raise(a)
    private fun clear(a: DeviceAlert) = DeviceChange.Clear(a)
    private fun words(s: String) = s.trim().split(Regex("\\s+")).size

    /** DESIGN.md: state card title 3 words, body 8 words, no exclamation marks. */
    @Test fun everyStateHasACardWithinWordCaps() {
        for (a in DeviceAlert.entries) {
            val t = DeviceStates.text(a, battery = 10)
            assertTrue("$a title: ${t.title}", words(t.title) <= 3)
            assertTrue("$a body: ${t.body}", words(t.body) <= 8)
            assertFalse(a.name, (t.title + t.body).contains('!'))
        }
        assertEquals("10% left. Charge the glasses soon.", DeviceStates.text(DeviceAlert.BATTERY_LOW, 10).body)
        assertEquals("Charge the glasses soon.", DeviceStates.text(DeviceAlert.BATTERY_LOW, null).body)
    }

    @Test fun finnishStateWordsAndDisconnect() {
        for (a in DeviceAlert.entries) {
            val t = DeviceStates.text(a, battery = 10, lang = "fi")
            assertTrue("$a title: ${t.title}", words(t.title) <= 3)
            assertTrue("$a body: ${t.body}", words(t.body) <= 8)
            assertTrue(t.title != DeviceStates.text(a).title)
        }
        assertEquals("Bluetooth dropped. Tap Connect.", DeviceStates.text(DeviceAlert.DISCONNECTED).body)
        assertEquals("10% jäljellä. Lataa lasit pian.", DeviceStates.text(DeviceAlert.BATTERY_LOW, 10, "fi").body)
    }

    /** Hot title on the phone only for errors. */
    @Test fun errorsVersusStates() {
        assertTrue(DeviceStates.isError(DeviceAlert.DISCONNECTED))
        assertTrue(DeviceStates.isError(DeviceAlert.CAMERA_DENIED))
        assertFalse(DeviceStates.isError(DeviceAlert.OFF))
        assertFalse(DeviceStates.isError(DeviceAlert.FOLDED))
        assertFalse(DeviceStates.isError(DeviceAlert.TAKEN_OVER))
    }

    /** DESIGN.md states table: off = blank, battery/hot = card that leaves, camera = decision card. */
    @Test fun glassesBehaviourPerState() {
        assertEquals(GlassesShow.BLANK, DeviceStates.text(DeviceAlert.OFF).glasses)
        assertEquals(GlassesShow.BLANK, DeviceStates.text(DeviceAlert.FOLDED).glasses)
        assertEquals(GlassesShow.CARD_AUTO, DeviceStates.text(DeviceAlert.BATTERY_LOW).glasses)
        assertEquals(GlassesShow.CARD_AUTO, DeviceStates.text(DeviceAlert.HOT).glasses)
        assertEquals(GlassesShow.CARD_DECIDE, DeviceStates.text(DeviceAlert.CAMERA_DENIED).glasses)
        assertEquals(PhoneAction.TRY_AGAIN, DeviceStates.text(DeviceAlert.CAMERA_DENIED).action)
        assertEquals(PhoneAction.CONNECT, DeviceStates.text(DeviceAlert.TAKEN_OVER).action)
        assertEquals(PhoneAction.CONNECT, DeviceStates.text(DeviceAlert.DISCONNECTED).action)
    }

    @Test fun phoneShowsTheMostImportantState() {
        assertNull(DeviceStates.top(emptySet()))
        assertEquals(DeviceAlert.FOLDED, DeviceStates.top(setOf(DeviceAlert.OFF, DeviceAlert.FOLDED)))
        assertEquals(DeviceAlert.DISCONNECTED, DeviceStates.top(setOf(DeviceAlert.BATTERY_LOW, DeviceAlert.DISCONNECTED)))
        assertEquals(DeviceAlert.HOT, DeviceStates.top(setOf(DeviceAlert.BATTERY_LOW, DeviceAlert.HOT)))
    }

    @Test fun onlyUnusableGlassesSuppressTheDisplay() {
        assertTrue(DeviceStates.suppressesDisplay(setOf(DeviceAlert.OFF)))
        assertTrue(DeviceStates.suppressesDisplay(setOf(DeviceAlert.TAKEN_OVER)))
        assertTrue(DeviceStates.suppressesDisplay(setOf(DeviceAlert.DISCONNECTED)))
        assertFalse(DeviceStates.suppressesDisplay(setOf(DeviceAlert.BATTERY_LOW, DeviceAlert.HOT, DeviceAlert.CAMERA_DENIED)))
        assertFalse(DeviceStates.suppressesDisplay(emptySet()))
    }

    @Test fun sessionErrorsMapToStates() {
        assertEquals(DeviceAlert.BATTERY_LOW, DeviceStates.forSessionError("BATTERY_CRITICAL"))
        assertEquals(DeviceAlert.HOT, DeviceStates.forSessionError("THERMAL_CRITICAL"))
        assertEquals(DeviceAlert.HOT, DeviceStates.forSessionError("THERMAL_EMERGENCY"))
        assertEquals(DeviceAlert.DISCONNECTED, DeviceStates.forSessionError("DEVICE_DISCONNECTED"))
        assertNull(DeviceStates.forSessionError("SESSION_ENDED_BY_DEVICE")) // fold / doff say why
        assertNull(DeviceStates.forSessionError("UNEXPECTED_ERROR"))
    }

    @Test fun thermalLevels() {
        assertFalse(DeviceStates.isHot("NONE"))
        assertFalse(DeviceStates.isHot("MODERATE"))
        assertTrue(DeviceStates.isHot("SEVERE"))
        assertTrue(DeviceStates.isHot("SHUTDOWN"))
        assertFalse(DeviceStates.isHot("SOMETHING_NEW"))
    }

    @Test fun firstSnapshotOfAHealthyPairRaisesNothing() {
        assertEquals(emptyList<DeviceChange>(), DeviceWatch().update(snap()))
    }

    @Test fun takeOffAndPutOn() {
        val w = DeviceWatch()
        w.update(snap())
        assertEquals(listOf(raise(DeviceAlert.OFF)), w.update(snap(donned = false)))
        assertEquals(emptyList<DeviceChange>(), w.update(snap(donned = false))) // repeats are not edges
        assertEquals(listOf(clear(DeviceAlert.OFF)), w.update(snap(donned = true)))
    }

    /** The kit reports a folded pair as taken off too: both are raised, the phone shows "folded". */
    @Test fun foldAndUnfold() {
        val w = DeviceWatch()
        w.update(snap())
        val folded = w.update(snap(donned = false, folded = true))
        assertEquals(listOf(raise(DeviceAlert.OFF), raise(DeviceAlert.FOLDED)), folded)
        assertEquals(DeviceAlert.FOLDED, DeviceStates.top(setOf(DeviceAlert.OFF, DeviceAlert.FOLDED)))
        assertEquals(listOf(clear(DeviceAlert.OFF), clear(DeviceAlert.FOLDED)), w.update(snap()))
    }

    @Test fun batteryWarnsOnceUntilCharged() {
        val w = DeviceWatch()
        w.update(snap())
        assertEquals(listOf(raise(DeviceAlert.BATTERY_LOW)), w.update(snap(battery = 10)))
        assertEquals(emptyList<DeviceChange>(), w.update(snap(battery = 9)))
        assertEquals(emptyList<DeviceChange>(), w.update(snap(battery = 18))) // under the re-arm level
        assertEquals(listOf(clear(DeviceAlert.BATTERY_LOW)), w.update(snap(battery = 60)))
        assertEquals(listOf(raise(DeviceAlert.BATTERY_LOW)), w.update(snap(battery = 12)))
    }

    @Test fun batteryZeroMeansNotReported() {
        val w = DeviceWatch()
        assertEquals(emptyList<DeviceChange>(), w.update(snap(battery = 0)))
    }

    @Test fun heat() {
        val w = DeviceWatch()
        w.update(snap())
        assertEquals(listOf(raise(DeviceAlert.HOT)), w.update(snap(thermal = "SEVERE")))
        assertEquals(emptyList<DeviceChange>(), w.update(snap(thermal = "CRITICAL")))
        assertEquals(listOf(clear(DeviceAlert.HOT)), w.update(snap(thermal = "LIGHT")))
    }

    @Test fun linkDropNeedsALinkFirst() {
        val w = DeviceWatch()
        assertEquals(emptyList<DeviceChange>(), w.update(snap(connected = false))) // still connecting
        assertEquals(emptyList<DeviceChange>(), w.update(snap(connected = true)))
        assertEquals(listOf(raise(DeviceAlert.DISCONNECTED)), w.update(snap(connected = false)))
        assertEquals(listOf(clear(DeviceAlert.DISCONNECTED)), w.update(snap(connected = true)))
    }

    @Test fun resetStartsOver() {
        val w = DeviceWatch()
        w.update(snap(battery = 10))
        w.reset()
        assertEquals(listOf(raise(DeviceAlert.BATTERY_LOW)), w.update(snap(battery = 10)))
    }
}
