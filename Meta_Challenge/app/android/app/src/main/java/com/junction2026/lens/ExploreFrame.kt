package com.junction2026.lens

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface

/**
 * Draws one Explore beat band ([ExploreLayoutCalc] decides where things go): the still, the part labels with
 * thin leader lines to their anchors, and the number block (value green, unit white, label soft; DESIGN.md
 * colours). Black stays black: it is see-through on the glasses.
 */
object ExploreFrame {
    private const val WHITE = 0xFFFFFFFF.toInt()
    private const val SOFT = 0xFFC9D4FF.toInt()
    private const val GREEN = 0xFF6DFF9C.toInt()
    private const val LEADER = 0x99C9D4FF.toInt()

    private fun paint(px: Float, color: Int, bold: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = px
        this.color = color
        typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }

    private val measurer = Paint(Paint.ANTI_ALIAS_FLAG)
    private fun measure(text: String, px: Float): Float = synchronized(measurer) {
        measurer.textSize = px
        measurer.measureText(text)
    }

    fun render(piece: Bitmap, box: CropBox, stillSize: Int, w: Int, h: Int, beat: ExploreBeat?): Bitmap {
        val l = ExploreLayoutCalc.layout(box, stillSize, w, h, beat, ::measure)
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        c.drawColor(Color.BLACK)
        val dst = RectF(l.imgX, l.imgY, l.imgX + piece.width * l.scale, l.imgY + piece.height * l.scale)
        c.drawBitmap(piece, Rect(0, 0, piece.width, piece.height), dst, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))

        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = LEADER; strokeWidth = 1.5f; style = Paint.Style.STROKE }
        val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = SOFT; style = Paint.Style.FILL }
        for (p in l.labels) {
            val tp = paint(p.px, if (p.focus) WHITE else SOFT)
            val fm = tp.fontMetrics
            c.drawText(p.text, p.x, p.y - (fm.ascent + fm.descent) / 2, tp)
            val from = if (p.left) p.x + p.w + 6f else p.x - 6f
            if (if (p.left) p.ax - from > 6f else from - p.ax > 6f) {
                c.drawLine(from, p.y, p.ax, p.ay, line)
                c.drawCircle(p.ax, p.ay, 2.5f, dot)
            }
        }

        l.number?.let { n ->
            val vp = paint(ExploreLayoutCalc.VALUE_PX, GREEN, bold = true)
            val up = paint(ExploreLayoutCalc.UNIT_PX, WHITE, bold = true)
            val lp = paint(ExploreLayoutCalc.NUM_LABEL_PX, SOFT)
            val vw = vp.measureText(n.value)
            val uw = if (n.unit.isNotEmpty()) up.measureText(n.unit) + 8f else 0f
            val lw = n.lines.maxOfOrNull { lp.measureText(it) } ?: 0f
            val blockW = maxOf(vw + uw, lw)
            val x = if (n.left) n.x else n.x + n.w - blockW
            val base = n.top + ExploreLayoutCalc.VALUE_LINE - 8f
            c.drawText(n.value, x, base, vp)
            if (n.unit.isNotEmpty()) c.drawText(n.unit, x + vw + 8f, base, up)
            n.lines.forEachIndexed { i, t ->
                c.drawText(t, x, n.top + ExploreLayoutCalc.VALUE_LINE + (i + 1) * ExploreLayoutCalc.NUM_LINE - 4f, lp)
            }
        }
        return out
    }
}
