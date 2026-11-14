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
    const val CONSENT_TITLE = "consent_title"
    const val CONSENT_BODY = "consent_body"
    const val CONSENT_NOTE = "consent_note"
    const val AGREE = "agree"
    const val NOT_NOW = "not_now"
    const val OFFLINE_TITLE = "offline_title"
    const val OFFLINE_BODY = "offline_body"
    const val OFFLINE_HINT = "offline_hint"
    const val OPEN = "open"
    const val NOT_SURE_BODY = "not_sure_body"
    const val ERROR_BODY = "error_body"
    const val ERR_EXPLAIN = "err_explain"
    const val ERR_CAMERA = "err_camera"
    const val ERR_GENERIC = "err_generic"
    const val ERR_ANSWER = "err_answer"
    const val TOOK_TOO_LONG = "took_too_long"
    const val CANCELLED = "cancelled"
    const val BUSY = "busy"
    const val TOKEN_TITLE = "token_title"
    const val CANT_ASK_THAT = "cant_ask_that"
    const val CANT_ASK_THAT_BODY = "cant_ask_that_body"
    const val NO_OBJECT = "no_object"
    const val NO_OBJECT_BODY = "no_object_body"
    const val CANT_ASK_YET = "cant_ask_yet"
    const val CANT_ASK_YET_BODY = "cant_ask_yet_body"
    const val OFFLINE_EMPTY = "offline_empty"
    const val QUESTION_PREFIX = "q_prefix"
    const val STAND_IN = "stand_in"

    private val EN = mapOf(
        IDLE to "Look at something and pinch",
        LOOKING to "Looking…",
        NOT_SURE to "Not sure",
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
        CONSENT_TITLE to "Before you start",
        CONSENT_BODY to "Each pinch sends one photo to a model.",
        CONSENT_NOTE to "Through our bridge. Not saved on the phone.",
        AGREE to "Agree",
        NOT_NOW to "Not now",
        OFFLINE_TITLE to "Offline",
        OFFLINE_BODY to "Offline · pick a saved card",
        OFFLINE_HINT to "Left/right: object. Pinch: open.",
        OPEN to "Open",
        NOT_SURE_BODY to "Look again, a bit closer.",
        ERROR_BODY to "Try again in a moment.",
        ERR_EXPLAIN to "Couldn't explain that",
        ERR_CAMERA to "Camera problem",
        ERR_GENERIC to "Something went wrong",
        ERR_ANSWER to "Couldn't answer",
        TOOK_TOO_LONG to "Took too long",
        CANCELLED to "Cancelled",
        BUSY to "Busy",
        TOKEN_TITLE to "Bridge token",
        CANT_ASK_THAT to "Can't ask that",
        CANT_ASK_THAT_BODY to "Ask about the object on screen.",
        NO_OBJECT to "No object yet",
        NO_OBJECT_BODY to "Explain something first, then ask.",
        CANT_ASK_YET to "Can't ask yet",
        CANT_ASK_YET_BODY to "Questions work for library objects only.",
        OFFLINE_EMPTY to "Can't reach the bridge. Try again later.",
        QUESTION_PREFIX to "Q:",
        STAND_IN to "Stand-in model",
    )

    private val FI = mapOf(
        IDLE to "Katso jotain ja nipistä",
        LOOKING to "Katsotaan…",
        NOT_SURE to "En ole varma",
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
        CONSENT_TITLE to "Ennen kuin aloitat",
        CONSENT_BODY to "Jokainen nipistys lähettää yhden kuvan mallille.",
        CONSENT_NOTE to "Sillan kautta. Kuvaa ei tallenneta puhelimeen.",
        AGREE to "Hyväksyn",
        NOT_NOW to "Ei nyt",
        OFFLINE_TITLE to "Ei yhteyttä",
        OFFLINE_BODY to "Ei yhteyttä · valitse tallennettu kortti",
        OFFLINE_HINT to "Vasen/oikea: kohde. Nipistys: avaa.",
        OPEN to "Avaa",
        NOT_SURE_BODY to "Katso uudelleen, vähän lähempää.",
        ERROR_BODY to "Yritä hetken päästä uudelleen.",
        ERR_EXPLAIN to "En osannut selittää",
        ERR_CAMERA to "Kameraongelma",
        ERR_GENERIC to "Jokin meni pieleen",
        ERR_ANSWER to "En osannut vastata",
        TOOK_TOO_LONG to "Kesti liian kauan",
        CANCELLED to "Peruttu",
        BUSY to "Varattu",
        TOKEN_TITLE to "Sillan avain",
        CANT_ASK_THAT to "Tätä ei voi kysyä",
        CANT_ASK_THAT_BODY to "Kysy näytöllä olevasta kohteesta.",
        NO_OBJECT to "Ei kohdetta vielä",
        NO_OBJECT_BODY to "Selitä ensin jotain, kysy sitten.",
        CANT_ASK_YET to "Ei voi vielä kysyä",
        CANT_ASK_YET_BODY to "Kysymykset toimivat vain kirjaston kohteille.",
        OFFLINE_EMPTY to "Siltaan ei saada yhteyttä. Yritä myöhemmin.",
        QUESTION_PREFIX to "K:",
        STAND_IN to "Varamalli",
    )

    private val TABLES = mapOf("en" to EN, "fi" to FI)

    /** UI string for [tag] and [key]; falls back to English, then to the key itself. */
    fun ui(tag: String, key: String): String {
        val t = tag.lowercase(Locale.ROOT).substringBefore('-').substringBefore('_')
        return TABLES[t]?.get(key) ?: EN[key] ?: key
    }

    val KEYS: List<String> get() = EN.keys.toList()

    /** Overview hint (8 words at most): "Pinch: 3 steps. Left/right: 5 lenses." English and Finnish. */
    fun overviewHint(tag: String, steps: Int, lenses: Int): String {
        val fi = tag.lowercase(Locale.ROOT).startsWith("fi")
        val first = if (fi) "Nipistys: $steps ${if (steps == 1) "vaihe" else "vaihetta"}."
        else "Pinch: $steps step${if (steps == 1) "" else "s"}."
        if (lenses <= 1) return first
        return first + if (fi) " Vasen/oikea: $lenses linssiä." else " Left/right: $lenses lenses."
    }
}
