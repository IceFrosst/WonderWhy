package com.junction2026.lens

/*
 * Explore lens (shared/MODEL3D.md): pre-rendered 3D beats. The phone app cannot play the beat clips, so each
 * beat shows its text-free still at rest (`explore/c<n>.png`, a whole 600x600 frame) with the part labels at
 * their rest anchors (`tracks.json`, sampled at `loopFrom`) and the beat's number drawn over it, and the caption
 * as card text. Pure Kotlin (no Android), so JVM tests cover the parsing and the layout.
 */

/** A beat's number: value as written ("1/3", "10.2"), unit, what it means. */
data class ExploreNumber(val value: String, val unit: String, val label: String)

/**
 * The text of a `model3d` spec: part ids and labels (same order as `spec.parts`) and each beat's number.
 * A translation (`specText`) has the same shape without ids, so it is laid over the English one by index.
 */
data class ExploreSpec(
    val partIds: List<String?>,
    val partLabels: List<String?>,
    val numbers: List<ExploreNumber?>,
) {
    /** The label of part [id], or null when the spec has none (an id is never shown as a label). */
    fun label(id: String): String? {
        val i = partIds.indexOf(id)
        return if (i < 0) null else partLabels.getOrNull(i)
    }

    /** [text] laid over this spec by index: its labels and number fields win where it has them. */
    fun overlay(text: ExploreSpec?): ExploreSpec {
        if (text == null) return this
        val labels = partLabels.indices.map { i -> text.partLabels.getOrNull(i) ?: partLabels[i] }
        val nums = (0 until maxOf(numbers.size, text.numbers.size)).map { i ->
            val base = numbers.getOrNull(i)
            val t = text.numbers.getOrNull(i)
            when {
                base == null -> t?.takeIf { it.value.isNotEmpty() }
                t == null -> base
                else -> ExploreNumber(t.value.ifEmpty { base.value }, t.unit.ifEmpty { base.unit }, t.label.ifEmpty { base.label })
            }
        }
        return ExploreSpec(partIds, labels, nums)
    }
}

/** One label of a beat in `tracks.json`: part id, column side (`l`/`r`), focus, anchor at rest in frame px. */
data class AnchorAt(val part: String, val side: Char, val focus: Boolean, val x: Double, val y: Double)

/** One beat of `tracks.json`, reduced to what a still needs. */
data class TrackBeat(val labels: List<AnchorAt>, val number: ExploreNumber?)

/** `tracks.json`: anchors are in [size] x [size] frame px. */
data class ExploreTracks(val size: Int, val beats: List<TrackBeat>)

/** A label as drawn on a beat still: text in the card's language, side, anchor in frame px. */
data class ExploreLabel(val text: String, val side: Char, val focus: Boolean, val x: Double, val y: Double)

/** What one beat still carries besides the picture. [frame]: the frame size the anchors are in. */
data class ExploreBeat(val labels: List<ExploreLabel>, val number: ExploreNumber?, val frame: Int = 600) {
    /** Words of the picture for the phone's text mirror: "2000 W heating power · Water, Steam switch". */
    val alt: String? get() {
        val parts = listOfNotNull(
            number?.let { listOf(it.value + if (it.unit.isNotEmpty()) " ${it.unit}" else "", it.label).filter { s -> s.isNotBlank() }.joinToString(" ") },
            labels.takeIf { it.isNotEmpty() }?.joinToString(", ") { it.text },
        )
        return if (parts.isEmpty()) null else parts.joinToString(" · ")
    }
}

object Explore {
    const val KIND = "explore"
    /** MODEL3D: never more than 3 labels per beat. */
    const val MAX_LABELS = 3
    /** MODEL3D: a part label is 24 characters at most. */
    const val LABEL_CHARS = 24
    private const val MAX_BEATS = 6
    private const val NUMBER_CHARS = 48

    /** Lens ids look like `kettle.explore` (or `sketch.explore`). */
    fun isExplore(lensId: String?): Boolean = lensId?.substringAfterLast('.') == KIND

