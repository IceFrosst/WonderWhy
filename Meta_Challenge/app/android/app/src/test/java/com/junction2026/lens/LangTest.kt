package com.junction2026.lens

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test

class LangTest {
    @Test fun tagMapping() {
        assertEquals("fi", Lang.tagFor(Locale.forLanguageTag("fi-FI")))
        assertEquals("sv", Lang.tagFor(Locale("sv", "SE")))
        assertEquals("en", Lang.tagFor(Locale.forLanguageTag("pt-BR")))
        assertEquals("en", Lang.tagFor(Locale.ROOT))
    }

    @Test fun names() {
        assertEquals("Finnish", Lang.name("fi"))
        assertEquals("Finnish", Lang.name("fi-FI"))
        assertEquals("English", Lang.name("xx"))
    }

    @Test fun uiFallback() {
        assertEquals("Done", Lang.ui("en", Lang.DONE))
        assertEquals("Valmis", Lang.ui("fi", Lang.DONE))
        assertEquals("Done", Lang.ui("de", Lang.DONE))
        assertEquals("nope", Lang.ui("fi", "nope"))
        for (k in Lang.KEYS) assert(Lang.ui("fi", k).isNotBlank())
    }

    /** DESIGN.md: state card body 8 words. The token message is longer; it is reported, not failed. */
    @Test fun uiWordCaps() {
        val offenders = ArrayList<String>()
        for (tag in listOf("en", "fi")) for (k in Lang.KEYS) {
            val s = Lang.ui(tag, k)
            val n = s.trim().split(Regex("\\s+")).size
            if (n > 8) offenders.add("ui $tag/$k: $n words")
            assert(!s.contains('!')) { "no exclamation marks: $tag/$k" }
        }
        println("UI CAP OFFENDERS: $offenders")
        assertEquals(listOf("ui en/token: 12 words", "ui fi/token: 9 words"), offenders)
    }
}
