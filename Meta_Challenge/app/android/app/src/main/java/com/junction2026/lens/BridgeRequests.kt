package com.junction2026.lens

import org.json.JSONObject

/**
 * Request bodies and paths for the bridge (PROTOCOL.md). Pure: the caller passes base64 text, ids and the
 * clock, so JVM tests check exactly what goes on the wire.
 */
object BridgeRequests {
    /** PROTOCOL `/ask`: "question: text, 200 chars at most". */
    const val MAX_QUESTION_CHARS = 200

    /**
     * `POST /detect`. [lang] is sent only when it is one of [Lang.SUPPORTED] (anything else means English
     * to the bridge anyway). [waitSketch]: for an unknown object, wait for the sketch in this response.
     */
    fun detectBody(
        reqId: String,
        imageBase64: String,
        focusBase64: String?,
        tCapture: Long,
        now: Long,
        lang: String,
        waitSketch: Boolean = true,
        /** PROTOCOL `forceObjectId`: a library id; the bridge skips the model (dev testing without a key). */
        forceObjectId: String? = null,
    ): String {
        val o = JSONObject()
            .put("reqId", reqId)
            .put("imageBase64", imageBase64)
            .put("question", JSONObject.NULL)
            .put("t_capture", tCapture)
            .put("preUploadMs", (now - tCapture).coerceAtLeast(0))
        if (focusBase64 != null) o.put("focusBase64", focusBase64) // PROTOCOL: omitted when absent
        langOrNull(lang)?.let { o.put("lang", it) }
        if (waitSketch) o.put("waitSketch", true)
        forceObjectId?.trim()?.lowercase()?.takeIf { it.matches(Regex("[a-z0-9_]{1,32}")) }?.let { o.put("forceObjectId", it) }
        return o.toString()
    }

    /** `POST /ask`. Null when the question is blank after cleaning (nothing to send). */
    fun askBody(reqId: String, question: String, aboutObjectId: String, lang: String): String? {
        val q = cleanQuestion(question) ?: return null
        val o = JSONObject()
            .put("reqId", reqId)
            .put("question", q)
            .put("aboutObjectId", aboutObjectId)
        langOrNull(lang)?.let { o.put("lang", it) }
        return o.toString()
    }

    /** `GET /objects?lang=<tag>`: the library text in that language (English when the tag is unknown). */
    fun objectsPath(lang: String): String = "/objects?lang=" + (langOrNull(lang) ?: "en")

    /** Whitespace collapsed, trimmed, cut to [MAX_QUESTION_CHARS]. Null when nothing is left. */
    fun cleanQuestion(raw: String?): String? {
        val q = raw?.replace(Regex("\\s+"), " ")?.trim().orEmpty()
        if (q.isEmpty()) return null
        return if (q.length <= MAX_QUESTION_CHARS) q else q.take(MAX_QUESTION_CHARS).trimEnd()
    }

    private fun langOrNull(tag: String): String? = tag.trim().lowercase().takeIf { it in Lang.SUPPORTED }
}
