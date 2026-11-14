package com.junction2026.lens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Scene stills for the glasses display, cached in memory only (never written to disk).
 * Keys are bridge paths like `/media/ball/s1.png`. [load] returns the file bytes or null.
 * Call from the main thread (the controller's scope); loading and decoding run on IO.
 */
class SceneMedia(
    private val scope: CoroutineScope,
    private val load: suspend (path: String) -> ByteArray?,
) {
    private val cache = HashMap<String, Bitmap>()
    private val failed = HashSet<String>()
    private val inflight = HashMap<String, Deferred<Bitmap?>>()

    fun cached(path: String): Bitmap? = cache[path]
    fun hasFailed(path: String): Boolean = path in failed

    /** The still for [path], downloading it once. Null when it cannot be loaded. */
    suspend fun get(path: String): Bitmap? {
        cache[path]?.let { return it }
        if (path in failed) return null
        val d = inflight.getOrPut(path) {
            scope.async {
                val bmp = try {
                    withContext(Dispatchers.IO) {
                        load(path)?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
                    }
                } catch (e: CancellationException) {
                    throw e // cleared: leave the new cache alone
                } catch (_: Exception) {
                    null
                }
                inflight.remove(path)
                if (bmp != null) cache[path] = bmp else failed += path
                bmp
            }
        }
        return d.await()
    }

    fun prefetch(paths: List<String>) {
        paths.forEach { p -> if (p !in cache && p !in failed) scope.launch { runCatching { get(p) } } }
    }

    /** Drop everything (new detection, disconnect). */
    fun clear() {
        inflight.values.forEach { it.cancel() }
        inflight.clear()
        cache.clear()
        failed.clear()
    }
}
