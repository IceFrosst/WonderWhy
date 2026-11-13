package com.junction2026.lens

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

data class Detection(
    val objectId: String,
    val label: String,
    val confidence: Double,
    val answer: String?,
)

/** A failure with text that is safe to show on the glasses. */
class BridgeException(val userMessage: String, cause: Throwable? = null) : Exception(userMessage, cause)

class BridgeClient(var baseUrl: String) {
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

    suspend fun detect(jpeg: ByteArray, tCapture: Long): Detection = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("reqId", UUID.randomUUID().toString())
            .put("imageBase64", Base64.encodeToString(jpeg, Base64.NO_WRAP))
            .put("question", JSONObject.NULL)
            .put("t_capture", tCapture)
            .toString()
        var c: HttpURLConnection? = null
        try {
            c = url("/detect").openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = 5000
            c.readTimeout = 12000 // bridge detection can take up to 8 s
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toByteArray()) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)
                ?.bufferedReader()?.readText().orEmpty()
            if (code !in 200..299) {
                val err = runCatching { JSONObject(text) }.getOrNull()
                val kind = err?.optString("error").orEmpty()
                throw BridgeException(
                    if (kind == "detect_timeout") "Detection timed out"
                    else "Bridge error (${kind.ifEmpty { "HTTP $code" }})",
                )
            }
            val j = JSONObject(text)
            Detection(
                objectId = j.optString("objectId", "unknown"),
                label = j.optString("label", ""),
                confidence = j.optDouble("confidence", 0.0),
                answer = j.optString("answer", "").ifBlank { null },
            )
        } catch (e: BridgeException) {
            throw e
        } catch (e: java.net.SocketTimeoutException) {
            throw BridgeException("Bridge timed out", e)
        } catch (e: java.io.IOException) {
            throw BridgeException("Can't reach the bridge (network)", e)
        } catch (e: org.json.JSONException) {
            throw BridgeException("Bad answer from the bridge", e)
        } finally {
            c?.disconnect()
        }
    }
}
