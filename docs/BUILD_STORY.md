# How we built it, and how much we tested

[← README](../README.md) · [Use case](USE_CASE.md) · [Architecture](ARCHITECTURE.md) · [UX, accessibility and trust](UX_ACCESSIBILITY_TRUST.md) · [Testing](TESTING.md)

This page records the effort behind WonderWhy. It separates three kinds of statement so you can weigh them:

| Label | Meaning |
|---|---|
| **Verified in the repo** | You can check it yourself in git history, test files or the linked documents |
| **Team account** | Said by the team; the repo cannot prove it |
| **Owner-reported** | Said by the project owner about the loaner glasses; the repo backs it only where we say so |

## The claim

**Team account (not verifiable here):** Meta staff were not sure this could be pulled off on Ray-Ban Display glasses: a Web App with live 3D line rendering, driven by Neural Band input. We found a way and built it. We ran far more tests and real-device runs than other teams, and we had the loaner glasses in three separate sessions, building from very early morning to very late night.

We cannot show you what Meta staff said, and we have no data on other teams' testing, so those two parts stay a team account. The rest of this page is the evidence we *can* show.

## Why it was not obvious (verified in the repo)

| Constraint | Where it is recorded |
|---|---|
| A Display Web App gets **no camera**, so the photo must be taken by an Android app through the Device Access Toolkit, and the drawing must be made in the Web App. The two cannot run at once on the glasses, so we built a bridge between them (HTTP and WebSocket, with a replay of the last result for a handover) | [README, Known limitations "Platform"](../README.md#known-limitations), [ARCHITECTURE](ARCHITECTURE.md), [Booth_Questions "What the simulators can answer"](../Meta_Challenge/team-notes/Booth_Questions.md) (toolkit and Web App at the same time: "No ... test on real glasses") |
| The display is 600 × 600 and additive: black is see-through, so only bright lines can be drawn | [DESIGN.md](../Meta_Challenge/app/shared/DESIGN.md), [3D screen spec](../Meta_Challenge/app/glasses/docs/3d-screen.md) |
| Live 3D line rendering inside a Web App: a three.js renderer with a 3D model schema, an "Inspect" view you can turn with the Band, a WebGL-loss fallback to 72-angle sheets, and a first load under Meta's size gate | [MODEL3D.md](../Meta_Challenge/app/shared/MODEL3D.md), [Design_Handoff "Baseline to compare against"](../Meta_Challenge/Design_Handoff.md#baseline-to-compare-against) |
| Neural Band input behaves differently from the docs: on the real glasses a pinch arrives as a short `Drag DOWN → UP` followed by `Select`, so the Android app treats a short drag as a pinch | [Loaner_Test "Evidence captured on November 14"](../Meta_Challenge/team-notes/Loaner_Test.md), commit `11:20` on 14 Nov in the table below |

## Effort in numbers (verified in the repo)

All figures below are for the history in **this** repository, which was extracted from the team repo and keeps only the Meta glasses project paths. Work that stayed in the team repo (research, other tracks) is not counted, so these are lower bounds for the team's total. Counts are up to and including sync commit [`1f65d04`](https://github.com/IceFrosst/WonderWhy/commit/1f65d04). Times are Helsinki time (UTC+2); the commits carry mixed time zones, so we converted them.

### Commits

| Day | Commits | First | Last | Of which between 00:00 and 05:59 |
|---|---|---|---|---|
| Fri 13 Nov | 10 | 22:37 | 23:55 | 0 |
| Sat 14 Nov | 142 | 00:02 | 23:52 | 62 |
| Sun 15 Nov (to the sync) | 33 | 00:08 | 08:03 | 22 |
| **Total** | **185** | | | **84** |

| Author name in git | 13 Nov | 14 Nov | 15 Nov | Total |
|---|---|---|---|---|
| IceFrost | 10 | 44 | 24 | 78 |
| Alexander | 0 | 72 | 9 | 81 |
| mrnetwork0001 | 0 | 24 | 0 | 24 |
| Merge commits ("Merge preview") | 0 | 2 | 0 | 2 |

Git records these as author names; the [team table](../README.md#team) lists three people, and git does not tell us how the names map to them.

Between the first commit (13 Nov 22:37) and the sync (15 Nov 08:03), **32 of the 35 clock hours had at least one commit**. The three empty hours were 14 Nov 06:xx, 15:xx and 20:xx. Commit times show when work was saved, not how long anyone worked, so we do not turn them into person-hours.

### Tests and checks

| What | Count | Evidence |
|---|---|---|
| Bridge tests (Node test runner) | **101** in 11 files, all pass; re-run for this page (`npm ci && npm test`) | [bridge/test](../Meta_Challenge/app/bridge/test), [TESTING](TESTING.md#bridge-tests-metachallengeappbridgetest) |
| Android JVM tests | **172** `@Test`s in 21 files; 172 passed on 14 Nov per the Android README (not re-run for this page: needs JDK 17 and the Android SDK) | [android tests](../Meta_Challenge/app/android/app/src/test/java/com/junction2026/lens), [Android README](../Meta_Challenge/app/android/README.md) |
| Glasses state and scene captures (headless Chrome, 600 × 600) | **182** (47 named states and 135 lens/scene steps), all OK in the report of 14 Nov 20:11 UTC (not re-run for this page: needs Playwright browsers). The [Design_Handoff](../Meta_Challenge/Design_Handoff.md#baseline-to-compare-against) notes that an earlier, expanded run had failures in the home/demo scripts and was stopped | [glasses docs report](../Meta_Challenge/app/glasses/docs/README.md) |
| Glasses build | Type-check and production build pass (run for this page) | [TESTING](TESTING.md) |
| Screenshots of every state | 182 glasses state files, 136 Android emulator screens | [`glasses/docs/states`](../Meta_Challenge/app/glasses/docs/states), [`android/docs/screens`](../Meta_Challenge/app/android/docs/screens) |

That is **101 + 172 + 182 = 455** automated checks. We have no count of other teams' tests, so we make no comparison in numbers.

### What was built

| What | Count | Where |
|---|---|---|
| Library objects | 12 | [`objects.json`](../Meta_Challenge/app/shared/objects.json) |
| Lens chapters in the library | 44, across 8 lens kinds (Motion, Inside, Cutaway, Zoom, What if, Compare, Flow, The number) | same |
| Pre-rendered media in the bridge | 374 tracked files: 284 PNG stills, 74 MP4 clips, 15 JSON files (manifests and label tracks); 8 objects with films | [`bridge/media`](../Meta_Challenge/app/bridge/media) |
| Authored 3D specs | 7 Explore specs and 6 live 3D specs (Python) | [`render3d/specs`](../Meta_Challenge/app/render3d/specs) |
| Languages | English plus five machine-translated (not native-reviewed) | [i18n](../Meta_Challenge/app/shared/i18n/README.md) |
| Filmed real objects | 5 raw clips (printers, sauna, air bike, a share scene) | [`DemoVideos/Objects`](../DemoVideos/Objects/README.md) |

## Real-device sessions

What the repo documents, with dates:

| When | What it shows | Evidence |
|---|---|---|
| **Sat 14 Nov**, loaner session | Band pinch → real glasses photo → Android → Gemini → display worked in one run (photo to phone 5,594 ms, phone recognised at 99%); other runs lost Bluetooth right after the photo; the wearer reported 1,133 ms to kettle film motion and 1,546 ms to Inspect in one run; the glasses microphone transcribed a spoken follow-up; "Hey Meta" answered aloud without opening the visual; the wearer reported Ask opened the phone visual. Some findings were fixed the same day (see the commits below) | [Design_Handoff "What the loaner established"](../Meta_Challenge/Design_Handoff.md#what-the-loaner-established), [Loaner_Test](../Meta_Challenge/team-notes/Loaner_Test.md) |
| Sat 14 Nov, 10:29 | Commit: the bridge now accepts `"question": null` on `/detect` because "real glasses got 400 bad_request" | git history |
| Sat 14 Nov, 11:20 | Commit: a short Band drag counts as a pinch, a sideways drag as a swipe, "real glasses send Drag, not Select" | git history |
| Sat 14 Nov, 18:25 | Commit "loaner session checkpoint": kettle Inspect live 3D, Home from films, Web App capture relay, native clip playback, loaner results and design handoff | git history, [Design_Handoff](../Meta_Challenge/Design_Handoff.md) |

**Owner-reported, only partly backed by the repo:** we had the loaner glasses in **three separate sessions**, working from very early morning to very late night. The repo documents **one** session explicitly (14 Nov, "Loaner session complete" in the Design_Handoff) and holds a checklist for "the next checkout" ([Loaner_Test](../Meta_Challenge/team-notes/Loaner_Test.md), [Test_Now](../Meta_Challenge/team-notes/Test_Now.md)). The commit messages above show glasses-driven fixes around 10:29 to 11:20 and at 18:25 on 14 Nov, but git cannot show session boundaries or how many sessions there were. We therefore give the three sessions as the owner's account.

What we did **not** establish on hardware (so we do not claim it): continuous drag, frame rate and long sessions on the glasses, audio routing, native MP4 playback, and a repeatable end-to-end run across both experiences ([README, Known limitations](../README.md#known-limitations)).

## Since the loaner day

Work after 14 Nov that the repo does show:

| Change | Evidence |
|---|---|
| Five more library objects (12 in total), live 3D specs for six objects | [USE_CASE "Content authoring"](USE_CASE.md#content-authoring-per-object) |
| Live deployment on a droplet, rate limit, open judging mode, emulator start screen with a privacy notice | [deploy README](../Meta_Challenge/app/deploy/README.md), [UX and trust](UX_ACCESSIBILITY_TRUST.md#consent-and-data) |
| Objects outside the library get a live 3D explanation generated by `gemini-4-carbon` in about a minute (57 s measured) | [bridge README](../Meta_Challenge/app/bridge/README.md), [PROTOCOL](../Meta_Challenge/app/shared/PROTOCOL.md) |
| Sync of the final app code from the team repo: consent copy and WonderWhy name on the glasses, per-IP rate limit, `SKETCH_MODEL`, 16,000-token sketch budget, 8 more bridge tests | commit `1f65d04` |
