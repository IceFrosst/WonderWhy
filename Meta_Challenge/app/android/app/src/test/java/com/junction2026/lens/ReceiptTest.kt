package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The phone's receipt line: only facts the app has, English and Finnish. */
class ReceiptTest {
    @Test fun english() {
        assertEquals("Library card · mock detector · 0.84 s to card", Receipt.line(ReceiptFacts(ReceiptKind.LIBRARY, "mock", 840), "en"))
        assertEquals("Library card · forced object · 1.3 s to card", Receipt.line(ReceiptFacts(ReceiptKind.LIBRARY, "forced", 1_320), "en"))
        assertEquals("Library card · gemini-2.5-flash · 2.0 s to card", Receipt.line(ReceiptFacts(ReceiptKind.LIBRARY, "gemini-2.5-flash", 2_000), "en"))
        assertEquals("Sketch · unverified · 6.2 s to card", Receipt.line(ReceiptFacts(ReceiptKind.SKETCH, null, 6_210), "en"))
        assertEquals("Saved card · offline", Receipt.line(ReceiptFacts(ReceiptKind.SAVED), "en"))
        assertEquals("Saved card · from Seen today", Receipt.line(ReceiptFacts(ReceiptKind.REPLAY), "en"))
        assertEquals("Demo data", Receipt.line(ReceiptFacts(ReceiptKind.DEMO), "en"))
        assertEquals("Answer from saved cards", Receipt.line(ReceiptFacts(ReceiptKind.ANSWER_PHONE), "en"))
        assertEquals("Bridge answer · word match · 0.31 s to card", Receipt.line(ReceiptFacts(ReceiptKind.ANSWER_BRIDGE, "local-match", 310), "en"))
        assertEquals("Library card · Stand-in model", Receipt.line(ReceiptFacts(ReceiptKind.LIBRARY, standIn = true), "en"))
        // Unknown parts are left out, never guessed; other languages use English.
        assertEquals("Library card", Receipt.line(ReceiptFacts(ReceiptKind.LIBRARY), "de"))
    }

    @Test fun finnish() {
        assertEquals("Kirjaston kortti · testitunnistin · 0,84 s korttiin", Receipt.line(ReceiptFacts(ReceiptKind.LIBRARY, "mock", 840), "fi"))
        assertEquals("Luonnos · tarkistamaton · 6,2 s korttiin", Receipt.line(ReceiptFacts(ReceiptKind.SKETCH, null, 6_210), "fi"))
        assertEquals("Tallennettu kortti · ei yhteyttä", Receipt.line(ReceiptFacts(ReceiptKind.SAVED), "fi"))
        assertEquals("Esittelydata", Receipt.line(ReceiptFacts(ReceiptKind.DEMO), "fi"))
        assertEquals("Kirjaston kortti · Varamalli", Receipt.line(ReceiptFacts(ReceiptKind.LIBRARY, standIn = true), "fi"))
    }

    @Test fun modelNameIsCleanedAndTimeNeedsAValue() {
        assertEquals("pi:anthropic/claude", Receipt.model("pi:anthropic/claude <b>", false))
        assertNull(Receipt.model("  ", false))
        assertNull(Receipt.time(null, false))
        assertNull(Receipt.time(-5, false))
        assertEquals("12.0 s to card", Receipt.time(12_000, false))
    }

    /** PROTOCOL `show.timings.model` is read from the `/detect` response; fixtures without timings give null. */
    @Test fun parsesTimingsModel() {
        val d = DetectionParser.parse("""{"objectId":"ball","label":"Thrown ball","confidence":1,"timings":{"detectMs":0,"model":"forced"}}""")
        assertEquals("forced", d.model)
        assertNull(DetectionParser.parse("""{"objectId":"ball","label":"b","confidence":1}""").model)
        assertNull(DetectionParser.parse("""{"objectId":"ball","label":"b","confidence":1,"timings":{"model":""}}""").model)
    }
}
