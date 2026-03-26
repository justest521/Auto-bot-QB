// lib/admin/auth-v2.js — 新版認證模組：帳密 + session + OTP
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

const SESSION_EXPIRY_HOURS = 24;
const OTP_EXPIRY_MINUTES = 10;
const MAX_LOGIN_FAILS = 5;
const LOCK_MINUTES = 30;

// ── Password ─────────────────────────────────────────
export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ── Session Token ────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId, request) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  const ip = request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ua = request?.headers?.get('user-agent')?.slice(0, 300) || '';

  await supabase.from('admin_sessions').insert({
    user_id: userId,
    token,
    ip_address: ip,
    user_agent: ua,
    expires_at: expiresAt,
  });

  return { token, expiresAt };
}

export async function validateSession(token) {
  if (!token || token.length < 32) return null;

  const { data: session } = await supabase
    .from('admin_sessions')
    .select('*, user:admin_users(*, role:admin_roles(*))')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!session?.user || session.user.status !== 'active') return null;

  return {
    session,
    user: session.user,
    role: session.user.role,
  };
}

export async function destroySession(token) {
  await supabase.from('admin_sessions').delete().eq('token', token);
}

// Clean expired sessions (call periodically)
export async function cleanExpiredSessions() {
  await supabase.from('admin_sessions').delete().lt('expires_at', new Date().toISOString());
}

// ── OTP ──────────────────────────────────────────────
function generateOTP() {
  return String(crypto.randomInt(100000, 999999));
}

export async function createOTP(userId, purpose = 'login') {
  // Invalidate old OTPs
  await supabase
    .from('admin_otp')
    .update({ used: true })
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .eq('used', false);

  const code = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  await supabase.from('admin_otp').insert({
    user_id: userId,
    code,
    purpose,
    expires_at: expiresAt,
  });

  return code;
}

export async function verifyOTP(userId, code, purpose = 'login') {
  const { data: otp } = await supabase
    .from('admin_otp')
    .select('*')
    .eq('user_id', userId)
    .eq('code', code)
    .eq('purpose', purpose)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!otp) return false;

  // Mark as used
  await supabase.from('admin_otp').update({ used: true }).eq('id', otp.id);
  return true;
}

// ── Login Flow ───────────────────────────────────────
export async function loginStep1(username, password) {
  // Find user by username or email
  const { data: user } = await supabase
    .from('admin_users')
    .select('*, role:admin_roles(*)')
    .or(`username.eq.${username},email.eq.${username}`)
    .maybeSingle();

  if (!user) return { ok: false, error: '帳號或密碼錯誤' };

  // Check if locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    return { ok: false, error: `帳號已鎖定，請 ${mins} 分鐘後再試` };
  }

  if (user.status === 'disabled') {
    return { ok: false, error: '此帳號已停用，請聯繫管理員' };
  }

  // Verify password
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    const fails = (user.login_fail_count || 0) + 1;
    const updates = { login_fail_count: fails };

    if (fails >= MAX_LOGIN_FAILS) {
      updates.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
    }

    await supabase.from('admin_users').update(updates).eq('id', user.id);
    return { ok: false, error: '帳號或密碼錯誤' };
  }

  // Password correct → send OTP
  const otpCode = await createOTP(user.id, 'login');

  return {
    ok: true,
    step: 'otp',
    userId: user.id,
    email: user.email,
    maskedEmail: maskEmail(user.email),
    _otpCode: otpCode, // will be sent via email
  };
}

export async function loginStep2(userId, otpCode, request) {
  const valid = await verifyOTP(userId, otpCode, 'login');
  if (!valid) return { ok: false, error: '驗證碼錯誤或已過期' };

  // Reset fail count, update last login
  await supabase.from('admin_users').update({
    login_fail_count: 0,
    locked_until: null,
    last_login_at: new Date().toISOString(),
  }).eq('id', userId);

  // Create session
  const session = await createSession(userId, request);

  // Get user info
  const { data: user } = await supabase
    .from('admin_users')
    .select('id, username, email, display_name, role:admin_roles(code, label)')
    .eq('id', userId)
    .maybeSingle();

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      role: user.role?.code,
      role_label: user.role?.label,
    },
  };
}

