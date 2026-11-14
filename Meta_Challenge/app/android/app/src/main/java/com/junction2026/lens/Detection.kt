package com.junction2026.lens

/*
 * The /detect response model and its parser. Pure Kotlin (no Android, no org.json) so JVM tests cover it.
 * All v1 fields are optional: an old bridge gives defaults and the app behaves as before.
 */

/** One lens of an object: a titled sequence of step captions. */
data class Lens(
    val id: String,
    val kind: String,
    val title: String,
    val lead: String?,
    val steps: List<String>,
)

/** Exported scene media for one lens. Files are relative to [Media.base]. */
data class LensMedia(val stills: List<String>, val clip: String?)

/** `media` block: `base` is a bridge path like `/media/ball`. */
data class Media(val base: String, val lenses: Map<String, LensMedia>)

/** `/ask` answer: the lens (library id like `kettle.cutaway`) and 1-based step that answers the question. */
data class LensHint(val id: String, val step: Int)

/** One chapter of a generated sketch: shaped like a library chapter (the app uses the text only). */
data class SketchChapter(val lens: String, val scene: String, val title: String, val lead: String?, val captions: List<String>)

/** `show.sketch`: a generated, unverified explanation of an object the library does not have. */
data class Sketch(val label: String, val answer: String?, val verified: Boolean, val chapters: List<SketchChapter>)

data class Detection(
    val objectId: String,
    val label: String,
    val confidence: Double,
    val answer: String?,
    // ---- v1 (all optional) ----
    val lowConfidence: Boolean = false,
    val summary: String? = null,
    val steps: List<String> = emptyList(),
    val lenses: List<Lens> = emptyList(),
    val media: Media? = null,
    // ---- 14 Nov additions (all optional) ----
    /** Language of the library text in this message (`show.lang`); null from an older bridge. */
    val lang: String? = null,
    /** The question this answer is for (`/ask`, or `/detect` with a question). */
    val question: String? = null,
    /** `/ask`: which lens and step answer the question. */
    val lensHint: LensHint? = null,
    /** `waitSketch`: the generated sketch for an unknown object. */
    val sketch: Sketch? = null,
    /** `waitSketch`: set instead of [sketch] when it could not be made (`sketch_failed`). */
    val sketchError: String? = null,
    /** Answer from a dev-only stand-in model. */
    val standIn: Boolean = false,
)

/** A track the wearer can step through: a lens, or the plain `steps` list when the bridge sent no lenses. */
data class Track(
    /** Lens id for media lookup; null when unknown. */
    val lensId: String?,
    val title: String,
    val lead: String?,
    val steps: List<String>,
)

/** What the result screen should be. */
sealed class Verdict {
    /** v1 `lowConfidence`: "Not sure" card with the label as a guess. Never opens a scene. */
    data class NotSure(val guess: String) : Verdict()
    /** Local rule (old bridge): `unknown` or confidence under [DetectionParser.LOCAL_MIN_CONFIDENCE]. Today's card. */
    data class Unrecognised(val answer: String?) : Verdict()
    /** No steps at all: today's single result card. */
    data class Plain(val det: Detection) : Verdict()
    /** v1 steps or lenses: overview card, then steps. */
    data class Explainer(val det: Detection, val tracks: List<Track>) : Verdict()
    /** Unknown object with a generated sketch: same explainer, every card tagged "Sketch · unverified". */
    data class Sketched(val det: Detection, val tracks: List<Track>) : Verdict()
}

class JsonParseException(msg: String) : IllegalArgumentException(msg)

/** Minimal JSON reader: objects become Map, arrays List, numbers Double, plus String, Boolean and null. */
internal class MiniJson private constructor(private val s: String) {
    private var i = 0

    companion object {
        fun parse(text: String): Any? {
            val p = MiniJson(text)
            p.ws()
            val v = p.value()
            p.ws()
            if (p.i != p.s.length) p.fail("trailing text")
            return v
        }
    }

    private fun fail(msg: String): Nothing = throw JsonParseException("JSON: $msg at $i")

