package com.junction2026.lens

import android.util.Base64
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** A failure with text that is safe to show on the glasses. */
class BridgeException(
    val userMessage: String,
    cause: Throwable? = null,
    /** True when the bridge answered 401: the token is wrong or missing. */
    val unauthorized: Boolean = false,
    /**
     * True when the bridge could not be reached at all (no connection, or a proxy's 502-504 with no
     * bridge body). Not set for 401, bridge errors with a body, or a bridge that is reachable but slow.
     */
    val offline: Boolean = false,
    /** HTTP status when the bridge answered (0 when it did not). */
    val status: Int = 0,
    /** The bridge's `error` field (`detect_timeout`, `bad_request`, ...), or empty. */
    val code: String = "",
) : Exception(userMessage, cause) {
    /** HTTP 429 again after the one retry ([BridgeRetry]). */
    val busy: Boolean get() = BridgeRetry.isBusy(status)
}

/**
 * HTTP calls to the bridge. [config] is read fresh at the start of every request, so a URL or token typed
 * on the phone after Connect applies to the very next request (no Disconnect + Connect needed).
 */
class BridgeClient(config: BridgeConfig, private val log: (String) -> Unit = {}) {
    @Volatile var config: BridgeConfig = config
    @Volatile private var lastUsed: String? = null

    /** The current address and token, once per request; logs when the address changed since the last one. */
    private fun snapshot(): BridgeConfig {
        val c = config
        if (lastUsed != null && lastUsed != c.baseUrl) log("Bridge: now using ${c.origin}")
        lastUsed = c.baseUrl
        return c
    }

    private fun url(c: BridgeConfig, path: String) = URL(c.baseUrl + path)

    /**
     * `GET /objects?lang=<tag>` as text (the library in that language), or null on any failure. The caller
     * decides what to use ([LibraryChoice]).
     */
    suspend fun objectsText(lang: String): String? = withContext(Dispatchers.IO) {
        var c: HttpURLConnection? = null
        try {
            c = url(snapshot(), BridgeRequests.objectsPath(lang)).openConnection() as HttpURLConnection
            c.connectTimeout = 4000
            c.readTimeout = 4000
            if (c.responseCode !in 200..299) return@withContext null
            c.inputStream.bufferedReader().readText()
        } catch (_: Exception) {
            null
        } finally {
            c?.disconnect()
        }
    }

    /** `GET /health` (open on the bridge): the HTTP status, or -1 when the bridge cannot be reached. */
    suspend fun health(): Int = withContext(Dispatchers.IO) {
        var c: HttpURLConnection? = null
        try {
            c = url(config, "/health").openConnection() as HttpURLConnection
            c.connectTimeout = 3000
            c.readTimeout = 3000
            val code = c.responseCode
            runCatching { (if (code in 200..299) c.inputStream else c.errorStream)?.close() }
            code
        } catch (_: Exception) {
            -1
        } finally {
            c?.disconnect()
        }
    }

    /**
     * Camera-only mode: has the Web App asked for a photo since [after]? Returns the new request id, or null.
     * Short timeouts: this runs every second.
     */
    suspend fun pollCapture(after: Int): Pair<Boolean, Int>? = withContext(Dispatchers.IO) {
        val cfg = config
        var c: HttpURLConnection? = null
        try {
            c = url(cfg, "/capture?after=$after").openConnection() as HttpURLConnection
            c.connectTimeout = 3000
            c.readTimeout = 3000
            BridgeAuth.headers(cfg.token).forEach { (k, v) -> c.setRequestProperty(k, v) }
            if (c.responseCode != 200) return@withContext null
            val o = org.json.JSONObject(c.inputStream.bufferedReader().use { it.readText() })
            o.optBoolean("capture") to o.optInt("id")
        } catch (_: Exception) {
            null
        } finally {
            c?.disconnect()
        }
    }

