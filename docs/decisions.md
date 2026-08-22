# Decisions Log

Every time an ambiguous field, rule, or edge case gets resolved — by the project owner, or by asking during a build session — add an entry here. Check this file before assuming the meaning of anything not fully spelled out in `data-model.md` or `business-rules.md`.

---

### 2026-08-21 — Totals row at top of old sheet
**Question:** Does the totals row at the top of the sheet mean anything beyond a sum?
**Answer:** No — it's purely a running total, nothing else. Implemented as a calculated dashboard summary, not stored data.

### 2026-08-21 — "EMD REFUND" sheet
**Question:** Is the second sheet tab a separate system to build?
**Answer:** No. Discarded as a separate concept — the "OB 01JUN26 Onward" sheet (i.e. the main `pnrs` + `emd_rounds` model) is the only thing being replicated. The refund log is just a filtered view of `emd_rounds` where `status = 'refunded'`.

### 2026-08-21 — Duplicate PNR rows with changed values (e.g. same PNR, seats drop from 10 to 0 across two SR# rows)
**Question:** Is this an amendment to the same deal, or a data-entry habit of copying a row forward?
**Answer:** Unresolved — likely a data-entry error in the legacy sheet, not a real business rule. **Do not build logic that assumes duplicate PNR values are meaningful.** Treat `pnr` as a plain field, not a unique key, unless told otherwise. If the new system ever produces a duplicate PNR value, don't silently allow it — surface a warning to the user rather than either blocking it or ignoring it.

### 2026-08-21 — GDS PNR field
**Question:** What is `gds_pnr` for?
**Answer:** Believed to be used when an agent books directly through a GDS (e.g. Travelport) rather than through the company as middleman. Confidence on this is low. Stored as an optional free-text field for now — do not build validation or logic around it until confirmed.

### 2026-08-21 — Segment field (Employment / Umrah / Tour)
**Question:** Is this a fixed list?
**Answer:** Not confirmed — could be a fixed set of categories or could include data-entry inconsistency. Built as free text with autocomplete suggestions from previously used values, **not** a locked dropdown/enum, so it doesn't break if a new or inconsistent value appears. Revisit if the project owner confirms a fixed list later.

---

## Template for new entries

```
### YYYY-MM-DD — <short title>
**Question:** <the ambiguity>
**Answer:** <what was decided, and by whom if relevant>
```
