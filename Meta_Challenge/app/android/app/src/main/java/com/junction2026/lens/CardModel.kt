package com.junction2026.lens

import android.graphics.Bitmap

/*
 * What a glasses card says, as plain data. [Cards] builds these and renders them with the toolkit's
 * flexBox; keeping the words out of the SDK types lets JVM tests count words and estimate the height,
 * and lets the phone mirror the card as text ([CardSpec.summary]) for the smoke script.
 */

/** Toolkit text style and colour, by role (DESIGN.md "Type"). */
enum class TextRole { HEADING, BODY, BODY_MUTED, META, META_MUTED }

sealed class CardItem {
    data class Text(val text: String, val role: TextRole) : CardItem()
    /** A step still, already cut to its band ([StillFrame]). */
    class Picture(val bitmap: Bitmap) : CardItem()
    /** The dock: at most 2 actions (DESIGN.md card anatomy). */
    data class Actions(val primary: String, val secondary: String?) : CardItem()
}

class CardSpec(
    val items: List<CardItem>,
    val onPrimary: () -> Unit = {},
    val onSecondary: () -> Unit = {},
    /** Centre the content (the "Looking…" card). */
    val centered: Boolean = false,
) {
    val texts: List<String> get() = items.filterIsInstance<CardItem.Text>().map { it.text }
    val actions: CardItem.Actions? get() = items.filterIsInstance<CardItem.Actions>().firstOrNull()
    val title: String? get() = items.filterIsInstance<CardItem.Text>().firstOrNull { it.role == TextRole.HEADING }?.text

    /** One line for the phone: "Title | line | [Primary / Secondary]". */
    val summary: String get() = items.joinToString(" | ") {
        when (it) {
            is CardItem.Text -> it.text
            is CardItem.Picture -> "[still]"
            is CardItem.Actions -> "[" + listOfNotNull(it.primary, it.secondary).joinToString(" / ") + "]"
        }
    }

    class Builder {
        private val items = ArrayList<CardItem>()
        fun heading(t: String) { items += CardItem.Text(t, TextRole.HEADING) }
        fun body(t: String) { items += CardItem.Text(t, TextRole.BODY) }
        fun muted(t: String) { items += CardItem.Text(t, TextRole.BODY_MUTED) }
        fun meta(t: String) { items += CardItem.Text(t, TextRole.META) }
        fun metaMuted(t: String) { items += CardItem.Text(t, TextRole.META_MUTED) }
        fun picture(b: Bitmap) { items += CardItem.Picture(b) }
        fun actions(primary: String, secondary: String? = null) { items += CardItem.Actions(primary, secondary) }
        fun build(onPrimary: () -> Unit, onSecondary: () -> Unit, centered: Boolean) = CardSpec(items.toList(), onPrimary, onSecondary, centered)
    }

    companion object {
        fun of(onPrimary: () -> Unit = {}, onSecondary: () -> Unit = {}, centered: Boolean = false, body: Builder.() -> Unit): CardSpec =
            Builder().apply(body).build(onPrimary, onSecondary, centered)
    }
}

/**
 * Height estimate of a card on the 600x600 display, in display px. Measured on the Mock Device Kit
 * display (14 Nov, emulator): line heights and characters per line for each text role, the 24 px card
 * padding, 12 px gaps and the button dock. Words wrap, so a line holds a little less than its width;
 * the estimate wraps word by word.
 */
object CardFit {
    const val DISPLAY = 600
    private const val PADDING = 24
    private const val GAP = 12
    private const val DOCK = 76

    /** Characters per line and px per line for each role on the 552 px content width. */
    fun charsPerLine(role: TextRole): Int = when (role) {
        TextRole.HEADING -> 26
        TextRole.BODY, TextRole.BODY_MUTED -> 38
        TextRole.META, TextRole.META_MUTED -> 46
    }

    fun lineHeight(role: TextRole): Int = when (role) {
        TextRole.HEADING -> 44
        TextRole.BODY, TextRole.BODY_MUTED -> 36
        TextRole.META, TextRole.META_MUTED -> 30
    }

    /** Lines [text] takes when wrapped word by word at [perLine] characters. */
    fun lines(text: String, perLine: Int): Int {
        var lines = 1
        var used = 0
        for (w in text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }) {
            when {
                used > 0 && used + 1 + w.length <= perLine -> used += 1 + w.length
                else -> {
                    // A new line (unless this is the first word), and a word longer than a line breaks over more.
                    if (used > 0) lines += 1
                    lines += (w.length - 1) / perLine
                    used = (w.length - 1) % perLine + 1
                }
            }
        }
        return lines
    }

    /** Estimated height of [spec]; a still counts as [stillPx] (its band height on the card). */
    fun height(spec: CardSpec, stillPx: Int = 0): Int {
        var h = 2 * PADDING
        spec.items.forEachIndexed { i, it ->
            if (i > 0) h += GAP
            h += when (it) {
                is CardItem.Text -> lines(it.text, charsPerLine(it.role)) * lineHeight(it.role)
                is CardItem.Picture -> stillPx
                is CardItem.Actions -> DOCK
            }
        }
        return h
    }

    fun fits(spec: CardSpec, stillPx: Int = 0): Boolean = height(spec, stillPx) <= DISPLAY
}
