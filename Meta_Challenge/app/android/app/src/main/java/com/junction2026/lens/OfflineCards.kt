package com.junction2026.lens

import java.io.InputStream
import java.util.Locale
import org.json.JSONObject

/** One lens (chapter) of a library object, shaped like a v1 `lenses[]` entry. */
data class OfflineLens(
    val id: String,
    val kind: String,
    val title: String,
    val lead: String?,
    val steps: List<String>,
)

/** One library object from the bundled objects.json. */
data class OfflineObject(
    val id: String,
    val label: String,
    val tagline: String,
    val answer: String,
    val lenses: List<OfflineLens>,
)

/** Same shape as the online v1 `/detect` response fields the phone card uses. */
data class OfflineDetect(
    val id: String,
    val label: String,
    val summary: String,
    val steps: List<String>,
    val lenses: List<OfflineLens>,
    val offline: Boolean = true,
)

object OfflineCards {
    const val ASSET_NAME = "objects.json"

    /** Thin loader: pass `context.assets.open(OfflineCards.ASSET_NAME)`. Closes the stream. */
    fun load(input: InputStream): Map<String, OfflineObject> =
        parse(input.use { it.readBytes().toString(Charsets.UTF_8) })

    /** Parses objects.json. Entries without an id are skipped; optional fields default to empty. */
    fun parse(jsonText: String): Map<String, OfflineObject> {
        val arr = JSONObject(jsonText).optJSONArray("objects") ?: return emptyMap()
        val out = LinkedHashMap<String, OfflineObject>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val id = o.optString("id").trim()
            if (id.isEmpty()) continue
            val chapters = o.optJSONArray("chapters")
            val lenses = ArrayList<OfflineLens>()
            if (chapters != null) {
                for (j in 0 until chapters.length()) {
                    val c = chapters.optJSONObject(j) ?: continue
                    val kind = c.optString("lens").ifEmpty { "motion" }
                    val caps = c.optJSONArray("captions")
                    val steps = ArrayList<String>()
                    if (caps != null) for (k in 0 until caps.length()) {
                        val s = caps.optString(k).trim()
                        if (s.isNotEmpty()) steps.add(s)
                    }
                    lenses.add(
                        OfflineLens(
                            id = "$id.$kind",
                            kind = kind,
                            title = c.optString("title"),
                            lead = c.optString("lead").ifEmpty { null },
                            steps = steps,
                        )
                    )
                }
            }
            val label = o.optString("label").ifEmpty { id }
            out[id] = OfflineObject(
                id = id,
                label = label,
                tagline = o.optString("tagline").ifEmpty { label },
                answer = o.optString("answer"),
                lenses = lenses,
            )
        }
        return out
    }

    private val ARTICLES = setOf("a", "an", "the", "my", "some", "this", "that", "one")

    private val EXTRA_ALIASES = mapOf(
        "guitar" to listOf("ukulele", "banjo", "strings"),
        "ball" to listOf("football", "basketball", "tennis ball"),
        "bicycle" to listOf("bike", "cycle", "gear", "gears"),
        "kettle" to listOf("water boiler", "pot"),
        "pendulum" to listOf("keys", "swing", "key chain", "keychain"),
        "phone" to listOf("smartphone", "mobile", "cellphone", "cell phone", "mobile phone"),
    )

    private fun singular(w: String): String = when {
        w.length > 3 && w.endsWith("ies") -> w.dropLast(3) + "y"
        w.length > 3 && w.endsWith("es") && (w.endsWith("ches") || w.endsWith("shes") || w.endsWith("sses") || w.endsWith("xes")) -> w.dropLast(2)
        w.length > 2 && w.endsWith("s") && !w.endsWith("ss") -> w.dropLast(1)
        else -> w
    }

    /** Lowercase, letters/digits only, articles dropped, each word singularised. */
    private fun norm(text: String): String =
        text.lowercase(Locale.ROOT)
            .replace(Regex("[^\\p{L}\\p{N}]+"), " ")
            .trim()
            .split(' ')
            .filter { it.isNotEmpty() && it !in ARTICLES }
            .joinToString(" ") { singular(it) }

    private fun aliases(obj: OfflineObject): Set<String> {
        val set = LinkedHashSet<String>()
        set.add(norm(obj.id))
        set.add(norm(obj.label))
        set.add(norm(obj.tagline))
        norm(obj.label).split(' ').filter { it.length > 2 }.forEach { set.add(it) }
        EXTRA_ALIASES[obj.id]?.forEach { set.add(norm(it)) }
        set.remove("")
        return set
    }

    /**
     * Finds an object by id or spoken/typed name ("a kettle", "the balls"). Null if no match.
     * Tries the whole phrase first, then single words (so "tennis ball" finds ball).
     */
    fun lookup(objects: Map<String, OfflineObject>, query: String): OfflineObject? {
        val q = norm(query)
        if (q.isEmpty()) return null
        objects.values.firstOrNull { norm(it.id) == q }?.let { return it }
        objects.values.firstOrNull { q in aliases(it) }?.let { return it }
        val words = q.split(' ')
        if (words.size > 1) {
            for (w in words.asReversed()) {
                objects.values.firstOrNull { w in aliases(it) }?.let { return it }
            }
        }
        return null
    }

    /**
     * The tagline to show on a card in [lang], or null. Translations do not carry taglines yet, so a library in
     * another language still has the English one: show it only in English or when it differs from
     * [englishTagline] (the bundled English library's).
     */
    fun taglineFor(lang: String, tagline: String, englishTagline: String?): String? = when {
        tagline.isBlank() -> null
        lang.lowercase(Locale.ROOT).startsWith("en") -> tagline
        englishTagline != null && tagline != englishTagline -> tagline
        else -> null
    }

    /** The data a v1 `/detect` response would carry for this object. */
    fun toDetect(obj: OfflineObject): OfflineDetect = OfflineDetect(
        id = obj.id,
        label = obj.label,
        summary = obj.answer,
        steps = obj.lenses.firstOrNull()?.steps ?: emptyList(),
        lenses = obj.lenses,
    )
}