    private fun clean(v: Any?, max: Int): String? =
        (v as? String)?.replace(Regex("[\\u0000-\\u001f\\u007f]"), " ")?.replace(Regex("\\s+"), " ")?.trim()?.ifEmpty { null }?.take(max)

    private fun num(v: Any?): Double? = (v as? Double)?.takeIf { it.isFinite() }

    private fun number(v: Any?): ExploreNumber? {
        val m = v as? Map<*, *> ?: return null
        val value = when (val x = m["value"]) {
            is Double -> if (x == Math.floor(x) && x.isFinite()) x.toLong().toString() else x.toString()
            else -> clean(x, 16)
        }.orEmpty()
        val unit = clean(m["unit"], 16).orEmpty()
        val label = clean(m["label"], NUMBER_CHARS).orEmpty()
        return if (value.isEmpty() && unit.isEmpty() && label.isEmpty()) null else ExploreNumber(value, unit, label)
    }

    /** A `spec` (or translated `specText`) object, as parsed by [MiniJson]. Null when it is not an object. */
    fun spec(v: Any?): ExploreSpec? {
        val m = v as? Map<*, *> ?: return null
        val parts = (m["parts"] as? List<*>).orEmpty()
        val beats = (m["beats"] as? List<*>).orEmpty().take(MAX_BEATS)
        return ExploreSpec(
            partIds = parts.map { (it as? Map<*, *>)?.get("id") as? String },
            partLabels = parts.map { clean((it as? Map<*, *>)?.get("label"), LABEL_CHARS) },
            numbers = beats.map { number((it as? Map<*, *>)?.get("number")) },
        )
    }

    /** [spec] from JSON text; null when it is not a JSON object. */
    fun specFromJson(text: String?): ExploreSpec? =
        text?.let { runCatching { spec(MiniJson.parse(it)) }.getOrNull() }

    /** Anchor at time [t]: linear between the samples around it, clamped to the first and last. */
    fun sampleAt(samples: List<Triple<Double, Double, Double>>, t: Double): Pair<Double, Double>? {
        if (samples.isEmpty()) return null
        val s = samples.sortedBy { it.first }
        if (t <= s.first().first) return s.first().second to s.first().third
        if (t >= s.last().first) return s.last().second to s.last().third
        for (i in 1 until s.size) {
            val b = s[i]
            if (b.first < t) continue
            val a = s[i - 1]
            val span = b.first - a.first
            val f = if (span <= 0) 1.0 else (t - a.first) / span
            return (a.second + (b.second - a.second) * f) to (a.third + (b.third - a.third) * f)
        }
        return s.last().second to s.last().third
    }

    /**
     * Parses an untrusted `tracks.json`: per beat the labels' anchors at rest (t = `loopFrom`, the frame the
     * still shows) and the number. Anchors given as 0..1 fractions are scaled to the frame. Null when unusable.
     */
    fun tracks(text: String?): ExploreTracks? {
        val root = runCatching { MiniJson.parse(text ?: return null) }.getOrNull() as? Map<*, *> ?: return null
        val raw = root["beats"] as? List<*> ?: return null
        val size = num(root["size"])?.takeIf { it in 16.0..4096.0 }?.toInt() ?: 600
        var maxCoord = 0.0
        val beats = raw.take(MAX_BEATS).map { b ->
            val bm = b as? Map<*, *> ?: emptyMap<Any, Any>()
            val loopFrom = num(bm["loopFrom"])?.coerceAtLeast(0.0) ?: 0.0
            val labels = (bm["labels"] as? List<*>).orEmpty().take(MAX_LABELS).mapNotNull { l ->
                val lm = l as? Map<*, *> ?: return@mapNotNull null
                val part = (lm["part"] ?: lm["id"]) as? String ?: return@mapNotNull null
                val samples = (lm["anchor"] as? List<*>).orEmpty().take(2000).mapNotNull { p ->
                    val q = p as? List<*> ?: return@mapNotNull null
                    if (q.size < 3) return@mapNotNull null
                    val t = num(q[0]); val x = num(q[1]); val y = num(q[2])
                    if (t == null || x == null || y == null) null else Triple(t, x, y)
                }
                val (x, y) = sampleAt(samples, loopFrom) ?: return@mapNotNull null
                maxCoord = maxOf(maxCoord, Math.abs(x), Math.abs(y))
                val side = when ((lm["side"] as? String)?.lowercase()) { "l", "left" -> 'l'; "r", "right" -> 'r'; else -> if (x < size / 2.0) 'l' else 'r' }
                AnchorAt(part, side, lm["focus"] == true, x, y)
            }
            TrackBeat(labels, number(bm["number"]))
        }
        val scale = if (maxCoord in 0.0..1.5 && beats.any { it.labels.isNotEmpty() }) size.toDouble() else 1.0
        return ExploreTracks(size, beats.map { b -> b.copy(labels = b.labels.map { it.copy(x = it.x * scale, y = it.y * scale) }) })
    }

