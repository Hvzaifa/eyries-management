# Phase 4 — Parent/Child Seat Splitting

## Step 1 — Split screen
- From a parent PNR's detail page, an action to allocate N seats to a new child PNR (creates a new `pnrs` row with `parent_pnr_id` set, plus an `allocations` row).
- Must validate that N does not exceed currently unallocated seats on the parent — calculate this from existing `allocations` rows, never trust a manually typed "remaining" number.
- Deliverable: splitting a 90-seat PNR into a 30-seat child leaves the parent correctly showing 60 unallocated, verified against the `allocations` table, not a stored field.

## Step 2 — Parent/child navigation
- On both parent and child detail pages, show links to the other side of the relationship (parent shows all children; child shows its parent).
- Deliverable: can navigate from parent to any child and back.
