// middleware.js — Next.js Edge Middleware for security headers & basic protection
import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // ── Security Headers (all routes) ──────────────────────────────
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // CSP: allow self + Supabase + LINE + CDN resources
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseDomain = supabaseUrl ? new URL(supabaseUrl).hostname : '';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: blob: https: http:`,
    `connect-src 'self' ${supabaseUrl} https://*.supabase.co https://api.line.me`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  response.headers.set('Content-Security-Policy', csp);

  // ── Admin routes: prevent caching of API responses ─────────────
  if (pathname.startsWith('/api/admin')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  // ── Block common attack paths ──────────────────────────────────
  const blocked = [
    '/wp-admin', '/wp-login', '/xmlrpc.php', '/.env',
    '/phpmyadmin', '/admin.php', '/wp-content',
    '/.git', '/.svn', '/config.php',
  ];
  if (blocked.some(p => pathname.toLowerCase().startsWith(p))) {
    return new NextResponse(null, { status: 404 });
  }

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
};
