package com.junction2026.lens

/**
 * Offline card: the bridge is unreachable, so the camera cannot identify anything. The wearer picks
 * one of the bundled library objects with D-pad left/right (wraps) and opens it with a pinch.
 */
data class OfflinePicker(val ids: List<String>, val index: Int = 0) {
    init {
        require(ids.isNotEmpty()) { "nothing to pick" }
        require(index in ids.indices) { "index out of range" }
    }

    val current: String get() = ids[index]

    /** "2/6": text, never colour alone. */
    val counter: String get() = "${index + 1}/${ids.size}"

    fun move(delta: Int): OfflinePicker = copy(index = Math.floorMod(index + delta, ids.size))
}

object OfflineConvert {
    /** The offline data as the [Detection] the explainer uses. Library data, so full confidence. */
    fun toDetection(d: OfflineDetect, media: Media? = null): Detection = Detection(
        objectId = d.id,
        label = d.label,
        confidence = 1.0,
        answer = null,
        summary = d.summary.ifBlank { null },
        steps = d.steps,
        lenses = d.lenses.map {
            Lens(id = it.id, kind = it.kind, title = it.title.ifBlank { DetectionParser.kindName(it.kind) }, lead = it.lead, steps = it.steps)
        },
        media = media,
    )

    /**
     * Stills bundled in the APK (`assets/media/<id>/`, copied from `bridge/media/` at build time): the
     * object's `manifest.json` as a `media` block with base `/media/<id>`. Null when it has no stills.
     */
    fun media(objectId: String, manifestText: String?): Media? {
        if (manifestText.isNullOrBlank()) return null
        val lenses = runCatching { org.json.JSONObject(manifestText).optJSONObject("lenses") }.getOrNull() ?: return null
        val out = LinkedHashMap<String, LensMedia>()
        for (key in lenses.keys()) {
            val arr = lenses.optJSONObject(key)?.optJSONArray("stills") ?: continue
            val stills = (0 until arr.length()).mapNotNull { arr.optString(it).trim().ifEmpty { null } }
            if (stills.isNotEmpty()) out[key] = LensMedia(stills, null)
        }
        return if (out.isEmpty()) null else Media("/media/$objectId", out)
    }
}
