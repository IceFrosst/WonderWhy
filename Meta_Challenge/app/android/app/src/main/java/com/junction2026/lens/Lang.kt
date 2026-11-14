package com.junction2026.lens

import java.util.Locale

object Lang {
    val SUPPORTED = listOf("en", "fi", "sv", "de", "es", "fr")

    private val NAMES = mapOf(
        "en" to "English", "fi" to "Finnish", "sv" to "Swedish",
        "de" to "German", "es" to "Spanish", "fr" to "French",
    )

    /** BCP-47 language tag limited to [SUPPORTED]; anything else gives "en". */
    fun tagFor(locale: Locale): String {
        val l = locale.language.lowercase(Locale.ROOT)
        return if (l in SUPPORTED) l else "en"
    }

    /** English name of the language, for a prompt ("Answer in Finnish"). Unknown tags give English. */
    fun name(tag: String): String =
        NAMES[tag.lowercase(Locale.ROOT).substringBefore('-').substringBefore('_')] ?: "English"

    const val IDLE = "idle"
    const val LOOKING = "looking"
    const val NOT_SURE = "not_sure"
    const val TRY_AGAIN = "try_again"
    const val AGAIN = "again"
    const val DONE = "done"
    const val OFFLINE = "offline"
    const val TOKEN = "token"

    private val EN = mapOf(
        IDLE to "Look at something and pinch",
        LOOKING to "Looking...",
        NOT_SURE to "Not sure what this is",
        TRY_AGAIN to "Try again",
        AGAIN to "Again",
        DONE to "Done",
        OFFLINE to "Offline: showing a saved card",
        TOKEN to "Bridge token is wrong or missing. Set it in the phone app.",
    )

    private val FI = mapOf(
        IDLE to "Katso jotain ja nipistä",
        LOOKING to "Katsotaan...",
        NOT_SURE to "En tunnista tätä",
        TRY_AGAIN to "Yritä uudelleen",
        AGAIN to "Uudelleen",
        DONE to "Valmis",
        OFFLINE to "Ei yhteyttä: tallennettu kortti",
        TOKEN to "Avain puuttuu tai on väärä. Aseta se puhelimen sovelluksessa.",
    )

    private val TABLES = mapOf("en" to EN, "fi" to FI)

    /** UI string for [tag] and [key]; falls back to English, then to the key itself. */
    fun ui(tag: String, key: String): String {
        val t = tag.lowercase(Locale.ROOT).substringBefore('-').substringBefore('_')
        return TABLES[t]?.get(key) ?: EN[key] ?: key
    }

    val KEYS: List<String> get() = EN.keys.toList()
}
