package com.junction2026.lens

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONObject

/*
 * "Glasses check": the first real-glasses test as a phone checklist for the team (English only, a team tool).
 * Source: Meta_Challenge/Glasses_Test.md (the 20-minute test sheet), rewritten short for a phone: each row is
 * the sheet's number, what to do and what you should see, each under 12 words. When the sheet changes,
 * change [GlassesCheck.ROWS] with it.
 *
 * Pure Kotlin plus org.json (no Android types), so JVM tests cover the rows, the state, the hints and the report.
 * The app never sets a verdict: hints say what the app itself saw, the person decides.
 */

enum class CheckVerdict { PASS, FAIL, SKIP }

/** One row of the sheet. [id] is the sheet's number ("6b"). [hint] names what the app can observe for it. */
data class CheckRow(val id: String, val todo: String, val expect: String, val hint: CheckHint = CheckHint.NONE)

/** What the app can observe for a row (see [GlassesCheck.hint]). */
enum class CheckHint { NONE, MODE, REGISTRATION, CAMERA, PINCH_CARD, LATENCY, SESSION, LAST_CARD, SPEECH, INPUT, DEVICE, OFFLINE, LANGUAGE, CONSENT }

data class CheckResult(val verdict: CheckVerdict, val note: String = "")

/** Facts the app has, for the hints. Times are "ms ago" (null: never). All read-only snapshots. */
data class CheckObserved(
    val mock: Boolean = true,
    val registration: String = "-",
    val session: String = "-",
    val display: String = "-",
    val speech: String = "-",
    val battery: Int? = null,
    val device: String = "",
    val pinchAgoMs: Long? = null,
    val lastCard: String? = null,
    val lastCardAgoMs: Long? = null,
    val lastDetectMs: Long? = null,
    val lastToCardMs: Long? = null,
    val lastHeard: String? = null,
    val lastPhotoKb: Int? = null,
    val cameraDeniedSeen: Boolean = false,
    val offlineSeen: Boolean = false,
    val bridgeHealth: Int? = null,
    val lang: String = "en",
    val consent: Boolean = false,
)

/** Report header facts. [bridgeUrl] may be anything the person typed: only its host goes in the report. */
data class CheckReportInfo(
    val atMs: Long,
    val timeZone: TimeZone,
    val phone: String,
    val android: String,
    val appVersion: String,
    val mock: Boolean,
    val bridgeUrl: String,
)

object GlassesCheck {
    /** From Glasses_Test.md, in the sheet's order. Each [CheckRow.todo] and [CheckRow.expect] is under 12 words. */
    val ROWS: List<CheckRow> = listOf(
        CheckRow("1", "Meta AI app: Developer Mode on, note both versions.", "App v272+, Developer Mode on, glasses connected.", CheckHint.MODE),
        CheckRow("2", "Mock glasses off, restart the app, tap Connect.", "Meta AI opens, you approve, back here connected.", CheckHint.REGISTRATION),
        CheckRow("3", "Allow camera when asked. Then deny once and retry.", "Allowed: photo taken. Denied: camera card, no crash.", CheckHint.CAMERA),
        CheckRow("4", "Look at the ball, pinch. Then tap Explain.", "Looking…, then the ball card. Again and Done work.", CheckHint.PINCH_CARD),
        CheckRow("5", "Time pinch to card three times. Open bridge /latency.", "Three times noted. /latency lists upload, detect, render.", CheckHint.LATENCY),
        CheckRow("6", "After a card, open the Web App on the glasses.", "Same scene within 120 s. Note if the phone session survives.", CheckHint.SESSION),
        CheckRow("6b", "Web App closed: pinch at the ball, step, swipe lenses.", "Drawing, caption, buttons fit. Readable at arm's length.", CheckHint.LAST_CARD),
        CheckRow("6c", "With a result shown, say \"why does it curve?\".", "Heard line, then an answer card at the right step.", CheckHint.SPEECH),
        CheckRow("7", "Scan the install QR code with the phone camera.", "Meta AI adds Physics Lens to the glasses.", CheckHint.NONE),
        CheckRow("8", "Web App: open ball and guitar, read captions by a window.", "Text readable, lines visible, no flicker, smooth.", CheckHint.NONE),
        CheckRow("9", "Web App: try D-pad, pinch and back.", "Same as arrow keys, Enter and Esc.", CheckHint.INPUT),
        CheckRow("10", "Open the Web App with the key link, then without.", "Works both times. A wrong key shows Bridge locked.", CheckHint.NONE),
        CheckRow("11", "Take off, put on, fold. Note battery start and end.", "Display blanks or session stops cleanly. No crash.", CheckHint.DEVICE),
        CheckRow("12", "Phone Wi-Fi and data off, pinch. Then turn back on.", "Offline card, then it works again when back on.", CheckHint.OFFLINE),
        CheckRow("13", "Language to Suomi, pinch at the ball.", "Finnish card. Å, ä and ö show.", CheckHint.LANGUAGE),
        CheckRow("14", "Clear app data, then pinch once.", "\"Before you start\" card first. Pinch agrees.", CheckHint.CONSENT),
    )

