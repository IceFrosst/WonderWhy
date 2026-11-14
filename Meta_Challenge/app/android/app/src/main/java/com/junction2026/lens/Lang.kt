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

    /**
     * The language the app uses: the phone screen's picker choice when it is one of [SUPPORTED], else the
     * phone language ([tagFor]). A blank choice is "Phone language".
     */
    fun effective(choice: String?, locale: Locale): String {
        val c = choice?.trim()?.lowercase(Locale.ROOT).orEmpty()
        return if (c in SUPPORTED) c else tagFor(locale)
    }

    /** Own name of each language, for the phone's picker ("Suomi"). */
    fun nativeName(tag: String): String = when (tag) {
        "en" -> "English"; "fi" -> "Suomi"; "sv" -> "Svenska"
        "de" -> "Deutsch"; "es" -> "Español"; "fr" -> "Français"
        else -> name(tag)
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
    const val SHOW_STEPS = "show_steps"
    const val NEXT = "next"
    const val STEP = "step"
    const val SKETCH = "sketch"
    const val PHONE_ANSWER = "phone_answer"

    private val EN = mapOf(
        IDLE to "Look at something and pinch",
        LOOKING to "Looking...",
        NOT_SURE to "Not sure what this is",
        TRY_AGAIN to "Try again",
        AGAIN to "Again",
        DONE to "Done",
        OFFLINE to "Offline: showing a saved card",
        TOKEN to "Wrong bridge token. Set it in the app.",
        SHOW_STEPS to "Show steps",
        NEXT to "Next",
        STEP to "Step",
        SKETCH to "Sketch · unverified",
        PHONE_ANSWER to "Answer from saved cards",
    )

    private val FI = mapOf(
        IDLE to "Katso jotain ja nipistä",
        LOOKING to "Katsotaan...",
        NOT_SURE to "En tunnista tätä",
        TRY_AGAIN to "Yritä uudelleen",
        AGAIN to "Uudelleen",
        DONE to "Valmis",
        OFFLINE to "Ei yhteyttä: tallennettu kortti",
        TOKEN to "Väärä avain. Aseta se sovelluksessa.",
        SHOW_STEPS to "Näytä vaiheet",
        NEXT to "Seuraava",
        STEP to "Vaihe",
        SKETCH to "Luonnos · tarkistamaton",
        PHONE_ANSWER to "Vastaus tallennetuista korteista",
    )

    private val TABLES = mapOf("en" to EN, "fi" to FI)

    /** UI string for [tag] and [key]; falls back to English, then to the key itself. */
    fun ui(tag: String, key: String): String {
        val t = tag.lowercase(Locale.ROOT).substringBefore('-').substringBefore('_')
        return TABLES[t]?.get(key) ?: EN[key] ?: key
    }

    val KEYS: List<String> get() = EN.keys.toList()
}