    /** [focus] is the centre of [jpeg], zoomed: where the wearer is looking. The bridge classifies that. */
    suspend fun detect(jpeg: ByteArray, focus: ByteArray?, tCapture: Long, lang: String, forceObjectId: String? = null, question: String? = null): Detection = withContext(Dispatchers.IO) {
        val reqId = UUID.randomUUID().toString()
        val body = BridgeRequests.detectBody(
            reqId = reqId,
            imageBase64 = Base64.encodeToString(jpeg, Base64.NO_WRAP),
            focusBase64 = focus?.let { Base64.encodeToString(it, Base64.NO_WRAP) },
            tCapture = tCapture,
            now = System.currentTimeMillis(),
            lang = lang,
            waitSketch = true,
            forceObjectId = forceObjectId,
            question = question,
        )
        // API providers answer in a few seconds (the dev-only pi provider needs up to 25 s). With waitSketch an
        // unknown object also waits for the sketch (SKETCH_TIMEOUT_MS, default 20 s) in the same response.
        post("/detect", body, readTimeoutMs = 60_000).let { if (it.reqId == null) it.copy(reqId = reqId) else it }
    }

    /** PROTOCOL `POST /ask`: a follow-up question about [aboutObjectId]. The answer is a normal `show`. */
    suspend fun ask(question: String, aboutObjectId: String, lang: String): Detection = withContext(Dispatchers.IO) {
        val reqId = UUID.randomUUID().toString()
        val body = BridgeRequests.askBody(reqId, question, aboutObjectId, lang)
            ?: throw BridgeException("Empty question", code = "bad_request")
        post("/ask", body, readTimeoutMs = 50_000).let { if (it.reqId == null) it.copy(reqId = reqId) else it }
    }

    /**
     * PROTOCOL "Phone-only latency": `POST /rendered {reqId, renderMs}` once the result card is on the display.
     * Fire-and-forget for the caller: returns the HTTP status, or -1 when it could not be sent. Never throws.
     */
    suspend fun rendered(reqId: String?, renderMs: Long): Int = withContext(Dispatchers.IO) {
        val body = RenderedAck.body(reqId, renderMs) ?: return@withContext -1
        var c: HttpURLConnection? = null
        try {
            val cfg = snapshot()
            c = url(cfg, "/rendered").openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = 3000
            c.readTimeout = 3000
            c.setRequestProperty("Content-Type", "application/json")
            BridgeAuth.headers(cfg.token).forEach { (k, v) -> c.setRequestProperty(k, v) }
            c.outputStream.use { it.write(body.toByteArray()) }
            val code = c.responseCode
            runCatching { (if (code in 200..299) c.inputStream else c.errorStream)?.close() }
            code
        } catch (_: Exception) {
            -1
        } finally {
            c?.disconnect()
        }
    }

    /**
     * POSTs JSON and parses the 2xx body as a `show`. Every failure becomes a [BridgeException]. A 429 waits for
     * `Retry-After` and tries once more ([BridgeRetry]); a second 429 is a busy [BridgeException].
     */
    private suspend fun post(path: String, body: String, readTimeoutMs: Int): Detection {
        var attempt = 0
        while (true) {
            when (val r = postOnce(path, body, readTimeoutMs)) {
                is PostResult.Ok -> return r.det
                is PostResult.TooMany -> {
                    val wait = BridgeRetry.retryAfterMs(429, attempt, r.retryAfter)
                        ?: throw BridgeException("Bridge busy (HTTP 429)", status = 429, code = r.code)
                    log("Bridge busy (429): trying again in ${wait / 1000} s")
                    delay(wait)
                    attempt++
                }
            }
        }
    }

    private sealed class PostResult {
        class Ok(val det: Detection) : PostResult()
        class TooMany(val retryAfter: String?, val code: String) : PostResult()
    }

