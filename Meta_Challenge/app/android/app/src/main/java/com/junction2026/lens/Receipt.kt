package com.junction2026.lens

import java.util.Locale

/** Where the current result came from, for the phone's receipt line. */
enum class ReceiptKind { LIBRARY, SKETCH, SAVED, REPLAY, DEMO, ANSWER_BRIDGE, ANSWER_PHONE }

/**
 * Facts the app has about the result on screen. [model]: the response's `timings.model` (PROTOCOL `show`),
 * null when the bridge sent none. [toCardMs]: measured on the phone from the trigger to the card on the display.
 */
data class ReceiptFacts(val kind: ReceiptKind, val model: String? = null, val toCardMs: Long? = null, val standIn: Boolean = false)

/**
 * The phone-only receipt line under the mirror (not on the glasses card, which is at its word cap):
 * "Library card · mock detector · 0.84 s to card". Only facts from [ReceiptFacts]; a part the app does not
 * know is left out. English and Finnish (other languages fall back to English). Pure, for JVM tests.
 */
object Receipt {
    fun line(f: ReceiptFacts, lang: String): String {
        val fi = lang.lowercase(Locale.ROOT).startsWith("fi")
        fun s(en: String, fiText: String) = if (fi) fiText else en
        val parts = ArrayList<String>()
        when (f.kind) {
            ReceiptKind.LIBRARY -> { parts += s("Library card", "Kirjaston kortti"); model(f.model, fi)?.let { parts += it }; time(f.toCardMs, fi)?.let { parts += it } }
            ReceiptKind.SKETCH -> { parts += Lang.ui(lang, Lang.SKETCH); time(f.toCardMs, fi)?.let { parts += it } }
            ReceiptKind.SAVED -> { parts += s("Saved card", "Tallennettu kortti"); parts += s("offline", "ei yhteyttä") }
            ReceiptKind.REPLAY -> { parts += s("Saved card", "Tallennettu kortti"); parts += s("from Seen today", "Nähty tänään -listasta") }
            ReceiptKind.DEMO -> parts += s("Demo data", "Esittelydata")
            ReceiptKind.ANSWER_BRIDGE -> { parts += s("Bridge answer", "Sillan vastaus"); model(f.model, fi)?.let { parts += it }; time(f.toCardMs, fi)?.let { parts += it } }
            ReceiptKind.ANSWER_PHONE -> parts += Lang.ui(lang, Lang.PHONE_ANSWER)
        }
        if (f.standIn) parts += Lang.ui(lang, Lang.STAND_IN)
        return parts.joinToString(" · ")
    }

    /** `timings.model` in words: the bridge's mock and forced modes by name, else the model name as sent. */
    fun model(m: String?, fi: Boolean): String? {
        val v = m?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return when (v) {
            "mock" -> if (fi) "testitunnistin" else "mock detector"
            "forced" -> if (fi) "pakotettu kohde" else "forced object"
            "local-match" -> if (fi) "sanavertailu" else "word match"
            else -> v.split(Regex("\\s+")).first().filter { it.isLetterOrDigit() || it in ".:_-/" }.take(32).ifEmpty { null }
        }
    }

    /** "0.84 s to card" under a second, "6.2 s to card" above; Finnish uses a decimal comma. */
    fun time(ms: Long?, fi: Boolean): String? {
        if (ms == null || ms < 0) return null
        val sec = ms / 1000.0
        val n = if (sec < 1) String.format(Locale.US, "%.2f", sec) else String.format(Locale.US, "%.1f", sec)
        return if (fi) "${n.replace('.', ',')} s korttiin" else "$n s to card"
    }
}