    const val NOTE_MAX = 140

    /** "01", "06b", "14": sheet numbers padded so the report lines up. */
    fun number(id: String): String {
        val digits = id.takeWhile { it.isDigit() }
        return digits.padStart(2, '0') + id.drop(digits.length)
    }

    // ---- state ----

    /** Tapping the verdict that is already set clears it. A note is kept only on Fail. */
    fun setVerdict(state: Map<String, CheckResult>, id: String, v: CheckVerdict): Map<String, CheckResult> {
        val old = state[id]
        val out = LinkedHashMap(state)
        if (old?.verdict == v) out.remove(id)
        else out[id] = CheckResult(v, if (v == CheckVerdict.FAIL) old?.note.orEmpty() else "")
        return out
    }

    /** Sets the note of a failed row (one line, [NOTE_MAX] characters). Other rows have no note. */
    fun setNote(state: Map<String, CheckResult>, id: String, note: String): Map<String, CheckResult> {
        val old = state[id] ?: return state
        if (old.verdict != CheckVerdict.FAIL) return state
        return LinkedHashMap(state).apply { put(id, old.copy(note = cleanNote(note))) }
    }

    fun cleanNote(note: String): String = note.replace(Regex("\\s+"), " ").trim().take(NOTE_MAX)

    fun encode(state: Map<String, CheckResult>): String {
        val rows = JSONObject()
        for ((id, r) in state) rows.put(id, JSONObject().put("v", r.verdict.name).put("n", r.note))
        return JSONObject().put("v", 1).put("rows", rows).toString()
    }

    /** Unknown rows and bad values are dropped; broken text gives an empty state. */
    fun decode(text: String?): Map<String, CheckResult> {
        if (text.isNullOrBlank()) return emptyMap()
        val rows = runCatching { JSONObject(text).optJSONObject("rows") }.getOrNull() ?: return emptyMap()
        val known = ROWS.map { it.id }.toSet()
        val out = LinkedHashMap<String, CheckResult>()
        for (id in rows.keys()) {
            if (id !in known) continue
            val o = rows.optJSONObject(id) ?: continue
            val v = runCatching { CheckVerdict.valueOf(o.optString("v")) }.getOrNull() ?: continue
            out[id] = CheckResult(v, if (v == CheckVerdict.FAIL) cleanNote(o.optString("n")) else "")
        }
        return out
    }

    // ---- hints: what the app saw, never a verdict ----

    fun ago(ms: Long): String = when {
        ms < 60_000 -> "${ms / 1000} s ago"
        ms < 3_600_000 -> "${ms / 60_000} min ago"
        else -> "${ms / 3_600_000} h ago"
    }

    fun seconds(ms: Long): String = if (ms < 1000) "$ms ms" else String.format(Locale.US, "%.1f s", ms / 1000.0)

    /** "App saw: ..." for [row], or null when the app cannot observe anything for it. */
    fun hint(row: CheckRow, o: CheckObserved): String? {
        val parts: List<String> = when (row.hint) {
            CheckHint.NONE -> return null
            CheckHint.MODE -> listOf(if (o.mock) "Mock glasses ON (real test: switch off, restart)" else "real glasses mode", "registration ${o.registration}")
            CheckHint.REGISTRATION -> listOf("registration ${o.registration}", "session ${o.session}", "display ${o.display}")
            CheckHint.CAMERA -> listOfNotNull(
                if (o.cameraDeniedSeen) "camera denied card shown" else null,
                o.lastPhotoKb?.let { "last photo $it KB" } ?: "no photo yet",
            )
            CheckHint.PINCH_CARD -> listOf(pinch(o), lastCard(o))
            CheckHint.LATENCY -> listOf(
                o.lastDetectMs?.let { "last /detect ${seconds(it)}" } ?: "no /detect yet",
                o.lastToCardMs?.let { "pinch to card ${seconds(it)}" } ?: "no card time yet",
            )
            CheckHint.SESSION -> listOf("session ${o.session}", "display ${o.display}")
            CheckHint.LAST_CARD -> listOf(lastCard(o))
            CheckHint.SPEECH -> listOf("speech ${o.speech}", o.lastHeard?.let { "heard \"${AskFlow.cap(it, 8)}\"" } ?: "nothing heard yet")
            CheckHint.INPUT -> listOf(pinch(o))
            CheckHint.DEVICE -> listOfNotNull(o.battery?.let { "battery $it%" } ?: "no battery level yet", o.device.ifBlank { null })
            CheckHint.OFFLINE -> listOf(
                when { o.bridgeHealth == null -> "bridge not checked"; o.bridgeHealth in 200..299 -> "bridge online"; o.bridgeHealth < 0 -> "bridge offline"; else -> "bridge HTTP ${o.bridgeHealth}" },
                if (o.offlineSeen) "offline card shown" else "no offline card yet",
            )
            CheckHint.LANGUAGE -> listOf("language ${o.lang}", lastCard(o))
            CheckHint.CONSENT -> listOf(if (o.consent) "consent given" else "consent not given yet")
        }
        return "App saw: " + parts.joinToString(", ")
    }

