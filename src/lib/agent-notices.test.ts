import { describe, expect, it } from 'vitest';
import {
  isAgentNoticeDue,
  buildAgentNotice,
  validateAgentNotice,
  AGENT_NOTICE_WINDOW_DAYS,
} from './agent-notices';

const TODAY = '2026-09-22';

describe('isAgentNoticeDue', () => {
  const due = (date: string | null, amount = 150_000) =>
    isAgentNoticeDue({ kind: 'emd', amount, date }, TODAY);

  it('alerts from today through the window', () => {
    expect(due(TODAY)).toBe(true);
    expect(due('2026-09-23')).toBe(true);
    expect(due('2026-09-24')).toBe(true);
    expect(AGENT_NOTICE_WINDOW_DAYS).toBe(2);
  });

  it('stays quiet further out', () => {
    expect(due('2026-09-25')).toBe(false);
  });

  it('never alerts on something already overdue', () => {
    // Owner rule, 2026-08-25: overdue items stay on screen but are never
    // emailed, so the daily mail does not nag.
    expect(due('2026-09-21')).toBe(false);
    expect(due('2026-01-01')).toBe(false);
  });

  it('never chases an obligation with no due date', () => {
    // No ticketing deadline recorded. The system will not invent a date and
    // will not chase one it invented (owner ruling 17).
    expect(due(null)).toBe(false);
  });

  it('never chases nothing', () => {
    expect(isAgentNoticeDue(null, TODAY)).toBe(false);
    expect(due(TODAY, 0)).toBe(false);
    expect(due(TODAY, -500)).toBe(false);
  });
});

describe('buildAgentNotice', () => {
  const facts = {
    agentName: 'QFC Group',
    pnrCode: 'AJK067',
    sector: 'ISB-JED',
    seats: 10,
    outboundDate: '2026-11-01',
    kind: 'emd' as const,
    amount: 150_000,
    dueDate: '2026-09-24',
  };

  it('puts the amount, the date and the booking in the subject', () => {
    const { subject } = buildAgentNotice(facts);
    expect(subject).toContain('AJK067');
    expect(subject).toContain('2026-09-24');
    expect(subject).toContain('150,000');
  });

  it('addresses the agent and states the facts', () => {
    const { body } = buildAgentNotice(facts);
    expect(body).toContain('Dear QFC Group,');
    expect(body).toContain('AJK067');
    expect(body).toContain('ISB-JED');
    expect(body).toContain('2026-11-01');
    expect(body).toContain('150,000');
  });

  it('says an EMD share is part of the total, not an extra charge', () => {
    // Ruling 13. An agent told they owe a deposit AND a balance would
    // reasonably think they were being billed twice.
    const { body } = buildAgentNotice(facts);
    expect(body).toContain('not an additional charge');
  });

  it('describes a balance as what is left after payments received', () => {
    const { body } = buildAgentNotice({ ...facts, kind: 'final' });
    expect(body).toContain('outstanding after payments received');
    expect(body).not.toContain('not an additional charge');
  });

  it('leaves out the airline’s internal deadlines and EMD rounds', () => {
    // None of that is the agent's business, and quoting it invites an argument
    // about arithmetic they cannot check.
    const { body } = buildAgentNotice(facts);
    expect(body).not.toMatch(/round/i);
    expect(body).not.toMatch(/percent|%/);
    expect(body).not.toMatch(/airline/i);
  });

  it('copes with a booking that has no sector or outbound date', () => {
    const { body } = buildAgentNotice({ ...facts, sector: null, outboundDate: null });
    expect(body).toContain('AJK067');
    expect(body).not.toContain('null');
    expect(body).not.toContain('undefined');
  });
});

