package com.junction2026.lens

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SketchParseTest {
    /** The bridge's recorded sketch (SKETCH_PROVIDER=fixture) inside an unknown show, as waitSketch returns it. */
    private fun show(sketchJson: String?, extra: String = "") =
        """{"type":"show","reqId":"r","objectId":"unknown","label":"Unknown object","lang":"en","confidence":0,
            "answer":"Mock mode: no model key set."${if (sketchJson != null) ",\"sketch\":$sketchJson" else ""}$extra}"""

    private val stapler by lazy { appFile("bridge/fixtures/sketch-stapler.json").readText() }

    @Test fun parsesTheBridgeFixture() {
        val d = DetectionParser.parse(show(stapler))
        val s = d.sketch!!
        assertEquals("Desk stapler", s.label)
        assertFalse(s.verified)
        // The fixture grows with the bridge (an Explore chapter first since 14 Nov): assert what the app needs.
        assertTrue(s.chapters.size in 2..DetectionParser.MAX_SKETCH_CHAPTERS)
        val flow = s.chapters.single { it.lens == "flow" }
        assertEquals("Follow the force", flow.title)
        assertEquals(4, flow.captions.size)
        assertTrue(s.chapters.any { it.lens == "number" })
        val v = DetectionParser.verdict(d) as Verdict.Sketched
        // No rendered media for the sketch: its Explore chapter is skipped, the 2D chapters stay in order.
        assertTrue(v.tracks.none { Explore.isExplore(it.lensId) })
        assertEquals(listOf("sketch.flow", "sketch.number"), v.tracks.map { it.lensId }.filter { it == "sketch.flow" || it == "sketch.number" })
        assertEquals(s.chapters.filter { it.lens != "explore" }.map { it.captions.size }, v.tracks.map { it.steps.size })
        assertEquals(AskTarget.Unknown, AskFlow.target(d))
    }

    /** The fixture's Explore chapter keeps its spec text; with rendered stills in `media` it becomes the first track. */
    @Test fun sketchExploreChapterOnlyWithMedia() {
        val d = DetectionParser.parse(show(stapler))
        val ex = d.sketch!!.chapters.firstOrNull { it.lens == "explore" } ?: return // fixture without one: nothing to check
        assertEquals("explore", d.sketch!!.chapters.first().lens) // MODEL3D: Explore is the first chapter
        val spec = ex.exploreText!!
        assertTrue(spec.partIds.filterNotNull().isNotEmpty())
        val clean = ex.captions.indices.joinToString(",") { "\"explore/c${it + 1}.png\"" }
        val media = ",\"media\":{\"base\":\"/media/sketch-r\",\"lenses\":{\"sketch.explore\":{\"clean\":[$clean],\"tracks\":\"explore/tracks.json\"}}}"
        val withMedia = DetectionParser.parse(show(stapler, media))
        val v = DetectionParser.verdict(withMedia) as Verdict.Sketched
        assertEquals("sketch.explore", v.tracks.first().lensId)
        assertEquals(ex.captions, v.tracks.first().steps)
        assertEquals("explore/c1.png", DetectionParser.stills(withMedia, "sketch.explore").first())
        // Fewer stills than beats: not usable, skipped.
        val short = media.replace(Regex("\\[\"explore/c1.png\".*?\\]"), "[\"explore/c1.png\"]")
        assertTrue((DetectionParser.verdict(DetectionParser.parse(show(stapler, short))) as Verdict.Sketched).tracks.none { Explore.isExplore(it.lensId) })
    }

    /** A sketch whose only chapter is an Explore chapter without media has nothing to show: the unknown card. */
    @Test fun exploreOnlySketchWithoutMediaIsUnrecognised() {
        val d = DetectionParser.parse(show("""{"label":"Mug","answer":"a","chapters":[{"lens":"explore","scene":"model3d","captions":["c"]}]}"""))
        assertEquals(Verdict.Unrecognised("Mock mode: no model key set."), DetectionParser.verdict(d))
    }

    @Test fun sketchErrorKeepsTheUnknownCard() {
        val d = DetectionParser.parse(show(null, ",\"sketchError\":\"sketch_failed\""))
        assertNull(d.sketch)
        assertEquals("sketch_failed", d.sketchError)
        assertEquals(Verdict.Unrecognised("Mock mode: no model key set."), DetectionParser.verdict(d))
    }

    @Test fun badChaptersAreDroppedAndAtMostTheCapKept() {
        val ch = """{"lens":"whatif","scene":"curve","title":"T","captions":["c"]}"""
        val many = """{"label":"Mug","answer":"a","verified":false,"chapters":[$ch,$ch,{"lens":"flow","captions":[]},$ch,$ch]}"""
        assertEquals(DetectionParser.MAX_SKETCH_CHAPTERS, DetectionParser.parse(show(many)).sketch!!.chapters.size)
        val none = """{"label":"Mug","chapters":[{"lens":"flow","captions":[" "]},"x"]}"""
        assertNull(DetectionParser.parse(show(none)).sketch)
        // Missing title falls back to the lens name; missing verified counts as unverified.
        val s = DetectionParser.parse(show("""{"label":"Mug","chapters":[{"lens":"number","captions":["c"]}]}""")).sketch!!
        assertEquals("The number", s.chapters[0].title)
        assertFalse(s.verified)
    }

    @Test fun sketchOnALibraryObjectIsIgnoredByTheVerdict() {
        val ball = JSONObject(fixture("detect_ball.json")).put("sketch", JSONObject(stapler)).toString()
        assertTrue(DetectionParser.verdict(DetectionParser.parse(ball)) is Verdict.Explainer)
    }
}
