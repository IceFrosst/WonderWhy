package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AskFlowTest {
    private val ball = DetectionParser.parse(fixture("detect_ball.json"))

    @Test fun parsesAskResponseWithLensHint() {
        val text = """{"type":"show","reqId":"a1","objectId":"kettle","label":"Boiling kettle","lang":"en",
            "confidence":1,"question":"why does it click off?","answer":"A bimetal strip bends when the steam reaches it.",
            "lensHint":{"id":"kettle.cutaway","step":3},"summary":"s",
            "lenses":[{"id":"kettle.flow","kind":"flow","title":"Flow","steps":["a","b"]},
                      {"id":"kettle.cutaway","kind":"cutaway","title":"Cutaway","steps":["c","d","e"]}]}"""
        val d = DetectionParser.parse(text)
        assertEquals("why does it click off?", d.question)
        assertEquals(LensHint("kettle.cutaway", 3), d.lensHint)
        assertEquals("en", d.lang)
        val tracks = DetectionParser.tracks(d)
        assertEquals(1 to 2, AskFlow.position(tracks, d.lensHint))
        assertEquals("Cutaway 3/3", AskFlow.openLabel(tracks[1], 2))
    }

    @Test fun lensHintAbsentOrBad() {
        assertNull(DetectionParser.parse("""{"objectId":"ball","lensHint":null}""").lensHint)
        assertNull(DetectionParser.parse("""{"objectId":"ball","lensHint":{"step":2}}""").lensHint)
        // A step that is not a positive whole number means step 1.
        assertEquals(LensHint("ball.motion", 1), DetectionParser.parse("""{"objectId":"ball","lensHint":{"id":"ball.motion","step":0}}""").lensHint)
        val tracks = DetectionParser.tracks(ball)
        assertNull(AskFlow.position(tracks, null))
        assertNull(AskFlow.position(tracks, LensHint("kettle.flow", 1)))
        assertEquals(0 to 2, AskFlow.position(tracks, LensHint("ball.motion", 9))) // clamped to the last step
    }

    @Test fun targetNeedsALibraryResult() {
        assertEquals(AskTarget.NoResult, AskFlow.target(null))
        assertEquals(AskTarget.Object("ball"), AskFlow.target(ball))
        assertEquals(AskTarget.NoResult, AskFlow.target(DetectionParser.parse(fixture("detect_lowconf.json"))))
        assertEquals(AskTarget.Unknown, AskFlow.target(Detection("unknown", "Unknown object", 0.0, "x")))
    }

    @Test fun wordCaps() {
        val a = AskFlow.answerText(
            "Thrown ball and its bounce",
            "why does the ball curve down when I throw it so hard across the park today",
            (1..30).joinToString(" ") { "w$it" } + ".",
        )
        assertEquals("Thrown ball and its…", a.title)
        assertEquals(12, a.question.removeSuffix("…").split(" ").size)
        assertTrue(a.answer.endsWith("…"))
        assertEquals(24, a.answer.removeSuffix("…").split(" ").size)
        assertEquals("Short answer.", AskFlow.cap("  Short   answer. ", 24))
    }

    @Test fun localAnswerPicksTheStepByWordOverlap() {
        val d = AskFlow.localAnswer(ball, "Why does it curve?")
        assertEquals(LensHint("ball.motion", 1), d.lensHint)
        assertTrue(d.answer!!.contains("parabola"))
        assertEquals("Why does it curve?", d.question)
        val bounce = AskFlow.localAnswer(ball, "why is each bounce lower")
        assertEquals("ball.compare", bounce.lensHint?.id)
    }

    @Test fun localAnswerWithoutMatchGivesSummaryAndNoHint() {
        val d = AskFlow.localAnswer(ball, "what is it?")
        assertNull(d.lensHint)
        assertEquals(ball.summary, d.answer)
    }
}
