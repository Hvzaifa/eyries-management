# Phase 0 — Data Audit (done, no code)

Status: **Complete.** Kept here for reference only — Claude Code doesn't need to act on this phase.

Resolved:
- Totals row = simple sum, nothing else.
- "EMD REFUND" sheet discarded as a separate concept — folded into `emd_rounds` as a filtered view.
- Segment field's fixed-list status is unresolved, possibly a data-entry inconsistency in the legacy sheet — see `docs/decisions.md`. Built as free text with autocomplete, not a locked enum.

Proceed to `phase-1-foundation.md`.
