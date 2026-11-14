package com.junction2026.lens

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class BridgeRequestsTest {
    @Test fun detectBodyCarriesLangAndWaitSketch() {
        val o = JSONObject(BridgeRequests.detectBody("r1", "/9j/AA==", "/9j/BB==", 1000, 1820, "fi"))
        assertEquals("r1", o.getString("reqId"))
        assertEquals("/9j/AA==", o.getString("imageBase64"))
        assertEquals("/9j/BB==", o.getString("focusBase64"))
        assertEquals("fi", o.getString("lang"))
        assertTrue(o.getBoolean("waitSketch"))
        assertEquals(820, o.getLong("preUploadMs"))
        assertEquals(1000, o.getLong("t_capture"))
        assertTrue(o.isNull("question"))
    }

    @Test fun detectBodyLangComesFromTheLocaleRule() {
        val tag = Lang.tagFor(Locale.forLanguageTag("sv-SE"))
        assertEquals("sv", JSONObject(BridgeRequests.detectBody("r", "x", null, 0, 0, tag)).getString("lang"))
        val en = Lang.tagFor(Locale.forLanguageTag("pt-BR"))
        assertEquals("en", JSONObject(BridgeRequests.detectBody("r", "x", null, 0, 0, en)).getString("lang"))
    }

    @Test fun detectBodyOmitsUnsupportedLangAndMissingFocus() {
        val o = JSONObject(BridgeRequests.detectBody("r", "x", null, 5, 1, "pt", waitSketch = false))
        assertFalse(o.has("lang"))
        assertFalse(o.has("focusBase64"))
        assertFalse(o.has("waitSketch"))
        assertEquals(0, o.getLong("preUploadMs")) // a clock that went back never gives a negative time
    }

    @Test fun forceObjectIdOnlyWhenSetAndSafe() {
        assertEquals("ball", JSONObject(BridgeRequests.detectBody("r", "x", null, 0, 0, "en", forceObjectId = " Ball ")).getString("forceObjectId"))
        assertFalse(JSONObject(BridgeRequests.detectBody("r", "x", null, 0, 0, "en")).has("forceObjectId"))
        assertFalse(JSONObject(BridgeRequests.detectBody("r", "x", null, 0, 0, "en", forceObjectId = "../x")).has("forceObjectId"))
    }

    @Test fun askBody() {
        val o = JSONObject(BridgeRequests.askBody("q1", "  why does   it curve? ", "ball", "de")!!)
        assertEquals("q1", o.getString("reqId"))
        assertEquals("why does it curve?", o.getString("question"))
        assertEquals("ball", o.getString("aboutObjectId"))
        assertEquals("de", o.getString("lang"))
        assertFalse(o.has("imageBase64")) // PROTOCOL: no image
        assertNull(BridgeRequests.askBody("q2", "   ", "ball", "en"))
    }

    @Test fun questionIsCutTo300Chars() {
        val long = "a".repeat(250) + " " + "b".repeat(100)
        val q = BridgeRequests.cleanQuestion(long)!!
        assertEquals(300, q.length) // PROTOCOL: 300 characters
        assertEquals(252, BridgeRequests.cleanQuestion("a".repeat(250) + " b")!!.length) // under 300: kept whole
        assertNull(BridgeRequests.cleanQuestion(null))
    }

    @Test fun objectsPath() {
        assertEquals("/objects?lang=fi", BridgeRequests.objectsPath("fi"))
        assertEquals("/objects?lang=en", BridgeRequests.objectsPath("xx"))
    }

    @Test fun pickerChoiceWinsOverPhoneLanguage() {
        val fi = Locale.forLanguageTag("fi-FI")
        assertEquals("fi", Lang.effective("", fi))
        assertEquals("fi", Lang.effective(null, fi))
        assertEquals("de", Lang.effective("de", fi))
        assertEquals("fi", Lang.effective("pt", fi)) // not supported: phone language
        assertEquals("en", Lang.effective("", Locale.forLanguageTag("pt-BR")))
        for (t in Lang.SUPPORTED) assertTrue(Lang.nativeName(t).isNotBlank())
    }
}
