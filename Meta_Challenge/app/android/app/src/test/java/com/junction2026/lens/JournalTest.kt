package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** "Seen today": add, merge, cap, questions, serialise, and which results make an entry. */
class JournalTest {
    private fun e(obj: String, t: Long, label: String = obj, flag: JournalFlag = JournalFlag.LIBRARY) =
        JournalEntry(id = t, timeMs = t, objectId = obj, label = label, lens = "Lens", line = "Line $t", flag = flag)

    private fun fixture(name: String) = DetectionParser.parse(appFile("android/app/src/main/assets/fixture/detect_$name.json").readText())

    @Test fun newestFirstAndDuplicatesWithin60sMerge() {
        var j = Journal().add(e("ball", 1_000)).add(e("guitar", 2_000))
        assertEquals(listOf("guitar", "ball"), j.entries.map { it.objectId })
        j = j.addQuestion("ball", "why does it curve?", "Gravity pulls it down.")
        // The ball again 50 s after it was last seen: one entry, on top, new text, old id and question.
        j = j.add(e("ball", 51_000))
        assertEquals(listOf("ball", "guitar"), j.entries.map { it.objectId })
        val ball = j.entries.first()
        assertEquals(1_000L, ball.id)
        assertEquals(51_000L, ball.timeMs)
        assertEquals("Line 51000", ball.line)
        assertEquals(1, ball.qa.size)
        // More than 60 s after: a new entry.
        j = j.add(e("ball", 51_000 + Journal.MERGE_MS + 1))
        assertEquals(listOf("ball", "ball", "guitar"), j.entries.map { it.objectId })
    }

    @Test fun sketchesMergeByLabelNotByUnknown() {
        val j = Journal()
            .add(e("unknown", 1_000, "Stapler", JournalFlag.SKETCH))
            .add(e("unknown", 2_000, "Desk lamp", JournalFlag.SKETCH))
            .add(e("unknown", 3_000, "stapler", JournalFlag.SKETCH))
        assertEquals(listOf("stapler", "Desk lamp"), j.entries.map { it.label })
    }

    @Test fun capAt30() {
        var j = Journal()
        for (i in 0 until 45) j = j.add(e("obj$i", i * 1000L))
        assertEquals(Journal.MAX, j.entries.size)
        assertEquals("obj44", j.entries.first().objectId)
        assertEquals("obj15", j.entries.last().objectId)
    }

    @Test fun questionsGoUnderTheirObject() {
        var j = Journal().add(e("ball", 1_000)).add(e("kettle", 2_000))
        j = j.addQuestion("ball", "why does it curve?", "Gravity.")
        j = j.addQuestion("phone", "not in the list", "-") // no entry: nothing happens
        assertEquals(listOf(JournalQa("why does it curve?", "Gravity.")), j.entries.first { it.objectId == "ball" }.qa)
        assertTrue(j.entries.first { it.objectId == "kettle" }.qa.isEmpty())
        repeat(8) { j = j.addQuestion("ball", "q$it", "a$it") }
        assertEquals(Journal.MAX_QA, j.entries.first { it.objectId == "ball" }.qa.size)
        assertEquals("q7", j.entries.first { it.objectId == "ball" }.qa.last().q)
        val long = j.addQuestion("kettle", (1..40).joinToString(" ") { "w$it" }, "a").entries.first { it.objectId == "kettle" }.qa.last()
        assertTrue(long.q.split(" ").size <= AskFlow.QUESTION_WORDS)
    }

    @Test fun jsonRoundTripWithoutPictures() {
        var j = Journal().add(e("ball", 1_000).copy(still = "fixture/media/ball/s1.png"))
            .add(e("unknown", 2_000, "Stapler", JournalFlag.SKETCH)).add(e("guitar", 3_000, flag = JournalFlag.DEMO))
        j = j.addQuestion("ball", "why \"curve\"?", "Gravity, ä ö.")
        val text = j.toJson()
        assertFalse(text.contains("base64") || text.contains("png;"))
        assertEquals(j.entries, Journal.fromJson(text).entries)
        assertTrue(Journal.fromJson("nope").entries.isEmpty())
        assertTrue(Journal.fromJson(null).entries.isEmpty())
        // A broken entry is skipped, an unsafe still path dropped.
        val mixed = """{"entries":[{"obj":"ball","label":"Ball","flag":"LIBRARY","t":5,"still":"../x.png"},{"obj":"","label":"x","flag":"DEMO","t":1},{"label":"y"}]}"""
        val m = Journal.fromJson(mixed).entries
        assertEquals(1, m.size)
        assertNull(m[0].still)
    }

    @Test fun entriesForResultsOnly() {
        val ball = Journal.entryFor(fixture("ball"), JournalFlag.DEMO, 10)
        assertNotNull(ball)
        assertEquals("Thrown ball", ball!!.label)
        assertEquals("Projectile motion", ball.lens)
        assertEquals("Gravity bends the path into a curve.", ball.line)
        assertEquals(JournalFlag.DEMO, ball.flag)
        assertEquals("fixture/media/ball/s1.png", ball.still)
        // Not sure is not an entry.
        assertNull(Journal.entryFor(fixture("lowconf"), JournalFlag.DEMO, 10))
        assertNull(Journal.entryFor(Detection("unknown", "", 0.0, "No idea"), JournalFlag.LIBRARY, 10))
        // A sketch is flagged as one and has no still.
        val stapler = appFile("bridge/fixtures/sketch-stapler.json").readText()
        val sk = DetectionParser.parse("""{"objectId":"unknown","label":"","confidence":0,"sketch":$stapler}""")
        val s = Journal.entryFor(sk, JournalFlag.LIBRARY, 10)!!
        assertEquals(JournalFlag.SKETCH, s.flag)
        assertEquals("Desk stapler", s.label)
        assertNull(s.still)
    }

    @Test fun libraryStillComesFromTheBundledCopy() {
        val lib = OfflineCards.parse(appFile("shared/objects.json").readText())
        val o = lib.getValue("ball")
        val det = OfflineConvert.toDetection(OfflineCards.toDetect(o), OfflineConvert.media("ball", appFile("bridge/media/ball/manifest.json").readText()))
        val entry = Journal.entryFor(det, JournalFlag.SAVED, 10)!!
        val still = entry.still!!
        assertTrue(still, still.startsWith("media/ball/"))
        assertTrue(still, appFile("bridge/" + still).isFile) // the APK bundles bridge/media as assets/media
    }
}
