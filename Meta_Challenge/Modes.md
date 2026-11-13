---
tags:
  - type/design
  - topic/junction-2026
updated: 2026-11-14
---

# Explanation modes ("lenses")

> [!summary]
> One object, several lenses. Each lens answers a different question. Swipe to change lens, pinch to go deeper. Decided 14 Nov; "Predict first", "Hear it" and "Do it" were dropped.

| # | Lens | Question it answers | Example | State |
|---|---|---|---|---|
| 1 | **Motion** | How does it move or work? | Guitar string wave, ball path | Built (5 scenes, branch `meta-app`) |
| 2 | **Inside** | What is it made of? | Phone pulls apart into 9 named layers | Built for the phone |
| 3 | **Cutaway** | What happens inside while it runs? | Kettle sliced open: element, water circulating, the switch that clicks off | To do, medium |
| 4 | **Follow the flow** | Where does the energy, water or signal come from and go? | Socket → cable → charger → battery, losses shown as heat | To do, low |
| 5 | **Zoom** | Why does the material behave like this? | Metal spoon → crystal grid → atoms passing heat ("why it feels cold") | To do, medium |
| 6 | **What if** | What changes if I change one thing? | The same throw on the Moon; a string twice as long | Low: scenes already have live controls |
| 7 | **Compare** | Why is this one different from that one? | Rubber ball against steel ball | Low: the bounce scene does this |
| 8 | **The number** | How much, how fast, how costly? | "Boiling this kettle: 0.1 kWh, about 2 cents, 2 minutes" | To do, low |

## Build notes
- Draw every lens from a small data file (like the exploded view), not hand-written code. For a new object the AI then only fills in data: parts, layers, flow steps, numbers.
- Lenses made of steps (Inside, Flow, Compare, The number) also work as still images, which matters if we end up on the phone-app-only route.
