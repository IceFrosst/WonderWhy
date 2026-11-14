package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Reads the app's fixture assets (the same files fixture mode serves). */
internal fun fixture(name: String): String {
    val candidates = listOf("src/main/assets/fixture/$name", "app/src/main/assets/fixture/$name")
    val f = candidates.map(::File).firstOrNull { it.isFile } ?: error("fixture $name not found from ${File(".").absolutePath}")
    return f.readText()
}

class DetectionParserTest {
    @Test fun fullV1Response() {
        val d = DetectionParser.parse(fixture("detect_ball.json"))
        assertEquals("ball", d.objectId)
        assertEquals("Thrown ball", d.label)
        assertEquals(0.93, d.confidence, 1e-9)
        assertFalse(d.lowConfidence)
        assertEquals("Gravity bends the path into a curve.", d.summary)
        assertEquals(3, d.steps.size)
        assertEquals(2, d.lenses.size)
        val bounce = d.lenses[1]
        assertEquals("ball.compare", bounce.id)
        assertEquals("compare", bounce.kind)
        assertEquals("Bounce", bounce.title)
        assertEquals("Each bounce keeps only part of the energy.", bounce.lead)
        assertEquals(3, bounce.steps.size)
        assertNull(d.lenses[0].lead)
        val m = d.media!!
        assertEquals("/media/ball", m.base)
        assertEquals(listOf("s1.png", "s2.png"), m.lenses["ball.motion"]!!.stills)
        assertEquals("clip.mp4", m.lenses["ball.motion"]!!.clip)

        val v = DetectionParser.verdict(d) as Verdict.Explainer
        assertEquals(listOf("Projectile motion", "Bounce"), v.tracks.map { it.title })
        assertEquals(listOf("s1.png", "s2.png"), DetectionParser.stills(d, "ball.motion"))
        assertTrue(DetectionParser.stills(d, "ball.compare").isEmpty())
    }

    @Test fun guitarFixtureHasOneLensAndOneStill() {
        val d = DetectionParser.parse(fixture("detect_guitar.json"))
        val v = DetectionParser.verdict(d) as Verdict.Explainer
        assertEquals(1, v.tracks.size)
        assertEquals("guitar.motion", v.tracks[0].lensId)
        assertEquals(listOf("s1.png"), DetectionParser.stills(d, "guitar.motion"))
    }

    @Test fun oldResponseHasDefaultsAndGivesTodaysCard() {
        val text = """{"type":"show","reqId":"r1","objectId":"kettle","label":"Kettle","confidence":0.8,
            "timings":{"detectMs":1200,"model":"gemini"},"t_sent":1731500000000}"""
        val d = DetectionParser.parse(text)
        assertEquals(Detection("kettle", "Kettle", 0.8, null, reqId = "r1"), d) // reqId kept for the /rendered ack
        assertEquals(Verdict.Plain(d), DetectionParser.verdict(d))
    }

    @Test fun oldBridgeLocalRuleStillApplies() {
        val unknown = DetectionParser.parse("""{"objectId":"unknown","label":"Lamp","confidence":0.9,"answer":"A desk lamp."}""")
        assertEquals(Verdict.Unrecognised("A desk lamp."), DetectionParser.verdict(unknown))
        val weak = DetectionParser.parse("""{"objectId":"ball","label":"Thrown ball","confidence":0.3}""")
        assertEquals(Verdict.Unrecognised(null), DetectionParser.verdict(weak))
        // Old bridge with nothing at all: same defaults as the old org.json code.
        val empty = DetectionParser.parse("{}")
        assertEquals(Detection("unknown", "", 0.0, null), empty)
        assertTrue(DetectionParser.verdict(empty) is Verdict.Unrecognised)
    }

    @Test fun lowConfidenceIsNotSureAndNeverAScene() {
        val d = DetectionParser.parse(fixture("detect_lowconf.json"))
        assertTrue(d.lowConfidence)
        assertEquals(Verdict.NotSure("Guitar string"), DetectionParser.verdict(d))
        // Even with high confidence and lenses, lowConfidence wins.
        val strong = DetectionParser.parse(
            """{"objectId":"ball","label":"Thrown ball","confidence":0.95,"lowConfidence":true,
               "lenses":[{"id":"ball.motion","kind":"motion","title":"Projectile motion","steps":["a"]}]}"""
        )
        assertEquals(Verdict.NotSure("Thrown ball"), DetectionParser.verdict(strong))
    }

