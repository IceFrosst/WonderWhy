package com.junction2026.lens

import java.util.Locale

/** What a follow-up question can be about right now. */
sealed class AskTarget {
    /** A library object is on screen: ask the bridge about it. */
    data class Object(val id: String) : AskTarget()
    /** Nothing explained yet: "explain something first". */
    data object NoResult : AskTarget()
    /** An unknown object or a sketch: PROTOCOL refuses `aboutObjectId: "unknown"` for now. */
    data object Unknown : AskTarget()
}

/** Text for the answer card, already within the DESIGN.md word caps. */
data class AnswerText(val title: String, val question: String, val answer: String)

/**
 * Follow-up questions (PROTOCOL `POST /ask`). Pure: target choice, lens hint to explainer position, word
 * caps, and the phone's own word-overlap answer (the same rule PROTOCOL gives the bridge's mock mode),
 * used when the bridge has no `/ask` or cannot be reached.
 */
object AskFlow {
    /** DESIGN.md word caps: title 4, one-line answer 12 (the question line), step caption 24 (the answer). */
    const val TITLE_WORDS = 4
    const val QUESTION_WORDS = 12
    const val ANSWER_WORDS = 24

    fun target(current: Detection?): AskTarget = when {
        current == null -> AskTarget.NoResult
        current.objectId == "unknown" || current.sketch != null -> AskTarget.Unknown
        current.objectId.isBlank() -> AskTarget.NoResult
        else -> when (DetectionParser.verdict(current)) {
            is Verdict.Explainer, is Verdict.Plain -> AskTarget.Object(current.objectId)
            is Verdict.NotSure, is Verdict.Unrecognised -> AskTarget.NoResult
            is Verdict.Sketched -> AskTarget.Unknown
        }
    }

    /** Lens index and 0-based step for [hint] in [tracks]; null when the hint is absent or names no track. */
    fun position(tracks: List<Track>, hint: LensHint?): Pair<Int, Int>? {
        if (hint == null) return null
        val lens = tracks.indexOfFirst { it.lensId == hint.id }
        if (lens < 0) return null
        val steps = tracks[lens].steps.size
        if (steps == 0) return null
        return lens to (hint.step - 1).coerceIn(0, steps - 1)
    }

