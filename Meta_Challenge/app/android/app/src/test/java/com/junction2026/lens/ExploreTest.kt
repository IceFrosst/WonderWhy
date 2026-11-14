package com.junction2026.lens

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Explore lens: spec text, translations by index, tracks.json anchors at rest, the media rule, and the band layout. */
class ExploreTest {
    private val objs by lazy { OfflineCards.parse(appFile("shared/objects.json").readText()) }
    private fun exploreOf(id: String) = objs.getValue(id).lenses.firstOrNull { it.kind == Explore.KIND }

    /** About 9.5 px per character at 18 px: close to the toolkit font, enough to test the layout rules. */
    private val measure: (String, Float) -> Float = { t, px -> t.length * px * 0.53f }

    @Test fun lensIds() {
        assertTrue(Explore.isExplore("kettle.explore"))
        assertTrue(Explore.isExplore("sketch.explore"))
        assertFalse(Explore.isExplore("kettle.motion"))
        assertFalse(Explore.isExplore("explorer.motion"))
        assertFalse(Explore.isExplore(null))
        assertEquals("Explore", DetectionParser.kindName("explore"))
    }

    @Test fun specFromTheLibrary() {
        val k = exploreOf("kettle") ?: return
        val spec = k.explore!!
        assertEquals("Heating element", spec.label("element"))
        assertNull(spec.label("no-such-part"))
        val n = spec.numbers.filterNotNull().single()
        assertEquals(ExploreNumber("2000", "W", "heating power"), n)
        // Every labelled part of every object fits MODEL3D's 24 characters.
        for (o in objs.values) o.lenses.firstOrNull { it.kind == Explore.KIND }?.explore?.partLabels?.filterNotNull()?.forEach {
            assertTrue("${o.id}: $it", it.length <= Explore.LABEL_CHARS)
        }
    }

    /** `specText` has no ids: it is laid over the English spec by index; a missing piece stays English. */
    @Test fun translationOverlayByIndex() {
        val en = ExploreSpec(listOf("a", "b", "c"), listOf("Body", "Element", "Switch"), listOf(null, ExploreNumber("2000", "W", "heating power")))
        val fi = Explore.spec(MiniJson.parse("""{"parts":[{"label":"Runko"},null,{}],"beats":[{},{"number":{"label":"teho"}}]}"""))!!
        val m = en.overlay(fi)
        assertEquals(listOf("Runko", "Element", "Switch"), m.partLabels)
        assertEquals("Runko", m.label("a"))
        assertEquals(ExploreNumber("2000", "W", "teho"), m.numbers[1])
        assertNull(m.numbers[0])
        assertEquals(en, en.overlay(null))
    }

    /** The shipped Finnish file, merged the way the app does it (bundled English spec + `specText`). */
    @Test fun finnishLabelsFromTheTranslationFile() {
        val k = exploreOf("kettle") ?: return
        val tr = JSONObject(appFile("shared/i18n/fi.json").readText()).getJSONObject("objects").getJSONObject("kettle")
            .getJSONObject("chapters").optJSONObject("explore") ?: return
        val fi = Explore.specFromJson(tr.getJSONObject("spec").toString())
        val m = k.explore!!.overlay(fi)
        assertEquals(k.explore!!.partIds, m.partIds)
        assertTrue(m.label("element")!!.isNotBlank())
        assertTrue(m.label("element") != "Heating element")
        assertEquals("2000", m.numbers.filterNotNull().single().value) // the value stays as written
    }

    @Test fun sampleAtInterpolates() {
        val s = listOf(Triple(0.0, 0.0, 10.0), Triple(1.0, 100.0, 20.0), Triple(2.0, 100.0, 20.0))
        assertEquals(50.0 to 15.0, Explore.sampleAt(s, 0.5))
        assertEquals(0.0 to 10.0, Explore.sampleAt(s, -1.0))
        assertEquals(100.0 to 20.0, Explore.sampleAt(s, 9.0))
        assertEquals(100.0 to 20.0, Explore.sampleAt(s.reversed(), 1.0)) // unsorted input
        assertNull(Explore.sampleAt(emptyList(), 0.0))
    }

    /** kettle beat 2 at rest (t = loopFrom = 0.8): the element's anchor is (240.9, 402.6) in the 600 px frame. */
    @Test fun tracksAnchorsAtRest() {
        val f = appFile("bridge/media/kettle/explore/tracks.json")
        if (!f.isFile) return
        val t = Explore.tracks(f.readText())!!
        assertEquals(600, t.size)
        assertTrue(t.beats.size >= 2)
        val el = t.beats[1].labels.first { it.part == "element" }
        assertEquals(240.9, el.x, 0.05)
        assertEquals(402.6, el.y, 0.05)
        assertEquals('l', el.side)
        assertTrue(el.focus)
        // Every object's tracks: at most 3 labels per beat, every anchor inside the frame.
        for (dir in appFile("bridge/media").listFiles().orEmpty()) {
            val tf = dir.resolve("explore/tracks.json")
            if (!tf.isFile) continue
            val tr = Explore.tracks(tf.readText())!!
            for (b in tr.beats) {
                assertTrue(b.labels.size <= Explore.MAX_LABELS)
                for (a in b.labels) assertTrue("${dir.name} $a", a.x in 0.0..tr.size.toDouble() && a.y in 0.0..tr.size.toDouble())
            }
        }
    }

