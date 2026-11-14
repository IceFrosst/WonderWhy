package com.junction2026.lens

import android.graphics.Bitmap
import com.meta.wearable.dat.display.views.Alignment
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

    /**
     * The toolkit content for [spec]: gap 12, padding 24, no card fill (an additive display glows where it is
     * filled, DESIGN.md "Filled areas"). The dock is one row of 1-2 buttons.
     */
    fun render(spec: CardSpec): ContentScope.() -> Unit = {
        val align = if (spec.centered) Alignment.CENTER else Alignment.START
        // The display pins the root to the bottom edge; a centred card is lifted to mid-height by its padding.
        val bottom = if (spec.centered) maxOf(24, (CardFit.DISPLAY - CardFit.height(spec)) / 2 + 24) else 24
        flexBox(gap = 12, padding = 24, paddingBottom = bottom, crossAlignment = align, background = FlexBoxBackground.NONE) {
            for (item in spec.items) when (item) {
                is CardItem.Text -> {
                    val style = when (item.role) {
                        TextRole.HEADING -> TextStyle.HEADING
                        TextRole.BODY, TextRole.BODY_MUTED -> TextStyle.BODY
                        TextRole.META, TextRole.META_MUTED -> TextStyle.META
                    }
                    val muted = item.role == TextRole.BODY_MUTED || item.role == TextRole.META_MUTED
                    text(item.text, style = style, color = if (muted) TextColor.SECONDARY else TextColor.PRIMARY, alignSelf = align)
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

    /** "Looking…", centred (DESIGN.md states table). */
    fun looking(): CardSpec = CardSpec.of(centered = true) { heading(t(Lang.LOOKING)) }

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

    /** Old single result (no steps). One button: Back already means Done. */
    fun result(title: String, concept: String?, answer: String?, onAgain: () -> Unit, standIn: Boolean = false): CardSpec =
        CardSpec.of(onAgain) {
            heading(title)
            if (standIn) metaMuted(t(Lang.STAND_IN))
            if (!concept.isNullOrBlank()) body(concept)
            if (!answer.isNullOrBlank()) muted(answer)
            actions(t(Lang.AGAIN))
        }

    /**
     * Low confidence or unknown (DESIGN.md "Not sure" state): fixed words, never the bridge's own answer text.
     * Pinch / Again takes a new photo.
     */
    fun notSure(onAgain: () -> Unit): CardSpec = CardSpec.of(onAgain) {
        heading(t(Lang.NOT_SURE))
        muted(t(Lang.NOT_SURE_BODY))
        actions(t(Lang.AGAIN))
    }

    /**
     * Explainer, overview or one step. The heading is the object; the one button is what pinch does (Back
     * goes one step back). [still]: the first step's drawing on the overview, the step's drawing on a step.
     */
    fun explainer(
        s: ExplainerState,
        label: String,
        summary: String?,
        answer: String?,
        still: Bitmap?,
        onPrimary: () -> Unit,
        /** Offline: the explanation comes from the bundled library, not from this photo. */
        saved: Boolean = false,
        /** A generated sketch: every card carries the "Sketch · unverified" tag (text, not colour). */
        sketch: Boolean = false,
        /** Answer from a dev-only stand-in model (PROTOCOL `standIn`): tag on the overview. */
        standIn: Boolean = false,
    ): CardSpec {
        val primary = when {
            s.isOverview -> t(Lang.SHOW_STEPS)
            !s.isLastStep -> t(Lang.NEXT)
            s.hasNextLens -> "${t(Lang.NEXT)}: ${s.nextLensTitle}"
            else -> t(Lang.AGAIN)
        }
        val many = s.tracks.size > 1
        return CardSpec.of(onPrimary) {
            heading(label)
            // Sketch: the tag is text on every card (the glasses have no "hot" text colour anyway).
            if (sketch) meta(t(Lang.SKETCH))
            if (s.isOverview) {
                if (saved) metaMuted(t(Lang.OFFLINE))
                if (standIn) metaMuted(t(Lang.STAND_IN))
                if (still != null) picture(still)
                if (!summary.isNullOrBlank()) body(summary)
                if (!answer.isNullOrBlank() && answer != summary) muted(answer)
                metaMuted(overviewHint(s))
            } else {
                if (still != null) picture(still)
                // The counter is text, never colour alone; "Step 1/3" is the only counter on the card.
                body(stepCaption(s))
                if (many) metaMuted(lensBar(s))
            }
            actions(primary)
        }
    }

    /** "Step 1/3. caption" in [lang]. */
    fun stepCaption(s: ExplainerState): String = "${t(Lang.STEP)} ${s.counter}. ${s.track.steps[s.step]}"

    /** "Pinch: 3 steps. Left/right: 5 lenses." (hint cap 8 words). */
    fun overviewHint(s: ExplainerState): String = Lang.overviewHint(lang, s.track.steps.size, s.tracks.size)

    /**
     * Lens bar as text (DESIGN.md: one dot per lens, the current one filled and named; never more than 5):
     * "●○○○○ Projectile motion". The name says which lens without the dots.
     */
    fun lensBar(s: ExplainerState): String {
        val dots = s.tracks.indices.joinToString("") { if (it == s.lens) "●" else "○" }
        return "$dots ${AskFlow.cap(s.track.title, 3)}"
    }

    /**
     * `/ask` answer: the object, the question, the answer (already within the word caps, see [AskFlow]).
     * One button = what pinch does: open the lens and step the bridge pointed at ([openLabel]), else the steps.
     */
    fun answer(
        a: AnswerText,
        openLabel: String?,
        onPrimary: () -> Unit,
        /** The phone answered by itself from the saved cards (bridge has no `/ask` or is offline). */
        local: Boolean = false,
    ): CardSpec = CardSpec.of(onPrimary) {
        heading(a.title)
        metaMuted("${t(Lang.QUESTION_PREFIX)} ${a.question}")
        if (local) metaMuted(t(Lang.PHONE_ANSWER))
        body(a.answer)
        actions(openLabel ?: t(Lang.SHOW_STEPS))
    }

    /** A card with a decision: title, one line, two actions (DESIGN.md card anatomy). */
    fun decide(title: String, detail: String, primary: String, onPrimary: () -> Unit, secondary: String, onSecondary: () -> Unit): CardSpec =
        CardSpec.of(onPrimary, onSecondary) {
            heading(title)
            muted(detail)
            actions(primary, secondary)
        }

    /** Error: title, what to do, one button (Back dismisses). The error code goes to the phone log only. */
    fun error(title: String, onRetry: () -> Unit, detail: String = t(Lang.ERROR_BODY)): CardSpec = CardSpec.of(onRetry) {
        heading(title)
        muted(detail)
        actions(t(Lang.TRY_AGAIN))
    }

    /**
     * Bridge unreachable: the camera cannot identify anything, so the wearer picks a saved library card.
     * Left/right changes the object (wraps), pinch (Open) opens it, Try again takes a new photo.
     * [tagline]: only when it is in the card's language (see [OfflineCards.taglineFor]).
     */
    fun offlinePicker(
        p: OfflinePicker,
        label: String,
        tagline: String?,
        onOpen: () -> Unit,
        onRetry: () -> Unit,
    ): CardSpec = CardSpec.of(onOpen, onRetry) {
        metaMuted(t(Lang.OFFLINE_BODY))
        heading(label)
        if (!tagline.isNullOrBlank() && tagline != label) body(tagline)
        metaMuted("${p.counter} · ${t(Lang.OFFLINE_HINT)}")
        actions(t(Lang.OPEN), t(Lang.TRY_AGAIN))
    }

    fun notice(title: String, detail: String, onOk: () -> Unit): CardSpec = CardSpec.of(onOk) {
        heading(title)
        muted(detail)
        actions("OK")
    }
}
