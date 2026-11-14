package com.junction2026.lens

/**
 * Where the wearer is in an explanation. Pure state machine, no Android, so JVM tests cover it.
 *
 * [step] == [OVERVIEW] is the result card (label + summary); 0..n-1 are the step cards of [lens].
 */
data class ExplainerState(
    val tracks: List<Track>,
    val lens: Int = 0,
    val step: Int = OVERVIEW,
) {
    init {
        require(tracks.isNotEmpty()) { "an explainer needs at least one track" }
        require(lens in tracks.indices) { "lens out of range" }
        require(step == OVERVIEW || step in track.steps.indices) { "step out of range" }
    }

    val track: Track get() = tracks[lens]
    val isOverview: Boolean get() = step == OVERVIEW
    val isLastStep: Boolean get() = !isOverview && step == track.steps.lastIndex
    val hasNextLens: Boolean get() = lens < tracks.lastIndex
    val nextLensTitle: String? get() = tracks.getOrNull(lens + 1)?.title

    /** "2/4" for step cards, null on the overview. */
    val counter: String? get() = if (isOverview) null else "${step + 1}/${track.steps.size}"

    /** Next step of this lens; stays on the last step. */
    fun next(): ExplainerState = when {
        isOverview -> copy(step = 0)
        isLastStep -> this
        else -> copy(step = step + 1)
    }

    /** Previous step; from step 1 back to the overview. Null from the overview: leave the explainer. */
    fun back(): ExplainerState? = when {
        isOverview -> null
        step == 0 -> copy(step = OVERVIEW)
        else -> copy(step = step - 1)
    }

    /** Previous step, but never leaves the explainer (D-pad up). */
    fun prev(): ExplainerState = back() ?: this

    /**
     * Switch lens by [delta], wrapping (PROTOCOL nav `left`/`right`: "previous / next, wrapping", as the
     * glasses Web App does). A new lens always starts at its step 1. One lens: nothing changes.
     */
    fun switchLens(delta: Int): ExplainerState {
        val target = Math.floorMod(lens + delta, tracks.size)
        return if (target == lens) this else copy(lens = target, step = 0)
    }

    /** What a pinch does: the obvious next thing. */
    fun pinch(): Move = when {
        !isLastStep -> Move.Show(next())
        hasNextLens -> Move.Show(copy(lens = lens + 1, step = 0))
        else -> Move.Again
    }

    sealed class Move {
        data class Show(val state: ExplainerState) : Move()
        /** End of the last lens: take a new photo. */
        data object Again : Move()
    }

    companion object {
        const val OVERVIEW = -1
    }
}
