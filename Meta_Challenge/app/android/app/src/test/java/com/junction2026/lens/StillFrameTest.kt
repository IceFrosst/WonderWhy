package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Runs the stage crop on the real exported stills the bridge serves under /media/. */
class StillFrameTest {
    /**
     * PNG pixels through the test JVM's ImageIO, by reflection: unit tests compile against android.jar, which
     * has no javax.imageio, but the JDK that runs them does.
     */
    private fun pixels(f: java.io.File): Triple<IntArray, Int, Int> {
        val img = Class.forName("javax.imageio.ImageIO").getMethod("read", java.io.File::class.java).invoke(null, f)
        val c = img.javaClass
        val w = c.getMethod("getWidth").invoke(img) as Int
        val h = c.getMethod("getHeight").invoke(img) as Int
        val get = c.getMethod("getRGB", Int::class.java, Int::class.java, Int::class.java, Int::class.java,
            IntArray::class.java, Int::class.java, Int::class.java)
        val px = get.invoke(img, 0, 0, w, h, null, 0, w) as IntArray
        return Triple(px, w, h)
    }

    private fun crop(rel: String): CropBox {
        val (px, w, h) = pixels(appFile("bridge/media/$rel"))
        return StillFrame.crop(px, w, h)
    }

    @Test fun realStillsAreFrames() {
        assertTrue(StillFrame.isFrame(600, 600))
        assertFalse(StillFrame.isFrame(264, 264)) // demo fixture drawings keep the old band
        assertFalse(StillFrame.isFrame(600, 300))
    }

    @Test fun ballMotionKeepsTheArcAndGroundButNoText() {
        val c = crop("ball/motion/s1.png")
        assertTrue("top $c", c.top >= 93) // below the title and answer line
        assertTrue("ground line kept $c", c.bottom >= 467)
        assertTrue("caption cut $c", c.bottom <= 495)
    }

    @Test fun threeLineCaptionIsCut() {
        val c = crop("ball/compare/s2.png") // caption starts near y=468
        assertTrue("$c", c.bottom in 427..465)
    }

    @Test fun numberSceneKeepsItsBar() {
        val c = crop("kettle/number/s2.png") // progress bar near y=473, caption from y=497
        assertTrue("$c", c.bottom in 474..495)
        assertTrue("$c", c.top < 125) // the big number stays
    }

    @Test fun everyRealStillGivesAStageBand() {
        val root = appFile("bridge/media")
        val files = root.walkTopDown().filter { it.name.matches(Regex("s\\d+\\.png")) }.toList()
        assertTrue(files.size > 30)
        for (f in files) {
            val c = crop(f.relativeTo(root).path)
            assertTrue("${f.path} $c", c.top >= 93 && c.bottom <= 560 && c.height in 40..467 && c.width > 100)
            val (bw, bh) = StillFrame.band(c.width, c.height)
            assertTrue(bw.toDouble() / bh >= StillFrame.ASPECT - 0.01)
        }
    }

    @Test fun band() {
        assertEquals(800 to 400, StillFrame.bandFor(545, 400, 2.0))
        assertEquals(530 to 150, StillFrame.bandFor(530, 150, 2.0))
        assertEquals(0 to 0, StillFrame.band(0, 0))
    }

    /** Longer captions leave less room: the band gets wider (so it shows lower) and never under 96 px. */
    @Test fun stillHeightFollowsTheCaption() {
        assertEquals(1, StillFrame.captionLines(30))
        assertEquals(2, StillFrame.captionLines(50))
        assertEquals(4, StillFrame.captionLines(161)) // the Finnish bounce caption that overflowed at 2:1
        assertEquals(144, StillFrame.stillHeight(161, 1))
        assertEquals(228, StillFrame.stillHeight(20, 0))
        assertEquals(96, StillFrame.stillHeight(400, 2))
        assertTrue(StillFrame.aspectFor(161, 1) > StillFrame.aspectFor(87, 1))
    }

    @Test fun syntheticFrameWithoutCaption() {
        val w = 600; val h = 600
        val px = IntArray(w * h)
        for (x in 100..500) px[300 * w + x] = 0xFFFFFFFF.toInt() // one line in the middle
        val c = StillFrame.crop(px, w, h)
        assertEquals(CropBox(92, 292, 509, 309), c)
    }
}
