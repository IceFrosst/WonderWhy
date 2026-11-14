package com.junction2026.lens

import org.json.JSONArray
import org.json.JSONObject

/*
 * "Seen today": every successful result card, newest first. Pure Kotlin plus org.json, for JVM tests.
 * Kept in app prefs as JSON without pictures: [JournalEntry.still] is the asset path of the first bundled
 * still, read again when the list is drawn (null when there is none, e.g. a sketch).
 */

/** Where a result came from (DESIGN.md "Where an answer comes from", plus demo data and saved cards). */
enum class JournalFlag { LIBRARY, SKETCH, SAVED, DEMO }

data class JournalQa(val q: String, val a: String)

data class JournalEntry(
    /** Creation time; stays the same when a duplicate is merged in. */
    val id: Long,
    /** Last time the object was seen (epoch ms). */
    val timeMs: Long,
    val objectId: String,
    val label: String,
    /** Title of the first lens ("Projectile motion"); empty when there is none. */
    val lens: String,
    /** The one-line summary or answer. */
    val line: String,
    val flag: JournalFlag,
    /** Asset path of the first still ("media/ball/motion/s1.png"), or null. */
    val still: String? = null,
    /** Follow-up questions about this object, oldest first. */
    val qa: List<JournalQa> = emptyList(),
) {
    /** Same object: library id, or for a sketch (always `unknown`) its label too. */
    val key: String get() = if (flag == JournalFlag.SKETCH || objectId == "unknown") "unknown:${label.lowercase()}" else objectId
}

class Journal(entries: List<JournalEntry> = emptyList()) {
    /** Newest first, at most [MAX]. */
    val entries: List<JournalEntry> = entries.sortedByDescending { it.timeMs }.take(MAX)

    /**
     * Adds [e] at the top. The same object seen again within [MERGE_MS] of its last time is merged: the new
     * text and time, the old id and questions.
     */
    fun add(e: JournalEntry): Journal {
        val dup = entries.firstOrNull { it.key == e.key && e.timeMs - it.timeMs in 0..MERGE_MS }
        val merged = if (dup == null) e else e.copy(id = dup.id, qa = (dup.qa + e.qa).takeLast(MAX_QA))
        return Journal(listOf(merged) + entries.filter { it !== dup })
    }

    /** A follow-up question goes under the newest entry of its object; nothing happens when there is none. */
    fun addQuestion(objectId: String, q: String, a: String): Journal {
        val target = entries.firstOrNull { it.objectId == objectId && it.flag != JournalFlag.SKETCH } ?: return this
        val qa = JournalQa(AskFlow.cap(q, AskFlow.QUESTION_WORDS), AskFlow.cap(a, AskFlow.ANSWER_WORDS))
        if (qa.q.isBlank()) return this
        return Journal(entries.map { if (it === target) it.copy(qa = (it.qa + qa).takeLast(MAX_QA)) else it })
    }

    fun toJson(): String {
        val arr = JSONArray()
        for (e in entries) {
            val o = JSONObject()
                .put("id", e.id).put("t", e.timeMs).put("obj", e.objectId).put("label", e.label)
                .put("lens", e.lens).put("line", e.line).put("flag", e.flag.name)
            if (e.still != null) o.put("still", e.still)
            if (e.qa.isNotEmpty()) o.put("qa", JSONArray().apply { e.qa.forEach { put(JSONObject().put("q", it.q).put("a", it.a)) } })
            arr.put(o)
        }
        return JSONObject().put("v", 1).put("entries", arr).toString()
    }

    companion object {
        const val MAX = 30
        const val MERGE_MS = 60_000L
        const val MAX_QA = 5

        /** Broken text gives an empty journal; a broken entry is skipped. */
        fun fromJson(text: String?): Journal {
            if (text.isNullOrBlank()) return Journal()
            val arr = runCatching { JSONObject(text).optJSONArray("entries") }.getOrNull() ?: return Journal()
            val out = ArrayList<JournalEntry>()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val obj = o.optString("obj").trim()
                val label = o.optString("label").trim()
                val flag = runCatching { JournalFlag.valueOf(o.optString("flag")) }.getOrNull()
                if (obj.isEmpty() || label.isEmpty() || flag == null || !o.has("t")) continue
                val qaArr = o.optJSONArray("qa")
                val qa = (0 until (qaArr?.length() ?: 0)).mapNotNull { j ->
                    val q = qaArr!!.optJSONObject(j) ?: return@mapNotNull null
                    JournalQa(q.optString("q"), q.optString("a")).takeIf { it.q.isNotBlank() }
                }
                out += JournalEntry(
                    id = o.optLong("id", o.optLong("t")), timeMs = o.optLong("t"), objectId = obj, label = label,
                    lens = o.optString("lens"), line = o.optString("line"), flag = flag,
                    still = o.optString("still").takeIf { it.isNotBlank() && safeAsset(it) }, qa = qa.takeLast(MAX_QA),
                )
            }
            return Journal(out)
        }

        /** Asset paths only, never a URL or a path out of the APK's assets. */
        fun safeAsset(path: String): Boolean =
            !path.contains("..") && !path.startsWith("/") && !path.contains("://") && (path.startsWith("media/") || path.startsWith("fixture/"))

        /**
         * The entry for a result card shown on the glasses, or null for anything that is not a result
         * (Not sure, unknown without a sketch). [flag]: where it came from.
         */
        fun entryFor(det: Detection, flag: JournalFlag, nowMs: Long): JournalEntry? {
            val v = DetectionParser.verdict(det)
            val sk = det.sketch?.takeIf { v is Verdict.Sketched }
            val tracks = when (v) {
                is Verdict.Explainer -> v.tracks
                is Verdict.Sketched -> v.tracks
                is Verdict.Plain -> emptyList()
                else -> return null
            }
            val label = (sk?.label ?: det.label).trim().ifEmpty { return null }
            val line = (if (sk != null) sk.answer else det.summary ?: det.answer).orEmpty().trim()
            return JournalEntry(
                id = nowMs, timeMs = nowMs, objectId = det.objectId, label = label,
                lens = tracks.firstOrNull()?.title.orEmpty(), line = AskFlow.cap(line, AskFlow.QUESTION_WORDS),
                flag = if (sk != null) JournalFlag.SKETCH else flag,
                still = if (sk != null) null else stillAsset(det, tracks.firstOrNull(), flag),
            )
        }

        /**
         * Asset path of the first still of [track]: demo data keeps its stills under `fixture/`, library
         * objects under `media/<id>/` (the bundled copy of the bridge's `/media/`).
         */
        fun stillAsset(det: Detection, track: Track?, flag: JournalFlag): String? {
            val base = det.media?.base ?: return null
            val file = DetectionParser.stills(det, track?.lensId).firstOrNull() ?: return null
            val path = DetectionParser.stillPath(base, file)?.removePrefix("/") ?: return null
            val asset = if (flag == JournalFlag.DEMO) "fixture/$path" else path
            return asset.takeIf { safeAsset(it) }
        }
    }
}
