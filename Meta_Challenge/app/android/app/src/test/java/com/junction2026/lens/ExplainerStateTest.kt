package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class ExplainerStateTest {
    private val motion = Track("ball.motion", "Projectile motion", null, listOf("m1", "m2", "m3"))
    private val bounce = Track("ball.compare", "Bounce", "lead", listOf("b1", "b2"))
    private val two = ExplainerState(listOf(motion, bounce))
    private val one = ExplainerState(listOf(motion))

    @Test fun startsOnOverview() {
        assertTrue(two.isOverview)
        assertNull(two.counter)
        assertFalse(two.isLastStep)
    }

    @Test fun nextStepsThroughWithCounter() {
        val s1 = two.next()
        assertEquals(0, s1.step)
        assertEquals("1/3", s1.counter)
        val s2 = s1.next()
        assertEquals("2/3", s2.counter)
        val s3 = s2.next()
        assertEquals("3/3", s3.counter)
        assertTrue(s3.isLastStep)
    }

    @Test fun nextOnLastStepStays() {
        val last = ExplainerState(listOf(motion), step = 2)
        assertSame(last, last.next())
    }

    @Test fun pinchGoesDeeperThenNextLensThenAgain() {
        var s = two
        val seen = mutableListOf<String>()
        while (true) {
            when (val m = s.pinch()) {
                is ExplainerState.Move.Show -> { s = m.state; seen += "${s.lens}:${s.counter}" }
                ExplainerState.Move.Again -> { seen += "again"; break }
            }
        }
        assertEquals(listOf("0:1/3", "0:2/3", "0:3/3", "1:1/2", "1:2/2", "again"), seen)
    }

    @Test fun pinchOnSingleLensLastStepIsAgain() {
        assertEquals(ExplainerState.Move.Again, ExplainerState(listOf(motion), step = 2).pinch())
    }

    @Test fun switchLensResetsStep() {
        val deep = two.next().next() // motion step 2
        val other = deep.switchLens(+1)
        assertEquals(1, other.lens)
        assertEquals(0, other.step)
        assertEquals("Bounce", other.track.title)
        // From the overview a lens switch also lands on that lens's first step.
        assertEquals(ExplainerState(listOf(motion, bounce), lens = 1, step = 0), two.switchLens(+1))
        // Back to the first lens: step 1 again, not the old step.
        assertEquals(0, other.switchLens(-1).step)
    }

    /** PROTOCOL nav left/right: previous / next lens, wrapping (as the glasses Web App does). */
    @Test fun switchLensWrapsAtEnds() {
        assertEquals(1, two.switchLens(-1).lens) // left from the first lens: the last one
        val atLast = two.switchLens(+1)
        assertEquals(0, atLast.switchLens(+1).lens) // right from the last: the first
        assertEquals(0, atLast.switchLens(+1).step)
        assertSame(one, one.switchLens(+1)) // one lens: nothing to switch to
        assertSame(one, one.switchLens(-1))
        val five = ExplainerState((1..5).map { Track("o.l$it", "L$it", null, listOf("s")) })
        assertEquals(4, five.switchLens(-1).lens)
        assertEquals(2, five.switchLens(+7).lens)
    }

    @Test fun backWalksToOverviewThenLeaves() {
        val s2 = two.next().next()
        val s1 = s2.back()!!
        assertEquals(0, s1.step)
        val ov = s1.back()!!
        assertTrue(ov.isOverview)
        assertNull(ov.back())
        assertSame(ov, ov.prev()) // D-pad up never leaves
    }

    @Test fun nextLensTitleForButton() {
        val endOfMotion = ExplainerState(listOf(motion, bounce), step = 2)
        assertTrue(endOfMotion.hasNextLens)
        assertEquals("Bounce", endOfMotion.nextLensTitle)
        assertFalse(endOfMotion.switchLens(+1).hasNextLens)
    }

    @Test fun lensBarIsTextNotColour() {
        assertEquals("○● 2/2 Bounce", Cards.lensBar(two.switchLens(+1)))
        assertEquals("●○ 1/2 Projectile motion", Cards.lensBar(two.next()))
    }

    @Test(expected = IllegalArgumentException::class) fun emptyTracksRejected() {
        ExplainerState(emptyList())
    }
}
