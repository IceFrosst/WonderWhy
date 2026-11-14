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
        assertEquals("Wrong bridge token. Set it in the app.", BridgeAuth.TOKEN_ERROR)
    }

    @Test fun status500IsGenericBridgeError() {
        assertEquals(BridgeAuth.ErrorKind.BRIDGE, BridgeAuth.kindFor(500))
        assertEquals(BridgeAuth.ErrorKind.TIMEOUT, BridgeAuth.kindFor(504, "detect_timeout"))
        assertEquals(BridgeAuth.ErrorKind.BRIDGE, BridgeAuth.kindFor(502, "detect_failed"))
    }

    /** A proxy's 502/503/504 without a bridge body means the bridge is down: offline card, not an error. */
    @Test fun proxyGatewayErrorIsUnreachable() {
        assertEquals(BridgeAuth.ErrorKind.UNREACHABLE, BridgeAuth.kindFor(502))
        assertEquals(BridgeAuth.ErrorKind.UNREACHABLE, BridgeAuth.kindFor(503))
        assertEquals(BridgeAuth.ErrorKind.BRIDGE, BridgeAuth.kindFor(500))
    }

    @Test fun tokenMessageFitsStateCardCap() {
        assertTrue(BridgeAuth.TOKEN_ERROR.split(" ").size <= 8)
        assertEquals(Lang.ui("en", Lang.TOKEN), BridgeAuth.TOKEN_ERROR)
    }
}
