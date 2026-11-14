package com.junction2026.lens

/** Pure helpers for bridge auth, kept free of Android classes so JVM tests can cover them. */
object BridgeAuth {
    const val HEADER = "X-Lens-Token"
    const val TOKEN_ERROR = "Bridge token is wrong or missing. Set it in the phone app."

    enum class ErrorKind { TOKEN, TIMEOUT, BRIDGE }

    /** Headers to add for [token]. Empty map when the token is blank (local bridge has no auth). */
    fun headers(token: String?): Map<String, String> {
        val t = token?.trim().orEmpty()
        return if (t.isEmpty()) emptyMap() else mapOf(HEADER to t)
    }

    /** Maps a non-2xx status (and the bridge's `error` field, if any) to an error kind. */
    fun kindFor(status: Int, bridgeError: String = ""): ErrorKind = when {
        status == 401 -> ErrorKind.TOKEN
        bridgeError == "detect_timeout" -> ErrorKind.TIMEOUT
        else -> ErrorKind.BRIDGE
    }
}
