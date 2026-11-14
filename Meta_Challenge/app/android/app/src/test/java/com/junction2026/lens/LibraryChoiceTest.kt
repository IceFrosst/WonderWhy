package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LibraryChoiceTest {
    private val bundled by lazy { appFile("shared/objects.json").readText() }
    private fun lib(lang: String?, label: String) =
        """{"objects":[{"id":"ball","label":"$label","answer":"a","chapters":[{"lens":"motion","title":"t","captions":["c"]}]}]${if (lang != null) ",\"lang\":\"$lang\"" else ""}}"""

    @Test fun bridgeInTheRequestedLanguageWinsAndIsSaved() {
        val p = LibraryChoice.choose("fi", lib("fi", "Heitetty pallo"), lib("fi", "old"), bundled)
        assertEquals(LibrarySource.BRIDGE, p.source)
        assertTrue(p.save)
        assertEquals("fi", p.lang)
        assertEquals("Heitetty pallo", OfflineCards.parse(p.text).getValue("ball").label)
    }

    @Test fun offlineStartUsesTheSavedCopy() {
        val p = LibraryChoice.choose("fi", null, lib("fi", "Heitetty pallo"), bundled)
        assertEquals(LibrarySource.CACHE, p.source)
        assertFalse(p.save)
    }

    @Test fun savedTranslationBeatsAnEnglishBridgeAnswer() {
        assertEquals(LibrarySource.CACHE, LibraryChoice.choose("fi", lib("en", "Thrown ball"), lib("fi", "Pallo"), bundled).source)
        val p = LibraryChoice.choose("fi", lib("en", "Thrown ball"), null, bundled)
        assertEquals(LibrarySource.BRIDGE, p.source)
        assertEquals("en", p.lang)
        assertFalse(p.save) // never saved as Finnish
    }

    @Test fun nothingUsableGivesTheBundledEnglish() {
        val p = LibraryChoice.choose("de", "<html>502</html>", "{\"objects\":[]}", bundled)
        assertEquals(LibrarySource.BUNDLED, p.source)
        assertEquals("en", p.lang)
        assertTrue(OfflineCards.parse(p.text).size >= 6)
    }

    @Test fun englishWithoutLangFieldCounts() {
        assertEquals("en", LibraryChoice.usableLang(lib(null, "Ball")))
        assertEquals(LibrarySource.BRIDGE, LibraryChoice.choose("en", lib(null, "Ball"), null, bundled).source)
    }

    @Test fun cacheNamesOnlyForSupportedTags() {
        assertEquals("objects_sv.json", LibraryChoice.cacheName("sv"))
        assertNull(LibraryChoice.cacheName("../x"))
    }
}
