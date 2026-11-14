package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Stills bundled for offline cards: bridge/media manifests to a `media` block, and the tagline language rule. */
class OfflineMediaTest {
    private val objs by lazy { OfflineCards.parse(appFile("shared/objects.json").readText()) }

    @Test fun everyLibraryObjectGetsItsStills() {
        for (o in objs.values) {
            val f = appFile("bridge/media").resolve("${o.id}/manifest.json")
            if (!f.isFile) continue
            val m = OfflineConvert.media(o.id, f.readText())!!
            assertEquals("/media/${o.id}", m.base)
            val det = OfflineConvert.toDetection(OfflineCards.toDetect(o), m)
            val tracks = DetectionParser.tracks(det)
            // The first lens has a still for its first step, and every listed still exists on disk.
            val first = DetectionParser.stills(det, tracks.first().lensId)
            assertTrue(o.id, first.isNotEmpty())
            for (t in tracks) for (file in DetectionParser.stills(det, t.lensId)) {
                val path = DetectionParser.stillPath(m.base, file)!!
                assertTrue(path, appFile("bridge" + path).isFile)
            }
        }
    }

    @Test fun badManifests() {
        assertNull(OfflineConvert.media("x", null))
        assertNull(OfflineConvert.media("x", "not json"))
        assertNull(OfflineConvert.media("x", """{"lenses":{"x.motion":{"stills":[]}}}"""))
        assertEquals(listOf("motion/s1.png"), OfflineConvert.media("x", """{"lenses":{"x.motion":{"stills":["motion/s1.png"]}}}""")!!.lenses["x.motion"]!!.stills)
    }

    @Test fun taglineOnlyInItsOwnLanguage() {
        assertEquals("Projectile motion", OfflineCards.taglineFor("en", "Projectile motion", "Projectile motion"))
        assertNull(OfflineCards.taglineFor("fi", "Projectile motion", "Projectile motion")) // untranslated
        assertEquals("Heittoliike", OfflineCards.taglineFor("fi", "Heittoliike", "Projectile motion"))
        assertNull(OfflineCards.taglineFor("fi", "Heittoliike", null))
        assertNull(OfflineCards.taglineFor("en", " ", "x"))
    }
}
