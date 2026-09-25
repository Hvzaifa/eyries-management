import type { NextConfig } from "next";

/**
 * Content-Security-Policy — what the browser may load and connect to.
 *
 * Built from what the app actually does (checked 2026-09-24): every request goes
 * to this app's own server actions and routes; fonts are self-hosted by
 * `next/font` at build time; the only image not served by the app is the AI
 * intake preview, a local `blob:` URL; no third-party scripts, frames or
 * analytics. The Supabase URL is allowed for `connect-src` only so a future
 * browser-side client does not silently fail — nothing imports one today.
 *
 * `'unsafe-inline'` on scripts is what the App Router needs without per-request
 * nonces (it inlines its bootstrapping scripts); nonces would force every page
 * to render dynamically for a small gain on an internal tool with no
 * user-generated HTML. `'unsafe-eval'` is development-only (React's dev tooling).
 *
 * **Shipped as Report-Only first.** Violations are logged in the browser console
 * instead of blocked, so a missed source shows up without breaking a page. Once
 * a deploy has run clean, change the header name to `Content-Security-Policy`.
 */
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseWs = supabase.replace(/^https:/, 'wss:');
  const dev = process.env.NODE_ENV !== 'production';

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabaseWs}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Supersedes X-Frame-Options in modern browsers; both are kept for older ones.
    "frame-ancestors 'none'",
  ].join('; ');
}

const nextConfig: NextConfig = {
  // The `X-Powered-By: Next.js` header tells an attacker which framework — and
  // so which advisories — to try. Nothing needs it.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: contentSecurityPolicy(),
          },
          {
            // Nothing in the app uses the camera, microphone, location or
            // payment APIs; switching them off means injected script cannot either.
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