    private fun pinch(o: CheckObserved) = o.pinchAgoMs?.let { "last pinch ${ago(it)}" } ?: "no pinch from the glasses yet"
    private fun lastCard(o: CheckObserved) =
        o.lastCard?.let { "last card: $it" + (o.lastCardAgoMs?.let { a -> " (${ago(a)})" } ?: "") } ?: "no card yet"

    // ---- report ----

    /**
     * scheme://user:key@host:port/path?k=..#k=.. -> "host". Never a path, query, fragment, user info or port.
     * Blank or unparsable gives "-".
     */
    fun bridgeHost(url: String): String {
        var u = url.trim().substringBefore('#').substringBefore('?')
        val at = u.indexOf("://")
        if (at >= 0) u = u.substring(at + 3)
        u = u.substringBefore('/').substringAfterLast('@')
        u = if (u.startsWith("[")) u.substringBefore(']') + "]" else u.substringBefore(':')
        return u.filter { it.isLetterOrDigit() || it in ".-[]:" }.ifEmpty { "-" }
    }

    /**
     * Removes anything that could carry a key from free text (a note, the phone name): every [secrets] value,
     * a URL's query and fragment, and `k=` / `key=` / `token=` values.
     */
    fun scrub(text: String, secrets: List<String>): String {
        var t = text
        for (s in secrets.map { it.trim() }.filter { it.length >= 3 }) t = t.replace(s, "[removed]", ignoreCase = true)
        t = t.replace(Regex("(?i)(\\w+://[^\\s?#]*)[?#]\\S*"), "$1")
        t = t.replace(Regex("(?i)(?<![\\p{L}\\p{N}])(k|key|token|lens[-_]?token)\\s*[=:]\\s*\\S*"), "[removed]")
        return t
    }

    private fun mark(v: CheckVerdict?) = when (v) {
        CheckVerdict.PASS -> "PASS"
        CheckVerdict.FAIL -> "FAIL"
        CheckVerdict.SKIP -> "SKIP"
        null -> "–"
    }

    /**
     * Plain text for the team: date and time, phone, Android, app version, mock or real, bridge host only, one
     * line per row ("07 PASS Scan the install QR code ... — note"), totals. [secrets] (the bridge token) are
     * scrubbed from every free-text field; the token itself is never an input of the header.
     */
    fun report(info: CheckReportInfo, state: Map<String, CheckResult>, secrets: List<String> = emptyList()): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply { timeZone = info.timeZone }
        fun clean(s: String) = scrub(s.replace(Regex("\\s+"), " ").trim(), secrets)
        val sb = StringBuilder()
        sb.append("Physics Lens glasses check\n")
        sb.append("Date: ${fmt.format(Date(info.atMs))} (${info.timeZone.getDisplayName(false, TimeZone.SHORT, Locale.US)})\n")
        sb.append("Phone: ${clean(info.phone)}, Android ${clean(info.android)}\n")
        sb.append("App: ${clean(info.appVersion)}\n")
        sb.append("Glasses: ${if (info.mock) "mock (Mock Device Kit)" else "real"}\n")
        sb.append("Bridge host: ${bridgeHost(info.bridgeUrl)}\n")
        sb.append("Source: Glasses_Test.md\n\n")
        for (row in ROWS) {
            val r = state[row.id]
            sb.append(number(row.id)).append(' ').append(mark(r?.verdict)).append(' ').append(row.todo)
            val note = r?.note?.let { clean(it) }.orEmpty()
            if (r?.verdict == CheckVerdict.FAIL && note.isNotEmpty()) sb.append(" — ").append(note)
            sb.append('\n')
        }
        val n = CheckVerdict.entries.associateWith { v -> ROWS.count { state[it.id]?.verdict == v } }
        val open = ROWS.count { state[it.id] == null }
        sb.append("\nTotals: ${n[CheckVerdict.PASS]} pass, ${n[CheckVerdict.FAIL]} fail, ${n[CheckVerdict.SKIP]} skip, $open not done (${ROWS.size} rows)\n")
        return sb.toString()
    }
}
