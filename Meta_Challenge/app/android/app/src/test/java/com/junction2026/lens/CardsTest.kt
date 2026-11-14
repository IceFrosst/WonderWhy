package com.junction2026.lens

import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Glasses cards as data: words, DESIGN.md caps, lens bar, and whether every library card fits 600x600. */
class CardsTest {
    @After fun resetLang() { Cards.lang = "en" }

    private fun words(s: String) = s.trim().split(Regex("\\s+")).size

    /** shared/objects.json, with shared/i18n/<lang>.json merged in the way the bridge's /objects?lang= does. */
    private fun library(lang: String): Map<String, OfflineObject> {
        val base = JSONObject(appFile("shared/objects.json").readText())
        if (lang == "en") return OfflineCards.parse(base.toString())
        val tr = JSONObject(appFile("shared/i18n/$lang.json").readText()).getJSONObject("objects")
        val arr = base.getJSONArray("objects")
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            val t = tr.optJSONObject(o.getString("id")) ?: continue
            for (k in listOf("label", "answer")) if (t.has(k)) o.put(k, t.getString(k))
            val chapters = o.getJSONArray("chapters")
            val tc = t.optJSONObject("chapters") ?: continue
            for (j in 0 until chapters.length()) {
                val c = chapters.getJSONObject(j)
                val x = tc.optJSONObject(c.getString("lens")) ?: continue
                for (k in listOf("title", "lead")) if (x.has(k)) c.put(k, x.getString(k))
                if (x.has("captions")) c.put("captions", x.getJSONArray("captions"))
            }
        }
        return OfflineCards.parse(base.toString())
    }

    private fun tracksOf(o: OfflineObject) = DetectionParser.tracks(OfflineConvert.toDetection(OfflineCards.toDetect(o)))

    @Test fun consentWordsWithinStateCardCaps() {
        for (tag in listOf("en", "fi")) {
            Cards.lang = tag
            val c = Cards.consent({}, {})
            assertTrue("$tag title ${c.title}", words(c.title!!) <= 3)
            for (line in c.texts.drop(1)) assertTrue("$tag: $line", words(line) <= 8)
            assertEquals(Lang.ui(tag, Lang.AGREE), c.actions!!.primary) // pinch = Agree
            assertEquals(Lang.ui(tag, Lang.NOT_NOW), c.actions!!.secondary)
            assertTrue(CardFit.fits(c))
        }
        // What the wearer agrees to is said on the card: one photo per pinch, a model, not saved.
        val en = Cards.apply { lang = "en" }.consent({}, {}).summary
        assertTrue(en, en.contains("one photo") && en.contains("model") && en.contains("Not saved"))
    }

    @Test fun summaryMirrorsTheCard() {
        Cards.lang = "en"
        assertEquals("Physics Lens | Look at something and pinch", Cards.idle().summary)
        assertEquals("T | d | [Try again / Done]", Cards.error("T", "d", {}, {}).summary)
    }

    /** DESIGN.md: one dot per lens, the current one filled, never more than 5; the counter is text too. */
    @Test fun lensBarWithFiveLenses() {
        val tracks = (1..5).map { Track("o.l$it", "Lens number $it here", null, listOf("s")) }
        val s = ExplainerState(tracks, lens = 2, step = 0)
        assertEquals("○○●○○ 3/5 Lens number 3…", Cards.lensBar(s))
        assertTrue(words(Cards.lensBar(s)) <= 8)
    }

    @Test fun overviewHintInEnglishAndFinnish() {
        assertEquals("Pinch: 3 steps. Left/right: 5 lenses.", Lang.overviewHint("en", 3, 5))
        assertEquals("Pinch: 1 step.", Lang.overviewHint("en", 1, 1))
        assertEquals("Nipistys: 3 vaihetta. Vasen/oikea: 5 linssiä.", Lang.overviewHint("fi", 3, 5))
        assertTrue(words(Lang.overviewHint("fi", 4, 5)) <= 8)
    }

    /**
     * Every card of every library object (7 objects on 14 Nov, up to 5 lenses) in English and Finnish fits the
     * 600x600 display by the [CardFit] estimate: overview, each step as text (offline: no still), and the
     * offline picker with its counter. Assert on the whole library, whatever its size.
     */
    @Test fun everyLibraryCardFitsInEnglishAndFinnish() {
        val over = ArrayList<String>()
        val tallest = HashMap<String, Pair<Int, String>>() // card kind -> (height, which)
        fun note(kind: String, h: Int, which: String) { if (h > (tallest[kind]?.first ?: 0)) tallest[kind] = h to which }
        for (tag in listOf("en", "fi")) {
            Cards.lang = tag
            val lib = library(tag)
            assertTrue(lib.size >= 6)
            val picker = OfflinePicker(lib.keys.toList())
            lib.values.forEachIndexed { i, o ->
                val p = picker.move(i)
                val pick = Cards.offlinePicker(p, o.label, o.tagline, {}, {})
                if (!CardFit.fits(pick)) over += "$tag ${o.id} picker ${CardFit.height(pick)}"
                note("picker", CardFit.height(pick), "$tag ${o.id}")
                val tracks = tracksOf(o)
                assertTrue(tracks.size <= DetectionParser.MAX_LENSES)
                val ov = ExplainerState(tracks)
                val ovCard = Cards.explainer(ov, o.label, o.answer, null, null, {}, {}, saved = true)
                if (!CardFit.fits(ovCard)) over += "$tag ${o.id} overview ${CardFit.height(ovCard)}"
                note("overview", CardFit.height(ovCard), "$tag ${o.id}")
                tracks.forEachIndexed { l, t ->
                    t.steps.indices.forEach { st ->
                        val card = Cards.explainer(ExplainerState(tracks, l, st), o.label, o.answer, null, null, {}, {}, saved = true)
                        if (!CardFit.fits(card)) over += "$tag ${t.lensId} step ${st + 1}: ${CardFit.height(card)}"
                        note("text step", CardFit.height(card), "$tag ${t.lensId} step ${st + 1}")
                    }
                }
            }
        }
        println("CARD FIT TALLEST: $tallest")
        assertEquals(emptyList<String>(), over)
    }

    /** Step cards with a still: the band height from [StillFrame] plus the text still fits. */
    @Test fun stepCardsWithStillsFit() {
        val over = ArrayList<String>()
        for (tag in listOf("en", "fi")) {
            Cards.lang = tag
            for (o in library(tag).values) {
                val tracks = tracksOf(o)
                tracks.forEachIndexed { l, t ->
                    t.steps.indices.forEach { st ->
                        val s = ExplainerState(tracks, l, st)
                        val caption = "${Cards.t(Lang.STEP)} ${s.counter}. ${t.steps[st]}"
                        val metaLines = if (tracks.size > 1) 1 else 0
                        val stillPx = StillFrame.stillHeight(caption.length, metaLines)
                        val text = Cards.explainer(s, o.label, o.answer, null, null, {}, {})
                        // With a still the lead is not shown; the still's band takes its place (a Bitmap cannot be
                        // made in a JVM test, so it is counted by height).
                        val card = CardSpec(text.items.filterNot { it is CardItem.Text && it.text == t.lead })
                        val h = CardFit.height(card) + 12 + stillPx
                        if (h > CardFit.DISPLAY) over += "$tag ${t.lensId} step ${st + 1}: $h"
                    }
                }
            }
        }
        assertEquals(emptyList<String>(), over)
    }

    @Test fun wrapEstimate() {
        assertEquals(1, CardFit.lines("short", 38))
        assertEquals(2, CardFit.lines("a".repeat(30) + " " + "b".repeat(30), 38))
        assertEquals(3, CardFit.lines("x".repeat(100), 38)) // one long word breaks over lines
    }
}
