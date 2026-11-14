package com.junction2026.lens

import android.graphics.Bitmap
import com.meta.wearable.dat.display.views.ButtonStyle
import com.meta.wearable.dat.display.views.ContentScope
import com.meta.wearable.dat.display.views.Direction
import com.meta.wearable.dat.display.views.FlexBoxBackground
import com.meta.wearable.dat.display.views.ImageSize
import com.meta.wearable.dat.display.views.TextColor
import com.meta.wearable.dat.display.views.TextStyle
import java.util.Locale

/**
 * Glasses Display cards. Builders return a [CardSpec] (plain data: words, still, dock); [render] turns it
 * into the toolkit's content, one root flexBox as the SDK requires.
 */
object Cards {
    /**
     * Language of the fixed card strings: the phone screen's picker choice, else the phone language
     * ([Lang.effective]). Set by the activity; read on the main thread.
     */
    @Volatile var lang: String = Lang.tagFor(Locale.getDefault())

    /** Fixed card strings in [lang] where [Lang] has them (English otherwise). */
    fun t(key: String): String = Lang.ui(lang, key)

    /** The toolkit content for [spec]: a card with gap 12 and padding 24; the dock is one row of 1-2 buttons. */
    fun render(spec: CardSpec): ContentScope.() -> Unit = {
        flexBox(gap = 12, padding = 24, background = FlexBoxBackground.CARD) {
            for (item in spec.items) when (item) {
                is CardItem.Text -> when (item.role) {
                    TextRole.HEADING -> text(item.text, style = TextStyle.HEADING)
                    TextRole.BODY -> text(item.text, style = TextStyle.BODY)
                    TextRole.BODY_MUTED -> text(item.text, style = TextStyle.BODY, color = TextColor.SECONDARY)
                    TextRole.META -> text(item.text, style = TextStyle.META)
                    TextRole.META_MUTED -> text(item.text, style = TextStyle.META, color = TextColor.SECONDARY)
                }
                is CardItem.Picture -> image(bitmap = item.bitmap, sizePreset = ImageSize.FILL, flexShrink = 1f)
                // A column of buttons runs off the 600x600 screen, so the dock is a row.
                is CardItem.Actions -> flexBox(direction = Direction.ROW, gap = 12, background = FlexBoxBackground.NONE) {
                    button(label = item.primary, style = ButtonStyle.PRIMARY, onClick = spec.onPrimary)
                    if (item.secondary != null) button(label = item.secondary, style = ButtonStyle.SECONDARY, onClick = spec.onSecondary)
                }
            }
        }
    }

    fun idle(): CardSpec = CardSpec.of {
        heading("Physics Lens")
        muted(t(Lang.IDLE))
    }

    fun looking(): CardSpec = CardSpec.of { heading(t(Lang.LOOKING)) }

    /**
     * First-run consent (DESIGN.md states table, PROTOCOL `first_run`): before the first photo ever. What
     * happens, in the state-card caps (title 3 words, lines 8 words). Agree is what pinch does.
     */
    fun consent(onAgree: () -> Unit, onNotNow: () -> Unit): CardSpec = CardSpec.of(onAgree, onNotNow) {
        heading(t(Lang.CONSENT_TITLE))
        body(t(Lang.CONSENT_BODY))
        muted(t(Lang.CONSENT_NOTE))
        actions(t(Lang.AGREE), t(Lang.NOT_NOW))
    }

    fun result(
        title: String,
        concept: String?,
        answer: String?,
        onAgain: () -> Unit,
        onDone: () -> Unit,
    ): CardSpec = CardSpec.of(onAgain, onDone) {
        heading(title)
        if (!concept.isNullOrBlank()) body(concept)
        if (!answer.isNullOrBlank()) muted(answer)
        actions(t(Lang.AGAIN), t(Lang.DONE))
    }

    /** v1 `lowConfidence`: a guess, never a scene (DESIGN.md "Not sure" state). Pinch / Again takes a new photo. */
    fun notSure(guess: String, onAgain: () -> Unit, onDone: () -> Unit): CardSpec = CardSpec.of(onAgain, onDone) {
        heading("Not sure")
        muted("Maybe: $guess. Look again, a bit closer.")
        actions(t(Lang.AGAIN), t(Lang.DONE))
    }

