'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { useResponsive } from '@/lib/admin/helpers';
import { apiGet, apiPost } from '@/lib/admin/api';
import { Loading, EmptyState, PageLead } from '../shared/ui';

export default function Announcements() {
  const { isMobile } = useResponsive();
  const [anns, setAnns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', type: 'info', priority: 0, target_roles: [] });
  const [msg, setMsg] = useState('');

  const TYPE_MAP = { info: '一般', warning: '警告', success: '成功', urgent: '緊急' };
  const TYPE_TONE = { info: 'blue', warning: 'yellow', success: 'green', urgent: 'red' };
  const ROLE_OPTIONS = [
    { value: 'dealer', label: '經銷商' },
    { value: 'sales', label: '業務' },
    { value: 'technician', label: '技師' },
  ];
  const ROLE_LABEL = { dealer: '經銷商', sales: '業務', technician: '技師' };
  const ROLE_TONE = { dealer: 'blue', sales: 'yellow', technician: 'green' };
  const toggleRole = (role) => {
    setForm(f => ({ ...f, target_roles: f.target_roles.includes(role) ? f.target_roles.filter(r => r !== role) : [...f.target_roles, role] }));
  };

  const load = async () => { setLoading(true); try { const res = await apiGet({ action: 'announcements' }); setAnns(res.announcements || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await apiPost({ action: 'create_announcement', ...form });
      setMsg('公告已發布');
      setShowCreate(false);
      setForm({ title: '', content: '', type: 'info', priority: 0, target_roles: [] });
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const toggleActive = async (ann) => {
    await apiPost({ action: 'update_announcement', announcement_id: ann.id, is_active: !ann.is_active });
    await load();
  };

  const deleteAnn = async (ann) => {
    if (!confirm(`確定刪除公告「${ann.title}」？`)) return;
    await apiPost({ action: 'delete_announcement', announcement_id: ann.id });
    await load();
  };

  return (
    <div>
      <PageLead eyebrow="ANNOUNCEMENTS" title="公告管理" description="發布公告給經銷商/業務/技師，會顯示在他們的入口頁面頂部。" action={<button onClick={() => setShowCreate(!showCreate)} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), minHeight: isMobile ? 44 : 'auto' }}>{showCreate ? '取消' : '+ 發布公告'}</button>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, padding: isMobile ? '8px 12px' : '10px 16px', minHeight: isMobile ? 40 : 'auto' }}>{msg}</div>}
      {showCreate && (
        <div style={{ ...S.card, marginBottom: 16, padding: isMobile ? '8px 12px' : '10px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div><label style={S.label}>標題 *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }} placeholder="公告標題" /></div>
            <div><label style={S.label}>類型</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }}><option value="info">一般</option><option value="warning">警告</option><option value="success">成功</option><option value="urgent">緊急</option></select></div>
            <div><label style={S.label}>優先級 (數字越大越前)</label><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={S.label}>內容</label><textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: 80 }} placeholder="公告內容（可留空）" /></div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>可見角色（不選 = 全部可見）</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
              {ROLE_OPTIONS.map(r => (
                <button key={r.value} onClick={() => toggleRole(r.value)} style={{ padding: isMobile ? '8px 12px' : '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '2px solid', borderColor: form.target_roles.includes(r.value) ? '#6366f1' : '#e5e7eb', background: form.target_roles.includes(r.value) ? '#6366f1' : '#fff', color: form.target_roles.includes(r.value) ? '#fff' : '#374151', transition: 'all 0.15s', minHeight: isMobile ? 40 : 'auto', width: isMobile ? '100%' : 'auto' }}>{r.label}</button>
              ))}
            </div>
          </div>
          <button onClick={create} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), minHeight: isMobile ? 44 : 'auto' }}>發布公告</button>
        </div>
      )}
      {loading ? <Loading /> : anns.length === 0 ? <EmptyState text="沒有公告" /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {anns.map((ann) => (
            <div key={ann.id} style={{ ...S.card, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: 14, opacity: ann.is_active ? 1 : 0.5, padding: isMobile ? '8px 12px' : '12px 16px', flexDirection: isMobile ? 'column' : 'row', minHeight: isMobile ? 44 : 'auto' }}>
              <span style={S.tag(TYPE_TONE[ann.type] || 'blue')}>{TYPE_MAP[ann.type] || ann.type}</span>
              <div style={{ flex: 1, width: isMobile ? '100%' : 'auto' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{ann.title}</div>
                {ann.content && <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>{ann.content}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: '#9ca3af', ...S.mono }}>{ann.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  {ann.target_roles && ann.target_roles.length > 0 ? ann.target_roles.map(r => (
                    <span key={r} style={S.tag(ROLE_TONE[r] || 'blue')}>{ROLE_LABEL[r] || r}</span>
                  )) : <span style={S.tag('')}>全部</span>}
                </div>
              </div>
              <span style={S.tag(ann.is_active ? 'green' : '')}>{ann.is_active ? '啟用' : '停用'}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                <button onClick={() => toggleActive(ann)} style={{ ...S.btnGhost, padding: isMobile ? '6px 12px' : '4px 10px', fontSize: 11, minHeight: isMobile ? 40 : 'auto', flex: isMobile ? 1 : 'auto' }}>{ann.is_active ? '停用' : '啟用'}</button>
                <button onClick={() => deleteAnn(ann)} style={{ ...S.btnGhost, padding: isMobile ? '6px 12px' : '4px 10px', fontSize: 11, color: '#ef4444', borderColor: '#fecdd3', minHeight: isMobile ? 40 : 'auto', flex: isMobile ? 1 : 'auto' }}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
