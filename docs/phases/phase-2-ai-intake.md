# Phase 2 — AI Paste-and-Parse Intake

Goal: replace manual typing of airline messages with paste → AI draft → human confirms → save.

## Step 1 — Parsing endpoint
- Build a server-side function that sends pasted text to the Claude API and returns structured fields matching `pnrs` and the first `emd_rounds` entry.
- The model must return a **confidence flag per field**, not just values — this is required, not optional, since it drives the review UI in Step 2.
- The AI only extracts and structures text. It never decides which fields are correct, never writes to the database directly, and never calculates deadlines or percentages — those remain plain code from Phase 1.
- Deliverable: given a sample airline message, the endpoint returns a structured JSON draft with per-field confidence.

## Step 2 — Review screen
- Paste box → draft form pre-filled from Step 1, with low-confidence fields visually flagged.
- Staff member reviews, corrects if needed, and only then clicks Save — this writes through the same save path as the manual form from Phase 1 Step 5 (do not build a second, separate save path).
- The original pasted text is stored alongside the PNR for later reference.
- Deliverable: pasting a real message produces an editable draft; saving creates a real PNR identical in structure to one created manually.

## Step 3 — Real-world testing
- Test against at least 10 real (anonymized) airline messages from different airlines/formats before considering this phase done.
- Log parsing failures or consistently-wrong fields in `docs/decisions.md` so future prompt adjustments are informed by real cases, not guesses.
- Deliverable: a short written note (in `docs/decisions.md` or a new `docs/parsing-notes.md`) on which airline formats parse well and which need manual entry as a fallback.
