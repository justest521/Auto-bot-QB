'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { Loading, EmptyState, PageLead } from '../shared/ui';
import { exportCsv, getPresetDateRange } from '@/lib/admin/helpers';

function StatCard({ code, label, value, tone }) {
  const TONE_MAP = {
    red: { bg: '#fee2e2', color: '#dc2626' },
    yellow: { bg: '#fef3c7', color: '#d97706' },
    blue: { bg: '#dbeafe', color: '#2563eb' },
    green: { bg: '#dcfce7', color: '#16a34a' },
    gray: { bg: '#f3f4f6', color: '#6b7280' },
  };
  const t = TONE_MAP[tone] || TONE_MAP.gray;
  return (
    <div style={{ ...S.card, padding: '16px', textAlign: 'center', borderTop: `3px solid ${t.color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: t.color, ...S.mono }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function Tickets() {
  const [data, setData] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', source: 'admin' });
  const [detail, setDetail] = useState(null);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');
  // Date filter
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [search, setSearch] = useState('');

  const load = async (status = statusFilter) => {
    setLoading(true);
    try { const res = await apiGet({ action: 'tickets', status, search, date_from: dateFrom, date_to: dateTo }); setData(res); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [statusFilter, search, dateFrom, dateTo]);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load();

  const STATUS_MAP = {
    open: { label: '開立', color: '#3b82f6' },
    in_progress: { label: '處理中', color: '#f59e0b' },
    resolved: { label: '已解決', color: '#16a34a' },
    closed: { label: '已關閉', color: '#6b7280' },
  };
  const PRIORITY_MAP = {
    low: { label: '低', color: '#9ca3af' },
    medium: { label: '中', color: '#3b82f6' },
    high: { label: '高', color: '#f59e0b' },
    urgent: { label: '緊急', color: '#dc2626' },
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { setMsg('請輸入工單標題'); return; }
    try { await apiPost({ action: 'create_ticket', ...form }); setCreateOpen(false); setForm({ title: '', description: '', priority: 'medium', source: 'admin' }); setMsg('工單已建立'); await load(); } catch (e) { setMsg(e.message); }
  };

  const openDetail = async (ticket) => {
    try {
      const res = await apiGet({ action: 'ticket_detail', ticket_id: ticket.id });
      setDetail(res.ticket || ticket);
      setReplies(res.replies || []);
    } catch (e) { setMsg(e.message); }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !detail) return;
    try {
      await apiPost({ action: 'reply_ticket', ticket_id: detail.id, content: replyText, sender_type: 'admin', sender_name: '管理員' });
      setReplyText('');
      await openDetail(detail);
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const updateStatus = async (ticketId, newStatus) => {
    try { await apiPost({ action: 'update_ticket', ticket_id: ticketId, status: newStatus }); setMsg('狀態已更新'); if (detail?.id === ticketId) await openDetail({ id: ticketId }); await load(); } catch (e) { setMsg(e.message); }
  };

  const handleExport = async () => {
    try {
      const result = await apiGet({ action: 'tickets', status: statusFilter, limit: '9999', export: 'true' });
      const columns = [
        { key: 'ticket_no', label: '工單號' },
        { key: 'customer_name', label: '客戶' },
        { key: 'title', label: '標題' },
        { key: 'status', label: '狀態' },
        { key: 'priority', label: '優先度' },
        { key: 'created_at', label: '建立時間' },
        { key: 'source', label: '來源' },
      ];
      exportCsv(result.rows || [], columns, `工單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert('匯出失敗: ' + e.message); }
  };

  const sm = data.summary || {};

  return (
    <div>
      <PageLead eyebrow="HELPDESK" title="客服工單" description="客服工單管理，可結合 LINE 訊息自動建立。參考 Odoo Helpdesk。" action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button><button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增工單</button></div>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={S.statGrid}>
        <StatCard code="OPEN" label="開立" value={sm.open || 0} tone="blue" />
        <StatCard code="PROG" label="處理中" value={sm.in_progress || 0} tone="yellow" />
        <StatCard code="DONE" label="已解決" value={sm.resolved || 0} tone="green" />
      </div>

      <div style={{ ...S.card, marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, fontSize: 13, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="open">開啟</option>
            <option value="in_progress">處理中</option>
            <option value="resolved">已解決</option>
            <option value="closed">已關閉</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋工單號、客戶..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: '6px 16px', fontSize: 13 }}>查詢</button>
        </div>
      </div>

      {/* Ticket detail panel */}
      {detail && (
        <div style={{ ...S.card, padding: '16px', marginBottom: 16, borderLeft: `3px solid ${STATUS_MAP[detail.status]?.color || '#3b82f6'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{detail.title}</span>
              <span style={{ marginLeft: 10, ...S.tag(''), background: STATUS_MAP[detail.status]?.color || '#3b82f6', color: '#fff', fontSize: 10 }}>{STATUS_MAP[detail.status]?.label || detail.status}</span>
              <span style={{ marginLeft: 6, ...S.tag(''), background: PRIORITY_MAP[detail.priority]?.color || '#3b82f6', color: '#fff', fontSize: 10 }}>{PRIORITY_MAP[detail.priority]?.label || detail.priority}</span>
            </div>
            <button onClick={() => setDetail(null)} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11 }}>關閉</button>
          </div>
          {detail.description && <div style={{ fontSize: 13, color: '#374151', marginBottom: 12, padding: '10px', background: '#f3f4f6', borderRadius: 6 }}>{detail.description}</div>}
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>來源：{detail.source || '-'} · 建立：{detail.created_at?.slice(0, 16)} · {detail.customer_name ? `客戶：${detail.customer_name}` : ''}</div>

          {/* Status actions */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {detail.status !== 'resolved' && <button onClick={() => updateStatus(detail.id, 'resolved')} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: '#16a34a', color: '#16a34a' }}>標記已解決</button>}
            {detail.status !== 'closed' && detail.status === 'resolved' && <button onClick={() => updateStatus(detail.id, 'closed')} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: '#6b7280', color: '#6b7280' }}>關閉工單</button>}
            {detail.status === 'open' && <button onClick={() => updateStatus(detail.id, 'in_progress')} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: '#f59e0b', color: '#f59e0b' }}>開始處理</button>}
          </div>

          {/* Replies */}
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 10 }}>回覆記錄 ({replies.length})</div>
            {replies.map((r, i) => (
              <div key={i} style={{ marginBottom: 8, padding: '10px 12px', background: r.sender_type === 'admin' ? '#dcfce7' : '#f3f4f6', borderRadius: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: r.sender_type === 'admin' ? '#3b82f6' : '#374151' }}>{r.sender_name || r.sender_type}</span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>{r.created_at?.slice(0, 16)}</span>
                </div>
                <div style={{ color: '#374151' }}>{r.content}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="輸入回覆..." style={{ ...S.input, flex: 1 }} onKeyDown={e => e.key === 'Enter' && handleReply()} />
              <button onClick={handleReply} style={S.btnPrimary}>送出</button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket list */}
      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有工單" /> : (data.rows || []).map(t => {
        const st = STATUS_MAP[t.status] || STATUS_MAP.open;
        const pr = PRIORITY_MAP[t.priority] || PRIORITY_MAP.medium;
        return (
          <div key={t.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', borderLeft: `3px solid ${st.color}` }} onClick={() => openDetail(t)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 11 }}>{st.label}</span>
              <span style={{ ...S.tag(''), background: pr.color, color: '#fff', fontSize: 10 }}>{pr.label}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{t.title}</div>
                <div style={{ fontSize: 11, color: '#374151' }}>{t.customer_name || t.source || '-'} · {t.created_at?.slice(0, 10)}</div>
              </div>
              {t.reply_count > 0 && <span style={{ ...S.tag(''), fontSize: 10 }}>{t.reply_count} 回覆</span>}
            </div>
          </div>
        );
      })}

      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 480, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增工單</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>標題 *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={S.input} /></div>
              <div><label style={S.label}>優先度</label><select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={S.input}><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="urgent">緊急</option></select></div>
              <div><label style={S.label}>來源</label><select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={S.input}><option value="admin">管理員</option><option value="line">LINE</option><option value="email">Email</option><option value="phone">電話</option></select></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>描述</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...S.input, minHeight: 80 }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button><button onClick={handleCreate} style={S.btnPrimary}>建立工單</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