    /**
     * The [count] beats as drawn: labels whose part has a label in [spec] (no spec: no labels), at most
     * [MAX_LABELS]; the number from [spec], else from [tracks]. Missing data gives plain beats, never an error.
     */
    fun beats(tracks: ExploreTracks?, spec: ExploreSpec?, count: Int): List<ExploreBeat> = (0 until count).map { i ->
        val tb = tracks?.beats?.getOrNull(i)
        val labels = tb?.labels.orEmpty().mapNotNull { a ->
            val text = spec?.label(a.part) ?: return@mapNotNull null
            ExploreLabel(text, a.side, a.focus, a.x, a.y)
        }.take(MAX_LABELS)
        ExploreBeat(labels, spec?.numbers?.getOrNull(i) ?: tb?.number, tracks?.size ?: 600)
    }
}

/** A label placed on the band: text box (left edge, vertical centre, width, font px) and its anchor, band px. */
data class PlacedLabel(
    val text: String, val focus: Boolean, val left: Boolean,
    val x: Float, val y: Float, val w: Float, val px: Float,
    val ax: Float, val ay: Float,
)

/** The number block on the band: [x],[top] corner, [w] wide; value line then the label lines. */
data class PlacedNumber(val value: String, val unit: String, val lines: List<String>, val left: Boolean, val x: Float, val top: Float, val w: Float)

/** Where everything goes on one beat band: the picture (scaled by [scale], top-left at [imgX],[imgY]), labels, number. */
data class ExploreLayout(val scale: Float, val imgX: Float, val imgY: Float, val labels: List<PlacedLabel>, val number: PlacedNumber?)

/**
 * Lays a beat out on a [w]x[h] band (display px; the display shows a 552-wide image 1:1). The still's drawn
 * part ([box], in frame px) is centred and as big as fits; when the beat has labels or a number, side columns
 * of at least [COL] px stay free for them. Labels sit in their side's column at their anchor's height
 * (pushed apart, never under 16 px), with a leader line to the anchor; the number goes to the bottom of the
 * column with fewer labels. Text widths come from [measure] (text, font px) so the layout is testable.
 */
object ExploreLayoutCalc {
    const val COL = 130f
    const val M = 4f
    const val LABEL_PX = 18f
    const val LABEL_MIN_PX = 16f
    const val LINE = 24f
    const val VALUE_PX = 40f
    const val UNIT_PX = 22f
    const val NUM_LABEL_PX = 16f
    const val VALUE_LINE = 46f
    const val NUM_LINE = 20f
    private const val LEADER = 14f

    fun numberHeight(lines: Int): Float = VALUE_LINE + lines * NUM_LINE + 4f

