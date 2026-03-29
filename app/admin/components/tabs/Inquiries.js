'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtDate, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { StatCard } from '../shared/ui';

export default function Inquiries() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ inquiries: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ customer_id: '', subject: '', description: '', priority: 'normal' });

  const load = useCallback(async (page = 1, q = search, st = statusF) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'inquiries', page: String(page), search: q, status: st })); } finally { setLoading(false); }
  }, [search, statusF]);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try { await apiPost({ action: 'create_inquiry', ...form }); setCreateOpen(false); setForm({ customer_id: '', subject: '', description: '', priority: 'normal' }); load(); } catch (e) { alert(e.message); }
  };

  const handleStatus = async (id, status) => {
    try { await apiPost({ action: 'update_inquiry_status', inquiry_id: id, status }); load(); } catch (e) { alert(e.message); }
  };

  const sm = data.summary || {};
  const statusLabel = (s) => ({ open: '待處理', quoted: '已報價', closed: '已結案', cancelled: '已取消' })[s] || s;
  const statusColor = (s) => ({ open: 'default', quoted: 'green', closed: 'green', cancelled: 'red' })[s] || 'default';
  const priorityColor = (p) => ({ high: 'red', urgent: 'red', normal: 'default', low: 'green' })[p] || 'default';

  return (
    <div>
      <PageLead eyebrow="Inquiries" title="詢價管理" description="追蹤客戶詢價需求，可轉報價單進入正式交易流程。"
        action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增詢價</button>} />
      <div style={{ ...S.statGrid, gap: 10, marginBottom: 10 }}>
        <StatCard code="OPEN" label="待處理" value={fmt(sm.open)} tone="blue" accent="#f59e0b" />
        <StatCard code="QUOT" label="已報價" value={fmt(sm.quoted)} tone="blue" accent="#3b82f6" />
        <StatCard code="CLSD" label="已結案" value={fmt(sm.closed)} tone="blue" accent="#16a34a" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusF)} placeholder="搜尋詢價單號或主旨..." style={{ ...S.input, ...S.mobile.input, flex: 1 }} />
        <select value={statusF} onChange={(e) => { setStatusF(e.target.value); load(1, search, e.target.value); }} style={{ ...S.input, ...(isMobile && S.mobile.input), width: isMobile ? '100%' : 140 }}>
          <option value="">全部狀態</option><option value="open">待處理</option><option value="quoted">已報價</option><option value="closed">已結案</option>
        </select>
        <button onClick={() => load(1, search, statusF)} style={{ ...S.btnPrimary, ...(isMobile && { ...S.mobile.btnPrimary, marginTop: 0 }) }}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.inquiries.length === 0 ? <EmptyState text="目前沒有詢價記錄" /> : data.inquiries.map(inq => (
        <div key={inq.id} style={{ ...S.card, padding: '10px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px minmax(0,1fr) 80px 100px 140px', gap: 12, alignItems: 'center' }}>
            <div><div style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>INQ_NO</div><div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{inq.inquiry_no || '-'}</div></div>
            <div><div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{inq.subject || '-'}</div><div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{(inq.description || '').slice(0, 80)}{(inq.description || '').length > 80 ? '...' : ''}</div></div>
            <div><span style={S.tag(priorityColor(inq.priority))}>{inq.priority || 'normal'}</span></div>
            <div><div style={{ fontSize: 12 }}>{fmtDate(inq.inquiry_date || inq.created_at)}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={S.tag(statusColor(inq.status))}>{statusLabel(inq.status)}</span>
              {inq.status === 'open' && <button onClick={() => handleStatus(inq.id, 'quoted')} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11 }}>已報價</button>}
              {inq.status === 'quoted' && <button onClick={() => handleStatus(inq.id, 'closed')} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11 }}>結案</button>}
            </div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
          <div style={{ ...S.card, width: isMobile ? '100%' : 440, maxWidth: isMobile ? '100%' : '90vw', maxHeight: isMobile ? '90vh' : 'auto', overflowY: isMobile ? 'auto' : 'visible', borderRadius: isMobile ? '16px 16px 0 0' : 14, padding: '10px 16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>新增詢價</h3>
            <div style={{ marginBottom: 10 }}><label style={{ ...S.label, marginBottom: 6 }}>客戶 ID (選填)</label><input value={form.customer_id} onChange={(e) => setForm(p => ({ ...p, customer_id: e.target.value }))} style={{ ...S.input, ...S.mobile.input }} /></div>
            <div style={{ marginBottom: 10 }}><label style={{ ...S.label, marginBottom: 6 }}>主旨 *</label><input value={form.subject} onChange={(e) => setForm(p => ({ ...p, subject: e.target.value }))} style={{ ...S.input, ...S.mobile.input }} /></div>
            <div style={{ marginBottom: 10 }}><label style={{ ...S.label, marginBottom: 6 }}>說明</label><textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...S.input, ...S.mobile.input, minHeight: 80 }} /></div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ ...S.label, marginBottom: 6 }}>優先度</label>
              <select value={form.priority} onChange={(e) => setForm(p => ({ ...p, priority: e.target.value }))} style={{ ...S.input, ...S.mobile.input }}>
                <option value="low">低</option><option value="normal">一般</option><option value="high">高</option><option value="urgent">緊急</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, ...(isMobile && { width: '100%' }) }}>取消</button>
              <button onClick={handleCreate} style={{ ...S.btnPrimary, ...(isMobile && S.mobile.btnPrimary) }}>建立詢價</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
