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
                        load(path)?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }?.let { band(it) }
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

    /**
     * Puts a (usually square) still in the middle of a wide black band. The display scales an image to the
     * card's width, so a square still would push the title off the 600x600 screen. Black is see-through.
     */
    private fun band(src: Bitmap): Bitmap {
        val (w, h) = StillBand.size(src.width, src.height)
        if (w == src.width && h == src.height) return src
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        android.graphics.Canvas(out).apply {
            drawColor(android.graphics.Color.BLACK)
            drawBitmap(src, ((w - src.width) / 2).toFloat(), ((h - src.height) / 2).toFloat(), null)
        }
        return out
    }

    /** Drop everything (new detection, disconnect). */
    fun clear() {
        inflight.values.forEach { it.cancel() }
        inflight.clear()
        cache.clear()
        failed.clear()
    }
}

/** Geometry of the band a still is shown in. Pure, for JVM tests. */
object StillBand {
    /** Width / height of the band (about 552x184 on the 600x600 card). */
    const val ASPECT = 3.0

    /** Band size for a [w]x[h] still: same height, wide enough for [ASPECT]; a wider still is kept as is. */
    fun size(w: Int, h: Int): Pair<Int, Int> {
        if (w <= 0 || h <= 0) return w to h
        val bw = Math.ceil(h * ASPECT).toInt()
        return if (w >= bw) w to h else bw to h
    }
}
