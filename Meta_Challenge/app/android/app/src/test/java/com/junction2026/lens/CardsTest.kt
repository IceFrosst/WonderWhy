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

    /** Tracks as a saved card opens them: with the bundled stills, so an Explore lens (when it has media) comes first. */
    private fun tracksOf(o: OfflineObject): List<Track> {
        val manifest = appFile("bridge/media").resolve("${o.id}/manifest.json").takeIf { it.isFile }?.readText()
        return DetectionParser.tracks(OfflineConvert.toDetection(OfflineCards.toDetect(o), OfflineConvert.media(o.id, manifest)))
    }

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
        assertEquals("T | d | [Try again]", Cards.error("T", {}, "d").summary)
        assertEquals("T | Try again in a moment. | [Try again]", Cards.error("T", {}).summary)
        Cards.lang = "fi"
        assertEquals("T | Yritä hetken päästä uudelleen. | [Yritä uudelleen]", Cards.error("T", {}).summary)
    }

    /** Not sure: fixed words in the card's language, one button, never the bridge's answer. */
    @Test fun notSureCard() {
        Cards.lang = "en"
        assertEquals("Not sure | Look again, a bit closer. | [Again]", Cards.notSure {}.summary)
        Cards.lang = "fi"
        assertEquals("En ole varma | Katso uudelleen, vähän lähempää. | [Uudelleen]", Cards.notSure {}.summary)
    }

    @Test fun lookingIsCentredWithARealEllipsis() {
        Cards.lang = "en"
        assertEquals("Looking…", Cards.looking().title)
        assertTrue(Cards.looking().centered)
        Cards.lang = "fi"
        assertEquals("Katsotaan…", Cards.looking().title)
    }

    /** One button on explainer, result and answer cards (Back means Done); two on consent and decide cards. */
    @Test fun buttonCounts() {
        Cards.lang = "en"
        val tracks = listOf(Track("o.a", "Lens A", "lead", listOf("one", "two")), Track("o.b", "Lens B", null, listOf("x")))
        for (st in listOf(ExplainerState(tracks), ExplainerState(tracks, 0, 0), ExplainerState(tracks, 1, 0))) {
            assertEquals(null, Cards.explainer(st, "Obj", "sum", null, null, {}).actions!!.secondary)
        }
        assertEquals(null, Cards.result("T", null, null, {}).actions!!.secondary)
        assertEquals(null, Cards.answer(AnswerText("T", "q", "a"), null, {}).actions!!.secondary)
        assertEquals("Not now", Cards.consent({}, {}).actions!!.secondary)
        assertEquals("No", Cards.decide("T", "d", "Yes", {}, "No", {}).actions!!.secondary)
    }

    /** Step card: the object is the heading, no lead, "Step 1/3" is the only counter. */
    @Test fun stepCardShape() {
        Cards.lang = "en"
        val tracks = listOf(Track("ball.motion", "Projectile motion", "The lead line.", listOf("Gravity pulls.", "Two.", "Three.")),
            Track("ball.compare", "Bounce", null, listOf("b")))
        val card = Cards.explainer(ExplainerState(tracks, 0, 0), "Thrown ball", "sum", null, null, {})
        assertEquals("Thrown ball | Step 1/3. Gravity pulls. | ●○ Projectile motion | [Next]", card.summary)
        assertTrue(card.texts.none { it.contains("lead line") })
    }

    /** PROTOCOL `standIn`: a small muted tag on the overview and the old result card, nowhere when unset. */
    @Test fun standInTag() {
        Cards.lang = "en"
        val tracks = listOf(Track("o.a", "A", null, listOf("one")))
        val ov = Cards.explainer(ExplainerState(tracks), "Obj", "sum", null, null, {}, standIn = true)
        assertTrue(ov.items.contains(CardItem.Text("Stand-in model", TextRole.META_MUTED)))
        assertTrue(Cards.result("T", null, "a", {}, standIn = true).texts.contains("Stand-in model"))
        assertTrue(Cards.explainer(ExplainerState(tracks), "Obj", "sum", null, null, {}).texts.none { it == "Stand-in model" })
    }

    @Test fun offlinePickerShape() {
        Cards.lang = "en"
        val p = OfflinePicker(listOf("a", "b", "c"), 1)
        assertEquals("Offline · pick a saved card | Kettle | Convection | 2/3 · Left/right: object. Pinch: open. | [Open / Try again]",
            Cards.offlinePicker(p, "Kettle", "Convection", {}, {}).summary)
        Cards.lang = "fi"
        val fi = Cards.offlinePicker(p, "Vedenkeitin", null, {}, {})
        assertEquals("Vedenkeitin", fi.title)
        assertEquals(2, fi.items.count { it is CardItem.Text && it.role != TextRole.HEADING })
    }

    /** DESIGN.md: one dot per lens, the current one filled, never more than 5; the counter is text too. */
    @Test fun lensBarWithFiveLenses() {
        val tracks = (1..5).map { Track("o.l$it", "Lens number $it here", null, listOf("s")) }
        val s = ExplainerState(tracks, lens = 2, step = 0)
        assertEquals("○○●○○ Lens number 3…", Cards.lensBar(s))
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
                val ovCard = Cards.explainer(ov, o.label, o.answer, null, null, {}, saved = true)
                if (!CardFit.fits(ovCard)) over += "$tag ${o.id} overview ${CardFit.height(ovCard)}"
                note("overview", CardFit.height(ovCard), "$tag ${o.id}")
                tracks.forEachIndexed { l, t ->
                    t.steps.indices.forEach { st ->
                        val card = Cards.explainer(ExplainerState(tracks, l, st), o.label, o.answer, null, null, {}, saved = true)
                        if (!CardFit.fits(card)) over += "$tag ${t.lensId} step ${st + 1}: ${CardFit.height(card)}"
                        note("text step", CardFit.height(card), "$tag ${t.lensId} step ${st + 1}")
                    }
                }
            }
        }
        println("CARD FIT TALLEST: $tallest")
        assertEquals(emptyList<String>(), over)
    }

    /**
     * Cards with a still (every step, and the overview with its first step's still), online and offline: the
     * band height [StillFrame.heightFor] gives plus the text fits 600x600. The band never goes under
     * [StillFrame.MIN_H], so this is where a long caption would overflow.
     */
    @Test fun cardsWithStillsFit() {
        val over = ArrayList<String>()
        var tallest = 0 to ""
        for (tag in listOf("en", "fi")) {
            Cards.lang = tag
            for (o in library(tag).values) {
                val tracks = tracksOf(o)
                for (saved in listOf(false, true)) {
                    val states = listOf(ExplainerState(tracks)) + tracks.indices.flatMap { l -> tracks[l].steps.indices.map { ExplainerState(tracks, l, it) } }
                    for (s in states) {
                        // A Bitmap cannot be made in a JVM test, so the still is counted by its band height.
                        val text = Cards.explainer(s, o.label, o.answer, null, null, {}, saved = saved)
                        val cardPx = CardFit.height(text)
                        val h = cardPx + 12 + StillFrame.heightFor(cardPx)
                        val which = "$tag ${s.track.lensId} ${if (s.isOverview) "overview" else "step ${s.step + 1}"}${if (saved) " saved" else ""}"
                        if (h > tallest.first) tallest = h to which
                        if (h > CardFit.DISPLAY) over += "$which: $h"
                    }
                }
            }
        }
        println("STILL CARD TALLEST: $tallest")
        assertEquals(emptyList<String>(), over)
    }

    /** Finnish cards carry no fixed English words (the idle title is the product name). */
    @Test fun finnishCardsHaveNoEnglishFixedStrings() {
        Cards.lang = "fi"
        val en = Lang.KEYS.filter { Lang.ui("en", it) != Lang.ui("fi", it) }.map { Lang.ui("en", it) }.filter { it.length > 3 }
        val lib = library("fi")
        val o = lib.getValue("ball")
        val tracks = tracksOf(o)
        val cards = listOf(Cards.looking(), Cards.notSure {}, Cards.error(Cards.t(Lang.ERR_EXPLAIN), {}), Cards.consent({}, {}),
            Cards.explainer(ExplainerState(tracks), o.label, o.answer, null, null, {}, saved = true),
            Cards.explainer(ExplainerState(tracks, 1, 0), o.label, o.answer, null, null, {}),
            Cards.offlinePicker(OfflinePicker(lib.keys.toList()), o.label, OfflineCards.taglineFor("fi", o.tagline, "Projectile motion"), {}, {}))
        for (c in cards) for (e in en) assertTrue("${c.summary} has '$e'", !c.summary.contains(e))
        for (c in cards) assertTrue(c.summary, !c.summary.contains("Projectile") && !c.summary.contains("Pinch") && !c.summary.contains("Step "))
    }

    @Test fun wrapEstimate() {
        assertEquals(1, CardFit.lines("short", 38))
        assertEquals(2, CardFit.lines("a".repeat(30) + " " + "b".repeat(30), 38))
        assertEquals(3, CardFit.lines("x".repeat(100), 38)) // one long word breaks over lines
    }
}
