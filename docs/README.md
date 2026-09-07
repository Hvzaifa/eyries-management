# Documentation

**Start here.** This index defines what to read, in what order, and what each
document is authoritative for.

---

## Read before writing any code

These four are not optional. The rules in them are the difference between a
correct booking and a wrong payment, and most of them were learned the hard way —
each one exists because something went wrong once.

| # | Document | Authoritative for | Read when |
|---|---|---|---|
| 1 | [`../PROGRESS.md`](../PROGRESS.md) | **Where the build actually is.** The current phase and step, and every step already completed | Every session, first thing |
| 2 | [`business-rules.md`](business-rules.md) | **The money and date logic.** EMD percentage bands, deadline derivation, refunds, statuses, parent/child splits | Before touching anything financial or date-related |
| 3 | [`data-model.md`](data-model.md) | **What every field means.** The confirmed field list — nothing outside it may become a column | Before adding or interpreting any field |
| 4 | [`decisions.md`](decisions.md) | **Why things are the way they are.** 70+ resolved ambiguities, superseded rules, and the bugs behind them | Before assuming the meaning of anything |

> **`decisions.md` outranks your intuition.** If a rule seems wrong or missing,
> search that file before changing behaviour — several "obvious improvements"
> have already been tried, reverted, and written up there.

## Read when the task calls for it

| Document | Covers |
|---|---|
| [`architecture.md`](architecture.md) | Tech stack, system diagram, and what is explicitly out of scope. **Locked** — do not change the stack without asking |
| [`operations.md`](operations.md) | Running the thing: scripts, database changes, backups, the daily cron, security posture |
| [`phases/`](phases/README.md) | The build plan, one file per phase, broken into numbered steps |
| [`reference/`](reference/README.md) | Findings that inform work without governing it (e.g. AI parsing behaviour per airline) |
| [`sessions/`](sessions/README.md) | Narrative notes from past working sessions (secondary — `PROGRESS.md` and `decisions.md` are the primary record) |

---

## The four rules that matter most

Restated from [`../CLAUDE.md`](../CLAUDE.md), because they are the ones most
often broken:

1. **One step per session.** Build exactly the step `PROGRESS.md` names. Do not
   run ahead to the next step or phase.
2. **Never guess business logic.** If a money or date rule is not written in
   `business-rules.md` or `decisions.md`, stop and ask. A wrong guess here costs
   real money.
3. **Never invent a database field.** Only what `data-model.md` lists exists.
4. **Log every resolved ambiguity** as a new entry in `decisions.md` — don't just
   act on a clarification and move on.

## Where each kind of fact belongs

Keeping these separate is what stops the documentation drifting:

- A **rule** the business follows → `business-rules.md`
- A **field's meaning** → `data-model.md`
- A **question that got answered**, or a bug and its cause → `decisions.md`
- **How to run something** → `operations.md`
- **Which step is done** → `PROGRESS.md`

The runnable source of truth for database *types* is [`../db/schema.sql`](../db/schema.sql);
`data-model.md` is the source of truth for what those types *mean*.
