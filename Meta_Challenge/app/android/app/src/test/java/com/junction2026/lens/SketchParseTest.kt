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
        assertEquals(2, s.chapters.size)
        assertEquals("flow", s.chapters[0].lens)
        assertEquals("Follow the force", s.chapters[0].title)
        assertEquals(4, s.chapters[0].captions.size)
        val v = DetectionParser.verdict(d) as Verdict.Sketched
        assertEquals(listOf("sketch.flow", "sketch.number"), v.tracks.map { it.lensId })
        assertEquals(listOf(4, 3), v.tracks.map { it.steps.size })
        assertEquals(AskTarget.Unknown, AskFlow.target(d))
    }

    @Test fun sketchErrorKeepsTheUnknownCard() {
        val d = DetectionParser.parse(show(null, ",\"sketchError\":\"sketch_failed\""))
        assertNull(d.sketch)
        assertEquals("sketch_failed", d.sketchError)
        assertEquals(Verdict.Unrecognised("Mock mode: no model key set."), DetectionParser.verdict(d))
    }

    @Test fun badChaptersAreDroppedAndAtMostThreeKept() {
        val ch = """{"lens":"whatif","scene":"curve","title":"T","captions":["c"]}"""
        val many = """{"label":"Mug","answer":"a","verified":false,"chapters":[$ch,$ch,{"lens":"flow","captions":[]},$ch,$ch]}"""
        assertEquals(3, DetectionParser.parse(show(many)).sketch!!.chapters.size)
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
