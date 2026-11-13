package com.junction2026.lens

import com.meta.wearable.dat.display.views.ButtonStyle
import com.meta.wearable.dat.display.views.ContentScope
import com.meta.wearable.dat.display.views.FlexBoxBackground
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