    @Test fun mediaWithoutStillsAndEmptyLenses() {
        val d = DetectionParser.parse(
            """{"objectId":"phone","label":"Phone","confidence":0.9,"summary":"s",
               "lenses":[],"steps":null,
               "media":{"base":"/media/phone","lenses":{"phone.inside":{"clip":"clip.mp4"}}}}"""
        )
        assertTrue(d.lenses.isEmpty())
        assertTrue(d.steps.isEmpty())
        assertEquals(LensMedia(emptyList(), "clip.mp4"), d.media!!.lenses["phone.inside"])
        assertTrue(DetectionParser.stills(d, "phone.inside").isEmpty())
        assertEquals(Verdict.Plain(d), DetectionParser.verdict(d)) // nothing to step through
    }

    @Test fun oddFieldsAreIgnored() {
        val d = DetectionParser.parse(
            """{"objectId":"ball","label":"Ball","confidence":"0.7","lowConfidence":"yes","summary":"  ",
               "steps":["one", 2, null, "", "two"],
               "lenses":[{"id":"x.motion","kind":"motion","steps":"nope"},
                         {"kind":"flow","title":"no id","steps":["a"]},
                         "junk",
                         {"id":"x.zoom","kind":"zoom","steps":["z1"]}],
               "media":{"lenses":{}}}"""
        )
        assertEquals(0.7, d.confidence, 1e-9) // numeric string accepted
        assertFalse(d.lowConfidence) // only a real true counts
        assertNull(d.summary)
        assertEquals(listOf("one", "two"), d.steps)
        assertEquals(listOf("x.motion", "x.zoom"), d.lenses.map { it.id })
        assertEquals("Motion", d.lenses[0].title) // missing title falls back to the kind's name
        assertTrue(d.lenses[0].steps.isEmpty())
        assertNull(d.media) // no base: unusable
        // The lens without steps is not offered.
        val tracks = DetectionParser.tracks(d)
        assertEquals(listOf("x.zoom"), tracks.map { it.lensId })
    }

    @Test fun stepsWithoutLensesMakeOneTrack() {
        val d = DetectionParser.parse("""{"objectId":"kettle","label":"Kettle","confidence":0.9,"steps":["a","b"]}""")
        val v = DetectionParser.verdict(d) as Verdict.Explainer
        assertEquals(1, v.tracks.size)
        assertEquals("Kettle", v.tracks[0].title)
        assertEquals(listOf("a", "b"), v.tracks[0].steps)
        assertNull(v.tracks[0].lensId)
    }

    @Test fun lensesCappedAtFive() {
        val lenses = (1..7).joinToString(",") { """{"id":"o.l$it","kind":"motion","title":"L$it","steps":["s"]}""" }
        val d = DetectionParser.parse("""{"objectId":"o","label":"O","confidence":0.9,"lenses":[$lenses]}""")
        assertEquals(7, d.lenses.size)
        assertEquals(5, DetectionParser.tracks(d).size)
    }

    @Test fun stillUrls() {
        assertEquals("http://10.0.2.2:8787/media/ball/s1.png", DetectionParser.stillUrl("http://10.0.2.2:8787/", "/media/ball", "s1.png"))
        assertEquals("/media/ball/s1.png", DetectionParser.stillPath("media/ball/", "s1.png"))
        assertNull(DetectionParser.stillPath("/media/ball", "../secret"))
        assertNull(DetectionParser.stillPath("/media/ball", "https://evil/x.png"))
        assertNull(DetectionParser.stillPath("/media/ball", ""))
    }

    @Test fun jsonEdgeCases() {
        val d = DetectionParser.parse("""  {"objectId":"a\"b","label":"café \/ x\n","confidence":1e0,"answer":"ok"}  """)
        assertEquals("a\"b", d.objectId)
        assertEquals("café / x\n", d.label)
        assertEquals(1.0, d.confidence, 1e-9)
        assertEquals("ok", d.answer)
    }

    @Test(expected = JsonParseException::class) fun brokenJsonThrows() {
        DetectionParser.parse("""{"objectId":"ball",""")
    }

    @Test(expected = JsonParseException::class) fun nonObjectThrows() {
        DetectionParser.parse("[1,2]")
    }
}
