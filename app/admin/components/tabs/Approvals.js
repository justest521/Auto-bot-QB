'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead } from '../shared/ui';

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

export default function Approvals() {
  const [data, setData] = useState({ rows: [], total: 0, pending_count: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [msg, setMsg] = useState('');
  const [noteDialog, setNoteDialog] = useState(null);
  const [note, setNote] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = async (status = statusFilter) => {
    setLoading(true);
    try { const res = await apiGet({ action: 'approvals', status }); setData(res); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const STATUS_MAP = {
    pending: { label: '待審核', color: '#f59e0b' },
    approved: { label: '已核准', color: '#16a34a' },
    rejected: { label: '已駁回', color: '#dc2626' },
  };
  const TYPE_MAP = {
    purchase_order: '採購單', quote: '報價單', order: '訂單', sale: '銷貨單', expense: '費用', other: '其他',
  };

  const handleProcess = async (approval, decision) => {
    if (decision === 'rejected' && !note.trim()) {
      setNoteDialog(approval); return;
    }
    try {
      await apiPost({ action: 'process_approval', approval_id: approval.id, decision, note: note || '' });
      setMsg(decision === 'approved' ? '已核准' : '已駁回');
      setNoteDialog(null); setNote('');
      await load();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <PageLead eyebrow="APPROVALS" title="簽核審批" description="集中管理採購單、報價單等文件的核准流程，參考 Odoo 審批模組。" />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={S.statGrid}>
        <StatCard code="PEND" label="待審核" value={data.pending_count || 0} tone="yellow" />
        <StatCard code="TOTL" label="全部" value={data.total} tone="blue" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_MAP).map(([k, v]) => (
          <button key={k} onClick={() => { setStatusFilter(k); load(k); }} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: v.color, background: statusFilter === k ? v.color : '#fff', color: statusFilter === k ? '#fff' : v.color }}>{v.label}</button>
        ))}
      </div>

      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有審批記錄" /> : (data.rows || []).map(a => {
        const st = STATUS_MAP[a.status] || STATUS_MAP.pending;
        const customerName = a.customer?.company_name || a.customer?.name || a.vendor?.company_name || a.vendor?.name || '';
        const isExpanded = expandedId === a.id;
        const items = a.items || [];
        return (
          <div key={a.id} style={{ ...S.card, marginBottom: 10, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ padding: '14px 18px', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : a.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 11 }}>{st.label}</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                    {TYPE_MAP[a.doc_type] || a.doc_type} — <span style={{ ...S.mono }}>{a.doc_no || a.doc_id}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                    {customerName && <span style={{ color: '#1f2937', fontWeight: 600 }}>{customerName}</span>}
                    {customerName && ' · '}
                    申請人：{a.requested_by || '-'} · {a.created_at?.slice(0, 10)}
                  </div>
                  {a.remark && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>備註：{a.remark}</div>}
                </div>
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: a.amount ? '#10b981' : '#9ca3af', ...S.mono }}>{a.amount ? fmtP(a.amount) : '-'}</div>
                  {items.length > 0 && <div style={{ fontSize: 11, color: '#6b7280' }}>{items.length} 品項</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { const pdfType = a.doc_type === 'purchase_order' ? 'purchase_order' : a.doc_type === 'quote' ? 'quote' : a.doc_type === 'sale' ? 'sale' : 'order'; window.open(`/api/pdf?type=${pdfType}&id=${a.doc_id}`, '_blank'); }} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 11 }}>PDF</button>
                  {a.status === 'pending' && (
                    <>
                      <button onClick={() => handleProcess(a, 'approved')} style={{ ...S.btnPrimary, padding: '6px 16px', fontSize: 12 }}>核准</button>
                      <button onClick={() => { setNoteDialog(a); setNote(''); }} style={{ ...S.btnGhost, padding: '6px 16px', fontSize: 12, borderColor: '#dc2626', color: '#dc2626' }}>駁回</button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Item details - always shown */}
            {items.length > 0 && (
              <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 18px', background: '#fafbfd' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>料號</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>品名</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>數量</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>單價</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '6px 8px', ...S.mono, color: '#1f2937' }}>{item.item_number || '-'}</td>
                        <td style={{ padding: '6px 8px', color: '#374151', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '-'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', ...S.mono }}>{item.quantity || 0}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', ...S.mono }}>{fmtP(item.unit_price)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', ...S.mono, color: '#10b981', fontWeight: 700 }}>{fmtP(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Customer history */}
            {a.customer_history && (
              <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 18px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>客戶歷史</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>共 {a.customer_history.order_count} 筆訂單</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', ...S.mono }}>{fmtP(a.customer_history.total_spent)}</div>
                </div>
                {a.customer_history.recent_orders && a.customer_history.recent_orders.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {a.customer_history.recent_orders.map((o, idx) => (
                      <div key={idx} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                        <span style={{ ...S.mono, color: '#1f2937', fontWeight: 600 }}>{o.order_no}</span>
                        <span style={{ color: '#6b7280', margin: '0 4px' }}>{o.date}</span>
                        <span style={{ ...S.mono, color: '#10b981', fontWeight: 700 }}>{fmtP(o.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Approved/Rejected info */}
            {a.status !== 'pending' && (
              <div style={{ borderTop: '1px solid #f0f0f0', padding: '10px 18px', background: a.status === 'approved' ? '#f0fdf4' : '#fef2f2', display: 'flex', gap: 12, alignItems: 'center', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: a.status === 'approved' ? '#16a34a' : '#dc2626' }}>{a.status === 'approved' ? '已核准' : '已駁回'}</span>
                <span style={{ color: '#6b7280' }}>審核人：{a.approved_by || '-'}</span>
                <span style={{ color: '#6b7280' }}>{a.approved_at?.slice(0, 16).replace('T', ' ')}</span>
                {a.rejected_reason && <span style={{ color: '#dc2626' }}>原因：{a.rejected_reason}</span>}
              </div>
            )}
          </div>
        );
      })}

      {noteDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 420, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>駁回原因</h3>
            <div style={{ marginBottom: 12 }}><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="請說明駁回原因..." style={{ ...S.input, minHeight: 80 }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setNoteDialog(null)} style={S.btnGhost}>取消</button>
              <button onClick={() => handleProcess(noteDialog, 'rejected')} style={{ ...S.btnPrimary, background: '#dc2626' }}>確認駁回</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
