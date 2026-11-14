package com.junction2026.lens

import android.graphics.Bitmap
import com.meta.wearable.dat.display.views.ButtonStyle
import com.meta.wearable.dat.display.views.ContentScope
import com.meta.wearable.dat.display.views.Direction
import com.meta.wearable.dat.display.views.FlexBoxBackground
import com.meta.wearable.dat.display.views.FlexBoxScope
import com.meta.wearable.dat.display.views.ImageSize
import com.meta.wearable.dat.display.views.TextColor
import com.meta.wearable.dat.display.views.TextStyle
import java.util.Locale

/** Glasses Display content. Each builder is one root flexBox, as the SDK requires. */
object Cards {
    /**
     * Language of the fixed card strings: the phone screen's picker choice, else the phone language
     * ([Lang.effective]). Set by the activity; read on the main thread.
     */
    @Volatile var lang: String = Lang.tagFor(Locale.getDefault())

    /** Fixed card strings in [lang] where [Lang] has them (English otherwise). */
    fun t(key: String): String = Lang.ui(lang, key)

    private fun card(body: FlexBoxScope.() -> Unit): ContentScope.() -> Unit = {
        flexBox(gap = 12, padding = 24, background = FlexBoxBackground.CARD) { body() }
    }

    /** The dock: at most 2 actions side by side (a column of buttons runs off the 600x600 screen). */
    private fun FlexBoxScope.actions(primary: String, onPrimary: () -> Unit, secondary: String? = null, onSecondary: () -> Unit = {}) {
        flexBox(direction = Direction.ROW, gap = 12, background = FlexBoxBackground.NONE) {
            button(label = primary, style = ButtonStyle.PRIMARY, onClick = onPrimary)
            if (secondary != null) button(label = secondary, style = ButtonStyle.SECONDARY, onClick = onSecondary)
        }
    }

    fun idle(): ContentScope.() -> Unit = card {
        text("Physics Lens", style = TextStyle.HEADING)
        text(t(Lang.IDLE), style = TextStyle.BODY, color = TextColor.SECONDARY)
    }

    fun looking(): ContentScope.() -> Unit = card {
        text(t(Lang.LOOKING), style = TextStyle.HEADING)
    }

    fun result(
        title: String,
        concept: String?,
        answer: String?,
        onAgain: () -> Unit,
        onDone: () -> Unit,
    ): ContentScope.() -> Unit = card {
        text(title, style = TextStyle.HEADING)
        if (!concept.isNullOrBlank()) text(concept, style = TextStyle.BODY)
        if (!answer.isNullOrBlank()) text(answer, style = TextStyle.BODY, color = TextColor.SECONDARY)
        actions(t(Lang.AGAIN), onAgain, t(Lang.DONE), onDone)
    }

    /** v1 `lowConfidence`: a guess, never a scene (DESIGN.md "Not sure" state). Pinch / Again takes a new photo. */
    fun notSure(guess: String, onAgain: () -> Unit, onDone: () -> Unit): ContentScope.() -> Unit = card {
        text("Not sure", style = TextStyle.HEADING)
        text("Maybe: $guess. Look again, a bit closer.", style = TextStyle.BODY, color = TextColor.SECONDARY)
        actions(t(Lang.AGAIN), onAgain, t(Lang.DONE), onDone)
    }

