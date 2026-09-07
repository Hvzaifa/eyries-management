import { describe, expect, it } from 'vitest';
import { getSafeRedirectUrl } from './safe-redirect';

describe('getSafeRedirectUrl', () => {
  it('allows ordinary in-app paths', () => {
    expect(getSafeRedirectUrl('/pnrs/abc')).toBe('/pnrs/abc');
    expect(getSafeRedirectUrl('/refunds')).toBe('/refunds');
  });

  it('falls back to / when nothing is supplied', () => {
    expect(getSafeRedirectUrl(null)).toBe('/');
    expect(getSafeRedirectUrl('')).toBe('/');
  });

  it('blocks protocol-relative URLs, which browsers treat as off-site', () => {
    expect(getSafeRedirectUrl('//evil.example')).toBe('/');
  });

  it('blocks a backslash variant some browsers normalise to //', () => {
    expect(getSafeRedirectUrl('/\\evil.example')).toBe('/');
  });

  it('blocks absolute URLs', () => {
    expect(getSafeRedirectUrl('https://evil.example')).toBe('/');
    expect(getSafeRedirectUrl('http://evil.example/x')).toBe('/');
  });

  it('blocks a scheme smuggled into a path', () => {
    expect(getSafeRedirectUrl('/redirect?to=https://evil.example')).toBe('/');
  });

  it('blocks anything not starting with /', () => {
    expect(getSafeRedirectUrl('evil.example')).toBe('/');
    expect(getSafeRedirectUrl('javascript:alert(1)')).toBe('/');
  });

  it('trims surrounding whitespace before deciding', () => {
    expect(getSafeRedirectUrl('  /pnrs  ')).toBe('/pnrs');
    expect(getSafeRedirectUrl('  //evil.example  ')).toBe('/');
  });
});
