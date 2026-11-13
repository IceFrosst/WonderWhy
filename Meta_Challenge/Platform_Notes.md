---
tags:
  - type/notes
  - topic/junction-2026
updated: 2026-11-13
---

# Meta glasses platform notes (read from Meta's docs and repos, 13 Nov)

> [!summary]
> There are two ways to build. **Web App** = what runs on the Display (WebGL animations, no camera). **Device Access Toolkit (DAT)** = a phone app that gets the camera and mic and can also show simple content on the Display. Our explanation mode probably needs both.

## Links from the Meta channel
- Docs: https://wearables.developer.meta.com
- Display simulator (Chrome extension): https://chromewebstore.google.com/detail/jpjlmmodokemlepklkdbimceggpbjcll
- DAT getting started: https://wearables.developer.meta.com/docs/develop/dat/getting-started-toolkit
- Web Apps: https://wearables.developer.meta.com/docs/develop/webapps
- UI toolkit: https://wearables.developer.meta.com/docs/develop/webapps/design/getting-started/what-is-the-toolkit/
- Repos: [webapp](https://github.com/meta/meta-wearables-webapp), [DAT iOS](https://github.com/meta/meta-wearables-dat-ios), [DAT Android](https://github.com/meta/meta-wearables-dat-android). Each has an `AGENTS.md` with guidance for coding agents.

## Web App (runs on the Ray-Ban Display only)
| Point | Fact |
|---|---|
| Screen | **600x600**, 30 fps panel (33 ms per frame). **Additive display: black = see-through**, bright colours glow over the real world |
| Graphics | **WebGL canvas (Three.js) is allowed**, so live physics animations work. Text must be DOM, not WebGL |
| Limits | JS < 500 KB gzipped, memory < 128 MB, text >= 16 px |
| Input | Neural Band pinch, drag and D-pad swipes. Voice or handwriting text input. Motion, orientation, compass, steps, GPS |
| Camera | **None** |
| Network | Normal REST, WebSocket and storage |
| Hosting | Must be a public **HTTPS** URL (Vercel, Netlify, Cloudflare and similar). Installed by looking at a QR code with the glasses |
| Setup | Meta AI app v272+, glasses v125+, Developer Mode (tap the app version 5 times) |

## Device Access Toolkit (phone app, iOS 17.2+ or Android 10+)
| Point | Fact |
|---|---|
| Camera stream | 360x640 (LOW), 504x896 (MEDIUM), 720x1280 (HIGH). **2, 7, 15, 24 or 30 fps.** Over Bluetooth; lower settings give cleaner frames |
| Photo | High-quality capture on demand (`camera.photo`). It competes with the stream, so stop the stream first |
| Mic | Audio streaming (experimental), 48 kHz PCM |
| Display | `mwdat-display` can show **text, icons, buttons, images (by HTTPS URL) and video playback (by URL)**. No custom drawing |
| Errors to handle | `BATTERY_LOW`, `THERMAL_HOT`, `THERMAL_EMERGENCY`, `PEAK_POWER_LIMIT`, `TIMEOUT` |
| Build | iOS needs a Mac with Xcode 26.4+. Android works from Linux (Android Studio, Kotlin 2.2+) |
| Testing | Mock Device Kit simulates glasses without hardware |
| Registration | App ID and client token from the Wearables Developer Center. Developer Mode works without review |

## What this means for explanation mode
| Option | How | Verdict |
|---|---|---|
| **A. Hybrid (best)** | DAT phone app: tap or voice → photo + question → backend (Gemini/Opus) → animation sent over WebSocket to the **Web App**, which draws it live in WebGL | Real interactive animations. Two apps |
| **B. DAT only (bare bones)** | DAT phone app does everything. Backend renders the animation **to a video** and the Display plays it from a URL | One app, simplest. Rendering video adds seconds |
| C. Web App only | No camera, so the user would have to describe the object by voice | Loses the point |

**Bare-bones plan: start with B for a working demo, move to A if time allows.**

Design tip: the display adds light, so draw on **black backgrounds with bright lines**. Animations look like they float over the real object.

## Questions for the Meta booth (updated)
1. Can a DAT phone app and a Web App run **at the same time** (DAT camera plus Web App on the Display)?
2. Real-world delay of a DAT photo capture → phone, and of a video URL starting on the Display?
3. Can we keep a Display pair plus Neural Band overnight?
4. Wearables Developer Center: does each of us need an account, or can one team app ID be shared?

## Hardware checkout problems (from the Meta channel)
- Device registered to another account? Factory reset: [glasses](https://www.meta.com/en-gb/help/ai-glasses/814846737027479/), [Neural Band](https://www.meta.com/en-gb/help/ai-glasses/1481163499576351/)
- Can't pair? [Glasses](https://www.meta.com/en-gb/help/ai-glasses/852077233025627/), [Neural Band](https://www.meta.com/en-gb/help/ai-glasses/770840295349358/)