    /**
     * Explainer, overview or one step. Primary button = what pinch does ([primaryLabel]); the second is
     * [secondaryLabel] (Again on the overview, Done on step cards). [still] replaces nothing: the caption stays.
     */
    fun explainer(
        s: ExplainerState,
        label: String,
        summary: String?,
        answer: String?,
        still: Bitmap?,
        onPrimary: () -> Unit,
        onSecondary: () -> Unit,
        /** Offline: the explanation comes from the bundled library, not from this photo. */
        saved: Boolean = false,
        /** A generated sketch: every card carries the "Sketch · unverified" tag (text, not colour). */
        sketch: Boolean = false,
    ): ContentScope.() -> Unit {
        val primary = when {
            s.isOverview -> t(Lang.SHOW_STEPS)
            !s.isLastStep -> t(Lang.NEXT)
            s.hasNextLens -> "Next: ${s.nextLensTitle}"
            else -> t(Lang.AGAIN)
        }
        val secondary = if (s.isOverview) t(Lang.AGAIN) else t(Lang.DONE)
        val many = s.tracks.size > 1
        return card {
            if (s.isOverview) {
                text(label, style = TextStyle.HEADING)
                if (sketch) text(t(Lang.SKETCH), style = TextStyle.META)
                if (saved) text(t(Lang.OFFLINE), style = TextStyle.META, color = TextColor.SECONDARY)
                if (!summary.isNullOrBlank()) text(summary, style = TextStyle.BODY)
                if (!answer.isNullOrBlank() && answer != summary) text(answer, style = TextStyle.BODY, color = TextColor.SECONDARY)
                val n = s.track.steps.size
                val hint = "Pinch: $n step${if (n == 1) "" else "s"}." + if (many) " Left/right: ${s.tracks.size} lenses." else ""
                text(hint, style = TextStyle.META, color = TextColor.SECONDARY)
            } else {
                text(s.track.title, style = TextStyle.HEADING)
                // Sketch: the tag is text on every step (the glasses have no "hot" text colour anyway).
                if (sketch) text(t(Lang.SKETCH), style = TextStyle.META)
                if (saved) text(t(Lang.OFFLINE), style = TextStyle.META, color = TextColor.SECONDARY)
                if (still != null) {
                    image(bitmap = still, sizePreset = ImageSize.FILL, flexShrink = 1f)
                } else {
                    val lead = s.track.lead
                    if (s.step == 0 && !lead.isNullOrBlank()) text(lead, style = TextStyle.BODY, color = TextColor.SECONDARY)
                }
                // The counter is text, never colour alone.
                text("${t(Lang.STEP)} ${s.counter}. ${s.track.steps[s.step]}", style = TextStyle.BODY)
                if (many) text(lensBar(s), style = TextStyle.META, color = TextColor.SECONDARY)
            }
            actions(primary, onPrimary, secondary, onSecondary)
        }
    }

    /** "Lens 1/2: Motion. Left/right: lens" (hint cap 8 words). */
    fun lensBar(s: ExplainerState): String =
        "Lens ${s.lens + 1}/${s.tracks.size}: ${s.track.title}. Left/right: lens"

    /**
     * `/ask` answer: the object, the question, the answer (already within the word caps, see [AskFlow]).
     * Primary = what pinch does: open the lens and step the bridge pointed at ([openLabel]), else the steps.
     */
    fun answer(
        a: AnswerText,
        openLabel: String?,
        onPrimary: () -> Unit,
        onDone: () -> Unit,
        /** The phone answered by itself from the saved cards (bridge has no `/ask` or is offline). */
        local: Boolean = false,
    ): ContentScope.() -> Unit = card {
        text(a.title, style = TextStyle.HEADING)
        text("Q: ${a.question}", style = TextStyle.META, color = TextColor.SECONDARY)
        if (local) text(t(Lang.PHONE_ANSWER), style = TextStyle.META, color = TextColor.SECONDARY)
        text(a.answer, style = TextStyle.BODY)
        actions(openLabel ?: t(Lang.SHOW_STEPS), onPrimary, t(Lang.DONE), onDone)
    }

    /** A card with a decision: title, one line, two actions (DESIGN.md card anatomy). */
    fun decide(title: String, detail: String, primary: String, onPrimary: () -> Unit, secondary: String, onSecondary: () -> Unit): ContentScope.() -> Unit = card {
        text(title, style = TextStyle.HEADING)
        text(detail, style = TextStyle.BODY, color = TextColor.SECONDARY)
        actions(primary, onPrimary, secondary, onSecondary)
    }

    fun error(title: String, detail: String, onRetry: () -> Unit, onDone: () -> Unit): ContentScope.() -> Unit = card {
        text(title, style = TextStyle.HEADING)
        text(detail, style = TextStyle.BODY, color = TextColor.SECONDARY)
        actions(t(Lang.TRY_AGAIN), onRetry, t(Lang.DONE), onDone)
    }

    /**
     * Bridge unreachable: the camera cannot identify anything, so the wearer picks a saved library card.
     * Left/right changes the object, pinch (Open) opens it, Try again takes a new photo.
     */
    fun offlinePicker(
        p: OfflinePicker,
        label: String,
        tagline: String?,
        onOpen: () -> Unit,
        onRetry: () -> Unit,
    ): ContentScope.() -> Unit = card {
        text("Offline", style = TextStyle.HEADING)
        text("Can't reach the bridge. Pick a saved card.", style = TextStyle.BODY, color = TextColor.SECONDARY)
        text("${p.counter}  $label", style = TextStyle.HEADING)
        if (!tagline.isNullOrBlank() && tagline != label) text(tagline, style = TextStyle.BODY)
        text("Left/right: object. Pinch: open.", style = TextStyle.META, color = TextColor.SECONDARY)
        actions("Open", onOpen, t(Lang.TRY_AGAIN), onRetry)
    }

    fun notice(title: String, detail: String, onOk: () -> Unit): ContentScope.() -> Unit = card {
        text(title, style = TextStyle.HEADING)
        text(detail, style = TextStyle.BODY, color = TextColor.SECONDARY)
        actions("OK", onOk)
    }
}