    /** [stillSize]: width of the still in px ([box] is in its pixels); anchors are in [ExploreBeat.frame] px. */
    fun layout(box: CropBox, stillSize: Int, w: Int, h: Int, beat: ExploreBeat?, measure: (String, Float) -> Float): ExploreLayout {
        val bw = maxOf(1, box.width).toFloat()
        val bh = maxOf(1, box.height).toFloat()
        val cols = beat != null && (beat.labels.isNotEmpty() || beat.number != null)
        val room = if (cols) w - 2 * COL else w.toFloat()
        val s = minOf(h / bh, room / bw, 1f).coerceAtLeast(0.05f)
        val imgX = (w - bw * s) / 2
        val imgY = (h - bh * s) / 2
        if (beat == null) return ExploreLayout(s, imgX, imgY, emptyList(), null)
        val k = if (beat.frame > 0 && stillSize > 0) stillSize.toDouble() / beat.frame else 1.0
        fun ax(x: Double) = (imgX + (x * k - box.left) * s).toFloat().coerceIn(0f, w.toFloat())
        fun ay(y: Double) = (imgY + (y * k - box.top) * s).toFloat().coerceIn(0f, h.toFloat())

        // The number: bottom of the side with fewer labels (left on a tie, as MODEL3D draws it).
        val leftCount = beat.labels.count { it.side == 'l' }
        val rightCount = beat.labels.size - leftCount
        val number = beat.number?.let { n ->
            val left = leftCount <= rightCount
            val colW = maxOf(imgX - 2 * M, COL)
            val lines = wrap(n.label, colW, NUM_LABEL_PX, 2, measure)
            val nh = numberHeight(lines.size)
            PlacedNumber(n.value, n.unit, lines, left, if (left) M else w - M - colW, h - nh, colW)
        }

        val placed = ArrayList<PlacedLabel>()
        for (left in listOf(true, false)) {
            val side = beat.labels.filter { (it.side == 'l') == left }
            if (side.isEmpty()) continue
            val floor = (if (number != null && number.left == left) number.top - LINE / 2 else h - LINE / 2)
            // Vertical centres: at the anchor, pushed apart by LINE, kept between LINE/2 and the floor.
            val items = side.map { it to ay(it.y) }.sortedBy { it.second }
            val ys = FloatArray(items.size) { items[it].second.coerceIn(LINE / 2, maxOf(LINE / 2, floor)) }
            for (i in 1 until ys.size) ys[i] = maxOf(ys[i], ys[i - 1] + LINE)
            if (ys.isNotEmpty() && ys.last() > floor) {
                ys[ys.lastIndex] = maxOf(LINE / 2, floor)
                for (i in ys.lastIndex - 1 downTo 0) ys[i] = minOf(ys[i], ys[i + 1] - LINE)
            }
            items.forEachIndexed { i, (lab, ayv) ->
                val axv = ax(lab.x)
                val maxW = maxOf(48f, if (left) axv - LEADER - M else w - M - (axv + LEADER))
                val (text, px) = fit(lab.text, maxW, measure)
                val tw = measure(text, px)
                val x = if (left) M else w - M - tw
                placed += PlacedLabel(text, lab.focus, left, x, ys[i], tw, px, axv, ayv)
            }
        }
        return ExploreLayout(s, imgX, imgY, placed, number)
    }

    /** [text] at 18 px, else 16 px, else cut with "…" to fit [maxW]. */
    fun fit(text: String, maxW: Float, measure: (String, Float) -> Float): Pair<String, Float> {
        if (measure(text, LABEL_PX) <= maxW) return text to LABEL_PX
        if (measure(text, LABEL_MIN_PX) <= maxW) return text to LABEL_MIN_PX
        var t = text
        while (t.length > 1 && measure("$t…", LABEL_MIN_PX) > maxW) t = t.dropLast(1)
        return "${t.trimEnd()}…" to LABEL_MIN_PX
    }

    /** Word wrap of [text] into lines of at most [maxW] at [px]; at most [maxLines], the last cut with "…". */
    fun wrap(text: String, maxW: Float, px: Float, maxLines: Int, measure: (String, Float) -> Float): List<String> {
        val words = text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return emptyList()
        val lines = ArrayList<String>()
        var cur = ""
        for (word in words) {
            val next = if (cur.isEmpty()) word else "$cur $word"
            if (cur.isEmpty() || measure(next, px) <= maxW) cur = next else { lines += cur; cur = word }
        }
        if (cur.isNotEmpty()) lines += cur
        if (lines.size <= maxLines) return lines
        var last = lines.subList(maxLines - 1, lines.size).joinToString(" ")
        while (last.length > 1 && measure("$last…", px) > maxW) last = last.dropLast(1)
        return lines.take(maxLines - 1) + "${last.trimEnd()}…"
    }
}
