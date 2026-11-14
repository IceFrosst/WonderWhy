package com.junction2026.lens

import android.graphics.Bitmap
import com.meta.wearable.dat.display.views.ButtonStyle
import com.meta.wearable.dat.display.views.ContentScope
import com.meta.wearable.dat.display.views.Direction
import com.meta.wearable.dat.display.views.FlexBoxBackground
import com.meta.wearable.dat.display.views.ImageSize
import com.meta.wearable.dat.display.views.TextColor
import com.meta.wearable.dat.display.views.TextStyle

/** Glasses Display content. Each builder is one root flexBox, as the SDK requires. */
object Cards {
    private fun card(body: com.meta.wearable.dat.display.views.FlexBoxScope.() -> Unit): ContentScope.() -> Unit = {
        flexBox(gap = 12, padding = 24, background = FlexBoxBackground.CARD) { body() }
    }

    fun idle(): ContentScope.() -> Unit = card {
        text("Physics Lens", style = TextStyle.HEADING)
        text("Look at something and pinch", style = TextStyle.BODY, color = TextColor.SECONDARY)
    }

    fun looking(): ContentScope.() -> Unit = card {
        text("Looking...", style = TextStyle.HEADING)
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
        button(label = "Again", style = ButtonStyle.PRIMARY, onClick = onAgain)
        button(label = "Done", style = ButtonStyle.SECONDARY, onClick = onDone)
    }

    /** v1 `lowConfidence`: a guess, never a scene (DESIGN.md "Not sure" state). Pinch / Again takes a new photo. */
    fun notSure(guess: String, onAgain: () -> Unit, onDone: () -> Unit): ContentScope.() -> Unit = card {
        text("Not sure", style = TextStyle.HEADING)
        text("Maybe: $guess. Look again, a bit closer.", style = TextStyle.BODY, color = TextColor.SECONDARY)
        button(label = "Again", style = ButtonStyle.PRIMARY, onClick = onAgain)
        button(label = "Done", style = ButtonStyle.SECONDARY, onClick = onDone)
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
    ): ContentScope.() -> Unit {
        val primary = when {
            s.isOverview -> "Show steps"
            !s.isLastStep -> "Next"
            s.hasNextLens -> "Next: ${s.nextLensTitle}"
            else -> "Again"
        }
        val secondary = if (s.isOverview) "Again" else "Done"
        val many = s.tracks.size > 1
        return card {
            if (s.isOverview) {
                text(label, style = TextStyle.HEADING)
                if (!summary.isNullOrBlank()) text(summary, style = TextStyle.BODY)
                if (!answer.isNullOrBlank() && answer != summary) text(answer, style = TextStyle.BODY, color = TextColor.SECONDARY)
                val n = s.track.steps.size
                val hint = "Pinch: $n step${if (n == 1) "" else "s"}." + if (many) " Left/right: ${s.tracks.size} lenses." else ""
                text(hint, style = TextStyle.META, color = TextColor.SECONDARY)
            } else {
                text(s.track.title, style = TextStyle.HEADING)
                if (still != null) {
                    image(bitmap = still, sizePreset = ImageSize.FILL, flexShrink = 1f)
                } else {
                    val lead = s.track.lead
                    if (s.step == 0 && !lead.isNullOrBlank()) text(lead, style = TextStyle.BODY, color = TextColor.SECONDARY)
                }
                // The counter is text, never colour alone.
                text("Step ${s.counter}. ${s.track.steps[s.step]}", style = TextStyle.BODY)
                if (many) text(lensBar(s), style = TextStyle.META, color = TextColor.SECONDARY)
            }
            flexBox(direction = Direction.ROW, gap = 12, background = FlexBoxBackground.NONE) {
                button(label = primary, style = ButtonStyle.PRIMARY, onClick = onPrimary)
                button(label = secondary, style = ButtonStyle.SECONDARY, onClick = onSecondary)
            }
        }
    }

    /** "Lens 1/2: Motion. Left/right: lens" (hint cap 8 words). */
    fun lensBar(s: ExplainerState): String =
        "Lens ${s.lens + 1}/${s.tracks.size}: ${s.track.title}. Left/right: lens"

    fun error(title: String, detail: String, onRetry: () -> Unit, onDone: () -> Unit): ContentScope.() -> Unit = card {
        text(title, style = TextStyle.HEADING)
        text(detail, style = TextStyle.BODY, color = TextColor.SECONDARY)
        button(label = "Try again", style = ButtonStyle.PRIMARY, onClick = onRetry)
        button(label = "Done", style = ButtonStyle.SECONDARY, onClick = onDone)
    }

    fun notice(title: String, detail: String, onOk: () -> Unit): ContentScope.() -> Unit = card {
        text(title, style = TextStyle.HEADING)
        text(detail, style = TextStyle.BODY, color = TextColor.SECONDARY)
        button(label = "OK", style = ButtonStyle.PRIMARY, onClick = onOk)
    }
}
