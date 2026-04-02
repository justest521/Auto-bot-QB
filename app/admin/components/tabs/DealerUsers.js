'use client';
import { useState, useEffect, useRef } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { useResponsive } from '@/lib/admin/helpers';
import { apiGet, apiPost } from '@/lib/admin/api';
import { Loading, EmptyState, PageLead } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

export default function DealerUsers() {
  const { isMobile, isTablet } = useResponsive();
  const ROLE_MAP = { dealer: '經銷商', sales: '業務', technician: '維修技師' };
  const ROLE_TONE = { dealer: 'blue', sales: '', technician: 'green' };
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', display_name: '', role: 'dealer', company_name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [permSaving, setPermSaving] = useState(null);
  const tableRef = useRef(null);
  const { colWidths, gridTemplate, ResizableHeader } = useResizableColumns('dealer_users_list', [120, 200, 100, 130, 100, 160]);
  useEffect(() => {
    const handler = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        setExpandedId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const load = async () => { setLoading(true); try { setData(await apiGet({ action: 'dealer_users' })); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const createUser = async () => {
    setSaving(true); setMsg('');
    try {
      await apiPost({ action: 'create_dealer_user', ...form });
      setMsg('帳號建立成功');
      setShowCreate(false);
      setForm({ username: '', password: '', display_name: '', role: 'dealer', company_name: '', phone: '', email: '' });
      await load();
    } catch (e) { setMsg(e.message); } finally { setSaving(false); }
  };

  const toggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    await apiPost({ action: 'update_dealer_user', user_id: user.id, status: newStatus });
    await load();
  };

  const resetPw = async (user) => {
    const pw = prompt(`重設 ${user.display_name} 的密碼為：`, '1234');
    if (!pw) return;
    await apiPost({ action: 'update_dealer_user', user_id: user.id, new_password: pw });
    alert('密碼已重設');
  };

  const togglePerm = async (user, field) => {
    setPermSaving(user.id + field);
    try {
      await apiPost({ action: 'update_dealer_user', user_id: user.id, [field]: !user[field] });
      await load();
    } finally { setPermSaving(null); }
  };

  const changeRole = async (user, newRole) => {
    await apiPost({ action: 'update_dealer_user', user_id: user.id, role: newRole });
    await load();
  };

  const changePriceLevel = async (user, level) => {
    await apiPost({ action: 'update_dealer_user', user_id: user.id, price_level: level });
    await load();
  };

  const changeDiscountRate = async (user, rate) => {
    const val = rate === '' ? null : parseFloat(rate);
    await apiPost({ action: 'update_dealer_user', user_id: user.id, discount_rate: val });
    await load();
  };

  const PermToggle = ({ user, field, label }) => {
    const on = !!user[field];
    const isSaving = permSaving === user.id + field;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', minHeight: isMobile ? 40 : 'auto' }}>
        <span style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary }}>{label}</span>
        <button onClick={() => togglePerm(user, field)} disabled={isSaving} style={{ width: 40, height: 22, borderRadius: t.radius.pill, border: 'none', cursor: 'pointer', background: on ? t.color.success : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}>
          <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: t.color.bgCard, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </button>
      </div>
    );
  };

  return (
    <div>
      <PageLead eyebrow="DEALER USERS" title="經銷商/業務帳號" description="管理帳號、角色與權限。點擊帳號展開權限設定。" action={<button onClick={() => setShowCreate(!showCreate)} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), minHeight: isMobile ? 44 : 'auto' }}>{showCreate ? '取消' : '+ 新增帳號'}</button>} />
      {msg && <div style={{ ...S.card, background: msg.includes('失敗') || msg.includes('錯誤') ? t.color.errorBg : t.color.successBg, borderColor: msg.includes('失敗') || msg.includes('錯誤') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') || msg.includes('錯誤') ? t.color.error : '#15803d', marginBottom: 10, padding: isMobile ? '8px 12px' : '10px 16px', minHeight: isMobile ? 40 : 'auto' }}>{msg}</div>}
      {showCreate && (
        <div style={{ ...S.card, marginBottom: 10, padding: isMobile ? '8px 12px' : '10px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
            <div><label style={S.label}>帳號 *</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }} placeholder="小寫英數" /></div>
            <div><label style={S.label}>密碼 *</label><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }} placeholder="至少 4 碼" /></div>
            <div><label style={S.label}>姓名 *</label><input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }} /></div>
            <div><label style={S.label}>角色</label><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }}><option value="dealer">經銷商</option><option value="sales">業務</option><option value="technician">維修技師</option></select></div>
            <div><label style={S.label}>公司</label><input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }} /></div>
            <div><label style={S.label}>電話</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }} /></div>
          </div>
          <button onClick={createUser} disabled={saving} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), minHeight: isMobile ? 44 : 'auto', opacity: saving ? 0.7 : 1 }}>{saving ? '建立中...' : '建立帳號'}</button>
        </div>
      )}
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="尚無帳號" /> : (
        <div ref={tableRef} style={{ ...S.card, padding: isMobile ? 0 : 0, overflowX: 'auto', border: `1px solid ${t.color.border}` }}>
          {!isMobile && <ResizableHeader headers={[
            { label: '帳號', align: 'center' },
            { label: '姓名 / 公司', align: 'center' },
            { label: '角色', align: 'center' },
            { label: '電話', align: 'center' },
            { label: '狀態', align: 'center' },
            { label: '操作', align: 'center' },
          ]} />}
          {data.rows.map((u, idx) => (
            <div key={u.id}>
              <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: !isMobile ? gridTemplate : undefined, gap: 0, padding: isMobile ? '10px 12px' : 0, borderBottom: `1px solid ${t.color.borderLight}`, alignItems: 'center', background: expandedId === u.id ? '#f0f7ff' : idx % 2 === 0 ? t.color.bgCard : '#fafbfd', cursor: isMobile ? 'pointer' : 'pointer', minHeight: isMobile ? 44 : 'auto' }} onClick={() => isMobile && setExpandedId(expandedId === u.id ? null : u.id)}>
                {!isMobile ? (
                  <>
                    <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', fontSize: t.fontSize.body, color: t.color.link, fontWeight: t.fontWeight.bold, textAlign: 'center', ...S.mono }}>{u.username}</div>
                    <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'left' }}><div><div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary }}>{u.display_name}</div>{u.company_name && <div style={{ fontSize: t.fontSize.tiny, color: t.color.textSecondary }}>{u.company_name}</div>}</div></div>
                    <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center' }}><span style={S.tag(ROLE_TONE[u.role] || '')}>{ROLE_MAP[u.role] || u.role}</span></div>
                    <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', fontSize: t.fontSize.body, color: t.color.textSecondary, textAlign: 'center' }}>{u.phone || '-'}</div>
                    <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center' }}><span style={S.tag(u.status === 'active' ? 'green' : '')}>{u.status === 'active' ? '啟用' : '停用'}</span></div>
                    <div style={{ padding: '8px 10px', borderRight: 'none', display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center', minWidth: 0, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleStatus(u)} style={{ ...S.btnGhost, padding: '4px 8px', fontSize: 11, minHeight: 32 }}>{u.status === 'active' ? '停用' : '啟用'}</button>
                      <button onClick={() => resetPw(u)} style={{ ...S.btnGhost, padding: '4px 8px', fontSize: 11, minHeight: 32 }}>重設密碼</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 8 }}>{u.display_name}</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.link, fontWeight: t.fontWeight.semibold, marginBottom: 8, ...S.mono }}>{u.username}</div>
                    {u.company_name && <div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, marginBottom: 8 }}>{u.company_name}</div>}
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span>{ROLE_MAP[u.role]}</span>
                      <span>{u.phone || '-'}</span>
                      <span style={S.tag(u.status === 'active' ? 'green' : '')}>{u.status === 'active' ? '啟用' : '停用'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => toggleStatus(u)} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 12, minHeight: 40, flex: 1 }}>{u.status === 'active' ? '停用' : '啟用'}</button>
                      <button onClick={() => resetPw(u)} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 12, minHeight: 40, flex: 1 }}>重設密碼</button>
                    </div>
                  </>
                )}
              </div>
              {expandedId === u.id && (
                <div style={{ padding: isMobile ? '10px 12px' : '10px 16px', background: t.color.bgMuted, borderTop: `1px solid ${t.color.borderLight}`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  <div style={{ ...S.card, padding: isMobile ? '8px 12px' : '10px 16px', background: t.color.bgCard }}>
                    <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 6 }}>權限設定</div>
                    <PermToggle user={u} field="can_see_stock" label="查看庫存" />
                    <PermToggle user={u} field="can_place_order" label="下單權限" />
                    <PermToggle user={u} field="notify_on_arrival" label="到貨通知" />
                  </div>
                  <div style={{ ...S.card, padding: isMobile ? '8px 12px' : '10px 16px', background: t.color.bgCard }}>
                    <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 6 }}>角色與價格</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', gap: 10, flexWrap: 'wrap', minHeight: isMobile ? 40 : 'auto' }}>
                      <span style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary }}>角色</span>
                      <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} style={{ ...S.input, width: 'auto', padding: isMobile ? '6px 8px' : '4px 8px', fontSize: 12, minHeight: isMobile ? 36 : 'auto' }}>
                        <option value="dealer">經銷商</option><option value="sales">業務</option><option value="technician">維修技師</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', gap: 10, flexWrap: 'wrap', minHeight: isMobile ? 40 : 'auto' }}>
                      <span style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary }}>價格等級</span>
                      <select value={u.price_level || 'reseller'} onChange={(e) => changePriceLevel(u, e.target.value)} style={{ ...S.input, width: 'auto', padding: isMobile ? '6px 8px' : '4px 8px', fontSize: 12, minHeight: isMobile ? 36 : 'auto' }}>
                        <option value="cost">成本價</option><option value="reseller">經銷價</option><option value="retail">零售價</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', gap: 10, flexWrap: 'wrap', minHeight: isMobile ? 40 : 'auto' }}>
                      <span style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary }}>個人折扣</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <select value={u.discount_rate != null ? String(u.discount_rate) : ''} onChange={(e) => changeDiscountRate(u, e.target.value)} style={{ ...S.input, width: 'auto', padding: isMobile ? '6px 8px' : '4px 8px', fontSize: 12, minHeight: isMobile ? 36 : 'auto' }}>
                          <option value="">不設定（用預設價格）</option>
                          <option value="0.95">95折</option>
                          <option value="0.9">9折</option>
                          <option value="0.85">85折</option>
                          <option value="0.8">8折</option>
                          <option value="0.75">75折</option>
                          <option value="0.7">7折</option>
                          <option value="0.65">65折</option>
                          <option value="0.6">6折</option>
                          <option value="0.55">55折</option>
                          <option value="0.5">5折</option>
                        </select>
                        {u.discount_rate != null && <span style={{ fontSize: 11, color: t.color.brand, fontWeight: t.fontWeight.bold }}>零售價×{Math.round(u.discount_rate * 100)}%</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ ...S.card, padding: isMobile ? '8px 12px' : '10px 16px', background: t.color.bgCard }}>
                    <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 6 }}>帳號資訊</div>
                    <div style={{ fontSize: t.fontSize.tiny, color: t.color.textSecondary, display: 'grid', gap: 4 }}>
                      <div>Email: {u.email || '-'}</div>
                      <div>LINE: {u.line_user_id ? '已綁定' : '未綁定'}</div>
                      <div>上次登入: {u.last_login_at ? u.last_login_at.slice(0, 16).replace('T', ' ') : '從未登入'}</div>
                      <div>建立日期: {u.created_at ? u.created_at.slice(0, 10) : '-'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