    private suspend fun postOnce(path: String, body: String, readTimeoutMs: Int): PostResult {
        val cfg = snapshot()
        val c = try {
            url(cfg, path).openConnection() as HttpURLConnection
        } catch (e: java.io.IOException) {
            throw BridgeException("Can't reach the bridge (network)", e)
        }
        return disconnectOnCancel(c) {
            try {
                c.requestMethod = "POST"
                c.doOutput = true
                c.connectTimeout = 5000
                c.readTimeout = readTimeoutMs
                c.setRequestProperty("Content-Type", "application/json")
                BridgeAuth.headers(cfg.token).forEach { (k, v) -> c.setRequestProperty(k, v) }
                // Connect on its own so "cannot reach" (offline card) is told apart from "reached but slow".
                try {
                    c.connect()
                } catch (e: java.io.IOException) {
                    throw BridgeException("Can't reach the bridge", e, offline = true)
                }
                c.outputStream.use { it.write(body.toByteArray()) }
                val code = c.responseCode
                val text = (if (code in 200..299) c.inputStream else c.errorStream)
                    ?.bufferedReader()?.readText().orEmpty()
                if (code !in 200..299) {
                    val err = runCatching { JSONObject(text) }.getOrNull()
                    val kind = err?.optString("error").orEmpty()
                    if (code == 429) return@disconnectOnCancel PostResult.TooMany(c.getHeaderField("Retry-After"), kind)
                    throw when (BridgeAuth.kindFor(code, kind)) {
                        BridgeAuth.ErrorKind.TOKEN -> BridgeException(BridgeAuth.TOKEN_ERROR, unauthorized = true, status = code, code = kind)
                        BridgeAuth.ErrorKind.TIMEOUT -> BridgeException("Detection timed out", status = code, code = kind)
                        BridgeAuth.ErrorKind.BRIDGE -> BridgeException("Bridge error (${kind.ifEmpty { "HTTP $code" }})", status = code, code = kind)
                        BridgeAuth.ErrorKind.UNREACHABLE -> BridgeException("Can't reach the bridge (HTTP $code)", offline = true, status = code)
                    }
                }
                PostResult.Ok(DetectionParser.parse(text)) // v1 and later fields optional; see Detection.kt
            } catch (e: BridgeException) {
                throw e
            } catch (e: java.net.SocketTimeoutException) {
                throw BridgeException("Bridge timed out", e)
            } catch (e: java.io.IOException) {
                throw BridgeException("Can't reach the bridge (network)", e)
            } catch (e: JsonParseException) {
                throw BridgeException("Bad answer from the bridge", e)
            } catch (e: org.json.JSONException) {
                throw BridgeException("Bad answer from the bridge", e)
            }
        }
    }

    /**
     * Runs the blocking [block] on IO; if the caller is cancelled meanwhile, disconnects [c] so a blocked
     * connect or read ends at once (a socket read does not react to thread interrupts). Always disconnects.
     */
    private suspend fun <T> disconnectOnCancel(c: HttpURLConnection, block: () -> T): T = coroutineScope {
        val watcher = launch(start = CoroutineStart.UNDISPATCHED) {
            try { awaitCancellation() } finally { c.disconnect() }
        }
        try {
            withContext(Dispatchers.IO) { block() }
        } catch (e: Exception) {
            ensureActive() // cancelled: the read failed because we disconnected; report the cancellation
            throw e
        } finally {
            watcher.cancel()
        }
    }

    /**
     * GET a media file (`/media/...`, open on the bridge) into memory. The token header is sent anyway
     * (harmless). Null on any failure or when the file is bigger than [maxBytes].
     */
    suspend fun fetchBytes(path: String, maxBytes: Int = 2_000_000): ByteArray? {
        val cfg = config // media: no "now using" line
        val c = runCatching { url(cfg, path).openConnection() as HttpURLConnection }.getOrNull() ?: return null
        return disconnectOnCancel(c) { fetchInto(c, cfg, maxBytes) }
    }

    private fun fetchInto(c: HttpURLConnection, cfg: BridgeConfig, maxBytes: Int): ByteArray? {
        try {
            c.connectTimeout = 4000
            c.readTimeout = 6000
            BridgeAuth.headers(cfg.token).forEach { (k, v) -> c.setRequestProperty(k, v) }
            if (c.responseCode !in 200..299) return null
            c.inputStream.use { input ->
                val out = java.io.ByteArrayOutputStream()
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > maxBytes) return null
                }
                return out.toByteArray()
            }
        } catch (_: Exception) {
            return null
        }
    }
}
