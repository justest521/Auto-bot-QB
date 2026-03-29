'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead } from '../shared/ui';

/* Customer History Modal */
function CustomerHistoryModal({ history, customerName, onClose }) {
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const { isMobile } = useResponsive();
  if (!history) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, ...(isMobile ? S.mobileModal : {}), width: isMobile ? undefined : 680, maxWidth: '92vw', maxHeight: isMobile ? '85vh' : '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ ...(isMobile ? S.mobileModalHeader : {}), padding: isMobile ? '14px 14px' : '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: '#111827' }}>{customerName} — 歷史訂單</div>
            <div style={{ fontSize: isMobile ? 10 : 11, color: '#6b7280', marginTop: 2 }}>
              共 {history.order_count} 筆訂單，累計 <span style={{ ...S.mono, color: '#2563eb', fontWeight: 800 }}>{fmtP(history.total_spent)}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ ...S.btnGhost, padding: '2px 10px', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ ...(isMobile ? S.mobileModalBody : {}), overflow: 'auto', flex: 1, padding: isMobile ? '10px 12px' : '10px 18px' }}>
          {(history.recent_orders || []).map((o, idx) => {
            const isOpen = expandedOrderId === (o.order_id || idx);
            const statusColor = o.status === 'confirmed' ? '#16a34a' : o.status === 'pending' ? '#f59e0b' : '#6b7280';
            return (
              <div key={o.order_id || idx} style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
                <div style={{ padding: isMobile ? '8px 10px' : '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10, background: isOpen ? '#f8fafc' : '#fff', flexWrap: isMobile ? 'wrap' : 'nowrap' }} onClick={() => setExpandedOrderId(isOpen ? null : (o.order_id || idx))}>
                  <span style={{ ...S.mono, fontSize: isMobile ? 11 : 12, fontWeight: 700, color: '#1f2937' }}>{o.order_no}</span>
                  <span style={{ fontSize: isMobile ? 10 : 11, color: '#6b7280' }}>{o.date}</span>
                  <span style={{ fontSize: isMobile ? 10 : 11, color: statusColor, fontWeight: 600 }}>{o.status === 'confirmed' ? '已核准' : o.status === 'pending' ? '待處理' : o.status}</span>
                  <span style={{ flex: isMobile ? undefined : 1 }} />
                  <span style={{ ...S.mono, fontSize: isMobile ? 12 : 13, fontWeight: 800, color: '#10b981' }}>{fmtP(o.amount)}</span>
                  <span style={{ fontSize: isMobile ? 9 : 10, color: '#9ca3af' }}>{o.items?.length || 0} 品項 {isOpen ? '▲' : '▼'}</span>
                </div>
                {isOpen && o.items && o.items.length > 0 && (
                  <div style={{ borderTop: '1px solid #f0f0f0', padding: isMobile ? '6px 10px' : '6px 12px', background: '#fafbfd', ...(isMobile ? S.tableScroll : {}) }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? 10 : 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ textAlign: 'left', padding: '3px 6px', color: '#6b7280', fontWeight: 600 }}>料號</th>
                          <th style={{ textAlign: 'left', padding: '3px 6px', color: '#6b7280', fontWeight: 600 }}>品名</th>
                          <th style={{ textAlign: 'right', padding: '3px 6px', color: '#6b7280', fontWeight: 600 }}>數量</th>
                          <th style={{ textAlign: 'right', padding: '3px 6px', color: '#6b7280', fontWeight: 600 }}>單價</th>
                          <th style={{ textAlign: 'right', padding: '3px 6px', color: '#6b7280', fontWeight: 600 }}>小計</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.items.map((item, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '3px 6px', ...S.mono, color: '#1f2937' }}>{item.item_number || '-'}</td>
                            <td style={{ padding: '3px 6px', color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '-'}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'right', ...S.mono }}>{item.quantity || 0}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'right', ...S.mono }}>{fmtP(item.unit_price)}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'right', ...S.mono, color: '#10b981', fontWeight: 700 }}>{fmtP(item.subtotal)}</td>
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
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, pending_count: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [noteDialog, setNoteDialog] = useState(null);
  const [note, setNote] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);

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
      <PageLead eyebrow="APPROVALS" title="簽核審批" description="集中管理文件的核准流程。" />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      {/* Compact header: stats + filters in one row */}
      <div style={{ ...S.card, padding: isMobile ? '10px 12px' : '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16, flexWrap: 'wrap' }}>
        {/* Stats chips */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: '#fef3c7' }}>
            <span style={{ ...S.mono, fontSize: isMobile ? 14 : 16, fontWeight: 800, color: '#d97706' }}>{data.pending_count || 0}</span>
            <span style={{ fontSize: isMobile ? 10 : 11, color: '#92400e' }}>待審核</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: '#dbeafe' }}>
            <span style={{ ...S.mono, fontSize: isMobile ? 14 : 16, fontWeight: 800, color: '#2563eb' }}>{data.total}</span>
            <span style={{ fontSize: isMobile ? 10 : 11, color: '#1e40af' }}>全部</span>
          </div>
        </div>

        {!isMobile && <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />}

        {/* Status filters */}
        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(STATUS_MAP).map(([k, v]) => (
            <button key={k} onClick={() => { setStatusFilter(k); load(k); }} style={{ ...S.btnGhost, padding: isMobile ? '3px 8px' : '3px 10px', fontSize: isMobile ? 10 : 11, borderColor: statusFilter === k ? v.color : '#e5e7eb', background: statusFilter === k ? v.color : '#fff', color: statusFilter === k ? '#fff' : v.color }}>{v.label}</button>
          ))}
        </div>

        {!isMobile && <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />}

        {/* Type filters */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 4 }}>
            {[['', '全部'], ['order', '訂單'], ['purchase_order', '採購單']].map(([k, label]) => (
              <button key={k} onClick={() => setTypeFilter(k)} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11, background: typeFilter === k ? '#374151' : '#fff', color: typeFilter === k ? '#fff' : '#6b7280', borderColor: typeFilter === k ? '#374151' : '#e5e7eb' }}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Approval list */}
      {loading ? <Loading /> : (() => {
        const filtered = (data.rows || []).filter(a => a.doc_type !== 'sale').filter(a => !typeFilter || a.doc_type === typeFilter);
        return filtered.length === 0 ? <EmptyState text="沒有審批記錄" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(a => {
              const st = STATUS_MAP[a.status] || STATUS_MAP.pending;
              const customerName = a.customer?.company_name || a.customer?.name || a.vendor?.company_name || a.vendor?.name || '';
              const isExpanded = expandedId === a.id;
              const items = a.items || [];
              return (
                <div key={a.id} style={{ ...S.card, marginBottom: 0, overflow: 'hidden', padding: 0 }}>
                  {/* Header row */}
                  <div style={{ padding: isMobile ? '10px 12px' : '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }} onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                    {/* Status badge */}
                    <span style={{ fontSize: isMobile ? 9 : 10, fontWeight: 700, color: '#fff', background: st.color, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap', minWidth: isMobile ? 40 : 42, textAlign: 'center' }}>{st.label}</span>

                    {/* Doc info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 700, color: '#111827' }}>{TYPE_MAP[a.doc_type] || a.doc_type}</span>
                        <span style={{ ...S.mono, fontSize: isMobile ? 11 : 12, color: '#6b7280' }}>{a.doc_no || a.doc_id}</span>
                      </div>
                      <div style={{ fontSize: isMobile ? 10 : 11, color: '#9ca3af', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {customerName && <span style={{ color: '#4b5563', fontWeight: 600 }}>{customerName}</span>}
                        <span>申請人：{a.requested_by || '-'}</span>
                        <span>{a.created_at?.slice(0, 10)}</span>
                      </div>
                    </div>

                    {/* Amount + items count */}
                    {!isMobile && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: a.amount ? '#10b981' : '#d1d5db', ...S.mono }}>{a.amount ? fmtP(a.amount) : '-'}</div>
                        {items.length > 0 && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{items.length} 品項 {isExpanded ? '▲' : '▼'}</div>}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: isMobile ? 3 : 4, alignItems: 'center', flexShrink: 0, ...(isMobile ? { width: '100%', marginTop: 8 } : {}) }} onClick={e => e.stopPropagation()}>
                      {a.customer_history && (
                        <button onClick={() => setHistoryModal({ history: a.customer_history, customerName })} style={{ ...S.btnGhost, padding: isMobile ? '4px 6px' : '4px 8px', fontSize: isMobile ? 9 : 10, borderColor: '#2563eb', color: '#2563eb', minHeight: isMobile ? 44 : undefined }}>{isMobile ? '歷史' : '客戶歷史'}</button>
                      )}
                      <button onClick={() => { const pdfType = a.doc_type === 'purchase_order' ? 'purchase_order' : a.doc_type === 'quote' ? 'quote' : a.doc_type === 'sale' ? 'sale' : 'order'; window.open(`/api/pdf?type=${pdfType}&id=${a.doc_id}`, '_blank'); }} style={{ ...S.btnGhost, padding: isMobile ? '4px 6px' : '4px 8px', fontSize: isMobile ? 9 : 10, minHeight: isMobile ? 44 : undefined }}>PDF</button>
                      {a.status === 'pending' && (
                        <>
                          <button onClick={() => handleProcess(a, 'approved')} style={{ ...S.btnPrimary, padding: isMobile ? '4px 10px' : '4px 12px', fontSize: isMobile ? 10 : 11, minHeight: isMobile ? 44 : undefined }}>核准</button>
                          <button onClick={() => { setNoteDialog(a); setNote(''); }} style={{ ...S.btnGhost, padding: isMobile ? '4px 10px' : '4px 12px', fontSize: isMobile ? 10 : 11, borderColor: '#dc2626', color: '#dc2626', minHeight: isMobile ? 44 : undefined }}>駁回</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded item details */}
                  {isExpanded && items.length > 0 && (() => {
                    const hasCost = items.some(i => i.cost_price > 0);
                    const isPO = a.doc_type === 'purchase_order';
                    const totalSell = items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
                    const totalCost = items.reduce((s, i) => s + (Number(i.cost_price || 0) * Number(i.quantity || 0)), 0);
                    const totalProfit = totalSell - totalCost;
                    const marginPct = totalSell > 0 ? ((totalProfit / totalSell) * 100).toFixed(1) : '0.0';
                    return (
                      <div style={{ borderTop: '1px solid #f0f0f0', padding: isMobile ? '8px 12px' : '8px 14px', background: '#fafbfd', ...(isMobile ? S.tableScroll : {}) }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? 10 : 11 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>料號</th>
                              <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>品名</th>
                              <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>數量</th>
                              {!isPO && <th style={{ textAlign: 'center', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>庫存</th>}
                              <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>{isPO ? '採購價' : '售價'}</th>
                              {hasCost && !isPO && <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>成本</th>}
                              <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>小計</th>
                              {hasCost && !isPO && <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>毛利</th>}
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
                                  <td style={{ padding: '4px 6px', ...S.mono, color: '#1f2937', fontSize: 11 }}>{item.item_number || '-'}</td>
                                  <td style={{ padding: '4px 6px', color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '-'}</td>
                                  <td style={{ padding: '4px 6px', textAlign: 'right', ...S.mono }}>{qty}</td>
                                  {!isPO && <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                    {item.stock_qty != null ? (
                                      <span style={{ ...S.mono, fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: item.stock_status === 'sufficient' ? '#dcfce7' : item.stock_status === 'partial' ? '#fef3c7' : '#fee2e2', color: item.stock_status === 'sufficient' ? '#15803d' : item.stock_status === 'partial' ? '#92400e' : '#dc2626' }}>{item.stock_qty} {item.stock_status === 'sufficient' ? '充足' : item.stock_status === 'partial' ? '不足' : '無庫存'}</span>
                                    ) : <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>}
                                  </td>}
                                  <td style={{ padding: '4px 6px', textAlign: 'right', ...S.mono }}>{fmtP(item.unit_price)}</td>
                                  {hasCost && !isPO && <td style={{ padding: '4px 6px', textAlign: 'right', ...S.mono, color: '#6b7280', fontSize: 10 }}>{fmtP(cost)}</td>}
                                  <td style={{ padding: '4px 6px', textAlign: 'right', ...S.mono, color: '#10b981', fontWeight: 700 }}>{fmtP(sell)}</td>
                                  {hasCost && !isPO && <td style={{ padding: '4px 6px', textAlign: 'right', ...S.mono, color: profit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 10 }}>{fmtP(profit)} <span style={{ fontSize: 9, color: '#9ca3af' }}>({itemMargin}%)</span></td>}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {hasCost && !isPO && (
                          <div style={{ marginTop: 8, padding: isMobile ? '8px 8px' : '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, flexDirection: isMobile ? 'column' : 'row' }}>
                            <div style={{ display: 'flex', gap: isMobile ? 8 : 12, fontSize: isMobile ? 10 : 11, color: '#374151' }}>
                              <span>售價 <strong style={{ ...S.mono, color: '#111827' }}>{fmtP(totalSell)}</strong></span>
                              <span>成本 <strong style={{ ...S.mono, color: '#6b7280' }}>{fmtP(totalCost)}</strong></span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                              <span style={{ fontSize: isMobile ? 10 : 11, color: '#374151' }}>毛利</span>
                              <span style={{ ...S.mono, fontSize: isMobile ? 13 : 15, fontWeight: 800, color: totalProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmtP(totalProfit)}</span>
                              <span style={{ ...S.mono, fontSize: isMobile ? 11 : 12, fontWeight: 700, color: totalProfit >= 0 ? '#16a34a' : '#dc2626', background: totalProfit >= 0 ? '#dcfce7' : '#fee2e2', padding: '1px 6px', borderRadius: 4 }}>{marginPct}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Approved/Rejected info */}
                  {a.status !== 'pending' && (
                    <div style={{ borderTop: '1px solid #f0f0f0', padding: isMobile ? '8px 12px' : '8px 14px', background: a.status === 'approved' ? '#f0fdf4' : '#fef2f2', display: 'flex', gap: 8, alignItems: 'center', fontSize: isMobile ? 10 : 11, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: a.status === 'approved' ? '#16a34a' : '#dc2626' }}>{a.status === 'approved' ? '已核准' : '已駁回'}</span>
                      <span style={{ color: '#6b7280' }}>審核人：{a.approved_by || '-'}</span>
                      <span style={{ color: '#6b7280' }}>{a.approved_at?.slice(0, 16).replace('T', ' ')}</span>
                      {a.rejected_reason && <span style={{ color: '#dc2626' }}>原因：{a.rejected_reason}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {historyModal && (
        <CustomerHistoryModal history={historyModal.history} customerName={historyModal.customerName} onClose={() => setHistoryModal(null)} />
      )}

      {noteDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, ...(isMobile ? S.mobileModal : {}), width: isMobile ? undefined : 400, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: isMobile ? 14 : 15 }}>駁回原因</h3>
            <div style={{ marginBottom: 8 }}><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="請說明駁回原因..." style={{ ...(isMobile ? S.mobile.input : S.input), minHeight: 70 }} /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setNoteDialog(null)} style={{ ...S.btnGhost, minHeight: isMobile ? 44 : undefined }}>取消</button>
              <button onClick={() => handleProcess(noteDialog, 'rejected')} style={{ ...S.btnPrimary, background: '#dc2626', minHeight: isMobile ? 44 : undefined }}>確認駁回</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