// ── Permissions ──────────────────────────────────────
export async function getUserPermissions(roleId) {
  const { data } = await supabase
    .from('admin_role_permissions')
    .select('permission:admin_permissions(code, label, module), can_read, can_write, can_delete')
    .eq('role_id', roleId);

  return (data || []).map(rp => ({
    code: rp.permission.code,
    label: rp.permission.label,
    module: rp.permission.module,
    can_read: rp.can_read,
    can_write: rp.can_write,
    can_delete: rp.can_delete,
  }));
}

export function hasPermission(permissions, permCode, action = 'read') {
  const perm = permissions.find(p => p.code === permCode);
  if (!perm) return false;
  if (action === 'read') return perm.can_read;
  if (action === 'write') return perm.can_write;
  if (action === 'delete') return perm.can_delete;
  return false;
}

// ── Auth Middleware (for API routes) ──────────────────
export async function isAuthorizedV2(request) {
  // Support both new session token and legacy ADMIN_TOKEN for backward compatibility
  const token = request.headers.get('x-admin-token') || '';

  // 1. Try new session auth
  if (token.length >= 64) {
    const result = await validateSession(token);
    if (result) {
      const permissions = await getUserPermissions(result.role.id);
      return {
        ok: true,
        user: result.user,
        role: result.role,
        permissions,
      };
    }
  }

  // 2. Fallback to legacy ADMIN_TOKEN (for transition period)
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken && token) {
    try {
      const a = Buffer.from(token, 'utf8');
      const b = Buffer.from(adminToken, 'utf8');
      if (a.length === b.length && require('crypto').timingSafeEqual(a, b)) {
        return {
          ok: true,
          user: { id: 'legacy', username: 'admin', display_name: 'Admin (Legacy)' },
          role: { code: 'admin', label: '系統管理員' },
          permissions: [], // Legacy admin has full access
          legacy: true,
        };
      }
    } catch {}
  }

  return { ok: false, status: 401, error: 'Unauthorized' };
}

// ── Audit Log ────────────────────────────────────────
export async function auditLog(userId, action, opts = {}) {
  try {
    await supabase.from('admin_audit_log').insert({
      user_id: userId === 'legacy' ? null : userId,
      action,
      target_type: opts.targetType || null,
      target_id: opts.targetId || null,
      detail: opts.detail || null,
      ip_address: opts.ip || null,
    });
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

// ── Helpers ──────────────────────────────────────────
function maskEmail(email) {
  const [local, domain] = email.split('@');
  const masked = local.length <= 2
    ? local[0] + '***'
    : local[0] + '***' + local.slice(-1);
  return `${masked}@${domain}`;
}

// ── Email sending (placeholder — needs RESEND_API_KEY) ──
export async function sendOTPEmail(email, code) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[OTP] No email service configured. Code for ${email}: ${code}`);
    return { sent: false, fallback: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Auto-bot QB <noreply@resend.dev>',
        to: [email],
        subject: `[QB 管理後台] 登入驗證碼：${code}`,
        html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #16a34a; margin-bottom: 8px;">Auto-bot QB</h2>
            <p style="color: #374151;">您的登入驗證碼是：</p>
            <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827; background: #f3f4f6; border-radius: 12px; padding: 16px; text-align: center; margin: 16px 0;">
              ${code}
            </div>
            <p style="color: #6b7280; font-size: 13px;">驗證碼 ${OTP_EXPIRY_MINUTES} 分鐘內有效，請勿分享給他人。</p>
          </div>
        `,
      }),
    });

    return { sent: res.ok };
  } catch (e) {
    console.error('Email send error:', e);
    return { sent: false };
  }
}