    @Test fun badTracks() {
        assertNull(Explore.tracks(null))
        assertNull(Explore.tracks("not json"))
        assertNull(Explore.tracks("""{"beats":"x"}"""))
        // Fractions are scaled to the frame; a label without samples is dropped; side falls back to the half.
        val t = Explore.tracks("""{"size":600,"beats":[{"loopFrom":1,"labels":[{"part":"a","anchor":[[0,0.25,0.5],[2,0.25,0.5]]},{"part":"b","anchor":[]}]}]}""")!!
        assertEquals(listOf(AnchorAt("a", 'l', false, 150.0, 300.0)), t.beats[0].labels)
    }

    /** Beats: labels only for parts the spec names, at most 3; the number from the spec, else from tracks. */
    @Test fun beatsFromTracksAndSpec() {
        val tracks = ExploreTracks(600, listOf(
            TrackBeat(emptyList(), null),
            TrackBeat(listOf(AnchorAt("a", 'l', true, 100.0, 200.0), AnchorAt("x", 'r', false, 400.0, 200.0)), ExploreNumber("9", "m", "t")),
        ))
        val spec = ExploreSpec(listOf("a"), listOf("Arm"), listOf(null, null))
        val b = Explore.beats(tracks, spec, 3)
        assertEquals(3, b.size)
        assertEquals(listOf(ExploreLabel("Arm", 'l', true, 100.0, 200.0)), b[1].labels)
        assertEquals(ExploreNumber("9", "m", "t"), b[1].number)
        assertEquals("9 m t · Arm", b[1].alt)
        assertNull(b[0].alt)
        assertEquals(ExploreBeat(emptyList(), null), b[2])
        // No spec: no labels (a part id is never shown as a label), the tracks' number stays.
        assertTrue(Explore.beats(tracks, null, 2)[1].labels.isEmpty())
        assertEquals(2, Explore.beats(null, null, 2).size)
    }

    /** The media rule: an Explore lens shows only with a text-free still for every beat. */
    @Test fun exploreNeedsItsMedia() {
        fun det(media: String) = DetectionParser.parse("""{"objectId":"kettle","label":"Kettle","confidence":0.9,
            "lenses":[{"id":"kettle.explore","kind":"explore","title":"How it works","steps":["one","two"],"specText":{"parts":[{"label":"Vastus"}]}},
                      {"id":"kettle.motion","kind":"motion","title":"Motion","steps":["m"]}]$media}""")
        val none = det("")
        assertEquals(listOf("kettle.motion"), DetectionParser.tracks(none).map { it.lensId })
        assertEquals(listOf("Vastus"), none.lenses[0].exploreText!!.partLabels)
        assertNull(none.lenses[1].exploreText)
        val full = det(""","media":{"base":"/media/kettle","lenses":{"kettle.explore":{"stills":["explore/s1.png","explore/s2.png"],"clean":["explore/c1.png","explore/c2.png"],"tracks":"explore/tracks.json"}}}""")
        assertEquals(listOf("kettle.explore", "kettle.motion"), DetectionParser.tracks(full).map { it.lensId })
        assertEquals(listOf("explore/c1.png", "explore/c2.png"), DetectionParser.stills(full, "kettle.explore")) // never the captioned ones
        assertEquals("explore/tracks.json", full.media!!.lenses["kettle.explore"]!!.tracks)
        val short = det(""","media":{"base":"/media/kettle","lenses":{"kettle.explore":{"clean":["explore/c1.png"]}}}""")
        assertEquals(listOf("kettle.motion"), DetectionParser.tracks(short).map { it.lensId })
    }

