package com.junction2026.lens

import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** "Glasses check": rows from Glasses_Test.md, state, hints that never give a verdict, and the report. */
class GlassesCheckTest {
    private fun words(s: String) = s.trim().split(Regex("\\s+")).size

    @Test fun rowsFollowTheSheetAndStayShort() {
        val ids = GlassesCheck.ROWS.map { it.id }
        assertEquals(ids.distinct(), ids)
        // Every numbered row of Glasses_Test.md's table is here, in order.
        val sheet = appFile("Glasses_Test.md").readLines()
            .mapNotNull { Regex("^\\| (\\d+[a-z]?) \\|").find(it)?.groupValues?.get(1) }
        assertEquals(sheet, ids)
        for (r in GlassesCheck.ROWS) {
            assertTrue("${r.id} todo: ${words(r.todo)} words", words(r.todo) < 12)
            assertTrue("${r.id} expect: ${words(r.expect)} words", words(r.expect) < 12)
            assertFalse(r.todo.contains('!') || r.expect.contains('!'))
        }
    }

    @Test fun numbersArePadded() {
        assertEquals("01", GlassesCheck.number("1"))
        assertEquals("06b", GlassesCheck.number("6b"))
        assertEquals("14", GlassesCheck.number("14"))
    }

    @Test fun verdictsToggleAndNotesOnlyOnFail() {
        var s = GlassesCheck.setVerdict(emptyMap(), "4", CheckVerdict.FAIL)
        s = GlassesCheck.setNote(s, "4", "  no card\n after pinch ")
        assertEquals(CheckResult(CheckVerdict.FAIL, "no card after pinch"), s["4"])
        // A note on a row that did not fail is ignored.
        assertEquals(s, GlassesCheck.setNote(s, "5", "x"))
        s = GlassesCheck.setVerdict(s, "4", CheckVerdict.PASS)
        assertEquals(CheckResult(CheckVerdict.PASS, ""), s["4"])
        s = GlassesCheck.setVerdict(s, "4", CheckVerdict.PASS) // same again: cleared
        assertNull(s["4"])
        assertEquals(GlassesCheck.NOTE_MAX, GlassesCheck.cleanNote("x".repeat(500)).length)
    }

    @Test fun stateRoundTripsAndSurvivesBadText() {
        var s = GlassesCheck.setVerdict(emptyMap(), "6b", CheckVerdict.FAIL)
        s = GlassesCheck.setNote(s, "6b", "caption cut")
        s = GlassesCheck.setVerdict(s, "1", CheckVerdict.PASS)
        s = GlassesCheck.setVerdict(s, "7", CheckVerdict.SKIP)
        assertEquals(s, GlassesCheck.decode(GlassesCheck.encode(s)))
        assertEquals(emptyMap<String, CheckResult>(), GlassesCheck.decode("not json"))
        assertEquals(emptyMap<String, CheckResult>(), GlassesCheck.decode(null))
        assertEquals(emptyMap<String, CheckResult>(), GlassesCheck.decode("""{"rows":{"99":{"v":"PASS"},"2":{"v":"MAYBE"}}}"""))
    }

    @Test fun hintsSayWhatTheAppSawNeverAVerdict() {
        val o = CheckObserved(
            mock = false, registration = "REGISTERED", session = "STARTED", display = "STARTED", battery = 82,
            pinchAgoMs = 2_400, lastCard = "Thrown ball", lastCardAgoMs = 1_000, lastDetectMs = 840, lastToCardMs = 1_320,
            lastHeard = "why does it curve?", speech = "STARTED", lang = "fi", consent = true, bridgeHealth = -1,
        )
        fun hint(id: String) = GlassesCheck.hint(GlassesCheck.ROWS.first { it.id == id }, o)
        assertEquals("App saw: registration REGISTERED, session STARTED, display STARTED", hint("2"))
        assertEquals("App saw: last pinch 2 s ago, last card: Thrown ball (1 s ago)", hint("4"))
        assertEquals("App saw: last /detect 840 ms, pinch to card 1.3 s", hint("5"))
        assertEquals("App saw: speech STARTED, heard \"why does it curve?\"", hint("6c"))
        assertTrue(hint("11")!!.contains("battery 82%"))
        assertTrue(hint("12")!!.contains("bridge offline"))
        assertNull(hint("7"))
        for (r in GlassesCheck.ROWS) {
            val h = GlassesCheck.hint(r, o) ?: continue
            assertTrue(h.startsWith("App saw: "))
            for (w in listOf("PASS", "FAIL", "SKIP", "pass", "fail")) assertFalse("$r: $h", Regex("\\b$w\\b").containsMatchIn(h))
        }
        assertEquals("App saw: no pinch from the glasses yet, no card yet", GlassesCheck.hint(GlassesCheck.ROWS.first { it.id == "4" }, CheckObserved()))
    }