    /**
     * Explainer, overview or one step. Primary button = what pinch does; the second is Again on the
     * overview, Done on step cards. [still] replaces nothing: the caption stays.
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
    ): CardSpec {
        val primary = when {
            s.isOverview -> t(Lang.SHOW_STEPS)
            !s.isLastStep -> t(Lang.NEXT)
            s.hasNextLens -> "${t(Lang.NEXT)}: ${s.nextLensTitle}"
            else -> t(Lang.AGAIN)
        }
        val secondary = if (s.isOverview) t(Lang.AGAIN) else t(Lang.DONE)
        val many = s.tracks.size > 1
        return CardSpec.of(onPrimary, onSecondary) {
            if (s.isOverview) {
                heading(label)
                if (sketch) meta(t(Lang.SKETCH))
                if (saved) metaMuted(t(Lang.OFFLINE))
                if (!summary.isNullOrBlank()) body(summary)
                if (!answer.isNullOrBlank() && answer != summary) muted(answer)
                metaMuted(overviewHint(s))
            } else {
                heading(s.track.title)
                // Sketch: the tag is text on every step (the glasses have no "hot" text colour anyway).
                if (sketch) meta(t(Lang.SKETCH))
                if (saved) metaMuted(t(Lang.OFFLINE))
                if (still != null) {
                    picture(still)
                } else {
                    val lead = s.track.lead
                    if (s.step == 0 && !lead.isNullOrBlank()) muted(lead)
                }
                // The counter is text, never colour alone.
                body("${t(Lang.STEP)} ${s.counter}. ${s.track.steps[s.step]}")
                if (many) metaMuted(lensBar(s))
            }
            actions(primary, secondary)
        }
    }

    /** "Pinch: 3 steps. Left/right: 5 lenses." (hint cap 8 words). */
    fun overviewHint(s: ExplainerState): String = Lang.overviewHint(lang, s.track.steps.size, s.tracks.size)

    /**
     * Lens bar as text (DESIGN.md: one dot per lens, the current one filled and named; never more than 5):
     * "●○○○○ 1/5 Projectile motion". The counter makes it readable without the dots.
     */
    fun lensBar(s: ExplainerState): String {
        val dots = s.tracks.indices.joinToString("") { if (it == s.lens) "●" else "○" }
        return "$dots ${s.lens + 1}/${s.tracks.size} ${AskFlow.cap(s.track.title, 3)}"
    }

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
    ): CardSpec = CardSpec.of(onPrimary, onDone) {
        heading(a.title)
        metaMuted("Q: ${a.question}")
        if (local) metaMuted(t(Lang.PHONE_ANSWER))
        body(a.answer)
        actions(openLabel ?: t(Lang.SHOW_STEPS), t(Lang.DONE))
    }

    /** A card with a decision: title, one line, two actions (DESIGN.md card anatomy). */
    fun decide(title: String, detail: String, primary: String, onPrimary: () -> Unit, secondary: String, onSecondary: () -> Unit): CardSpec =
        CardSpec.of(onPrimary, onSecondary) {
            heading(title)
            muted(detail)
            actions(primary, secondary)
        }

    fun error(title: String, detail: String, onRetry: () -> Unit, onDone: () -> Unit): CardSpec =
        decide(title, detail, t(Lang.TRY_AGAIN), onRetry, t(Lang.DONE), onDone)

    /**
     * Bridge unreachable: the camera cannot identify anything, so the wearer picks a saved library card.
     * Left/right changes the object (wraps), pinch (Open) opens it, Try again takes a new photo.
     */
    fun offlinePicker(
        p: OfflinePicker,
        label: String,
        tagline: String?,
        onOpen: () -> Unit,
        onRetry: () -> Unit,
    ): CardSpec = CardSpec.of(onOpen, onRetry) {
        heading(t(Lang.OFFLINE_TITLE))
        muted(t(Lang.OFFLINE_BODY))
        heading("${p.counter}  $label")
        if (!tagline.isNullOrBlank() && tagline != label) body(tagline)
        metaMuted(t(Lang.OFFLINE_HINT))
        actions(t(Lang.OPEN), t(Lang.TRY_AGAIN))
    }

    fun notice(title: String, detail: String, onOk: () -> Unit): CardSpec = CardSpec.of(onOk) {
        heading(title)
        muted(detail)
        actions("OK")
    }
}
