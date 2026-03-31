'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { useResponsive } from '@/lib/admin/helpers';

export default function UserManagement() {
  const { isMobile } = useResponsive();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [rolePermMap, setRolePermMap] = useState({});
  const [form, setForm] = useState({ username: '', email: '', password: '', display_name: '', role_code: 'sales' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [activeTab, setActiveTab] = useState('users'); // users | roles

  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, rRes, pRes] = await Promise.all([
        apiGet({ action: 'list_admin_users' }),
        apiGet({ action: 'list_admin_roles' }),
        apiGet({ action: 'list_admin_permissions' }),
      ]);
      setUsers(uRes?.users || []);
      setRoles(rRes?.roles || []);
      setAllPermissions(pRes?.permissions || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const loadRolePerms = async (roleId) => {
    const res = await apiGet({ action: 'get_role_permissions', role_id: roleId });
    const permIds = (res?.role_permissions || []).map(rp => rp.permission_id);
    setRolePermMap(prev => ({ ...prev, [roleId]: permIds }));
    return permIds;
  };

  const handleCreate = async () => {
    setSaving(true); setMsg('');
    const res = await apiPost({ action: 'create_admin_user', ...form });
    if (res?.ok) {
      setMsg('建立成功'); setShowCreateForm(false);
      setForm({ username: '', email: '', password: '', display_name: '', role_code: 'sales' });
      loadData();
    } else { setMsg(res?.error || '建立失敗'); }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    setSaving(true); setMsg('');
    const payload = { action: 'update_admin_user', user_id: editingUser.id };
    if (editingUser._display_name) payload.display_name = editingUser._display_name;
    if (editingUser._email) payload.email = editingUser._email;
    if (editingUser._role_code) payload.role_code = editingUser._role_code;
    if (editingUser._status) payload.status = editingUser._status;
    if (editingUser._new_password) payload.new_password = editingUser._new_password;
    const res = await apiPost(payload);
    if (res?.ok) { setMsg('更新成功'); setEditingUser(null); loadData(); }
    else { setMsg(res?.error || '更新失敗'); }
    setSaving(false);
  };

  const handleDisable = async (userId, username) => {
    if (!confirm(`確定要停用帳號「${username}」？`)) return;
    const res = await apiPost({ action: 'delete_admin_user', user_id: userId });
    if (res?.ok) { setMsg('已停用'); loadData(); }
    else { setMsg(res?.error || '操作失敗'); }
  };

  const handleSaveRolePerms = async (roleId, permIds) => {
    setSaving(true); setMsg('');
    const res = await apiPost({ action: 'update_role_permissions', role_id: roleId, permission_ids: permIds });
    if (res?.ok) { setMsg('權限已更新'); setRolePermMap(prev => ({ ...prev, [roleId]: permIds })); }
    else { setMsg(res?.error || '更新失敗'); }
    setSaving(false);
  };

  // Group permissions by module
  const permsByModule = allPermissions.reduce((acc, p) => {
    (acc[p.module] = acc[p.module] || []).push(p); return acc;
  }, {});
  const moduleLabels = { overview: '總覽', master_data: '主檔資料', purchasing: '採購進貨', sales: '銷售出貨', warehouse: '倉儲管理', reports: '分析報表', crm: 'CRM', finance: '財務會計', approvals: '審批簽核', support: '客服工單', dealer: '經銷商入口', system: '系統' };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: t.color.textMuted }}>載入中...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 0 }}>
        <div>
          <div style={{ ...S.eyebrow, fontSize: t.fontSize.tiny, letterSpacing: 1.2, marginBottom: 4 }}>SYSTEM</div>
          <h2 style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, margin: 0 }}>使用者與權限管理</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
          <button onClick={() => setActiveTab('users')} style={{ ...( activeTab === 'users' ? S.btnPrimary : S.btnGhost), padding: '8px 16px', fontSize: t.fontSize.body, cursor: 'pointer', flex: isMobile ? 1 : 'auto' }}>使用者</button>
          <button onClick={() => setActiveTab('roles')} style={{ ...(activeTab === 'roles' ? S.btnPrimary : S.btnGhost), padding: '8px 16px', fontSize: 13, cursor: 'pointer', flex: isMobile ? 1 : 'auto' }}>角色權限</button>
        </div>
      </div>

      {msg && <div style={{ padding: '10px 16px', borderRadius: t.radius.lg, marginBottom: 16, fontSize: 13, background: msg.includes('失敗') || msg.includes('錯誤') ? t.color.errorBg : t.color.successBg, color: msg.includes('失敗') || msg.includes('錯誤') ? t.color.error : t.color.brand }}>{msg}</div>}

      {/* ── Users Tab ── */}
      {activeTab === 'users' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setShowCreateForm(!showCreateForm)} style={{ ...(isMobile ? S.mobile.btnPrimary : { ...S.btnPrimary, padding: '9px 18px' }), fontSize: 13, cursor: 'pointer' }}>{showCreateForm ? '取消' : '+ 新增使用者'}</button>
          </div>

          {showCreateForm && (
            <div style={{ ...S.card, padding: isMobile ? 16 : 24, marginBottom: 20 }}>
              <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 16 }}>新增使用者</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: isMobile ? 12 : 14 }}>
                {[
                  { key: 'username', label: '帳號', placeholder: '英文帳號' },
                  { key: 'display_name', label: '顯示名稱', placeholder: '使用者姓名' },
                  { key: 'email', label: 'Email', placeholder: 'user@example.com', type: 'email' },
                  { key: 'password', label: '密碼', placeholder: '至少 8 碼', type: 'password' },
                ].map(f => (
                  <div key={f.key}>
                    <div style={{ ...S.label, fontSize: t.fontSize.caption, marginBottom: 4 }}>{f.label}</div>
                    <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} type={f.type || 'text'} style={{ width: '100%', ...(isMobile ? S.mobile.input : { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: t.color.textPrimary, outline: 'none', boxSizing: 'border-box' }) }} />
                  </div>
                ))}
                <div>
                  <div style={{ ...S.label, fontSize: 12, marginBottom: 4 }}>角色</div>
                  <select value={form.role_code} onChange={e => setForm(p => ({ ...p, role_code: e.target.value }))} style={{ width: '100%', ...(isMobile ? S.mobile.input : { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: t.color.textPrimary, outline: 'none', background: t.color.bgCard, boxSizing: 'border-box' }) }}>
                    {roles.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <button onClick={handleCreate} disabled={saving} style={{ ...(isMobile ? S.mobile.btnPrimary : { ...S.btnPrimary, padding: '9px 24px' }), fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '處理中...' : '建立帳號'}</button>
              </div>
            </div>
          )}

          {/* Users table */}
          <div style={{ ...S.card, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: isMobile ? 600 : 'auto' }}>
              <thead>
                <tr style={{ background: t.color.bgMuted }}>
                  {['帳號', '名稱', 'Email', '角色', '狀態', '最後登入', '操作'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: t.color.textSecondary, borderBottom: '1px solid #e5e7eb', fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: t.color.textPrimary, ...S.mono }}>{u.username}</td>
                    <td style={{ padding: '12px 14px', color: t.color.textSecondary }}>{u.display_name}</td>
                    <td style={{ padding: '12px 14px', color: t.color.textMuted, ...S.mono, fontSize: 12 }}>{u.email}</td>
                    <td style={{ padding: '12px 14px' }}><span style={{ padding: '3px 10px', borderRadius: t.radius.sm, fontSize: 11, fontWeight: 600, background: t.color.successBg, color: t.color.brand }}>{u.role?.label || '-'}</span></td>
                    <td style={{ padding: '12px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: u.status === 'active' ? t.color.successBg : t.color.errorBg, color: u.status === 'active' ? t.color.brand : t.color.error }}>{u.status === 'active' ? '啟用' : '停用'}</span></td>
                    <td style={{ padding: '12px 14px', color: t.color.textMuted, fontSize: 12, ...S.mono }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString('zh-TW') : '從未'}</td>
                    <td style={{ padding: '12px 14px', display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditingUser({ ...u, _display_name: u.display_name, _email: u.email, _role_code: u.role?.code, _status: u.status, _new_password: '' })} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, cursor: 'pointer' }}>編輯</button>
                      {u.status === 'active' && <button onClick={() => handleDisable(u.id, u.username)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, cursor: 'pointer', color: t.color.error, borderColor: '#fecaca' }}>停用</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Edit user modal */}
          {editingUser && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: isMobile ? 16 : 0 }} onClick={() => setEditingUser(null)}>
              <div style={{ ...S.card, padding: isMobile ? 20 : 28, maxWidth: 480, width: '100%' }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: t.fontSize.h2, fontWeight: 700, color: t.color.textPrimary, marginBottom: 20 }}>編輯使用者 — {editingUser.username}</div>
                <div style={{ display: 'grid', gap: isMobile ? 12 : 14 }}>
                  <div>
                    <div style={{ ...S.label, fontSize: 12, marginBottom: 4 }}>顯示名稱</div>
                    <input value={editingUser._display_name} onChange={e => setEditingUser(p => ({ ...p, _display_name: e.target.value }))} style={{ width: '100%', ...(isMobile ? S.mobile.input : { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: t.color.textPrimary, outline: 'none', boxSizing: 'border-box' }) }} />
                  </div>
                  <div>
                    <div style={{ ...S.label, fontSize: 12, marginBottom: 4 }}>Email</div>
                    <input value={editingUser._email} onChange={e => setEditingUser(p => ({ ...p, _email: e.target.value }))} style={{ width: '100%', ...(isMobile ? S.mobile.input : { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: t.color.textPrimary, outline: 'none', boxSizing: 'border-box' }) }} />
                  </div>
                  <div>
                    <div style={{ ...S.label, fontSize: 12, marginBottom: 4 }}>角色</div>
                    <select value={editingUser._role_code} onChange={e => setEditingUser(p => ({ ...p, _role_code: e.target.value }))} style={{ width: '100%', ...(isMobile ? S.mobile.input : { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: t.color.textPrimary, outline: 'none', background: t.color.bgCard, boxSizing: 'border-box' }) }}>
                      {roles.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ ...S.label, fontSize: 12, marginBottom: 4 }}>狀態</div>
                    <select value={editingUser._status} onChange={e => setEditingUser(p => ({ ...p, _status: e.target.value }))} style={{ width: '100%', ...(isMobile ? S.mobile.input : { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: t.color.textPrimary, outline: 'none', background: t.color.bgCard, boxSizing: 'border-box' }) }}>
                      <option value="active">啟用</option>
                      <option value="disabled">停用</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ ...S.label, fontSize: 12, marginBottom: 4 }}>新密碼（留空不變更）</div>
                    <input value={editingUser._new_password} onChange={e => setEditingUser(p => ({ ...p, _new_password: e.target.value }))} type="password" placeholder="留空保持原密碼" style={{ width: '100%', ...(isMobile ? S.mobile.input : { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: t.color.textPrimary, outline: 'none', boxSizing: 'border-box' }) }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
                  <button onClick={() => setEditingUser(null)} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#f3f4f6', color: t.color.textMuted, border: '1px solid #e5e7eb' } : { ...S.btnGhost, padding: '9px 18px' }), fontSize: 13, cursor: 'pointer' }}>取消</button>
                  <button onClick={handleUpdate} disabled={saving} style={{ ...(isMobile ? S.mobile.btnPrimary : { ...S.btnPrimary, padding: '9px 18px' }), fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '處理中...' : '儲存'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Roles Tab ── */}
      {activeTab === 'roles' && (
        <div>
          <div style={{ fontSize: 13, color: t.color.textMuted, marginBottom: 16 }}>選擇角色後勾選該角色可存取的功能頁面。系統管理員擁有所有權限，無法修改。</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr', gap: isMobile ? 12 : 20, minHeight: 400 }}>
            {/* Role list */}
            <div style={{ ...S.card, padding: 0, overflow: 'hidden', order: isMobile && editingRole ? 2 : 0 }}>
              {roles.map(r => (
                <div
                  key={r.id}
                  onClick={async () => { setEditingRole(r); if (!rolePermMap[r.id]) await loadRolePerms(r.id); }}
                  style={{ padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', background: editingRole?.id === r.id ? t.color.successBg : 'transparent', transition: 'background 0.15s' }}
                >
                  <div style={{ fontSize: t.fontSize.h3, fontWeight: 600, color: editingRole?.id === r.id ? t.color.brand : t.color.textPrimary }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: t.color.textMuted, marginTop: 2 }}>{r.code}{r.is_system ? ' (系統)' : ''}</div>
                </div>
              ))}
            </div>

            {/* Permission editor */}
            <div style={{ ...S.card, padding: isMobile ? 16 : 24, order: isMobile && editingRole ? 1 : 0 }}>
              {!editingRole ? (
                <div style={{ color: t.color.textMuted, fontSize: 14, textAlign: 'center', paddingTop: 40 }}>請從{isMobile ? '上方' : '左側'}選擇角色</div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 0 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: t.color.textPrimary }}>{editingRole.label}</div>
                      <div style={{ fontSize: 12, color: t.color.textMuted }}>{editingRole.description || editingRole.code}</div>
                    </div>
                    {editingRole.code !== 'admin' && (
                      <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
                        <button onClick={() => { const allIds = allPermissions.map(p => p.id); setRolePermMap(prev => ({ ...prev, [editingRole.id]: allIds })); }} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 11, cursor: 'pointer', flex: isMobile ? 1 : 'auto' }}>全選</button>
                        <button onClick={() => { setRolePermMap(prev => ({ ...prev, [editingRole.id]: [] })); }} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 11, cursor: 'pointer', flex: isMobile ? 1 : 'auto' }}>清除</button>
                        <button onClick={() => handleSaveRolePerms(editingRole.id, rolePermMap[editingRole.id] || [])} disabled={saving} style={{ ...S.btnPrimary, padding: '6px 16px', fontSize: 11, cursor: 'pointer', opacity: saving ? 0.6 : 1, flex: isMobile ? 1 : 'auto' }}>{saving ? '儲存中...' : '儲存權限'}</button>
                      </div>
                    )}
                  </div>

                  {editingRole.code === 'admin' ? (
                    <div style={{ padding: 20, background: '#f3f4f6', borderRadius: t.radius.lg, textAlign: 'center', color: t.color.textMuted, fontSize: 13 }}>系統管理員擁有所有權限，無法修改</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 16 }}>
                      {Object.entries(permsByModule).map(([mod, perms]) => {
                        const currentPerms = rolePermMap[editingRole.id] || [];
                        const allChecked = perms.every(p => currentPerms.includes(p.id));
                        return (
                          <div key={mod} style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                            <div
                              onClick={() => {
                                const ids = perms.map(p => p.id);
                                setRolePermMap(prev => {
                                  const cur = prev[editingRole.id] || [];
                                  const next = allChecked ? cur.filter(id => !ids.includes(id)) : [...new Set([...cur, ...ids])];
                                  return { ...prev, [editingRole.id]: next };
                                });
                              }}
                              style={{ padding: '10px 16px', background: t.color.bgMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #e5e7eb' }}
                            >
                              <span style={{ width: 18, height: 18, borderRadius: t.radius.sm, border: '2px solid ' + (allChecked ? t.color.brand : '#d1d5db'), background: allChecked ? t.color.brand : t.color.bgCard, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: t.color.bgCard, flexShrink: 0 }}>{allChecked ? '\u2713' : ''}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: t.color.textSecondary }}>{moduleLabels[mod] || mod}</span>
                              <span style={{ fontSize: 11, color: t.color.textDisabled, marginLeft: 'auto' }}>{perms.filter(p => currentPerms.includes(p.id)).length}/{perms.length}</span>
                            </div>
                            <div style={{ padding: '8px 16px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4 }}>
                              {perms.map(p => {
                                const checked = currentPerms.includes(p.id);
                                return (
                                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: checked ? t.color.textPrimary : t.color.textMuted }}>
                                    <input type="checkbox" checked={checked} onChange={() => {
                                      setRolePermMap(prev => {
                                        const cur = prev[editingRole.id] || [];
                                        const next = checked ? cur.filter(id => id !== p.id) : [...cur, p.id];
                                        return { ...prev, [editingRole.id]: next };
                                      });
                                    }} style={{ accentColor: t.color.brand }} />
                                    <span>{p.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