describe('validateAgentNotice — the open-relay guard', () => {
  const base = {
    subject: 'Payment due',
    body: 'Dear agent,',
    agentName: 'QFC Group',
    allowedEmails: ['ops@qfc.example', 'accounts@qfc.example'],
  };

  it('accepts an address recorded on the agent', () => {
    const r = validateAgentNotice({ ...base, recipient: 'ops@qfc.example' });
    expect(r).toEqual({ recipient: 'ops@qfc.example' });
  });

  it('refuses an address that is not on the agent', () => {
    // This is the whole guard: the airline batch email sent arbitrary text to
    // an arbitrary address over the company's verified domain
    // (decisions.md, 2026-09-07).
    const r = validateAgentNotice({ ...base, recipient: 'attacker@elsewhere.example' });
    expect('error' in r && r.error).toContain('not a recorded contact address');
    expect('error' in r && r.error).toContain('QFC Group');
  });

  it('ignores case and surrounding whitespace on both sides', () => {
    expect(
      validateAgentNotice({ ...base, recipient: '  OPS@QFC.EXAMPLE ' })
    ).toEqual({ recipient: 'OPS@QFC.EXAMPLE' });
    expect(
      validateAgentNotice({ ...base, allowedEmails: ['  Ops@QFC.Example  '], recipient: 'ops@qfc.example' })
    ).toEqual({ recipient: 'ops@qfc.example' });
  });

  it('refuses to send to an agent with no address on file', () => {
    // Deliberate: falling back to an address typed at send time is the relay
    // again.
    const r = validateAgentNotice({ ...base, allowedEmails: [], recipient: 'ops@qfc.example' });
    expect('error' in r && r.error).toContain('No contact email is recorded');
  });

  it('refuses a blank recipient, subject or body', () => {
    expect(validateAgentNotice({ ...base, recipient: '' })).toHaveProperty('error');
    expect(validateAgentNotice({ ...base, recipient: null })).toHaveProperty('error');
    expect(validateAgentNotice({ ...base, recipient: 'ops@qfc.example', subject: '   ' })).toHaveProperty('error');
    expect(validateAgentNotice({ ...base, recipient: 'ops@qfc.example', body: '' })).toHaveProperty('error');
  });

  it('does not accept a partial match of an allowed address', () => {
    const r = validateAgentNotice({ ...base, recipient: 'ops@qfc.example.attacker.test' });
    expect(r).toHaveProperty('error');
  });
});

describe('buildAgentNotice — an EMD share, which has no due date', () => {
  const facts = {
    agentName: 'QFC Group',
    pnrCode: 'AJK067',
    sector: 'ISB-JED',
    seats: 10,
    outboundDate: '2026-11-01',
    kind: 'emd' as const,
    amount: 150_000,
    dueDate: null,
  };

  it('is still sendable, asking for the money without a date', () => {
    // The owner removed the deadline (2026-09-22), not the ability to chase.
    const { subject, body } = buildAgentNotice(facts);
    expect(subject).toContain('Payment required');
    expect(subject).toContain('150,000');
    expect(body).toContain('150,000');
  });

  it('states the condition in place of a date', () => {
    const { body } = buildAgentNotice(facts);
    expect(body).toContain('before the next EMD is issued');
    expect(body).not.toContain('Due by:');
    expect(body).not.toContain('falling due on');
  });

  it('never prints a null where a date would go', () => {
    const { subject, body } = buildAgentNotice(facts);
    expect(subject).not.toContain('null');
    expect(body).not.toContain('null');
  });

  it('still says the EMD share is part of the total', () => {
    expect(buildAgentNotice(facts).body).toContain('not an additional charge');
  });

  it('keeps quoting the date when there is one', () => {
    const { subject, body } = buildAgentNotice({ ...facts, dueDate: '2026-09-24' });
    expect(subject).toContain('Payment due 2026-09-24');
    expect(body).toContain('Due by:    2026-09-24');
  });
});

describe('the EMD share never reaches the daily alert', () => {
  it('is excluded because it carries no date', () => {
    // Owner ruling, 2026-09-22: "drop EMD share from the alert". It is enforced
    // by the share having no due date at all rather than by a special case, so
    // this asserts the behaviour the ruling asked for, not the mechanism.
    const emdShare = { kind: 'emd' as const, amount: 150_000, date: null };
    expect(isAgentNoticeDue(emdShare, TODAY)).toBe(false);
  });

  it('still alerts a dated balance', () => {
    const balance = { kind: 'final' as const, amount: 850_000, date: '2026-09-23' };
    expect(isAgentNoticeDue(balance, TODAY)).toBe(true);
  });
});
