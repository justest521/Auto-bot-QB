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

/* Customer History Modal */
function CustomerHistoryModal({ history, customerName, onClose }) {
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  if (!history) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, width: 680, maxWidth: '92vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Modal header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{customerName} — 歷史訂單</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
              共 {history.order_count} 筆訂單，累計 <span style={{ ...S.mono, color: '#2563eb', fontWeight: 800 }}>{fmtP(history.total_spent)}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        {/* Order list */}
        <div style={{ overflow: 'auto', flex: 1, padding: '12px 22px' }}>
          {(history.recent_orders || []).map((o, idx) => {
            const isOpen = expandedOrderId === (o.order_id || idx);
            const statusColor = o.status === 'confirmed' ? '#16a34a' : o.status === 'pending' ? '#f59e0b' : '#6b7280';
            return (
              <div key={o.order_id || idx} style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                {/* Order header */}
                <div style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: isOpen ? '#f8fafc' : '#fff' }} onClick={() => setExpandedOrderId(isOpen ? null : (o.order_id || idx))}>
                  <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{o.order_no}</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{o.date}</span>
                  <span style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>{o.status === 'confirmed' ? '已確認' : o.status === 'pending' ? '待處理' : o.status}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ ...S.mono, fontSize: 14, fontWeight: 800, color: '#10b981' }}>{fmtP(o.amount)}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{o.items?.length || 0} 品項 {isOpen ? '▲' : '▼'}</span>
                </div>
                {/* Order items */}
                {isOpen && o.items && o.items.length > 0 && (
                  <div style={{ borderTop: '1px solid #f0f0f0', padding: '8px 14px', background: '#fafbfd' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>料號</th>
                          <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>品名</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>數量</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>單價</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>小計</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.items.map((item, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '4px 6px', ...S.mono, color: '#1f2937' }}>{item.item_number || '-'}</td>
                            <td style={{ padding: '4px 6px', color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '-'}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', ...S.mono }}>{item.quantity || 0}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', ...S.mono }}>{fmtP(item.unit_price)}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', ...S.mono, color: '#10b981', fontWeight: 700 }}>{fmtP(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Approvals() {
  const [data, setData] = useState({ rows: [], total: 0, pending_count: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [noteDialog, setNoteDialog] = useState(null);
  const [note, setNote] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [historyModal, setHistoryModal] = useState(null); // { history, customerName }

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
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 10, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={S.statGrid}>
        <StatCard code="PEND" label="待審核" value={data.pending_count || 0} tone="yellow" />
        <StatCard code="TOTL" label="全部" value={data.total} tone="blue" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_MAP).map(([k, v]) => (
          <button key={k} onClick={() => { setStatusFilter(k); load(k); }} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: v.color, background: statusFilter === k ? v.color : '#fff', color: statusFilter === k ? '#fff' : v.color }}>{v.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {[['', '全部類型'], ['order', '訂單'], ['sale', '銷貨單'], ['purchase_order', '採購單']].map(([k, label]) => (
          <button key={k} onClick={() => setTypeFilter(k)} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11, background: typeFilter === k ? '#374151' : '#fff', color: typeFilter === k ? '#fff' : '#6b7280', borderColor: typeFilter === k ? '#374151' : '#e5e7eb' }}>{label}</button>
        ))}
      </div>

      {loading ? <Loading /> : (() => {
        const filtered = (data.rows || []).filter(a => !typeFilter || a.doc_type === typeFilter);
        return filtered.length === 0 ? <EmptyState text="沒有審批記錄" /> : filtered.map(a => {
        const st = STATUS_MAP[a.status] || STATUS_MAP.pending;
        const customerName = a.customer?.company_name || a.customer?.name || a.vendor?.company_name || a.vendor?.name || '';
        const isExpanded = expandedId === a.id;
        const items = a.items || [];
        return (
          <div key={a.id} style={{ ...S.card, marginBottom: 10, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ padding: '10px 16px', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : a.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
                  {items.length > 0 && <div style={{ fontSize: 11, color: '#6b7280' }}>{items.length} 品項 {isExpanded ? '▲' : '▼'}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  {a.customer_history && (
                    <button onClick={() => setHistoryModal({ history: a.customer_history, customerName })} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 11, borderColor: '#2563eb', color: '#2563eb' }}>客戶歷史</button>
                  )}
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

            {/* Item details - collapsible with cost/profit analysis */}
            {isExpanded && items.length > 0 && (() => {
              const hasCost = items.some(i => i.cost_price > 0);
              const isPO = a.doc_type === 'purchase_order';
              const totalSell = items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
              const totalCost = items.reduce((s, i) => s + (Number(i.cost_price || 0) * Number(i.quantity || 0)), 0);
              const totalProfit = totalSell - totalCost;
              const marginPct = totalSell > 0 ? ((totalProfit / totalSell) * 100).toFixed(1) : '0.0';
              return (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '10px 16px', background: '#fafbfd' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>料號</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>品名</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>數量</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>{isPO ? '採購價' : '售價'}</th>
                        {hasCost && !isPO && <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>成本</th>}
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>小計</th>
                        {hasCost && !isPO && <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>毛利</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const qty = Number(item.quantity || 0);
                        const sell = Number(item.subtotal || 0);
                        const cost = Number(item.cost_price || 0);
                        const profit = sell - (cost * qty);
                        const itemMargin = sell > 0 ? ((profit / sell) * 100).toFixed(0) : '-';
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 8px', ...S.mono, color: '#1f2937' }}>{item.item_number || '-'}</td>
                            <td style={{ padding: '6px 8px', color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '-'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', ...S.mono }}>{qty}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', ...S.mono }}>{fmtP(item.unit_price)}</td>
                            {hasCost && !isPO && <td style={{ padding: '6px 8px', textAlign: 'right', ...S.mono, color: '#6b7280', fontSize: 11 }}>{fmtP(cost)}</td>}
                            <td style={{ padding: '6px 8px', textAlign: 'right', ...S.mono, color: '#10b981', fontWeight: 700 }}>{fmtP(sell)}</td>
                            {hasCost && !isPO && <td style={{ padding: '6px 8px', textAlign: 'right', ...S.mono, color: profit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 11 }}>{fmtP(profit)} <span style={{ fontSize: 10, color: '#9ca3af' }}>({itemMargin}%)</span></td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {/* Profit summary bar */}
                  {hasCost && !isPO && (
                    <div style={{ marginTop: 10, padding: '10px 12px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', border: '1px solid #bbf7d0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#374151' }}>
                        <span>售價合計 <strong style={{ ...S.mono, color: '#111827' }}>{fmtP(totalSell)}</strong></span>
                        <span>成本合計 <strong style={{ ...S.mono, color: '#6b7280' }}>{fmtP(totalCost)}</strong></span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                        <span style={{ fontSize: 12, color: '#374151' }}>毛利</span>
                        <span style={{ ...S.mono, fontSize: 18, fontWeight: 800, color: totalProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmtP(totalProfit)}</span>
                        <span style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: totalProfit >= 0 ? '#16a34a' : '#dc2626', background: totalProfit >= 0 ? '#dcfce7' : '#fee2e2', padding: '2px 8px', borderRadius: 4 }}>{marginPct}%</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Approved/Rejected info */}
            {a.status !== 'pending' && (
              <div style={{ borderTop: '1px solid #f0f0f0', padding: '10px 16px', background: a.status === 'approved' ? '#f0fdf4' : '#fef2f2', display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: a.status === 'approved' ? '#16a34a' : '#dc2626' }}>{a.status === 'approved' ? '已核准' : '已駁回'}</span>
                <span style={{ color: '#6b7280' }}>審核人：{a.approved_by || '-'}</span>
                <span style={{ color: '#6b7280' }}>{a.approved_at?.slice(0, 16).replace('T', ' ')}</span>
                {a.rejected_reason && <span style={{ color: '#dc2626' }}>原因：{a.rejected_reason}</span>}
              </div>
            )}
          </div>
        );
      });
      })()}

      {/* Customer History Modal */}
      {historyModal && (
        <CustomerHistoryModal history={historyModal.history} customerName={historyModal.customerName} onClose={() => setHistoryModal(null)} />
      )}

      {/* Reject reason dialog */}
      {noteDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 420, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>駁回原因</h3>
            <div style={{ marginBottom: 10 }}><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="請說明駁回原因..." style={{ ...S.input, minHeight: 80 }} /></div>
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
