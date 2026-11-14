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
    /** True for a path whose frame keeps only its headline number ([StillFrame.crop] `headlineOnly`). */
    private val headlineOnly: (path: String) -> Boolean = { false },
) {
    private val cache = HashMap<String, Bitmap>()
    /** Paths whose cached piece was cut from a whole exported frame ([StillFrame]). */
    private val frames = HashSet<String>()
    private val failed = HashSet<String>()
    private val inflight = HashMap<String, Deferred<Bitmap?>>()
    /** Explore stills: the drawn box cut from the whole frame, and the frame's width (anchors are in it). */
    private val whole = HashMap<String, Pair<CropBox, Int>>()
    private val texts = HashMap<String, String?>()

    fun cached(path: String): Bitmap? = cache[path]
    fun hasFailed(path: String): Boolean = path in failed

    /** The still for [path], downloading it once. Null when it cannot be loaded. */
    suspend fun get(path: String): Bitmap? {
        cache[path]?.let { return it }
        if (path in failed) return null
        val d = inflight.getOrPut(path) {
            scope.async {
                var frame = false
                var box: Pair<CropBox, Int>? = null
                val bmp = try {
                    withContext(Dispatchers.IO) {
                        load(path)?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }?.let { src ->
                            if (StillFrame.isWhole(path)) {
                                // Explore: the whole frame, only the black around the drawing goes.
                                val px = IntArray(src.width * src.height)
                                src.getPixels(px, 0, src.width, 0, 0, src.width, src.height)
                                val c = StillFrame.drawnBox(px, src.width, src.height)
                                box = c to src.width
                                Bitmap.createBitmap(src, c.left, c.top, c.width, c.height)
                            } else {
                                frame = StillFrame.isFrame(src.width, src.height)
                                if (frame) stage(src, headlineOnly(path)) else src
                            }
                        }
                    }
                } catch (e: CancellationException) {
                    throw e // cleared: leave the new cache alone
                } catch (_: Exception) {
                    null
                }
                inflight.remove(path)
                if (bmp != null) { cache[path] = bmp; if (frame) frames += path; box?.let { whole[path] = it } } else failed += path
                bmp
            }
        }
        return d.await()
    }

    fun prefetch(paths: List<String>) {
        paths.forEach { p -> if (p !in cache && p !in failed) scope.launch { runCatching { get(p) } } }
    }

    /** A real exported frame (600x600 with its own title and English caption) cut to its drawing. */
    private fun stage(src: Bitmap, headline: Boolean): Bitmap {
        val px = IntArray(src.width * src.height)
        src.getPixels(px, 0, src.width, 0, 0, src.width, src.height)
        val c = StillFrame.crop(px, src.width, src.height, headline)
        return Bitmap.createBitmap(src, c.left, c.top, c.width, c.height)
    }

    /**
     * The still of [path] in a black band [heightPx] high (black is see-through). The display scales an image
     * to the card's width, so the band's shape sets its height on the card ([StillFrame.heightFor]).
     * Drawing-only stills (demo fixtures) never get less than the old 3:1 band.
     */
    fun forCard(path: String, heightPx: Int): Bitmap? {
        val piece = cache[path] ?: return null
        val aspect = StillFrame.aspectFor(heightPx).let { if (path in frames) it else maxOf(it, StillBand.ASPECT) }
        return pad(piece, aspect)
    }

    private fun pad(piece: Bitmap, aspect: Double): Bitmap {
        val (bw, bh) = StillFrame.bandFor(piece.width, piece.height, aspect)
        // Never narrower than the card: a small piece (a number lens headline) is not blown up to fill it.
        val (w, h) = if (bw >= CARD_PX) bw to bh else CARD_PX to Math.ceil(bh * CARD_PX.toDouble() / bw).toInt()
        if (w == piece.width && h == piece.height) return piece
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        android.graphics.Canvas(out).apply {
            drawColor(android.graphics.Color.BLACK)
            drawBitmap(piece, ((w - piece.width) / 2).toFloat(), ((h - piece.height) / 2).toFloat(), null)
        }
        return out
    }

    /**
     * An Explore beat on the card: the whole still (black trimmed), with [beat]'s labels and number drawn
     * over it, on a [CARD_PX]x[heightPx] band (shown 1:1, so text sizes are display px). Null until loaded.
     */
    fun exploreForCard(path: String, heightPx: Int, beat: ExploreBeat?): Bitmap? {
        val piece = cache[path] ?: return null
        val (box, size) = whole[path] ?: return null
        return ExploreFrame.render(piece, box, size, CARD_PX, heightPx, beat)
    }

    /** A small text file (an Explore `tracks.json`) through the same loader, once; null when it cannot be read. */
    suspend fun text(path: String): String? {
        if (texts.containsKey(path)) return texts[path]
        val t = try {
            withContext(Dispatchers.IO) { load(path)?.toString(Charsets.UTF_8) }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        texts[path] = t
        return t
    }

    private companion object { const val CARD_PX = 552 }

    /** Drop everything (new detection, disconnect). */
    fun clear() {
        inflight.values.forEach { it.cancel() }
        inflight.clear()
        cache.clear()
        frames.clear()
        failed.clear()
        whole.clear()
        texts.clear()
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
