package com.junction2026.lens

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineCardsTest {
    /** Gradle runs unit tests with the module dir (app/) as working dir; walk up to be robust. */
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
    private fun words(s: String) = s.trim().split(Regex("\\s+")).size

    /** The library keeps growing (7 objects on 14 Nov): assert what the app needs, not exact counts. */
    @Test fun loadsTheLibrary() {
        assertTrue(objs.keys.toString(), objs.keys.containsAll(setOf("guitar", "ball", "bicycle", "kettle", "pendulum", "phone")))
        assertTrue(objs.size >= 6)
        for (o in objs.values) {
            assertTrue(o.id, o.answer.isNotBlank())
            assertTrue(o.id, o.lenses.isNotEmpty())
            assertTrue(o.id, o.lenses.first().steps.isNotEmpty())
        }
        val ball = objs.getValue("ball").lenses
        assertTrue(ball.map { it.id }.containsAll(listOf("ball.motion", "ball.compare")))
        assertEquals("ball.motion", ball.first { it.kind != Explore.KIND }.id) // the first 2D lens
        assertTrue(ball.single { it.id == "ball.compare" }.lead.orEmpty().isNotBlank())
        // MODEL3D: an Explore chapter, when an object has one, is its first, with its spec text parsed.
        for (o in objs.values) {
            val i = o.lenses.indexOfFirst { it.kind == Explore.KIND }
            if (i < 0) continue
            assertEquals(o.id, 0, i)
            val ex = o.lenses[0]
            assertEquals("${o.id}.explore", ex.id)
            assertTrue(o.id, ex.steps.size in 1..6)
            val spec = ex.explore!!
            assertTrue(o.id, spec.partIds.filterNotNull().isNotEmpty())
            assertEquals(o.id, spec.partIds.size, spec.partLabels.size)
            assertTrue(o.id, o.lenses.drop(1).all { it.explore == null })
        }
    }

    @Test fun lookups() {
        assertEquals("ball", OfflineCards.lookup(objs, "ball")?.id)
        assertEquals("kettle", OfflineCards.lookup(objs, "a kettle")?.id)
        assertEquals("ball", OfflineCards.lookup(objs, "The Ball")?.id)
        assertEquals("ball", OfflineCards.lookup(objs, "balls")?.id)
        assertEquals("bicycle", OfflineCards.lookup(objs, "Bike gears")?.id)
        assertEquals("bicycle", OfflineCards.lookup(objs, "my bike")?.id)
        assertEquals("phone", OfflineCards.lookup(objs, "  smartphone ")?.id)
        assertEquals("pendulum", OfflineCards.lookup(objs, "keys")?.id)
        assertEquals("ball", OfflineCards.lookup(objs, "tennis ball")?.id)
        assertNull(OfflineCards.lookup(objs, "elephant"))
        assertNull(OfflineCards.lookup(objs, "the"))
        assertNull(OfflineCards.lookup(objs, ""))
    }

    @Test fun detectShape() {
        val d = OfflineCards.toDetect(assertNotNull(OfflineCards.lookup(objs, "ball")).let { objs.getValue("ball") })
        assertEquals("Gravity bends the path into a curve.", d.summary)
        assertEquals(objs.getValue("ball").lenses.first().steps, d.steps)
        assertTrue(d.steps.isNotEmpty())
        assertTrue(d.lenses.size >= 2)
        assertTrue(d.offline)
    }

    @Test fun missingOptionalFields() {
        val m = OfflineCards.parse("""{"objects":[{"id":"x"},{"label":"no id"}]}""")
        assertEquals(setOf("x"), m.keys)
        assertEquals("x", m.getValue("x").label)
        assertTrue(m.getValue("x").lenses.isEmpty())
        assertTrue(OfflineCards.toDetect(m.getValue("x")).steps.isEmpty())
    }

    /** DESIGN.md caps: title 4, answer 12, caption 24. Reported, never failed. */
    @Test fun wordCapsReport() {
        val off = ArrayList<String>()
        for (o in objs.values) {
            if (words(o.answer) > 12) off.add("${o.id} answer: ${words(o.answer)}")
            for (l in o.lenses) {
                if (words(l.title) > 4) off.add("${l.id} title: ${words(l.title)}")
                l.steps.forEachIndexed { i, s -> if (words(s) > 24) off.add("${l.id} step ${i + 1}: ${words(s)}") }
            }
        }
        println("DATA CAP OFFENDERS: $off")
    }
}
