'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard } from '../shared/ui';
import { useViewportWidth } from '@/lib/admin/helpers';

const PO_FOCUS_KEY = 'qb_purchase_order_focus';
const SALES_DOCUMENT_FOCUS_KEY = 'qb_sales_document_focus';
const ORDER_FOCUS_KEY = 'qb_order_focus';

// ========== 採購單詳情頁 ==========
function PODetailView({ po, onBack, onRefresh, setTab }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [emailDialog, setEmailDialog] = useState(null);
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const [timeline, setTimeline] = useState([]);

  const statusKey = String(po.status || 'draft').toLowerCase();
  const PO_STATUS_MAP = { draft: '草稿', sent: '已寄出', confirmed: '已確認', shipped: '已出貨', received: '已到貨', rejected: '退回', cancelled: '已取消' };
  const PO_STATUS_COLOR = { draft: '#6b7280', sent: '#3b82f6', confirmed: '#16a34a', shipped: '#f59e0b', received: '#10b981', rejected: '#ef4444', cancelled: '#9ca3af' };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'po_items', po_id: po.id });
        setDetail(result);
        setTimeline(result.timeline || []);
      } catch (e) {
        setMsg(e.message || '無法取得採購單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [po.id]);

  const handleConfirm = async () => {
    if (!confirm(`確定確認採購單 ${po.po_no || ''}？`)) return;
    try {
      await apiPost({ action: 'confirm_purchase_order', po_id: po.id });
      setMsg('已確認');
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '確認失敗');
    }
  };

  const handleSendEmail = async () => {
    let vendorEmail = '';
    if (po.vendor_id) {
      try {
        const res = await apiGet({ action: 'vendors', search: '', limit: '1', id: String(po.vendor_id) });
        vendorEmail = res?.rows?.[0]?.email || '';
      } catch {}
    }
    setEmailTo(vendorEmail);
    setEmailDialog(true);
  };

  const confirmSendEmail = async () => {
    if (!emailTo.trim()) { setMsg('請輸入收件人 email'); return; }
    setSending(true); setMsg('');
    try {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_po_email', po_id: po.id, to_email: emailTo.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg(data.message || '已寄出');
      setEmailDialog(null);
      onRefresh?.();
    } catch (e) { setMsg(e.message); }
    finally { setSending(false); }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export_po', po_id: po.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const link = document.createElement('a');
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.excel_base64}`;
      link.download = data.filename;
      link.click();
      setMsg('Excel 已下載');
    } catch (e) { setMsg(e.message); }
  };

  const items = detail?.items || [];
  const totalAmount = items.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0);

  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 };
  const cardStyle = { ...S.card, borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5' };

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header ====== */}
      <div style={{ ...cardStyle, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{po.po_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${PO_STATUS_COLOR[statusKey] || '#6b7280'}14`, color: PO_STATUS_COLOR[statusKey] || '#6b7280', border: `1px solid ${PO_STATUS_COLOR[statusKey] || '#6b7280'}30` }}>
                {PO_STATUS_MAP[statusKey] || statusKey}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4, ...S.mono }}>
              {po.po_date || '-'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {po.status === 'draft' && <button onClick={handleConfirm} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>確認</button>}
          {(po.status === 'draft' || po.status === 'confirmed') && <button onClick={handleSendEmail} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(79,70,229,0.25)' }}>寄給原廠</button>}
          {(po.status === 'confirmed' || po.status === 'shipped') && <button style={{ padding: '9px 22px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}>轉進貨</button>}
          <button onClick={handleExport} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}>匯出</button>
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 16, padding: '12px 20px', fontSize: 14 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          {/* ====== Left: Items ====== */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f2f5' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>採購明細</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
            </div>
            {items.length > 0 ? (
              <div>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 100px 110px', gap: 10, padding: '10px 24px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  <div>料號</div><div>品名</div><div style={{ textAlign: 'right' }}>數量</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'right' }}>小計</div>
                </div>
                {/* Table rows */}
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 100px 110px', gap: 10, padding: '16px 24px', borderTop: '1px solid #f3f5f7', background: '#fff', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background='#f8fafc'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                    <div style={{ ...S.mono, fontSize: 14, color: '#374151', paddingTop: 2 }}>{item.item_number || '-'}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937', lineHeight: 1.4 }}>{item.description || '-'}</div>
                    <div style={{ textAlign: 'right', ...S.mono, fontSize: 14, color: '#374151', fontWeight: 600 }}>{item.qty || 0}</div>
                    <div style={{ textAlign: 'right', ...S.mono, fontSize: 14, color: '#6b7280' }}>{fmtP(item.unit_cost)}</div>
                    <div style={{ textAlign: 'right', ...S.mono, fontWeight: 800, color: '#059669', fontSize: 16 }}>{fmtP(item.line_total)}</div>
                  </div>
                ))}
                {/* Totals */}
                <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderTop: '2px solid #d1fae5' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 24 }}>
                    <div style={{ borderLeft: '2px solid #a7f3d0', paddingLeft: 20, textAlign: 'right' }}>
                      <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: 2 }}>合計</span>
                      <span style={{ ...S.mono, fontSize: 28, fontWeight: 900, color: '#059669', letterSpacing: -1 }}>{fmtP(totalAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: 14 }}>尚無品項</div>
            )}
          </div>

          {/* ====== Right sidebar ====== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. PDF button */}
            <button onClick={() => window.open(`/api/pdf?type=po&id=${po.id}`, '_blank')} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>下載 PDF</button>

            {/* 2. Vendor card */}
            <div style={{ ...cardStyle, padding: '16px 20px' }}>
              <div style={labelStyle}>廠商資訊</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>廠商 ID: {po.vendor_id || '未指定'}</div>
            </div>

            {/* 3. Unified record timeline card - combine source order + creation + approval + receiving */}
            <div style={{ ...cardStyle, padding: '16px 20px' }}>
              <div style={labelStyle}>採購記錄</div>
              {(() => {
                const fmtTime = (t) => {
                  if (!t) return '';
                  const d = new Date(t);
                  if (isNaN(d.getTime())) return typeof t === 'string' ? t.slice(0, 10) : '';
                  const pad = (n) => String(n).padStart(2, '0');
                  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                };
                const makeClickable = (text) => {
                  const saMatch = text.match(/(SA-\d+)/);
                  const qtMatch = text.match(/(QT\d+)/);
                  const poMatch = text.match(/(PO-[\w-]+)/);
                  const soMatch = text.match(/(SO\d+)/);
                  const linkStyle = { color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' };
                  if (saMatch) { const p = text.split(saMatch[1]); return <>{p[0]}<span style={linkStyle} onClick={() => { window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, saMatch[1]); setTab?.('sales_documents'); }}>{saMatch[1]}</span>{p[1]}</>; }
                  if (qtMatch) { const p = text.split(qtMatch[1]); return <>{p[0]}<span style={linkStyle} onClick={() => { window.localStorage.setItem('qb_quote_focus', qtMatch[1]); setTab?.('quotes'); }}>{qtMatch[1]}</span>{p[1]}</>; }
                  if (poMatch) { const p = text.split(poMatch[1]); return <>{p[0]}<span style={linkStyle} onClick={() => { window.localStorage.setItem(PO_FOCUS_KEY, poMatch[1]); setTab?.('purchase_orders'); }}>{poMatch[1]}</span>{p[1]}</>; }
                  if (soMatch) { const p = text.split(soMatch[1]); return <>{p[0]}<span style={linkStyle} onClick={() => { window.localStorage.setItem(ORDER_FOCUS_KEY, soMatch[1]); setTab?.('orders'); }}>{soMatch[1]}</span>{p[1]}</>; }
                  return text;
                };

                // Build unified timeline entries
                const entries = [];
                const PO_STATUS_COLOR_MAP = { draft: '#f59e0b', sent: '#3b82f6', confirmed: '#16a34a', shipped: '#059669', received: '#10b981', rejected: '#ef4444', cancelled: '#9ca3af' };

                // Source order (from timeline if linked)
                const sourceOrder = timeline.find(e => (e.event || '').match(/來源訂單|SO\d+/));
                if (sourceOrder && sourceOrder.event) {
                  const soMatch = (sourceOrder.event || '').match(/(SO\d+)/);
                  entries.push({ dot: '#3b82f6', label: '來源訂單', ref: soMatch?.[1], refType: 'order', time: sourceOrder.time, status: 'done' });
                }

                // PO created
                entries.push({ dot: '#3b82f6', label: '採購建立', ref: po.po_no, time: po.po_date, status: 'done' });

                // Approval status
                const approvalEv = timeline.find(e => (e.event || '').match(/審核|確認/));
                if (statusKey === 'confirmed' || statusKey === 'shipped' || statusKey === 'received') {
                  entries.push({ dot: '#16a34a', label: '已審核', detail: '已確認', time: approvalEv?.time, status: 'done' });
                } else if (statusKey === 'sent') {
                  entries.push({ dot: '#2563eb', label: '待審核', detail: '待確認', time: approvalEv?.time, status: 'current' });
                } else if (statusKey === 'rejected') {
                  entries.push({ dot: '#ef4444', label: '審核', detail: '已駁回', time: approvalEv?.time, status: 'rejected' });
                }

                // Receiving status
                const receivingEv = timeline.find(e => (e.event || '').match(/到貨|received/));
                if (statusKey === 'received' || statusKey === 'shipped') {
                  entries.push({ dot: '#16a34a', label: '到貨', detail: statusKey === 'received' ? '已到貨' : '出貨中', time: receivingEv?.time, status: statusKey === 'received' ? 'done' : 'current' });
                } else if (statusKey === 'confirmed') {
                  entries.push({ dot: '#d1d5db', label: '到貨', detail: '待到貨', status: 'pending' });
                }

                // Other timeline events
                timeline.forEach(ev => {
                  const eventText = ev.event || '';
                  if (!eventText.match(/建立訂單|審核|確認|到貨|SO\d+/) && !entries.some(e => e.ref && eventText.includes(e.ref))) {
                    entries.push({
                      dot: '#6b7280',
                      label: eventText.substring(0, 12),
                      detail: eventText.length > 12 ? eventText.substring(12) : '',
                      time: ev.time,
                      status: 'pending'
                    });
                  }
                });

                return (
                  <div style={{ position: 'relative', paddingLeft: 18 }}>
                    {entries.length > 0 ? entries.map((e, i) => {
                      const isLast = i === entries.length - 1;
                      const isCurrent = e.status === 'current';
                      return (
                        <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 14, minHeight: isLast ? 'auto' : 28 }}>
                          {!isLast && <div style={{ position: 'absolute', left: -11, top: 10, width: 2, bottom: 0, background: '#e5e7eb' }} />}
                          <div style={{ position: 'absolute', left: -14, top: 3, width: isCurrent ? 10 : 8, height: isCurrent ? 10 : 8, borderRadius: '50%', background: e.dot, border: '2px solid #fff', boxShadow: isCurrent ? `0 0 0 3px ${e.dot}25` : `0 0 0 1.5px ${e.dot}30` }} />
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', lineHeight: 1.3 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: e.status === 'done' ? '#1f2937' : e.status === 'rejected' ? '#dc2626' : isCurrent ? '#1d4ed8' : '#9ca3af' }}>{e.label}</span>
                            {e.ref && (() => {
                              const clickHandler = e.refType === 'order' ? () => { window.localStorage.setItem(ORDER_FOCUS_KEY, e.ref); setTab?.('orders'); }
                                : e.refType === 'po' ? () => { window.localStorage.setItem(PO_FOCUS_KEY, e.ref); setTab?.('purchase_orders'); }
                                : null;
                              return <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', ...S.mono, cursor: clickHandler ? 'pointer' : 'default', textDecoration: clickHandler ? 'underline' : 'none' }} onClick={clickHandler}>{e.ref}</span>;
                            })()}
                            {e.detail && <span style={{ fontSize: 11, fontWeight: 600, color: e.status === 'done' ? '#6b7280' : isCurrent ? '#1d4ed8' : '#9ca3af', background: isCurrent ? `${e.dot}14` : 'transparent', padding: isCurrent ? '1px 6px' : 0, borderRadius: 4 }}>{e.detail}</span>}
                          </div>
                          {e.time && <div style={{ fontSize: 10, color: '#b0b5bf', marginTop: 1, ...S.mono }}>{fmtTime(e.time)}</div>}
                        </div>
                      );
                    }) : (
                      <div style={{ fontSize: 13, color: '#c4cad3' }}>無記錄</div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* 4. Remark card */}
            {po.remark && (
              <div style={{ ...cardStyle, padding: '16px 20px' }}>
                <div style={labelStyle}>備註</div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontWeight: 700 }}>{po.remark}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {emailDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>寄送採購單給原廠</h3>
            <p style={{ fontSize: 14, color: '#374151', margin: '0 0 16px' }}>採購單 <b>{po.po_no}</b> 將以 Excel 附件寄出，原廠可透過信件中的按鈕直接回覆接單/出貨。</p>
            <div style={{ marginBottom: 12 }}><label style={S.label}>收件人 Email *</label><input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} style={S.input} placeholder="supplier@example.com" type="email" /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEmailDialog(null)} style={S.btnGhost}>取消</button>
              <button onClick={confirmSendEmail} disabled={sending} style={{ ...S.btnPrimary, opacity: sending ? 0.7 : 1, background: '#6366f1' }}>{sending ? '寄送中...' : '寄出'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 採購單主元件 ==========
export default function PurchaseOrders({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [msg, setMsg] = useState('');
  const [selectedPO, setSelectedPO] = useState(null);

  const PO_STATUS_MAP = { draft: '草稿', sent: '已寄出', confirmed: '已確認', shipped: '已出貨', received: '已到貨', rejected: '退回', cancelled: '已取消' };
  const PO_STATUS_COLOR = { draft: 'default', sent: 'blue', confirmed: 'green', shipped: 'yellow', received: 'green', rejected: 'red', cancelled: 'gray' };

  const load = useCallback(async (page = 1, q = search, st = statusF) => {
    setLoading(true);
    try {
      const params = { action: 'purchase_orders', page: String(page), search: q, status: st };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      setData(await apiGet(params));
    } finally {
      setLoading(false);
    }
  }, [search, statusF, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, []);

  // Focus on a specific PO if navigated from another page
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const focusedPO = window.localStorage.getItem(PO_FOCUS_KEY);
    if (!focusedPO) return;
    setSearch(focusedPO);
    load(1, focusedPO, statusF);
    window.localStorage.removeItem(PO_FOCUS_KEY);
  }, [load]);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const sm = data.summary || {};

  // If a PO is selected, show detail view
  if (selectedPO) {
    return (
      <PODetailView
        po={selectedPO}
        onBack={() => setSelectedPO(null)}
        onRefresh={() => load()}
        setTab={setTab}
      />
    );
  }

  // List view
  return (
    <div>
      <PageLead eyebrow="Purchase Orders" title="採購單" description="建立對廠商的採購訂單，確認後可轉進貨單入庫。"
        action={<button style={S.btnPrimary}>+ 新增採購單</button>} />
      {msg && <div style={{ ...S.card, background: msg.includes('失敗') || msg.includes('錯誤') ? '#fef2f2' : '#edfdf3', borderColor: msg.includes('失敗') || msg.includes('錯誤') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') || msg.includes('錯誤') ? '#dc2626' : '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}
      <div style={S.statGrid}>
        <StatCard code="DFT" label="草稿" value={fmt(sm.draft)} tone="blue" />
        <StatCard code="SENT" label="已寄出" value={fmt(sm.sent)} tone="blue" accent="#6366f1" />
        <StatCard code="CNF" label="已確認" value={fmt(sm.confirmed)} tone="blue" accent="#3b82f6" />
        <StatCard code="SHIP" label="已出貨" value={fmt(sm.shipped)} tone="blue" accent="#f59e0b" />
        <StatCard code="RCV" label="已到貨" value={fmt(sm.received)} tone="blue" accent="#16a34a" />
      </div>
      <div style={{ ...S.card, marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <select value={statusF} onChange={(e) => { setStatusF(e.target.value); load(1, search, e.target.value); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="sent">已寄出</option>
            <option value="confirmed">已確認</option>
            <option value="shipped">已出貨</option>
            <option value="received">已到貨</option>
            <option value="rejected">退回</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusF)} placeholder="搜尋採購單號..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }} />
          <button onClick={() => load(1, search, statusF)} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 13 }}>查詢</button>
        </div>
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有採購單" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '40px 150px 130px 80px minmax(0,1fr) 100px' : '40px 150px 130px 80px minmax(0,1fr) 100px 120px 80px', gap: 10, padding: '12px 16px', borderBottom: '2px solid #e6edf5', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>
            <div>序</div>
            <div>採購單號</div>
            <div>日期</div>
            <div>狀態</div>
            <div>備註</div>
            <div style={{ textAlign: 'right' }}>金額</div>
            {!isTablet && <div>廠商ID</div>}
            <div style={{ textAlign: 'right' }}>操作</div>
          </div>
          {data.rows.map((row, idx) => {
            const statusKey = String(row.status || 'draft').toLowerCase();
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '40px 150px 130px 80px minmax(0,1fr) 100px' : '40px 150px 130px 80px minmax(0,1fr) 100px 120px 80px', gap: 10, padding: '12px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => setSelectedPO(row)} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f7ff'} onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'}>
                <div style={{ fontSize: 12, color: '#6b7280', ...S.mono }}>{((data.page - 1) * (data.limit || 30)) + idx + 1}</div>
                <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{row.po_no || '-'}</div>
                <div style={{ fontSize: 13, color: '#374151', ...S.mono }}>{row.po_date?.slice(0, 10) || '-'}</div>
                <div><span style={S.tag(PO_STATUS_COLOR[statusKey] || 'default')}>{PO_STATUS_MAP[statusKey] || statusKey}</span></div>
                <div style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.remark || '-'}</div>
                <div style={{ fontSize: 14, color: '#10b981', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
                {!isTablet && <div style={{ fontSize: 12, color: '#6b7280' }}>{row.vendor_id || '-'}</div>}
                <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>→</div>
              </div>
            );
          })}
        </div>
      )}
      <Pager page={data.page || 1} limit={data.limit || 30} total={data.total || 0} onPageChange={(p) => load(p, search, statusF)} />
    </div>
  );
}
