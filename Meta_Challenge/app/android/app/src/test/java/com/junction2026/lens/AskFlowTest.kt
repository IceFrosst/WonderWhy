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

    private fun resource(name: String): String =
        requireNotNull(javaClass.classLoader?.getResource(name)) { "test resource $name" }.readText()

    /**
     * Recorded from the real bridge on 14 Nov (`POST /ask` on :8787, provider mock): a normal show with every
     * lens, media, the question, the matching caption as answer, lensHint and our reqId echoed.
     */
    @Test fun realBridgeAskResponse() {
        val d = DetectionParser.parse(resource("bridge_ask_ball.json"))
        assertEquals("rec-ask-ball", d.reqId) // what the /rendered ack sends back
        assertEquals("ball", d.objectId)
        assertEquals("why is each bounce lower", d.question)
        assertEquals(LensHint("ball.compare", 1), d.lensHint)
        assertTrue(d.answer!!.startsWith("Each bounce is lower"))
        val tracks = DetectionParser.tracks(d)
        assertTrue(tracks.size >= 2)
        val pos = AskFlow.position(tracks, d.lensHint)!!
        assertEquals("ball.compare", tracks[pos.first].lensId)
        assertEquals(0, pos.second)
        assertTrue(d.media != null && DetectionParser.stills(d, "ball.compare").isNotEmpty())
        assertEquals(d.answer, AskFlow.answerLine(d))
    }

    /** Real bridge, nothing matches: `answer: ""` and no lensHint. The card shows the summary, button "Show steps". */
    @Test fun realBridgeNoMatchShowsTheSummary() {
        val d = DetectionParser.parse(resource("bridge_ask_nomatch_fi.json"))
        assertEquals("fi", d.lang)
        assertNull(d.answer)
        assertNull(d.lensHint)
        assertTrue(d.summary!!.isNotBlank())
        assertEquals(d.summary, AskFlow.answerLine(d))
    }

    /** The phone answers by itself only for a bridge with no /ask (404) or no bridge at all. */
    @Test fun phoneFallbackOnlyWithoutAsk() {
        assertTrue(AskFlow.answerOnPhone(404, "", offline = false))
        assertTrue(AskFlow.answerOnPhone(404, "not_found", offline = false)) // the bridge's own unknown-route body
        assertTrue(AskFlow.answerOnPhone(0, "", offline = true))
        assertTrue(AskFlow.answerOnPhone(502, "", offline = true)) // a proxy with no bridge behind it
        assertTrue(!AskFlow.answerOnPhone(401, "unauthorized", offline = false))
        assertTrue(!AskFlow.answerOnPhone(400, "bad_request", offline = false))
        assertTrue(!AskFlow.answerOnPhone(502, "detect_timeout", offline = false))
        assertTrue(!AskFlow.answerOnPhone(502, "detect_failed", offline = false))
        assertTrue(!AskFlow.answerOnPhone(404, "unknown_request", offline = false))
        assertTrue(!AskFlow.answerOnPhone(0, "", offline = false)) // reached but timed out: a real error card
    }
}
