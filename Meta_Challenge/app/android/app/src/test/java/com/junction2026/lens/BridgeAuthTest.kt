package com.junction2026.lens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BridgeAuthTest {
    @Test fun blankTokenGivesNoHeader() {
        assertTrue(BridgeAuth.headers("").isEmpty())
        assertTrue(BridgeAuth.headers("   ").isEmpty())
        assertTrue(BridgeAuth.headers(null).isEmpty())
    }

    @Test fun tokenGivesHeader() {
        assertEquals(mapOf("X-Lens-Token" to "abc123"), BridgeAuth.headers("abc123"))
    }

    @Test fun tokenIsTrimmed() {
        assertEquals(mapOf("X-Lens-Token" to "abc123"), BridgeAuth.headers("  abc123\n"))
    }

    @Test fun status401IsTokenError() {
        assertEquals(BridgeAuth.ErrorKind.TOKEN, BridgeAuth.kindFor(401))
        assertEquals("Bridge token is wrong or missing. Set it in the phone app.", BridgeAuth.TOKEN_ERROR)
    }

    @Test fun status500IsGenericBridgeError() {
        assertEquals(BridgeAuth.ErrorKind.BRIDGE, BridgeAuth.kindFor(500))
        assertEquals(BridgeAuth.ErrorKind.TIMEOUT, BridgeAuth.kindFor(504, "detect_timeout"))
    }
}