    /** Saved cards: every bundled manifest with an Explore entry opens on Explore, its stills and tracks on disk. */
    @Test fun savedCardsOpenOnExplore() {
        var seen = 0
        for (o in objs.values) {
            val f = appFile("bridge/media").resolve("${o.id}/manifest.json")
            if (!f.isFile || o.lenses.firstOrNull()?.kind != Explore.KIND) continue
            val m = OfflineConvert.media(o.id, f.readText()) ?: continue
            val lm = m.lenses["${o.id}.explore"] ?: continue
            seen++
            val det = OfflineConvert.toDetection(OfflineCards.toDetect(o), m)
            val tracks = DetectionParser.tracks(det)
            assertEquals(o.id, "${o.id}.explore", tracks.first().lensId)
            assertTrue(tracks.size <= DetectionParser.MAX_LENSES)
            assertEquals(o.lenses.first().explore, det.lenses.first().exploreText)
            for (c in lm.clean) assertTrue(c, appFile("bridge/media/${o.id}/$c").isFile)
            assertTrue(appFile("bridge/media/${o.id}/${lm.tracks}").isFile)
            // Labels resolve for the beats that list them, numbers for the beats that have one.
            val beats = Explore.beats(Explore.tracks(appFile("bridge/media/${o.id}/${lm.tracks}").readText()), o.lenses.first().explore, tracks.first().steps.size)
            assertTrue(o.id, beats.any { it.labels.isNotEmpty() })
            assertTrue(o.id, beats.any { it.number != null })
        }
        assertTrue("objects with Explore media: $seen", seen >= 1 || objs.values.none { it.lenses.firstOrNull()?.kind == Explore.KIND })
    }

    /** Layout: labels inside the band, at least 16 px, apart on each side, clear of the number block; picture centred. */
    @Test fun layoutKeepsLabelsReadableAndApart() {
        val box = CropBox(150, 60, 450, 520)
        val labels = listOf(
            ExploreLabel("Steam switch", 'r', true, 420.0, 110.0),
            ExploreLabel("Water", 'l', true, 220.0, 310.0),
            ExploreLabel("Heating element", 'l', true, 240.0, 315.0), // almost the same height: pushed apart
        )
        for (h in listOf(StillFrame.MIN_H, 222, StillFrame.MAX_H)) {
            val l = ExploreLayoutCalc.layout(box, 600, 552, h, ExploreBeat(labels, ExploreNumber("2000", "W", "heating power")), measure)
            assertTrue(l.scale > 0f && l.imgX >= ExploreLayoutCalc.COL - 1 && l.imgY >= -0.5f)
            assertTrue(box.height * l.scale <= h + 0.5f)
            assertEquals(3, l.labels.size)
            for (p in l.labels) {
                assertTrue("$h $p", p.px >= ExploreLayoutCalc.LABEL_MIN_PX)
                assertTrue("$h $p", p.x >= 0f && p.x + p.w <= 552f + 0.5f)
                assertTrue("$h $p", p.y - p.px / 2 >= 0f && p.y + p.px / 2 <= h.toFloat())
            }
            val left = l.labels.filter { it.left }.sortedBy { it.y }
            assertTrue("$h $left", left[1].y - left[0].y >= ExploreLayoutCalc.LINE - 0.01f)
            val n = l.number!!
            assertTrue(n.left == (left.size <= 1)) // the number goes to the side with fewer labels: right here
            assertTrue(n.top >= 0f && n.top + ExploreLayoutCalc.numberHeight(n.lines.size) <= h + 0.5f)
            for (p in l.labels.filter { it.left == n.left }) assertTrue("$h $p above $n", p.y + p.px / 2 <= n.top)
        }
    }

    @Test fun layoutWithoutTextUsesTheWholeBand() {
        val box = CropBox(100, 100, 500, 400)
        val plain = ExploreLayoutCalc.layout(box, 600, 552, 222, ExploreBeat(emptyList(), null), measure)
        val none = ExploreLayoutCalc.layout(box, 600, 552, 222, null, measure)
        assertEquals(222f / 300, plain.scale, 0.001f)
        assertEquals(plain, none)
        assertTrue(plain.labels.isEmpty() && plain.number == null)
        // A wide drawing with labels shrinks so both columns stay free.
        val wide = ExploreLayoutCalc.layout(CropBox(0, 200, 600, 400), 600, 552, 222, ExploreBeat(listOf(ExploreLabel("A", 'l', false, 10.0, 300.0)), null), measure)
        assertTrue(wide.imgX >= ExploreLayoutCalc.COL - 0.5f)
    }

    @Test fun longLabelsShrinkThenCut() {
        val m: (String, Float) -> Float = { t, px -> t.length * px * 0.53f }
        assertEquals("Water" to ExploreLayoutCalc.LABEL_PX, ExploreLayoutCalc.fit("Water", 200f, m))
        assertEquals(ExploreLayoutCalc.LABEL_MIN_PX, ExploreLayoutCalc.fit("Heating element", 130f, m).second)
        val cut = ExploreLayoutCalc.fit("A very long label of 24c", 80f, m)
        assertTrue(cut.first.endsWith("…") && m(cut.first, cut.second) <= 80f)
        assertEquals(listOf("range of a 10 m/s", "throw, no air"), ExploreLayoutCalc.wrap("range of a 10 m/s throw, no air", 160f, 16f, 2, m))
        val two = ExploreLayoutCalc.wrap("one two three four five six seven eight nine ten", 60f, 16f, 2, m)
        assertEquals(2, two.size)
        assertTrue(two.last().endsWith("…"))
        assertTrue(ExploreLayoutCalc.wrap("  ", 60f, 16f, 2, m).isEmpty())
    }
}
