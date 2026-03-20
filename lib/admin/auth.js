// lib/admin/auth.js — Admin 認證
import crypto from 'crypto';

export function isAuthorized(request) {
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    console.error('ADMIN_TOKEN is not configured');
    return { ok: false, status: 503, error: 'Admin auth is not configured' };
  }

  const headerToken = request.headers.get('x-admin-token') || '';
  try {
    const a = Buffer.from(headerToken, 'utf8');
    const b = Buffer.from(adminToken, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, status: 401, error: 'Unauthorized' };
    }
  } catch {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true };
}
