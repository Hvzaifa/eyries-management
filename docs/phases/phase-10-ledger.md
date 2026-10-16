# Phase 10 — The group-booking ledger

**Status: draft, awaiting owner sign-off.** Nothing here is built. It's built
after Phase 9, which adds the forfeited status, the penalties and the
cancellation this ledger posts from.

Goal: the portal keeps its own ledger of group-booking money. It replaces the
company's accounting software **for group bookings only** (`decisions.md`,
2026-10-13 C2 and 2026-10-14).

This reverses the business-rules statement "no reconciliation in v1" and the
`architecture.md` limit on automatic financial actions. The step that builds
the ledger must amend both documents in the same change.

---

## The entries

These are the only entries the ledger holds (owner, 2026-10-14). Payments to
IATA, agent payments and agent paybacks are **not** posted.

| Event | Debit | Credit | Amount |
|---|---|---|---|
| 1. EMD issued | Advances to Airlines (EMDs): that airline | Payable to Airlines: the round's license | `emd_amount` |
| 2. EMD refunded | Payable to Airlines: the round's license | Advances to Airlines (EMDs): that airline | `refund_amount` |
| 2a. Refund short of the EMD | Loss (PSF): agents and company, **split by share of the seats** | Advances to Airlines (EMDs): that airline | `emd_amount − refund_amount` |
| 3. Penalty, on a cancellation or for unissued seats | Loss (PSF): the agent, or the company | Payable to Airlines: the license the **penalty EMD** was issued against, chosen by staff | the penalty entered |
| 4A. Cancellation, refunded | as entry 2 | | |
| 4B. Cancellation, written off | Loss (PSF): agents and company, **split by share of the seats** | Advances to Airlines (EMDs): that airline | the forfeited amount |

**Accounts** are created from the lookup tables, so a new license, airline or
agent gets its account automatically:
- Payable to Airlines: one per license (the licenses dropdown);
- Advances to Airlines (EMDs): one per airline;
- Loss (PSF): one per agent, plus the company.

**Cancellation:** staff choose 4A (the forfeited EMDs are refunded after the
penalty) or 4B (they're never refunded and become a loss).

---

## Step 1 — Accounts, entries and posting

- New tables for accounts and journal entries, with each entry's lines. Names
  and fields are to be proposed for approval (rule 3).
- New `src/lib/ledger.ts`, pure and unit-tested (rule 4):
  - every entry balances, debits equal credits to the paisa;
  - amounts are summed in whole paisa, as `sumMoney()` does.
- Posting happens **in the same transaction** as the event that causes it:
  issuing, refunding, entering a penalty, and choosing 4A or 4B. If the entry
  fails, the event doesn't happen.
- **Corrections edit the original entry** (owner, 2026-10-14). The old values
  go to `activity_log` in the same transaction, and an edited entry must still
  balance.
- Deliverable: issuing, refunding and penalising a test booking posts the three
  entries, and the account balances match by hand.

## Step 2 — Opening entries for existing EMDs

- A dry-run-by-default script posts entry 1 for every existing issued round,
  and entries 1 and 2 for every refunded one, dated on the round's own issue
  and refund dates.
- It's a production write: back up first and get the owner's go-ahead
  (`operations.md`).
- Rounds with no license, amount or refund date are **refused and listed**.
  The owner fixes them by hand, and the script is re-run. It never fills a gap
  itself.
- Deliverable: each airline's Advances balance equals the EMD value it
  currently holds, as the dashboard shows it.

## Step 3 — Reports

- **Journal:** every entry, filterable by date, account and PNR.
- **Account balances:** per account, as at a chosen date.
- **Excel export** of both.
- **Head Office only.** A branch sees the entries for its own PNRs on each
  PNR's page, and nothing else.
- Deliverable: the owner can reconcile one airline's Advances account and one
  license's Payable account against the existing EMD records.

---

## Sign-off

Every question raised while drafting was answered on 2026-10-14 (`decisions.md`).
This file is ready for the owner's sign-off.

**Field this phase needs from Phase 9:** each penalty amount
(`agent_assignments.penalty_amount`, `ticketing.company_penalty_amount`) needs a
matching license field for the penalty EMD. Phase 9 Step 4 should add them with
the amounts, so penalties are never entered without one.