    /** At most [max] words; a cut text ends with an ellipsis. */
    fun cap(text: String, max: Int): String {
        val words = text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.size <= max) return words.joinToString(" ")
        return words.take(max).joinToString(" ").trimEnd(',', ';', ':', '.') + "…"
    }

    fun answerText(label: String, question: String, answer: String): AnswerText = AnswerText(
        title = cap(label, TITLE_WORDS),
        question = cap(question, QUESTION_WORDS),
        answer = cap(answer, ANSWER_WORDS),
    )

    /**
     * The answer line of the card. The real bridge sends `answer: ""` (no lensHint) when no step matches the
     * question (14 Nov, mock provider); the parser turns that into null and the object's summary is shown.
     */
    fun answerLine(det: Detection): String = det.answer?.takeIf { it.isNotBlank() } ?: det.summary.orEmpty()

    /** Primary button of the answer card: the lens and step the hint points at, e.g. "Open: Bounce 2/3". */
    fun openLabel(track: Track, step: Int): String =
        "${cap(track.title, 3)} ${step + 1}/${track.steps.size}"

    /**
     * When the phone answers by itself instead of showing an error: only when the bridge truly has no
     * `/ask` (404 with no body or the bridge's own `not_found` route error) or cannot be reached at all.
     * A 401, a `bad_request`, a timeout or a model failure from a bridge that has `/ask` are real answers.
     */
    fun answerOnPhone(status: Int, code: String, offline: Boolean): Boolean =
        offline || (status == 404 && (code.isEmpty() || code == "not_found"))

    // ---- the phone's own answer (no /ask on the bridge, or offline) ----

    private val STOP = setOf(
        "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "by", "for", "with", "from", "is", "are",
        "was", "be", "it", "its", "this", "that", "does", "do", "did", "why", "how", "what", "when", "where",
        "which", "who", "can", "could", "would", "will", "so", "as", "into", "than", "then", "there", "they",
        "you", "your", "i", "me", "my", "we", "our", "not", "no", "yes", "about", "more", "most", "very",
    )

    private fun tokens(text: String): List<String> =
        text.lowercase(Locale.ROOT).split(Regex("[^\\p{L}\\p{N}]+"))
            .filter { it.length > 2 && it !in STOP }

    /** Two words match when one is a prefix of the other and the shorter has 4+ letters (curve / curves). */
    private fun same(a: String, b: String): Boolean {
        if (a == b) return true
        val (s, l) = if (a.length <= b.length) a to b else b to a
        return s.length >= 4 && l.startsWith(s)
    }

    /**
     * PROTOCOL's mock rule, on the phone: the step whose caption (plus its lens title) shares the most words
     * with the question. Ties go to the earlier lens and step. Null when no word matches.
     */
    fun bestStep(tracks: List<Track>, question: String): Pair<Int, Int>? {
        val q = tokens(question).distinct()
        if (q.isEmpty()) return null
        var best: Pair<Int, Int>? = null
        var bestScore = 0
        tracks.forEachIndexed { li, t ->
            val titleWords = tokens(t.title)
            t.steps.forEachIndexed { si, caption ->
                val words = tokens(caption) + titleWords
                val score = q.count { qw -> words.any { same(qw, it) } }
                if (score > bestScore) { bestScore = score; best = li to si }
            }
        }
        return best
    }

    /** Words in a question that point at a kind of lens (English). The first matching lens the object has wins. */
    private val LENS_WORDS: List<Pair<List<String>, List<String>>> = listOf(
        listOf("inside", "construction", "constructed", "built", "build", "made", "layers", "layer", "parts", "part", "components", "open", "apart", "structure", "works", "work") to listOf("inside", "cutaway", "explore", "zoom"),
        listOf("material", "atoms", "atom", "molecules", "zoom", "microscopic", "feel", "feels") to listOf("zoom", "inside", "cutaway"),
        listOf("much", "many", "cost", "costs", "number", "numbers", "fast", "long", "big", "heavy") to listOf("number"),
        listOf("if", "change", "changed", "instead", "moon", "longer", "shorter", "bigger", "smaller") to listOf("whatif"),
        listOf("compare", "difference", "different", "versus", "bounce", "bounces") to listOf("compare"),
        listOf("energy", "flow", "power", "electricity", "heat", "sound", "force", "goes", "comes") to listOf("flow"),
        listOf("move", "moves", "motion", "moving", "why", "vibrate", "vibrates", "swing", "swings", "boil", "boils", "curve", "curves") to listOf("motion", "explore"),
    )

    /**
     * Where to open the pictures for a question spoken with the photo: a lens named by the question's words
     * (step 1), else the step whose caption shares most words with it, else null (the usual overview).
     */
    fun visualFor(tracks: List<Track>, question: String): Pair<Int, Int>? {
        val q = question.lowercase().split(Regex("[^a-z]+")).filter { it.isNotEmpty() }.toSet()
        for ((words, lenses) in LENS_WORDS) {
            if (words.none { it in q }) continue
            for (id in lenses) {
                // Lens ids look like "phone.inside" or "sketch.flow": the kind is the last part.
                val li = tracks.indexOfFirst { it.lensId?.substringAfterLast('.') == id && it.steps.isNotEmpty() }
                if (li >= 0) return li to 0
            }
        }
        return bestStep(tracks, question)
    }

    /**
     * The answer the phone gives by itself: [det] with the question, the matching caption as the answer and a
     * lens hint, shaped like an `/ask` show. With no match the answer is the object's summary and no hint.
     */
    fun localAnswer(det: Detection, question: String): Detection {
        val tracks = DetectionParser.tracks(det)
        val pos = bestStep(tracks, question)
        val hint = pos?.let { (l, s) -> tracks[l].lensId?.let { LensHint(it, s + 1) } }
        val answer = pos?.let { (l, s) -> tracks[l].steps[s] } ?: det.summary ?: det.answer.orEmpty()
        return det.copy(question = question, answer = answer, lensHint = hint)
    }
}
