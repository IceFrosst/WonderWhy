# V04: "Wait, how do these even work?"

**Concept:** The friend's line appears as a caption over the glasses. A hologram of the glasses lifts out of the real pair, explodes into frame, projector, waveguide and Neural Band, and shows the light path in cyan. Then it folds back and lands on the face as the friend puts the real pair on.
**Colour:** grey and cool while they doubt, warm from the moment it explodes. The hologram is the answer, and no second caption is needed.

**Changed after seeing the real clip:** `share_scene_glasses_friend.mp4` has no sceptical face during the turn. At 3-5.5 s the glasses are on the table (hand at the left edge), at 5.5-7.5 s hands turn them in close-up, and at 8-10 s they go on. So the line plays as an off-screen voice over the glasses, and the hologram lands on the face when the pair settles (~10.4 s in the clip).

## Shot list (shot time; clip time = shot + 3.2 s; real speed)
| t (s) | What |
|---|---|
| 0.0-1.5 | Grey: glasses on the table. Caption types in word by word from 0.35 s |
| 0.9-1.4 | Cyan scan line sweeps left to right and reveals a hologram matched to the real pair |
| 1.25-2.35 | Hologram lifts and shrinks to centre while the 16:9 window pans up with the hands |
| 2.2-3.3 | Explodes in stagger order. Warmth comes in (1.6-3.3). Caption out at 2.7 |
| 2.9-3.65 | Labels in: Frame, Projector, Waveguide, Neural Band (each with a sub-line) |
| 3.3-5.0 | Cyan light path: projector, in-grating, zig-zag in the waveguide, out to the eye. Photons run along it. Small print on |
| 5.0-6.35 | Beam off, labels out, parts fold back (5.45-6.35) and the model turns to the face angle |
| 7.25 | Lands on the real glasses on the face: thin ring, hologram gone by 7.4 |
| 7.4-8.0 | Wearing them, warm |

## PC session must tune
| What | Where | Note |
|---|---|---|
| Opening match on the table (t 0-1.25) | `anchor[0..1]` x, y, w, rot, yaw, pitch | Close on the proxy; the real right lens is bigger (perspective) |
| Landing on the face (t 7.25) | `anchor[4..5]` and `ring.dx/dy` | **Top item.** Shifted +110 px down after the last still and not re-checked; the head moves fast here |
| Landing time | `times.land`, `times.out`, `anchor[4].t` | Should be when the real pair stops moving |
| Exploded hold position | `anchor[2..3]` | Sits over the hands; fine on the proxy |
| Crop and pan | `footage.plate.vf` (relative `crop`, y pans from 27% to 15% of height over t 1.5-3.4) | Uses the ffmpeg `t` variable; keep `-ss` input seek |
| In-point | `footage.plate.in` = 3.2 | Clip 3.0 is a cut in IceFrost's edit; don't go earlier |
| Caption timing | `caption.in`, `wordStep` | Check where the line really is in the audio (if it's in this clip at all) |
| Model look | `holo.zoom`, `holo.target`, `holo.yaw/pitch` | Base camera; anchor yaw/pitch add to it |

## Cues
| t | Sound |
|---|---|
| 0.0 | Clip audio / the friend's line |
| 0.9 | Soft scanner sweep with the scan line |
| 2.2 | Quiet glass chimes as the parts fly out |
| 3.3 | Thin rising tone with the light path |
| 5.45 | Reverse whoosh on the fold |
| 7.25 | One soft click on landing (the app's click); music lifts |

## Unsure
- The real pair is the Meta Ray-Ban Display, but the model is our generic `glasses` object. The labels stay generic ("Projector", "Waveguide") and don't claim specs.
- The Neural Band floats under the exploded glasses, but the friend wears a real band (visible on the wrist at about 5.6 s). It could fly to the wrist instead (not built).
- The hologram is 2.5x supersampled. At the opening (w ~2450 px) the lines are soft. This is OK as a ghost, but check it on the 4K render.
- The engine beam's pulse phase is stretched in the hold so it fades out without a jump. Watch 5.0-5.3 s in the full render.
- Stills checked on the 1080x1920 proxy: 0.6, 1.2, 1.3, 2.0, 3.0, 3.8, 4.3, 5.6, 6.15, 6.4, 7.25.
