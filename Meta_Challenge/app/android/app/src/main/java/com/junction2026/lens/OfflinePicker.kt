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
    /** The offline data as the [Detection] the explainer uses. Library data, so full confidence and no media. */
    fun toDetection(d: OfflineDetect): Detection = Detection(
        objectId = d.id,
        label = d.label,
        confidence = 1.0,
        answer = null,
        summary = d.summary.ifBlank { null },
        steps = d.steps,
        lenses = d.lenses.map {
            Lens(id = it.id, kind = it.kind, title = it.title.ifBlank { DetectionParser.kindName(it.kind) }, lead = it.lead, steps = it.steps)
        },
        media = null,
    )
}
