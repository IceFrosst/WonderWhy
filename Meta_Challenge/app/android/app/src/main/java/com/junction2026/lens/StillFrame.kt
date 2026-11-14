package com.junction2026.lens

/** A crop rectangle; [right] and [bottom] are exclusive. */
data class CropBox(val left: Int, val top: Int, val right: Int, val bottom: Int) {
    val width: Int get() = right - left
    val height: Int get() = bottom - top
}

/**
 * Real exported stills (`/media/<object>/<lens>/sN.png`) are whole 600x600 explainer frames: title and answer
 * at the top, the drawing, then the English caption and the lens name at the bottom. The glasses card already
 * shows the title and the (translated) caption as text, and a 600x600 picture cannot fit on a 600x600 card
 * next to them. So the app keeps only the drawing ("stage") and trims the black around it.
 *
 * Pure (ARGB pixels in, rectangle out) so JVM tests run it on the real files.
 */
object StillFrame {
    /** Widest band shape for a still (552x300 on the card) when the text is short. */
    const val ASPECT = 552.0 / 300

    private const val CARD_W = 552.0
    const val MIN_H = 160
    const val MAX_H = 300
    /**
     * Margin kept free beyond the [CardFit] estimate. On the Mock Device Kit display (15 Nov, emulator) the
     * estimate was within 5 px of the drawn card (502 estimated, 499 drawn); the real Display may differ.
     */
    const val SLACK = 24
    private const val GAP = 12

    /** Band height in display px for a card whose other items take [cardPx] by the [CardFit] estimate. */
    fun heightFor(cardPx: Int): Int = (CardFit.DISPLAY - cardPx - GAP - SLACK).coerceIn(MIN_H, MAX_H)

    /** Width / height of a band [heightPx] high: the display scales the band to the card's width. */
    fun aspectFor(heightPx: Int): Double = CARD_W / heightPx

    /** A pixel counts as drawn when its brightest channel is over this: dim guides (frets, ghosts) count too. */
    const val BRIGHT = 24

    private const val PAD = 8

    /** A whole exported frame: square and big. Small drawing-only stills (the demo fixtures) are not. */
    fun isFrame(w: Int, h: Int): Boolean = w == h && w >= 480

    fun rowsDrawn(px: IntArray, w: Int, h: Int): BooleanArray = BooleanArray(h) { y ->
        var hit = false
        var x = 0
        while (x < w && !hit) { hit = drawn(px[y * w + x]); x++ }
        hit
    }

    private fun drawn(argb: Int): Boolean {
        val r = (argb shr 16) and 0xff
        val g = (argb shr 8) and 0xff
        val b = argb and 0xff
        return maxOf(r, g, b) > BRIGHT
    }

    /** Runs of drawn rows from [from], joining gaps under 3 rows (anti-aliasing). Inclusive ranges. */
    fun blocks(rows: BooleanArray, from: Int = 0): List<IntRange> {
        val out = ArrayList<IntRange>()
        var start = -1
        var last = -1
        for (y in from until rows.size) {
            if (!rows[y]) continue
            if (start >= 0 && y - last - 1 < 3) { last = y; continue }
            if (start >= 0) out += start..last
            start = y; last = y
        }
        if (start >= 0) out += start..last
        return out
    }

    /**
     * Rows of the stage in a frame [h] rows high: below the head (title and answer, the top 15.5%) and above
     * the caption block. The caption is found from the bottom: the lens name (a line in the bottom 12%), then
     * up to three caption lines, each close to the one below; a wide gap ends the caption.
     */
    fun stageRows(rows: BooleanArray): IntRange {
        val h = rows.size
        val top = (h * 0.155).toInt()
        val bl = blocks(rows, top)
        var i = bl.lastIndex
        var bottom = h // exclusive: first row that is not stage
        if (i >= 0 && bl[i].first > h * 0.88) { bottom = bl[i].first; i-- } // lens name
        var lines = 0
        val captionLimit = bottom - (h * 0.2).toInt() // 3 lines of caption fit in 20% of the frame
        while (i >= 0) {
            val b = bl[i]
            val gap = bottom - b.last - 1
            val maxGap = if (lines == 0) (h * 0.05).toInt() else (h * 0.022).toInt()
            if (gap > maxGap || b.first < captionLimit || b.last - b.first + 1 > h * 0.16) break
            bottom = b.first
            lines++
            i--
        }
        return top until bottom.coerceAtLeast(top + 1)
    }

    /**
     * The part of the still to show. A frame: the stage, trimmed to its drawing plus a small margin. With
     * [headlineOnly] (a number lens on a card that is not in English) only the first block of the stage: the
     * big number and its unit, without the English line under it. Anything else: the whole picture.
     */
    fun crop(px: IntArray, w: Int, h: Int, headlineOnly: Boolean = false): CropBox {
        if (!isFrame(w, h)) return CropBox(0, 0, w, h)
        val rows = rowsDrawn(px, w, h)
        var stage = stageRows(rows)
        if (headlineOnly) blocks(rows, stage.first).firstOrNull { it.first <= stage.last }?.let { b ->
            stage = b.first..minOf(b.last, stage.last)
        }
        var minX = w; var maxX = -1; var minY = h; var maxY = -1
        for (y in stage) for (x in 0 until w) {
            if (drawn(px[y * w + x])) {
                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                if (y > maxY) maxY = y
            }
        }
        if (maxX < 0) return CropBox(0, stage.first, w, stage.last + 1) // empty stage: keep the rows
        return CropBox(
            (minX - PAD).coerceAtLeast(0), (minY - PAD).coerceAtLeast(stage.first),
            (maxX + 1 + PAD).coerceAtMost(w), (maxY + 1 + PAD).coerceAtMost(stage.last + 1),
        )
    }

    /** Band for a [w]x[h] crop: same height, widened to [aspect]; a wider crop is kept as is. */
    fun bandFor(w: Int, h: Int, aspect: Double): Pair<Int, Int> {
        if (w <= 0 || h <= 0) return w to h
        val bw = Math.ceil(h * aspect).toInt()
        return if (w >= bw) w to h else bw to h
    }

    fun band(w: Int, h: Int): Pair<Int, Int> = bandFor(w, h, ASPECT)
}
