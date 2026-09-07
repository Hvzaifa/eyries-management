# Phase 3 — Payments, Refunds, and Airline Emails

## Step 1 — Auto-create Round 2 & Manual addition
- On PNR creation, automatically create both EMD Round 1 and EMD Round 2 (using the SV percentage/deadline policy).
- Provide a button on the PNR detail page to manually create a 3rd or 4th `emd_rounds` entry. No payment proof uploads required.
- Deliverable: can create a new SV Umrah PNR and see two rounds automatically created, and can manually add a third round.

## Step 2 — Refund recording
- On an `emd_rounds` row, allow setting `status = 'refunded'` with `refund_amount` and `refund_date`.
- Deliverable: refunding a round updates its status and the change appears in `activity_log`.

## Step 3 — Refund log view
- A filtered list view using the `refunded_emd_rounds` SQL view (already defined in `db/schema.sql`) — do not build a separate table for this.
- Deliverable: refunded rounds appear in this view and nowhere else duplicated.

## Step 4 — Airline email templates
- Two templates: (a) deposit confirmation + extension request, (b) generic notice. Pre-filled from PNR/round data, editable before sending, sent via Resend.
- Every sent email is logged against the PNR (subject, body, timestamp, recipient).
- **Sending always requires a human click.** Do not build automatic sending in this phase.
- Deliverable: from a PNR detail page, generate a pre-filled email, edit it, send it, and see it logged.
