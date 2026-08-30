# Ideas parking lot

Good ideas that are NOT in SPEC.md for V1. Logged here instead of built.

- Custom sending domain for Resend so sign-in emails never land in spam
  (needs a ~$10/yr domain — do before real coaches sign up; Phase 6 adjacent).
- Full "cinematic dark" theme exploration (CapCut-style) — revisit after V1
  ships; current pass keeps the warm paper look but adds depth/glass/motion.
- Re-record voice memo from a settings screen (currently the Today card
  disappears once recorded).
- Live trend awareness ("what's viral right now"): needs a trend data feed or
  periodic research pass — V2. Current mitigation: proven structural patterns
  encoded in the compose prompt.
- Real Instagram profile scraping at onboarding (V1 stores the handle only,
  per SPEC) so the writer can learn from the coach's existing top posts.
- Stricter nonce-based Content-Security-Policy: the Phase 1.4 CSP allows
  'unsafe-inline'/'unsafe-eval' for scripts because Next.js and the app's
  inline `style` attributes need it. A per-request nonce (via proxy.ts) would
  let us drop those and tighten script-src — hardening before wide launch.
- Per-content-piece "render failed" state: today a failed render leaves a
  piece on the "Finishing edit…" overlay (session still shows failed). An
  explicit failed badge on the piece would make it unambiguous.

## From Jack's Phase 3 baseline review (all Phase C — do NOT build in Phase 3)

- **Per-kind caption typography.** Every piece currently burns the same font,
  size, and placement, so a pack looks visually identical even when the content
  differs. Jack: "always the same style of lettering — maybe if it's hype have a
  different font." Give each piece kind its own type treatment (hype = heavy
  condensed/impact, teaching = clean readable, story = softer) so the pack looks
  as varied as it reads.
- **Cuts that land on the movement.** Jack: "we can work a lot on transitions
  and when it cuts — knowing when they do an exercise or a move." Cuts should
  land on the actual rep/impact/landing, not arbitrary timestamps. (Phase 3
  item 7's motion-adaptive sampling is the perception half of this; the
  cut-placement half is the Phase C rhythm engine.)
- **Transition variety tied to piece kind** — hype gets hard cuts on impact,
  story gets softer dissolves.
