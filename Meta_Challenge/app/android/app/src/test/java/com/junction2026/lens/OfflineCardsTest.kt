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

    @Test fun loadsAllSix() {
        assertEquals(setOf("guitar", "ball", "bicycle", "kettle", "pendulum", "phone"), objs.keys)
        for (o in objs.values) {
            assertTrue(o.id, o.answer.isNotBlank())
            assertTrue(o.id, o.lenses.isNotEmpty())
            assertTrue(o.id, o.lenses.first().steps.isNotEmpty())
        }
        // 14 Nov: the ball has 5 lenses in shared/objects.json now (was 2 when this test was written).
        assertEquals(listOf("ball.motion", "ball.compare", "ball.whatif", "ball.flow", "ball.number"), objs.getValue("ball").lenses.map { it.id })
        assertEquals("Each bounce keeps only part of the energy.", objs.getValue("ball").lenses[1].lead)
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
        assertEquals(3, d.steps.size)
        assertEquals(5, d.lenses.size) // 5 ball lenses in shared/objects.json since 14 Nov
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
