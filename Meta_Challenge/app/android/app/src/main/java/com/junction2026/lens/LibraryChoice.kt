package com.junction2026.lens

import org.json.JSONObject

/** Where the offline library text came from. */
enum class LibrarySource { BRIDGE, CACHE, BUNDLED }

/**
 * The library the offline cards use. [save]: write [text] to the app-private cache for [lang] (library text
 * from the bridge, not user data).
 */
data class LibraryPick(val source: LibrarySource, val text: String, val lang: String, val save: Boolean)

/**
 * Which library text to use (pure, for JVM tests). In order:
 * 1. the bridge's `GET /objects?lang=` answer when it is in the requested language (saved for later),
 * 2. the saved copy for that language from an earlier run,
 * 3. the bridge's answer in English (it has no translation for the language; not saved under that language),
 * 4. the bundled English `objects.json`.
 * A text counts only when it parses and has at least one object.
 */
object LibraryChoice {
    fun choose(requested: String, fetched: String?, cached: String?, bundled: String): LibraryPick {
        val fetchedLang = fetched?.let { usableLang(it) }
        if (fetched != null && fetchedLang == requested) return LibraryPick(LibrarySource.BRIDGE, fetched, requested, save = true)
        if (cached != null && usableLang(cached) != null) return LibraryPick(LibrarySource.CACHE, cached, requested, save = false)
        if (fetched != null && fetchedLang != null) return LibraryPick(LibrarySource.BRIDGE, fetched, fetchedLang, save = false)
        return LibraryPick(LibrarySource.BUNDLED, bundled, "en", save = false)
    }

    /** The text's `lang` (an answer without one is English, as `/objects` without `?lang=`), or null if unusable. */
    fun usableLang(text: String): String? = runCatching {
        if (OfflineCards.parse(text).isEmpty()) return null
        JSONObject(text).optString("lang").trim().lowercase().ifEmpty { "en" }
    }.getOrNull()

    /** File name of the saved copy; null for a tag that is not supported (never a path from outside). */
    fun cacheName(lang: String): String? = lang.takeIf { it in Lang.SUPPORTED }?.let { "objects_$it.json" }
}
