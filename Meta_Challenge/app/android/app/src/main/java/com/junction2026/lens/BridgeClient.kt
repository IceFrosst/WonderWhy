package com.junction2026.lens

import android.util.Base64
import kotlinx.coroutines.Dispatchers
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
) : Exception(userMessage, cause)

class BridgeClient(var baseUrl: String, var token: String = "") {
    private fun url(path: String) = URL(baseUrl.trim().trimEnd('/') + path)

    /** objectId -> one-line concept. Empty map on any failure (concept line is optional). */
    suspend fun objects(): Map<String, String> = withContext(Dispatchers.IO) {
        try {
            val c = url("/objects").openConnection() as HttpURLConnection
            c.connectTimeout = 4000
            c.readTimeout = 4000
            try {
                val arr = JSONObject(c.inputStream.bufferedReader().readText()).getJSONArray("objects")
                buildMap {
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        put(o.getString("id"), o.optString("concept", ""))
                    }
                }
            } finally {
                c.disconnect()
            }
        } catch (_: Exception) {
            emptyMap()
        }
    }

    /** [focus] is the centre of [jpeg], zoomed: where the wearer is looking. The bridge classifies that. */
    suspend fun detect(jpeg: ByteArray, focus: ByteArray?, tCapture: Long): Detection = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("reqId", UUID.randomUUID().toString())
            .put("imageBase64", Base64.encodeToString(jpeg, Base64.NO_WRAP))
            .put("focusBase64", focus?.let { Base64.encodeToString(it, Base64.NO_WRAP) } ?: JSONObject.NULL)
            .put("question", JSONObject.NULL)
            .put("t_capture", tCapture)
            .put("preUploadMs", System.currentTimeMillis() - tCapture)
            .toString()
        var c: HttpURLConnection? = null
        try {
            c = url("/detect").openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = 5000
            c.readTimeout = 28000 // API providers answer in a few seconds; the dev-only pi provider needs up to 25 s
            c.setRequestProperty("Content-Type", "application/json")
            BridgeAuth.headers(token).forEach { (k, v) -> c.setRequestProperty(k, v) }
            c.outputStream.use { it.write(body.toByteArray()) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)
                ?.bufferedReader()?.readText().orEmpty()
            if (code !in 200..299) {
                val err = runCatching { JSONObject(text) }.getOrNull()
                val kind = err?.optString("error").orEmpty()
                throw when (BridgeAuth.kindFor(code, kind)) {
                    BridgeAuth.ErrorKind.TOKEN -> BridgeException(BridgeAuth.TOKEN_ERROR, unauthorized = true)
                    BridgeAuth.ErrorKind.TIMEOUT -> BridgeException("Detection timed out")
                    BridgeAuth.ErrorKind.BRIDGE -> BridgeException("Bridge error (${kind.ifEmpty { "HTTP $code" }})")
                }
            }
            DetectionParser.parse(text) // v1 fields optional; see Detection.kt
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
        } finally {
            c?.disconnect()
        }
    }

    /**
     * GET a media file (`/media/...`, open on the bridge) into memory. The token header is sent anyway
     * (harmless). Null on any failure or when the file is bigger than [maxBytes].
     */
    suspend fun fetchBytes(path: String, maxBytes: Int = 2_000_000): ByteArray? = withContext(Dispatchers.IO) {
        var c: HttpURLConnection? = null
        try {
            c = url(path).openConnection() as HttpURLConnection
            c.connectTimeout = 4000
            c.readTimeout = 6000
            BridgeAuth.headers(token).forEach { (k, v) -> c.setRequestProperty(k, v) }
            if (c.responseCode !in 200..299) return@withContext null
            c.inputStream.use { input ->
                val out = java.io.ByteArrayOutputStream()
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > maxBytes) return@withContext null
                }
                out.toByteArray()
            }
        } catch (_: Exception) {
            null
        } finally {
            c?.disconnect()
        }
    }
}