    @Test fun bridgeHostOnly() {
        assertEquals("lens.example.io", GlassesCheck.bridgeHost("https://user:pw@lens.example.io:8443/x/y?k=abc#k=def"))
        assertEquals("10.0.2.2", GlassesCheck.bridgeHost("http://10.0.2.2:8787"))
        assertEquals("lens.167-71-139-39.sslip.io", GlassesCheck.bridgeHost(Prefs.DEFAULT_BRIDGE))
        assertEquals("192.168.1.4", GlassesCheck.bridgeHost("192.168.1.4:8787/#k=zzz"))
        assertEquals("-", GlassesCheck.bridgeHost(""))
    }

    private fun info(url: String, phone: String = "Google Pixel 8") = CheckReportInfo(
        atMs = 1_794_640_000_000L, timeZone = TimeZone.getTimeZone("Europe/Helsinki"),
        phone = phone, android = "15 (API 35)", appVersion = "0.1 (1)", mock = false, bridgeUrl = url,
    )

    @Test fun reportLinesAndTotals() {
        var s = GlassesCheck.setVerdict(emptyMap(), "1", CheckVerdict.PASS)
        s = GlassesCheck.setVerdict(s, "6b", CheckVerdict.FAIL)
        s = GlassesCheck.setNote(s, "6b", "caption cut at the bottom")
        s = GlassesCheck.setVerdict(s, "7", CheckVerdict.SKIP)
        val r = GlassesCheck.report(info("http://10.0.2.2:8787"), s)
        val lines = r.lines()
        assertEquals("Physics Lens glasses check", lines[0])
        assertTrue(r, r.contains("Date: 2026-11-14 "))
        assertTrue(r.contains("Phone: Google Pixel 8, Android 15 (API 35)"))
        assertTrue(r.contains("App: 0.1 (1)"))
        assertTrue(r.contains("Glasses: real"))
        assertTrue(r.contains("Bridge host: 10.0.2.2\n"))
        assertTrue(r.contains("\n01 PASS Meta AI app: Developer Mode on, note both versions.\n"))
        assertTrue(r.contains("\n06b FAIL Web App closed: pinch at the ball, step, swipe lenses. — caption cut at the bottom\n"))
        assertTrue(r.contains("\n07 SKIP Scan the install QR code with the phone camera.\n"))
        assertTrue(r.contains("\n14 – Clear app data, then pinch once.\n"))
        assertEquals(GlassesCheck.ROWS.size, lines.count { Regex("^\\d\\d[a-z]? (PASS|FAIL|SKIP|–) ").containsMatchIn(it) })
        assertTrue(r.contains("Totals: 1 pass, 1 fail, 1 skip, 13 not done (16 rows)"))
        assertTrue(GlassesCheck.report(info(""), emptyMap()).contains("Glasses: real"))
    }

    /** The token, a pasted key link or any `k=` value never reaches the report, wherever it was typed. */
    @Test fun reportNeverCarriesATokenOrUrlKey() {
        val token = "s3cret-Tok3n-xyz"
        var s = GlassesCheck.setVerdict(emptyMap(), "10", CheckVerdict.FAIL)
        s = GlassesCheck.setNote(s, "10", "used https://lens.example.io/?k=$token#k=$token and token=$token, key: $token")
        s = GlassesCheck.setVerdict(s, "4", CheckVerdict.FAIL)
        s = GlassesCheck.setNote(s, "4", "pasted $token here")
        val urls = listOf(
            "https://lens.example.io/#k=$token",
            "https://lens.example.io/?k=$token",
            "https://me:$token@lens.example.io:8443/path?x=1&k=$token#k=$token",
        )
        for (u in urls) {
            val r = GlassesCheck.report(info(u, phone = "Pixel k=$token"), s, secrets = listOf(token))
            assertFalse(r, r.contains(token))
            assertFalse(r, r.contains("k=", ignoreCase = true))
            assertFalse(r, r.contains("/?") || r.contains("?x=") || r.contains("#k") || r.contains("&"))
            assertFalse(r, r.contains("8443"))
            assertTrue(r, r.contains("Bridge host: lens.example.io\n"))
        }
        // Without the token as a secret, query, fragment and k= values are still removed.
        val r = GlassesCheck.report(info(urls[2]), s)
        assertFalse(r, r.contains("k=$token") || r.contains("?k=") || r.contains("#k="))
    }
}
