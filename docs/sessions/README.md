# Session notes

Narrative write-ups of past working sessions. **These are secondary.** The
primary record is:

- [`../../PROGRESS.md`](../../PROGRESS.md) — *what* was built, step by step
- [`../decisions.md`](../decisions.md) — *why* it was built that way

Read a session note only when you need the story around a change that those two
files summarise too tersely. Nothing here is authoritative; where a session note
and `decisions.md` disagree, **`decisions.md` wins** — it is maintained, these
are snapshots.

## Notes

| Date | Session | Covers |
|---|---|---|
| 2026-09-01 | [Phase 3 & 4 refinements](2026-09-01-phase-3-4-refinements.md) | Bulk EMD refunds, per-round license tracking, batch airline emails, EMD-number validation |

## Convention for new notes

Name them `YYYY-MM-DD-short-topic.md` and keep them to what a future reader needs:
what the session set out to do, what was decided and why, what changed, and what
was left open. A session note is a summary, not a transcript.

Every decision worth keeping belongs in `decisions.md` as well — a note is not a
substitute for that, because nobody searches session notes for a rule.

## Removed: the raw transcripts

Three raw AI session transcripts from the Phase 1–2 build (~12,000 lines of model
thinking and tool calls) used to live here. They were removed on 2026-09-07.

Before removing them, all 15 owner instructions they contained were checked
against [`../decisions.md`](../decisions.md) and every one was already recorded
there — the SV-only EMD policy, the umrah-only scope, sheet immutability, the
completed and cancelled status rules, the one-day-early date bug (`8K7FGY`), and
the future-deadlines-only alert rule.

They remain in git history if ever needed:

```bash
git show 5798601:docs/session-files/session-1.md > /tmp/session-1.md
```
