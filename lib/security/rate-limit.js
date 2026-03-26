// lib/security/rate-limit.js — In-memory rate limiter for API routes
// Works on Vercel serverless (per-instance), good enough for basic protection

const stores = {};

/**
 * Create a rate limiter for a specific route group
 * @param {object} opts
 * @param {number} opts.windowMs - Time window in ms (default 60s)
 * @param {number} opts.max - Max requests per window (default 60)
 * @param {string} opts.prefix - Store prefix to separate route groups
 */
export function createRateLimiter({ windowMs = 60_000, max = 60, prefix = 'global' } = {}) {
  if (!stores[prefix]) {
    stores[prefix] = new Map();
  }
  const store = stores[prefix];

  // Cleanup old entries every 5 minutes
  if (!stores[`${prefix}_timer`]) {
    stores[`${prefix}_timer`] = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (now - entry.windowStart > windowMs * 2) {
          store.delete(key);
        }
      }
    }, 5 * 60_000);
  }

  return function checkRateLimit(request) {
    const ip = getClientIp(request);
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now - entry.windowStart > windowMs) {
      store.set(ip, { windowStart: now, count: 1 });
      return { ok: true, remaining: max - 1 };
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      return {
        ok: false,
        remaining: 0,
        retryAfter,
        response: Response.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
              'X-RateLimit-Limit': String(max),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.ceil((entry.windowStart + windowMs) / 1000)),
            },
          }
        ),
      };
    }

    return { ok: true, remaining: max - entry.count };
  };
}

/**
 * Extract client IP from request headers (works with Vercel, Cloudflare, etc.)
 */
function getClientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

// Pre-configured limiters for different route groups
export const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 100, prefix: 'admin' });
export const authLimiter = createRateLimiter({ windowMs: 300_000, max: 10, prefix: 'auth' });    // Login: 10 per 5min
export const publicLimiter = createRateLimiter({ windowMs: 60_000, max: 30, prefix: 'public' });
export const webhookLimiter = createRateLimiter({ windowMs: 60_000, max: 200, prefix: 'webhook' });
