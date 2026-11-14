package com.junction2026.lens

/** Pure helpers for bridge auth, kept free of Android classes so JVM tests can cover them. */
object BridgeAuth {
    const val HEADER = "X-Lens-Token"
    const val TOKEN_ERROR = "Wrong bridge token. Set it in the app."

    /** UNREACHABLE: a proxy in front of the bridge answered for it (bridge down); treated like no network. */
    enum class ErrorKind { TOKEN, TIMEOUT, BRIDGE, UNREACHABLE }

    /** Headers to add for [token]. Empty map when the token is blank (local bridge has no auth). */
    fun headers(token: String?): Map<String, String> {
        val t = token?.trim().orEmpty()
        return if (t.isEmpty()) emptyMap() else mapOf(HEADER to t)
    }

    /** Maps a non-2xx status (and the bridge's `error` field, if any) to an error kind. */
    fun kindFor(status: Int, bridgeError: String = ""): ErrorKind = when {
        status == 401 -> ErrorKind.TOKEN
        bridgeError == "detect_timeout" -> ErrorKind.TIMEOUT
        // 502/503/504 with no bridge `error` body: the reverse proxy could not reach the bridge.
        status in 502..504 && bridgeError.isEmpty() -> ErrorKind.UNREACHABLE
        else -> ErrorKind.BRIDGE
    }
}
