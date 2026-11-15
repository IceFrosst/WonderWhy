# AR renders (desktop, 14 Nov)

## Picks (ready to drop into the film)
| Scene | File | What we keep from it |
|---|---|---|
| Printer | [V02.mp4](V02.mp4) | The transition: the scan line rises up the printer and the hologram locks onto the real Core One, then the head explodes towards camera |
| Printer | [V09.mp4](V09.mp4) | The spacing: the fixed display panel right of centre, clear of the printer, with the app's real caption (the honest look) |
| Glasses (share scene) | [V04.mp4](V04.mp4) | The 3D glasses lifting out of the friend's hands and exploding into Frame, Projector, Waveguide, Neural Band. Already in the rough cut (shot s17) |
| Intro → grey grass | [R_B3_match.mp4](R_B3_match.mp4), [intro_match.mp4](intro_match.mp4) | The team intro with its end camera matched to the man in `A001_11141516_C098 2.MOV` @ 7.0 s, and the 10.6 s transition with sound |

Both printer versions are a bit zoomed in (a 16:9 window of portrait footage). The printer scene in the rough cut is still a placeholder box.

1920x1080, 30 fps, H.264 CRF 17, silent. Rendered on the desktop PC (RTX 3060 Ti, WebGL through Chrome on D3D11) from 2160x3840 SDR footage built by `lib/prepare_footage.sh`. Each `V<nn>_sheet.png` shows 8 frames at the `config.sheet` times.

| Version | Length | Render time | Size | Tuned |
|---|---|---|---|---|
| V01 Printer prints its own hologram | 7.3 s | 53 s | 14 MB | Nothing. The base stays on the bed's front edge through the push-in (checked 1.9-4.0 s) |
| V02 X-ray peel | 7.0 s | 62 s | 12 MB | Nothing. The spool and bed line up with the real printer at 2.47-3.3 s |
| V03 Over the shoulder | 7.0 s | 70 s | 14 MB | Nothing |
| V04 Glasses explode out of the friend's hands | 8.0 s | 56 s | 15 MB | Landing at 7.25-8.0 s: x 1610 to 1690, w 2000 to 1900, yaw 35 to 52, so the ghost matches the real pair on his face (it was wider and to the left) |
| V05 Colour spreads from the lenses | 7.0 s | 41 s | 9 MB | Nothing. The lens rings sit on the glasses at 2.5-2.8 s. The colour that comes back is very blue/purple (as NOTES says) |
| V06 Grey world, colour behind the lines | 6.8 s | 53 s | 8 MB | Nothing |
| V07 Earbuds and the anti-noise trick | 7.5 s | 27 s | 26 MB | Nothing. The ring lands on the real earbud at 1.5-2.0 s |
| V08 Notebook margins | 8.0 s | 26 s | 13 MB | The "the display is a tiny projector" note: dy -320 to -255. Its first line was cut off by the top of the frame |
| V09 Through the glasses | 8.0 s | 28 s | 12 MB | Nothing |
| V10 Beat montage | 8.4 s | 32 s | 20 MB | Nothing |

Render times are wall clock, including the footage frame extraction. Later versions ran faster because the footage encode had finished.

Also fixed: `lib/prepare_footage.sh` missed HDR on Windows. ffprobe there prints `bt709,` plus a carriage return, so the HLG iPhone clips (IMG_55xx) were never tone mapped. It now strips both, and writes to a temporary name first so an interrupted run can't leave a half file that the next run skips.
