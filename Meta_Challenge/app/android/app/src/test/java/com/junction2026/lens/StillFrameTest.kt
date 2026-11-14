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

    /** 2D lens stills. Explore stills (`explore/`) have another layout and the app never cuts them (below). */
    @Test fun everyRealStillGivesAStageBand() {
        val root = appFile("bridge/media")
        val files = root.walkTopDown().filter { it.name.matches(Regex("s\\d+\\.png")) && it.parentFile.name != "explore" }.toList()
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

    /** More text leaves less room: the band shrinks with the card's text, between 160 and 300 px. */
    @Test fun stillHeightFollowsTheText() {
        assertEquals(StillFrame.MAX_H, StillFrame.heightFor(100))
        assertEquals(600 - 300 - 12 - StillFrame.SLACK, StillFrame.heightFor(300))
        assertEquals(StillFrame.MIN_H, StillFrame.heightFor(500))
        assertTrue(StillFrame.aspectFor(160) > StillFrame.aspectFor(300))
    }

    /** Number lens on a card not in English: only the headline number and unit, not the English line under it. */
    @Test fun numberHeadlineOnly() {
        val root = appFile("bridge/media")
        val files = root.walkTopDown().filter { it.path.contains("/number/") && it.name.matches(Regex("s\\d+\\.png")) }.toList()
        assertTrue(files.size >= 7)
        for (f in files) {
            val (px, w, h) = pixels(f)
            val full = StillFrame.crop(px, w, h)
            val head = StillFrame.crop(px, w, h, headlineOnly = true)
            assertTrue("${f.path} $head vs $full", head.top >= full.top && head.bottom < full.bottom && head.height in 25..140)
        }
        // ball step 1: the big "10.2 m" ends above the line "how far a 10 m/s throw..." (from y=285).
        val (px, w, h) = pixels(appFile("bridge/media/ball/number/s1.png"))
        assertTrue(StillFrame.crop(px, w, h, headlineOnly = true).bottom <= 285)
    }

    /**
     * Regenerated 14 Nov: the pendulum's answer wraps to a second line (y 89-105) that crosses the 15.5% head
     * line (y 93). The stage starts below that line, so the headline is the big "1.0 s" (y 209-284), not "second.".
     */
    @Test fun twoLineAnswerStaysInTheHead() {
        val (px, w, h) = pixels(appFile("bridge/media/pendulum/number/s1.png"))
        val full = StillFrame.crop(px, w, h)
        assertTrue("$full", full.top >= 106)
        val head = StillFrame.crop(px, w, h, headlineOnly = true)
        assertTrue("$head", head.top >= 200 && head.bottom <= 293)
        // A one-line answer keeps the old head line: ball motion still starts its stage under y=93.
        val (bp, bw, bh) = pixels(appFile("bridge/media/ball/motion/s1.png"))
        assertTrue(StillFrame.stageRows(StillFrame.rowsDrawn(bp, bw, bh)).first == 93)
    }

    /** Explore beat stills (text-free cN.png) are kept whole: only the black around the drawing is trimmed. */
    @Test fun exploreStillsKeepTheirWholeDrawing() {
        val root = appFile("bridge/media")
        val files = root.walkTopDown().filter { it.parentFile?.name == "explore" && it.name.matches(Regex("c\\d+\\.png")) }.toList()
        assertTrue(files.size >= 6)
        for (f in files) {
            val (px, w, h) = pixels(f)
            assertTrue(f.path, StillFrame.isWhole("/media/x/explore/${f.name}"))
            val b = StillFrame.drawnBox(px, w, h)
            assertTrue("${f.path} $b", b.width in 100..w && b.height in 100..h)
            // Nothing drawn outside the box: the trim never cuts the picture.
            for (y in 0 until h) for (x in 0 until w) {
                if (x in b.left until b.right && y in b.top until b.bottom) continue
                val c = px[y * w + x]
                assertTrue("${f.path} ($x,$y)", maxOf((c shr 16) and 0xff, (c shr 8) and 0xff, c and 0xff) <= StillFrame.GLOW)
            }
        }
        assertFalse(StillFrame.isWhole("/media/ball/motion/s1.png"))
        assertEquals(CropBox(0, 0, 10, 10), StillFrame.drawnBox(IntArray(100), 10, 10)) // empty: keep it all
    }

    @Test fun syntheticFrameWithoutCaption() {
        val w = 600; val h = 600
        val px = IntArray(w * h)
        for (x in 100..500) px[300 * w + x] = 0xFFFFFFFF.toInt() // one line in the middle
        val c = StillFrame.crop(px, w, h)
        assertEquals(CropBox(92, 292, 509, 309), c)
    }
}
