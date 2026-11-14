package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** HTTP 429: wait Retry-After (default 2 s, at most 5 s), retry exactly once, then "Busy". */
class BridgeRetryTest {
    @Test fun firstTooManyWaitsForRetryAfter() {
        assertEquals(3000L, BridgeRetry.retryAfterMs(429, 0, "3"))
        assertEquals(1000L, BridgeRetry.retryAfterMs(429, 0, " 1 "))
        assertEquals(0L, BridgeRetry.retryAfterMs(429, 0, "0"))
    }

    @Test fun defaultAndCap() {
        assertEquals(2000L, BridgeRetry.retryAfterMs(429, 0, null))
        assertEquals(2000L, BridgeRetry.retryAfterMs(429, 0, ""))
        assertEquals(2000L, BridgeRetry.retryAfterMs(429, 0, "Wed, 21 Oct 2026 07:28:00 GMT")) // HTTP date
        assertEquals(2000L, BridgeRetry.retryAfterMs(429, 0, "-4"))
        assertEquals(5000L, BridgeRetry.retryAfterMs(429, 0, "10"))
        assertEquals(5000L, BridgeRetry.retryAfterMs(429, 0, "99999999999"))
    }

    @Test fun onlyOneRetryAndOnlyFor429() {
        assertNull(BridgeRetry.retryAfterMs(429, 1, "1"))
        assertNull(BridgeRetry.retryAfterMs(503, 0, "1"))
        assertNull(BridgeRetry.retryAfterMs(200, 0, null))
        assertTrue(BridgeException("x", status = 429).busy)
        assertFalse(BridgeException("x", status = 500).busy)
        assertFalse(BridgeException("x", offline = true).busy)
    }
}