    private fun ws() {
        while (i < s.length && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++
    }

    private fun value(): Any? {
        if (i >= s.length) fail("unexpected end")
        return when (val c = s[i]) {
            '{' -> obj()
            '[' -> arr()
            '"' -> str()
            't' -> lit("true", true)
            'f' -> lit("false", false)
            'n' -> lit("null", null)
            else -> if (c == '-' || c in '0'..'9') num() else fail("unexpected '$c'")
        }
    }

    private fun lit(word: String, v: Any?): Any? {
        if (!s.startsWith(word, i)) fail("bad literal")
        i += word.length
        return v
    }

    private fun obj(): Map<String, Any?> {
        val m = LinkedHashMap<String, Any?>()
        i++ // {
        ws()
        if (i < s.length && s[i] == '}') { i++; return m }
        while (true) {
            ws()
            if (i >= s.length || s[i] != '"') fail("expected key")
            val k = str()
            ws()
            if (i >= s.length || s[i] != ':') fail("expected ':'")
            i++
            ws()
            m[k] = value()
            ws()
            if (i >= s.length) fail("unclosed object")
            when (s[i]) {
                ',' -> i++
                '}' -> { i++; return m }
                else -> fail("expected ',' or '}'")
            }
        }
    }

    private fun arr(): List<Any?> {
        val l = ArrayList<Any?>()
        i++ // [
        ws()
        if (i < s.length && s[i] == ']') { i++; return l }
        while (true) {
            ws()
            l += value()
            ws()
            if (i >= s.length) fail("unclosed array")
            when (s[i]) {
                ',' -> i++
                ']' -> { i++; return l }
                else -> fail("expected ',' or ']'")
            }
        }
    }

    private fun str(): String {
        i++ // opening quote
        val b = StringBuilder()
        while (true) {
            if (i >= s.length) fail("unclosed string")
            val c = s[i++]
            when (c) {
                '"' -> return b.toString()
                '\\' -> {
                    if (i >= s.length) fail("bad escape")
                    when (val e = s[i++]) {
                        '"' -> b.append('"'); '\\' -> b.append('\\'); '/' -> b.append('/')
                        'b' -> b.append('\b'); 'f' -> b.append('\u000C'); 'n' -> b.append('\n')
                        'r' -> b.append('\r'); 't' -> b.append('\t')
                        'u' -> {
                            if (i + 4 > s.length) fail("bad \\u escape")
                            val code = s.substring(i, i + 4).toIntOrNull(16) ?: fail("bad \\u escape")
                            b.append(code.toChar())
                            i += 4
                        }
                        else -> fail("bad escape '$e'")
                    }
                }
                else -> b.append(c)
            }
        }
    }

    private fun num(): Double {
        val start = i
        if (s[i] == '-') i++
        while (i < s.length && (s[i].isDigit() || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+' || s[i] == '-')) i++
        return s.substring(start, i).toDoubleOrNull() ?: fail("bad number")
    }
}

object DetectionParser {
    /** The app's own rule, kept for an old bridge that sends no `lowConfidence`. */
    const val LOCAL_MIN_CONFIDENCE = 0.5

    /** DESIGN.md: the lens bar never shows more than 5 lenses. */
    const val MAX_LENSES = 5

    /** Parses a `/detect` body. Throws [JsonParseException] when the text is not a JSON object. */
    fun parse(text: String): Detection {
        val root = MiniJson.parse(text) as? Map<*, *> ?: throw JsonParseException("JSON: not an object")
        return Detection(
            objectId = root.str("objectId") ?: "unknown",
            label = root.str("label") ?: "",
            confidence = root.num("confidence") ?: 0.0,
            answer = root.str("answer")?.ifBlank { null },
            lowConfidence = root["lowConfidence"] == true,
            summary = root.str("summary")?.ifBlank { null },
            steps = strings(root["steps"]),
            lenses = (root["lenses"] as? List<*>).orEmpty().mapNotNull { lens(it) },
            media = media(root["media"]),
            lang = root.str("lang")?.trim()?.ifEmpty { null },
            question = root.str("question")?.trim()?.ifEmpty { null },
            lensHint = lensHint(root["lensHint"]),
            sketch = sketch(root["sketch"]),
            sketchError = root.str("sketchError")?.trim()?.ifEmpty { null },
            standIn = root["standIn"] == true,
        )
    }

    /** PROTOCOL: a sketch has 1 to 3 chapters. */
    const val MAX_SKETCH_CHAPTERS = 3

    private fun lensHint(v: Any?): LensHint? {
        val m = v as? Map<*, *> ?: return null
        val id = m.str("id")?.trim()?.ifEmpty { null } ?: return null
        val step = (m["step"] as? Double)?.takeIf { it >= 1 && it == Math.floor(it) }?.toInt() ?: 1
        return LensHint(id, step)
    }

    /** A sketch with no usable chapter (no captions) is dropped: the app then shows the model's answer. */
    private fun sketch(v: Any?): Sketch? {
        val m = v as? Map<*, *> ?: return null
        val chapters = (m["chapters"] as? List<*>).orEmpty().mapNotNull { c ->
            val cm = c as? Map<*, *> ?: return@mapNotNull null
            val captions = strings(cm["captions"])
            if (captions.isEmpty()) return@mapNotNull null
            val lens = cm.str("lens")?.trim().orEmpty()
            SketchChapter(
                lens = lens,
                scene = cm.str("scene")?.trim().orEmpty(),
                title = cm.str("title")?.trim()?.ifEmpty { null } ?: kindName(lens),
                lead = cm.str("lead")?.trim()?.ifEmpty { null },
                captions = captions,
            )
        }.take(MAX_SKETCH_CHAPTERS)
        if (chapters.isEmpty()) return null
        return Sketch(
            label = m.str("label")?.trim()?.ifEmpty { null } ?: "Sketch",
            answer = m.str("answer")?.trim()?.ifEmpty { null },
            // Anything but an explicit true counts as unverified (PROTOCOL: always false today).
            verified = m["verified"] == true,
            chapters = chapters,
        )
    }

    /** Tracks of a sketch. Lens ids are `sketch.<lens>`: there is no media for them. */
    fun sketchTracks(s: Sketch): List<Track> = s.chapters.mapIndexed { i, c ->
        Track("sketch.${c.lens.ifEmpty { "$i" }}", c.title, c.lead, c.captions)
    }

    private fun Map<*, *>.str(k: String): String? = when (val v = this[k]) {
        is String -> v
        is Double -> if (v == Math.floor(v) && !v.isInfinite()) v.toLong().toString() else v.toString()
        is Boolean -> v.toString()
        else -> null
    }

    private fun Map<*, *>.num(k: String): Double? = when (val v = this[k]) {
        is Double -> v
        is String -> v.trim().toDoubleOrNull()
        else -> null
    }

    /** Non-blank strings of a JSON array; anything else gives an empty list. */
    private fun strings(v: Any?): List<String> =
        (v as? List<*>).orEmpty().mapNotNull { (it as? String)?.trim()?.ifEmpty { null } }

    private fun lens(v: Any?): Lens? {
        val m = v as? Map<*, *> ?: return null
        val id = m.str("id")?.ifBlank { null } ?: return null
        val kind = m.str("kind").orEmpty()
        return Lens(
            id = id,
            kind = kind,
            title = m.str("title")?.ifBlank { null } ?: kindName(kind),
            lead = m.str("lead")?.ifBlank { null },
            steps = strings(m["steps"]),
        )
    }

    private fun media(v: Any?): Media? {
        val m = v as? Map<*, *> ?: return null
        val base = m.str("base")?.trim()?.ifEmpty { null } ?: return null
        val lenses = (m["lenses"] as? Map<*, *>).orEmpty().mapNotNull { (k, lv) ->
            val key = k as? String ?: return@mapNotNull null
            val lm = lv as? Map<*, *> ?: return@mapNotNull null
            key to LensMedia(stills = strings(lm["stills"]), clip = lm.str("clip")?.ifBlank { null })
        }.toMap()
        return Media(base, lenses)
    }

    /** Name on screen for a lens kind (DESIGN.md lens table). */
    fun kindName(kind: String): String = when (kind) {
        "motion" -> "Motion"
        "inside" -> "Inside"
        "cutaway" -> "Cutaway"
        "flow" -> "Flow"
        "zoom" -> "Zoom"
        "whatif" -> "What if"
        "compare" -> "Compare"
        "number" -> "The number"
        else -> "Lens"
    }

    /** Tracks to step through: lenses with steps, else the plain `steps` list, else none. */
    fun tracks(d: Detection): List<Track> {
        val fromLenses = d.lenses.filter { it.steps.isNotEmpty() }.take(MAX_LENSES)
            .map { Track(it.id, it.title, it.lead, it.steps) }
        if (fromLenses.isNotEmpty()) return fromLenses
        if (d.steps.isEmpty()) return emptyList()
        // `steps` are the captions of the first lens, so its media (if any) belongs to them.
        return listOf(Track(d.lenses.firstOrNull()?.id, d.label.ifBlank { "Explanation" }, null, d.steps))
    }

    fun verdict(d: Detection): Verdict = when {
        d.objectId == "unknown" && d.sketch != null -> Verdict.Sketched(d, sketchTracks(d.sketch))
        d.lowConfidence && d.objectId != "unknown" && d.label.isNotBlank() -> Verdict.NotSure(d.label)
        d.objectId == "unknown" || d.confidence < LOCAL_MIN_CONFIDENCE || d.lowConfidence -> Verdict.Unrecognised(d.answer)
        else -> tracks(d).let { if (it.isEmpty()) Verdict.Plain(d) else Verdict.Explainer(d, it) }
    }

    /** Media file names for [lensId]'s steps; step i shows stills[i] when present. */
    fun stills(d: Detection, lensId: String?): List<String> =
        lensId?.let { d.media?.lenses?.get(it)?.stills }.orEmpty()

    /** Bridge path of a still: `{media.base}/{file}`. Null when the file name is unsafe. */
    fun stillPath(mediaBase: String, file: String): String? {
        if (file.isBlank() || file.contains("..") || file.startsWith("/") || file.contains("://")) return null
        val base = "/" + mediaBase.trim().trim('/')
        return "$base/$file"
    }

    /** Full URL of a still on [bridgeBase] (e.g. `https://host:8787`). */
    fun stillUrl(bridgeBase: String, mediaBase: String, file: String): String? =
        stillPath(mediaBase, file)?.let { bridgeBase.trim().trimEnd('/') + it }
}
