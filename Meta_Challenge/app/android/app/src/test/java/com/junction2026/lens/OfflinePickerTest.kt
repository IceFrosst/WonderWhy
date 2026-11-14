package com.junction2026.lens

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflinePickerTest {
    private fun objectsFile(): File {
        var d: File? = File(System.getProperty("user.dir")).absoluteFile
        while (d != null) {
            val f = File(d, "shared/objects.json")
            if (f.isFile) return f
            d = d.parentFile
        }
        error("shared/objects.json not found above ${System.getProperty("user.dir")}")
    }

    private val objs by lazy { OfflineCards.parse(objectsFile().readText()) }

    @Test fun startsAtFirstWithCounter() {
        val p = OfflinePicker(objs.keys.toList())
        assertEquals(objs.keys.first(), p.current)
        assertEquals("1/${objs.size}", p.counter)
        // Left from the first wraps to the last, whatever the library size.
        assertEquals("${objs.size}/${objs.size}", p.move(-1).counter)
        assertEquals(objs.keys.last(), p.move(-1).current)
    }

    @Test fun leftRightWrapAround() {
        val p = OfflinePicker(listOf("a", "b", "c"))
        assertEquals("b", p.move(+1).current)
        assertEquals("2/3", p.move(+1).counter)
        assertEquals("c", p.move(-1).current) // left from the first wraps to the last
        assertEquals("a", p.move(+1).move(+1).move(+1).current)
        assertEquals("a", p.move(+3).current)
        assertEquals("c", p.move(-4).current)
    }

    @Test(expected = IllegalArgumentException::class)
    fun emptyLibraryIsRejected() {
        OfflinePicker(emptyList())
    }

    @Test(expected = IllegalArgumentException::class)
    fun indexOutOfRangeIsRejected() {
        OfflinePicker(listOf("a"), index = 1)
    }

    /** Every saved card opens the same explainer an online v1 answer would. */
    @Test fun everySavedObjectOpensTheExplainer() {
        for (o in objs.values) {
            val det = OfflineConvert.toDetection(OfflineCards.toDetect(o))
            assertEquals(o.id, det.objectId)
            assertEquals(o.label, det.label)
            assertEquals(o.answer, det.summary)
            assertNull(det.media)
            val v = DetectionParser.verdict(det)
            assertTrue("${o.id}: $v", v is Verdict.Explainer)
            val tracks = (v as Verdict.Explainer).tracks
            // No media here: an Explore lens is skipped (as the Web App does), the 2D lenses follow in order.
            val twoD = o.lenses.filter {
                it.kind != Explore.KIND && (o.id != "phone" || it.kind in setOf("inside", "whatif"))
            }
            assertEquals(twoD.size.coerceAtMost(DetectionParser.MAX_LENSES), tracks.size)
            assertEquals(twoD.first().steps, tracks.first().steps)
            assertTrue(tracks.none { Explore.isExplore(it.lensId) })
            // The explainer state machine accepts it and steps to the end.
            var s = ExplainerState(tracks)
            repeat(20) { s = s.next() }
            assertTrue(s.isLastStep)
        }
    }

    /**
     * Every track has a title; never more than 5 (DESIGN lens bar). Without media the ball opens on its first
     * 2D lenses; with the bundled stills (the saved-card path) its Explore lens comes first, then those.
     */
    @Test fun ballLensesHaveTitles() {
        val ball = objs.getValue("ball")
        val det = OfflineConvert.toDetection(OfflineCards.toDetect(ball))
        val tracks = DetectionParser.tracks(det)
        assertTrue(tracks.all { it.title.isNotBlank() })
        assertEquals(listOf("Projectile motion", "Bounce"), tracks.take(2).map { it.title })
        assertEquals(listOf("ball.motion", "ball.compare"), tracks.take(2).map { it.lensId })
        assertTrue(tracks.size in 2..DetectionParser.MAX_LENSES)

        val media = OfflineConvert.media("ball", appFile("bridge/media/ball/manifest.json").readText())
        val withMedia = DetectionParser.tracks(OfflineConvert.toDetection(OfflineCards.toDetect(ball), media))
        assertTrue(withMedia.all { it.title.isNotBlank() })
        assertTrue(withMedia.size in 3..DetectionParser.MAX_LENSES)
        if (ball.lenses.first().kind == Explore.KIND) {
            assertEquals("ball.explore", withMedia.first().lensId)
            assertEquals(ball.lenses.first().title, withMedia.first().title)
            assertEquals(listOf("ball.motion", "ball.compare"), withMedia.drop(1).take(2).map { it.lensId })
        }
    }

    @Test fun blankLensTitleFallsBackToKindName() {
        val d = OfflineDetect("x", "X", "s", listOf("a"), listOf(OfflineLens("x.flow", "flow", "", null, listOf("a"))))
        assertEquals("Flow", OfflineConvert.toDetection(d).lenses.single().title)
    }

    /** A square still goes in a 3:1 band so the step card fits the 600x600 display. */
    @Test fun stillBand() {
        assertEquals(792 to 264, StillBand.size(264, 264))
        assertEquals(1800 to 600, StillBand.size(600, 600))
        assertEquals(2000 to 500, StillBand.size(2000, 500)) // already wider: unchanged
        assertEquals(0 to 0, StillBand.size(0, 0))
    }
}
