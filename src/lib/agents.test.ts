import { describe, expect, it } from 'vitest';
import {
  agentNameKey,
  agentVisibilityFilter,
  canEditAgent,
  parseContactEmails,
  validateAgent,
  type AgentInput,
} from './agents';
import type { AuthUser } from './auth';

const hq: AuthUser = {
  id: 'u1',
  email: 'hq@example.com',
  accountType: 'headoffice',
  branchId: null,
  branchIds: [],
  branchName: null,
};

const branch = (branchIds: string[]): AuthUser => ({
  id: 'u2',
  email: 'rwp@example.com',
  accountType: 'branch',
  branchId: branchIds[0] ?? null,
  branchIds,
  branchName: 'RAWALPINDI',
});

describe('agentNameKey', () => {
  it('ignores case, so one agent cannot exist twice under two spellings', () => {
    expect(agentNameKey('QFC Group')).toBe(agentNameKey('qfc group'));
    expect(agentNameKey('QFC GROUP')).toBe('qfc group');
  });

  it('ignores surrounding and repeated whitespace', () => {
    expect(agentNameKey('  QFC Group  ')).toBe('qfc group');
    expect(agentNameKey('QFC   Group')).toBe('qfc group');
    expect(agentNameKey('QFC\tGroup')).toBe('qfc group');
  });

  it('keeps genuinely different agents apart', () => {
    expect(agentNameKey('QFC Group')).not.toBe(agentNameKey('QFC Travels'));
  });
});

const agent = (over: Partial<AgentInput> = {}): AgentInput => ({
  name: 'QFC Group (Pvt) Ltd',
  b2bCode: 'B2B6022',
  contactEmails: ['bookings@qfc.example'],
  contactPhone: '+92 51 1234567',
  ...over,
});

describe('validateAgent', () => {
  it('accepts a complete agent', () => {
    expect(validateAgent(agent())).toBeNull();
  });

  it('accepts an agent with only a name — everything else is optional', () => {
    expect(
      validateAgent({ name: 'Walk-in', b2bCode: null, contactEmails: [], contactPhone: null })
    ).toBeNull();
  });

  it('refuses the two names the dashboard reserves for the company and the bot', () => {
    // An agent called "Company Investment" would be one Holder filter entry
    // meaning two different things, and a share worked out for the wrong one.
    expect(validateAgent(agent({ name: 'Company Investment' }))?.error).toMatch(/reserved/);
    expect(validateAgent(agent({ name: 'B2C / Bot' }))?.error).toMatch(/reserved/);
  });

  it('refuses a case or spacing variant of a reserved name too', () => {
    expect(validateAgent(agent({ name: '  company   investment ' }))?.error).toMatch(/reserved/);
  });

  it('still allows a name that merely contains a reserved word', () => {
    expect(validateAgent(agent({ name: 'Company Investment Partners' }))).toBeNull();
  });

  it('requires a name that is not just whitespace', () => {
    expect(validateAgent(agent({ name: '' }))?.error).toMatch(/required/);
    expect(validateAgent(agent({ name: '   ' }))?.error).toMatch(/required/);
  });

  it('rejects an address a dues notice could never reach', () => {
    expect(validateAgent(agent({ contactEmails: ['not-an-email'] }))?.error).toMatch(/not a valid/);
    expect(validateAgent(agent({ contactEmails: ['a@b'] }))?.error).toMatch(/not a valid/);
    expect(validateAgent(agent({ contactEmails: ['a b@c.com'] }))?.error).toMatch(/not a valid/);
    expect(validateAgent(agent({ contactEmails: ['two@@at.com'] }))?.error).toMatch(/not a valid/);
  });

  it('rejects the same address listed twice, whatever the case', () => {
    expect(
      validateAgent(agent({ contactEmails: ['a@b.com', 'A@B.com'] }))?.error
    ).toMatch(/listed twice/);
  });

  it('rejects absurdly long values', () => {
    expect(validateAgent(agent({ name: 'x'.repeat(201) }))?.error).toMatch(/too long/);
    expect(validateAgent(agent({ b2bCode: 'x'.repeat(51) }))?.error).toMatch(/too long/);
  });
});

describe('parseContactEmails', () => {
  it('splits on commas, semicolons and newlines, trimming each', () => {
    expect(parseContactEmails('a@b.com, c@d.com')).toEqual(['a@b.com', 'c@d.com']);
    expect(parseContactEmails('a@b.com\n c@d.com ; e@f.com')).toEqual([
      'a@b.com',
      'c@d.com',
      'e@f.com',
    ]);
  });

  it('returns nothing for an empty box', () => {
    expect(parseContactEmails(null)).toEqual([]);
    expect(parseContactEmails('')).toEqual([]);
    expect(parseContactEmails('  ,  ')).toEqual([]);
  });
});

describe('agentVisibilityFilter', () => {
  it('shows head office every agent', () => {
    expect(agentVisibilityFilter(hq)).toEqual({});
  });

  it('shows a branch only the agents it created', () => {
    expect(agentVisibilityFilter(branch(['b1', 'b2']))).toEqual({
      createdByBranchId: { in: ['b1', 'b2'] },
    });
  });

  it('DENIES an unresolved branch rather than falling open', () => {
    // null means "deny everything". Returning {} here would show every agent to
    // the one account that should see none — the 2026-09-07 fail-open bug.
    expect(agentVisibilityFilter(branch([]))).toBeNull();
  });
});

describe('canEditAgent', () => {
  it('lets head office edit any agent', () => {
    expect(canEditAgent(hq, null)).toBe(true);
    expect(canEditAgent(hq, 'b1')).toBe(true);
  });

  it('lets a branch edit its own agents', () => {
    expect(canEditAgent(branch(['b1', 'b2']), 'b2')).toBe(true);
  });

  it("denies a branch another branch's agent, and head office's", () => {
    expect(canEditAgent(branch(['b1']), 'b9')).toBe(false);
    // null created_by_branch_id means head office created it — not "unowned,
    // therefore anyone's". This is the null-vs-null trap from canEditPnr.
    expect(canEditAgent(branch(['b1']), null)).toBe(false);
  });

  it('denies an unresolved branch', () => {
    expect(canEditAgent(branch([]), 'b1')).toBe(false);
    expect(canEditAgent(branch([]), null)).toBe(false);
  });
});
