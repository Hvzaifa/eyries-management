import { describe, it, expect } from 'vitest';
import {
  canEditPnr,
  hasUnresolvedBranch,
  pnrBranchFilter,
  isHeadOffice,
  canManageEmd,
  canSplitPnr,
  type AuthUser,
} from './auth';

const hq: AuthUser = {
  id: 'hq', email: 'hq@eyries.local', accountType: 'headoffice',
  branchId: null, branchIds: [], branchName: null,
};

/** A branch whose name matched exactly one row. */
const rwp: AuthUser = {
  id: 'rwp', email: 'rwp@eyries.local', accountType: 'branch',
  branchId: 'rwp-1', branchIds: ['rwp-1'], branchName: 'RAWALPINDI',
};

/** The live shape: one real branch split across case-variant rows by the import. */
const rwpDup: AuthUser = {
  id: 'rwp2', email: 'rwp@eyries.local', accountType: 'branch',
  branchId: 'rwp-upper', branchIds: ['rwp-title', 'rwp-upper'], branchName: 'RAWALPINDI',
};

/** A branch account whose branch_name matches no row at all. */
const orphan: AuthUser = {
  id: 'orphan', email: 'ghost@eyries.local', accountType: 'branch',
  branchId: null, branchIds: [], branchName: 'Atlantis',
};

describe('pnrBranchFilter — the scoping fragment', () => {
  it('lets head office see everything', () => {
    expect(pnrBranchFilter(hq)).toEqual({});
  });

  it('scopes a branch user to every row of their own branch', () => {
    expect(pnrBranchFilter(rwpDup)).toEqual({ branchId: { in: ['rwp-title', 'rwp-upper'] } });
  });

  it('DENIES a branch user whose branch does not resolve', () => {
    // The bug this guards: returning {} here means "no filter", i.e. every PNR
    // in the company. Null forces callers to short-circuit instead.
    expect(pnrBranchFilter(orphan)).toBeNull();
    expect(pnrBranchFilter(orphan)).not.toEqual({});
  });

  it('treats an absent user as unscoped (server-side callers with no session)', () => {
    expect(pnrBranchFilter(undefined)).toEqual({});
  });
});

describe('hasUnresolvedBranch', () => {
  it('is true only for a branch account with no matching branch row', () => {
    expect(hasUnresolvedBranch(orphan)).toBe(true);
    expect(hasUnresolvedBranch(rwp)).toBe(false);
    expect(hasUnresolvedBranch(hq)).toBe(false);
  });
});

describe('canEditPnr', () => {
  it('lets head office edit anything, even after EMDs are issued', () => {
    expect(canEditPnr(hq, 'any-branch', true)).toBe(true);
    expect(canEditPnr(hq, null, true)).toBe(true);
  });

  it('lets a branch user edit its own un-issued booking', () => {
    expect(canEditPnr(rwp, 'rwp-1', false)).toBe(true);
  });

  it('accepts any case-variant row of the same branch', () => {
    expect(canEditPnr(rwpDup, 'rwp-title', false)).toBe(true);
    expect(canEditPnr(rwpDup, 'rwp-upper', false)).toBe(true);
  });

  it('locks the booking once any EMD round exists', () => {
    expect(canEditPnr(rwp, 'rwp-1', true)).toBe(false);
  });

  it("refuses another branch's booking", () => {
    expect(canEditPnr(rwp, 'lhr-1', false)).toBe(false);
  });

  it('refuses a branch user whose branch does not resolve', () => {
    expect(canEditPnr(orphan, 'rwp-1', false)).toBe(false);
  });

  it('refuses an unbranched PNR — null must not match null', () => {
    // Previously `pnrBranchId !== user.branchId` was false when both were null,
    // so an orphan account could edit any PNR that had no branch assigned.
    expect(canEditPnr(orphan, null, false)).toBe(false);
    expect(canEditPnr(rwp, null, false)).toBe(false);
  });
});

describe('head-office-only actions stay head-office-only', () => {
  it('never grants EMD or split rights to a branch account', () => {
    for (const u of [rwp, rwpDup, orphan]) {
      expect(isHeadOffice(u)).toBe(false);
      expect(canManageEmd(u)).toBe(false);
      expect(canSplitPnr(u)).toBe(false);
    }
  });
});
