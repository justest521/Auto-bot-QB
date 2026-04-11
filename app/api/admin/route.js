// app/api/admin/route.js — 路由層：auth + rate limit + dispatch
import { isAuthorizedV2, loginStep1, loginStep2, sendOTPEmail, destroySession, auditLog, getUserPermissions, hashPassword } from '@/lib/admin/auth-v2';
import { handleGetAction } from '@/lib/admin/actions-get';
import { handlePostAction } from '@/lib/admin/actions-post';
import { adminLimiter, authLimiter } from '@/lib/security/rate-limit';
import { sanitizeBody } from '@/lib/security/sanitize';
import { supabase } from '@/lib/supabase';
import { generatePdfSignedParams } from '@/app/api/pdf/route';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1'; // 新加坡，靠近 Supabase (ap-southeast-1)
export const maxDuration = 60; // seconds (AI 解析 PDF 需要較長時間)

export async function GET(request) {
  const rl = adminLimiter(request);
  if (!rl.ok) return rl.response;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // ── Public GET actions (no auth needed) ──
  if (action === 'ping') return Response.json({ ok: true });

  // ── Auth required ──
  const auth = await isAuthorizedV2(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Return user info + permissions
  if (action === 'me') {
    return Response.json({
      user: {
        id: auth.user.id,
        username: auth.user.username,
        email: auth.user.email,
        display_name: auth.user.display_name,
        role: auth.role.code,
        role_label: auth.role.label,
      },
      permissions: auth.permissions.map(p => p.code),
      legacy: auth.legacy || false,
      must_change_password: auth.user.must_change_password || false,
    });
  }

  // Staff list for dropdowns (all authenticated users can access)
  if (action === 'list_staff') {
    const { data } = await supabase
      .from('admin_users')
      .select('id, username, display_name, role:admin_roles(code, label)')
      .eq('status', 'active')
      .order('display_name', { ascending: true });
    return Response.json({ users: data || [] });
  }

  // User management (admin only)
  if (action === 'list_admin_users') {
    if (auth.role.code !== 'admin' && !auth.legacy) {
      return Response.json({ error: '權限不足' }, { status: 403 });
    }
    const { data } = await supabase
      .from('admin_users')
      .select('id, username, email, display_name, status, last_login_at, created_at, role:admin_roles(code, label)')
      .order('created_at', { ascending: true });
    return Response.json({ users: data || [] });
  }

  if (action === 'list_admin_roles') {
    const { data } = await supabase
      .from('admin_roles')
      .select('id, code, label, description, is_system')
      .order('created_at', { ascending: true });
    return Response.json({ roles: data || [] });
  }

  if (action === 'list_admin_permissions') {
    const { data } = await supabase
      .from('admin_permissions')
      .select('id, code, label, module, sort_order')
      .order('module', { ascending: true })
      .order('sort_order', { ascending: true });
    return Response.json({ permissions: data || [] });
  }

  if (action === 'get_role_permissions') {
    if (auth.role.code !== 'admin' && !auth.legacy) {
      return Response.json({ error: '權限不足' }, { status: 403 });
    }
    const roleId = searchParams.get('role_id');
    if (!roleId) return Response.json({ error: '缺少 role_id' }, { status: 400 });
    const { data } = await supabase
      .from('admin_role_permissions')
      .select('permission_id, can_read, can_write, can_delete')
      .eq('role_id', roleId);
    return Response.json({ role_permissions: data || [] });
  }

  // Generate signed PDF URL
  if (action === 'generate_pdf_url') {
    const docType = searchParams.get('doc_type');
    const docId = searchParams.get('doc_id');
    if (!docType || !docId) return Response.json({ error: '缺少 doc_type 或 doc_id' }, { status: 400 });
    const { token, exp } = generatePdfSignedParams(docType, docId);
    const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const url = `${base}/api/pdf?type=${docType}&id=${docId}&token=${token}&exp=${exp}`;
    return Response.json({ url });
  }

  try {
    const result = await handleGetAction(action, searchParams);
    if (result) return result;
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Admin API error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const rl = adminLimiter(request);
  if (!rl.ok) return rl.response;

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const bodyStr = JSON.stringify(rawBody);
  const isFileUpload = rawBody?.action === 'upload_company_logo';
  const maxSize = isFileUpload ? 5_242_880 : 1_048_576; // 5MB for file uploads, 1MB otherwise
  if (bodyStr.length > maxSize) {
    return Response.json({ error: 'Payload too large' }, { status: 413 });
  }

  // Preserve raw binary fields before sanitization
  const rawFileData = rawBody?.file_data;
  const body = sanitizeBody(rawBody);
  if (rawFileData && body.action === 'upload_company_logo') {
    body.file_data = rawFileData; // Restore unsanitized base64 data
  }
  const { action } = body;

  // ── Public POST actions (login flow, no auth) ──
  if (action === 'login_step1') {
    const rlAuth = authLimiter(request);
    if (!rlAuth.ok) return rlAuth.response;

    const result = await loginStep1(body.username, body.password);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 401 });
    }

    // First-login accounts skip OTP
    if (result.step === 'first_login') {
      return Response.json(result);
    }

    // Send OTP email
    await sendOTPEmail(result.email, result._otpCode);

    return Response.json({
      step: 'otp',
      userId: result.userId,
      maskedEmail: result.maskedEmail,
    });
  }

  if (action === 'login_step2') {
    const rlAuth = authLimiter(request);
    if (!rlAuth.ok) return rlAuth.response;

    const result = await loginStep2(body.userId, body.otpCode, request);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 401 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    await auditLog(body.userId, 'login', { ip });

    return Response.json(result);
  }

  if (action === 'logout') {
    const token = request.headers.get('x-admin-token') || '';
    if (token) await destroySession(token);
    return Response.json({ ok: true });
  }

  // ── Auth required for all other actions ──
  const auth = await isAuthorizedV2(request);
  if (!auth.ok) {
    authLimiter(request);
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // ── Change own password (first-login or voluntary) ──
  if (action === 'change_own_password') {
    const { new_password } = body;
    if (!new_password || new_password.length < 6) {
      return Response.json({ error: '密碼至少 6 碼' }, { status: 400 });
    }
    const password_hash = await hashPassword(new_password);
    await supabase.from('admin_users').update({
      password_hash,
      must_change_password: false,
    }).eq('id', auth.user.id);

    await auditLog(auth.user.id, 'change_own_password', {});
    return Response.json({ ok: true });
  }

  // ── User management actions (admin only) ──
  if (action === 'create_admin_user') {
    if (auth.role.code !== 'admin' && !auth.legacy) {
      return Response.json({ error: '權限不足' }, { status: 403 });
    }

    const { username, email, password, display_name, role_code } = body;
    if (!username || !email || !password || !display_name || !role_code) {
      return Response.json({ error: '所有欄位皆為必填' }, { status: 400 });
    }

    // Find role
    const { data: role } = await supabase
      .from('admin_roles')
      .select('id')
      .eq('code', role_code)
      .maybeSingle();
    if (!role) return Response.json({ error: '無效的角色' }, { status: 400 });

    // Hash password
    const password_hash = await hashPassword(password);

    const { data: newUser, error: insertErr } = await supabase
      .from('admin_users')
      .insert({ username, email, password_hash, display_name, role_id: role.id, must_change_password: true })
      .select('id, username, email, display_name')
      .maybeSingle();

    if (insertErr) {
      if (insertErr.message?.includes('duplicate')) {
        return Response.json({ error: '帳號或 Email 已存在' }, { status: 409 });
      }
      return Response.json({ error: insertErr.message }, { status: 500 });
    }

    await auditLog(auth.user.id, 'create_admin_user', {
      targetType: 'admin_user', targetId: newUser.id,
      detail: { username, role_code },
    });

    return Response.json({ ok: true, user: newUser });
  }

  if (action === 'update_role_permissions') {
    if (auth.role.code !== 'admin' && !auth.legacy) {
      return Response.json({ error: '權限不足' }, { status: 403 });
    }
    const { role_id, permission_ids } = body;
    if (!role_id || !Array.isArray(permission_ids)) {
      return Response.json({ error: '缺少 role_id 或 permission_ids' }, { status: 400 });
    }
    // Prevent editing admin role permissions
    const { data: targetRole } = await supabase.from('admin_roles').select('code').eq('id', role_id).maybeSingle();
    if (targetRole?.code === 'admin') {
      return Response.json({ error: '無法修改系統管理員角色的權限' }, { status: 403 });
    }
    // Delete existing permissions for this role
    await supabase.from('admin_role_permissions').delete().eq('role_id', role_id);
    // Insert new permissions
    if (permission_ids.length > 0) {
      const rows = permission_ids.map(pid => ({ role_id, permission_id: pid, can_read: true, can_write: true, can_delete: true }));
      const { error: insertErr } = await supabase.from('admin_role_permissions').insert(rows);
      if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 });
    }
    await auditLog(auth.user?.id || null, 'update_role_permissions', {
      targetType: 'admin_role', targetId: role_id,
      detail: { permission_count: permission_ids.length },
    });
    return Response.json({ ok: true });
  }

  if (action === 'delete_admin_user') {
    if (auth.role.code !== 'admin' && !auth.legacy) {
      return Response.json({ error: '權限不足' }, { status: 403 });
    }
    const { user_id } = body;
    if (!user_id) return Response.json({ error: '缺少 user_id' }, { status: 400 });
    // Don't allow deleting yourself
    if (auth.user?.id === user_id) {
      return Response.json({ error: '無法刪除自己的帳號' }, { status: 400 });
    }
    // Soft delete: set status to disabled
    await supabase.from('admin_users').update({ status: 'disabled', updated_at: new Date().toISOString() }).eq('id', user_id);
    // Destroy all sessions for this user
    await supabase.from('admin_sessions').delete().eq('user_id', user_id);
    await auditLog(auth.user?.id || null, 'disable_admin_user', {
      targetType: 'admin_user', targetId: user_id,
    });
    return Response.json({ ok: true });
  }

  if (action === 'update_admin_user') {
    if (auth.role.code !== 'admin' && !auth.legacy) {
      return Response.json({ error: '權限不足' }, { status: 403 });
    }

    const { user_id, display_name, email, role_code, status: userStatus, new_password } = body;
    if (!user_id) return Response.json({ error: '缺少 user_id' }, { status: 400 });

    const updates = {};
    if (display_name) updates.display_name = display_name;
    if (email) updates.email = email;
    if (userStatus) updates.status = userStatus;
    if (new_password) updates.password_hash = await hashPassword(new_password);
    if (role_code) {
      const { data: role } = await supabase.from('admin_roles').select('id').eq('code', role_code).maybeSingle();
      if (role) updates.role_id = role.id;
    }

    updates.updated_at = new Date().toISOString();
    await supabase.from('admin_users').update(updates).eq('id', user_id);

    await auditLog(auth.user.id, 'update_admin_user', {
      targetType: 'admin_user', targetId: user_id,
      detail: { fields: Object.keys(updates) },
    });

    return Response.json({ ok: true });
  }

  // ── Existing actions ──
  // 注入認證使用者資訊供 actions-post 使用（如 process_approval）
  body.__auth_user = { id: auth.user.id, username: auth.user.username, display_name: auth.user.display_name, role: auth.role.code };
  try {
    const result = await handlePostAction(action, body);
    if (result) return result;
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Admin POST error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
