package com.junction2026.lens

/**
 * HTTP 429 on `/detect` and `/ask`: wait for `Retry-After` seconds (default 2, at most 5) and try exactly once
 * more; a second 429 is "Busy". Pure, for JVM tests.
 */
object BridgeRetry {
    const val DEFAULT_S = 2L
    const val MAX_S = 5L

    /**
     * What to do after an answer with [status] on try [attempt] (0 = the first): the wait in ms before the one
     * retry, or null for no retry (not a 429, or the retry was already used).
     */
    fun retryAfterMs(status: Int, attempt: Int, retryAfter: String?): Long? {
        if (status != 429 || attempt > 0) return null
        // Seconds only; an HTTP date or anything else gets the default.
        val s = retryAfter?.trim()?.toLongOrNull()?.takeIf { it >= 0 } ?: DEFAULT_S
        return minOf(s, MAX_S) * 1000
    }

    /** A 429 that is left after the retry: the "Busy" card. */
    fun isBusy(status: Int): Boolean = status == 429
}
