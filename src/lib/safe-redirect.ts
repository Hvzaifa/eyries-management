/**
 * Screens a redirect target that arrived from a URL or form field.
 *
 * Anything the user can supply and we then redirect to is an open-redirect risk:
 * a link that looks like ours but lands the visitor on someone else's site,
 * which is how credential-phishing pages get their legitimacy.
 *
 * Only same-site paths are allowed through. Everything else falls back to '/'.
 * Lives here rather than in a `'use server'` file so both the login action and
 * the auth callback can share one implementation — a `'use server'` module may
 * only export async functions.
 */
export function getSafeRedirectUrl(target: string | null): string {
  if (!target) return '/';
  const trimmed = target.trim();
  // Must start with '/' but NOT '//' (a protocol-relative URL pointing off-site),
  // and must not smuggle in a scheme such as "/\evil.com" or "javascript:".
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !trimmed.includes('://')
  ) {
    return trimmed;
  }
  return '/';
}
