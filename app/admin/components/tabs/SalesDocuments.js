'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, useResponsive, exportCsv, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard, CsvImportButton } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';
import { useUnsavedGuard } from '../shared/UnsavedChangesGuard';
import { DocumentTimeline } from '../shared/DocumentTimeline';

const SALES_DOCUMENT_FOCUS_KEY = 'qb_sales_document_focus';
const PO_FOCUS_KEY = 'qb_purchase_order_focus';
const ORDER_FOCUS_KEY = 'qb_order_focus';

// ========== 銷貨單詳情頁 ==========
function SaleDetailView({ sale, onBack, setTab }) {
  const { setDirty, confirmIfDirty } = useUnsavedGuard();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [shipping, setShipping] = useState(false);
  const [showShipForm, setShowShipForm] = useState(false);
  const [shipForm, setShipForm] = useState({ carrier: '', tracking_no: '', remark: '' });
  const [timeline, setTimeline] = useState([]);
  const [approvalData, setApprovalData] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [origInvoice, setOrigInvoice] = useState({ number: '', date: '' });

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [result, approvalRes] = await Promise.all([
        apiGet({ action: 'sale_detail', slip_number: sale.slip_number }),
        apiGet({ action: 'approvals', doc_type: 'sale' }),
      ]);
      setDetail(result);
      setTimeline(result.timeline || []);
      setShipments(result.shipments || []);
      const origNum = result.sale?.invoice_number || sale.invoice_number || '';
      const origDate = result.sale?.invoice_date || result.invoice?.invoice_date || result.sale?.sale_date || sale.sale_date || '';
      setInvoiceNumber(origNum);
      setInvoiceDate(origDate);
      setOrigInvoice({ number: origNum, date: origDate });
      const saleApprovals = (approvalRes.rows || []).filter(a => String(a.doc_id) === String(sale.id));
      if (saleApprovals.length > 0) {
        saleApprovals.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setApprovalData(saleApprovals[0]);
      }
    } catch (e) {
      setMsg(e.message || '無法取得銷貨單明細');
    } finally {
      setLoading(false);
    }
  }, [sale.slip_number, sale.id]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const s = detail?.sale || sale;
  const invoice = detail?.invoice;
  const items = detail?.items || [];

  // ── Calculate shipped vs ordered to determine remaining ──
  const shippedQtyMap = {};
  (shipments || []).filter(sh => sh.status !== 'cancelled').forEach(sh => {
    (sh.erp_shipment_items || sh.items || []).forEach(si => {
      const pid = si.product_id;
      if (pid) shippedQtyMap[pid] = (shippedQtyMap[pid] || 0) + Number(si.qty_shipped || 0);
    });
  });
  const allFullyShipped = items.length > 0 && items.every(it => {
    const ordered = Number(it.quantity || it.qty || 0);
    const shipped = shippedQtyMap[it.product_id] || 0;
    return shipped >= ordered;
  });
  const remainingItems = items.map(it => {
    const ordered = Number(it.quantity || it.qty || 0);
    const shipped = shippedQtyMap[it.product_id] || 0;
    return { ...it, shipped, remaining: Math.max(0, ordered - shipped) };
  }).filter(it => it.remaining > 0);

  // 追蹤發票/出貨表單是否有未儲存變更
  useEffect(() => {
    const invoiceDirty = invoiceNumber !== origInvoice.number || invoiceDate !== origInvoice.date;
    const shipDirty = showShipForm && (shipForm.carrier || shipForm.tracking_no || shipForm.remark);
    setDirty(invoiceDirty || !!shipDirty);
  }, [invoiceNumber, invoiceDate, origInvoice, showShipForm, shipForm, setDirty]);

  // 離開時清除 dirty
  useEffect(() => () => setDirty(false), [setDirty]);

  const guardedBack = () => confirmIfDirty(onBack);

  const saveInvoice = async () => {
    setSavingInvoice(true); setMsg('');
    try {
      await apiPost({ action: 'update_sale_invoice', sale_id: sale.id, invoice_number: invoiceNumber.trim(), invoice_date: invoiceDate || undefined });
      setMsg('發票資訊已儲存');
      setDirty(false);
      loadDetail();
    } catch (e) { setMsg(e.message || '儲存失敗'); }
    finally { setSavingInvoice(false); }
  };

  const STOCK_BADGE = {
    sufficient: { label: '充足', color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
    partial: { label: '部分', color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
    no_stock: { label: '無庫存', color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
  };

  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };
  const cardStyle = { ...S.card, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5', marginBottom: 0 };

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header ====== */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={guardedBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{sale.slip_number || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: '#dcfce714', color: '#16a34a', border: '1px solid #16a34a30' }}>
                銷貨單
              </span>
              <span style={{ fontSize: 9, background: s.tax_inclusive ? '#dcfce7' : '#fef3c7', color: s.tax_inclusive ? '#15803d' : '#92400e', padding: '1px 5px', borderRadius: 4, fontWeight: 600, letterSpacing: 0.3 }}>{s.tax_inclusive ? '含稅' : '未稅'}</span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, ...S.mono }}>
              {s.sale_date || sale.sale_date || '-'}
              {s.invoice_number && <span style={{ color: '#d1d5db' }}> &middot; </span>}
              {s.invoice_number && <span>發票 {s.invoice_number}</span>}
            </div>
          </div>
        </div>
        {approvalData?.status === 'approved' && <span style={{ padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>{approvalData?.approved_by === 'system' ? '自動核准' : '已核准'}</span>}
      </div>

      {msg && <div style={{ ...cardStyle, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 10, padding: '10px 16px', fontSize: 14 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 10, alignItems: 'start' }}>
          {/* ====== Left column ====== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>商品明細</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
            </div>
            {items.length > 0 ? (
              <div>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '130px 80px 50px 80px 85px minmax(0,1fr)', gap: 6, padding: '8px 12px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  <div>料號</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'center' }}>數量</div><div style={{ textAlign: 'center' }}>庫存</div><div style={{ textAlign: 'right' }}>小計</div><div>備註</div>
                </div>
                {/* Table rows */}
                {items.map((item, i) => {
                  const badge = STOCK_BADGE[item.stock_status] || STOCK_BADGE.no_stock;
                  return (
                    <div key={item.id || i} style={{ display: 'grid', gridTemplateColumns: '130px 80px 50px 80px 85px minmax(0,1fr)', gap: 6, padding: '10px 12px', borderTop: '1px solid #f3f5f7', background: '#fff', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background='#f8fafc'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151', fontWeight: 600, ...S.mono, fontSize: 14 }} title={`${item.item_number || item.item_number_snapshot || '-'} — ${item.description || item.description_snapshot || ''}`}>{item.item_number || item.item_number_snapshot || '-'}</div>
                      <div style={{ textAlign: 'right', ...S.mono, fontSize: 14, color: '#6b7280' }}>{fmtP(item.unit_price)}</div>
                      <div style={{ textAlign: 'center', ...S.mono, fontSize: 14, color: '#374151', fontWeight: 600 }}>{item.quantity || item.qty || 0}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <span style={{ fontWeight: 700, color: badge.color, ...S.mono, fontSize: 12 }}>{item.stock_qty ?? '—'}</span>
                        {item.stock_status && <span style={{ padding: '1px 5px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>
                          {badge.label}{item.stock_status === 'partial' ? `(差${item.shortage})` : ''}
                        </span>}
                      </div>
                      <div style={{ textAlign: 'right', ...S.mono, fontWeight: 800, color: '#059669', fontSize: 14 }}>{fmtP(item.subtotal || item.line_total || (item.unit_price * (item.quantity || item.qty || 0)))}</div>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: '#6b7280' }}>{item.item_note || '—'}</div>
                    </div>
                  );
                })}
                {/* Totals */}
                <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderTop: '2px solid #d1fae5' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 24 }}>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 14, color: '#6b7280' }}>小計 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(s.subtotal || 0)}</strong></span>
                      {Number(s.discount_amount || 0) > 0 && <span style={{ fontSize: 14, color: '#ef4444' }}>折扣 <strong style={{ ...S.mono, fontSize: 16, color: '#ef4444', fontWeight: 600 }}>-{fmtP(s.discount_amount)}</strong></span>}
                      {Number(s.shipping_fee || 0) > 0 && <span style={{ fontSize: 14, color: '#6b7280' }}>運費 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(s.shipping_fee)}</strong></span>}
                      {(s.tax > 0 || s.tax_amount > 0) && <span style={{ fontSize: 14, color: '#6b7280' }}>稅金 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(s.tax || s.tax_amount || 0)}</strong></span>}
                    </div>
                    <div style={{ borderLeft: '2px solid #a7f3d0', paddingLeft: 20, textAlign: 'right' }}>
                      <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: 2 }}>合計</span>
                      <span style={{ ...S.mono, fontSize: 22, fontWeight: 900, color: '#059669', letterSpacing: -1 }}>{fmtP(s.total || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: 14 }}>尚無品項明細</div>
            )}
          </div>
          {/* Action bar below items — outside the card */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {shipments.length > 0 && (
              <span style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                已建立出貨單 {shipments.map(sh => sh.shipment_no).join(', ')}
              </span>
            )}
            {allFullyShipped ? (
              <span style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>✓ 已全部出貨完畢</span>
            ) : (
              <button onClick={() => setShowShipForm(true)} disabled={shipping} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: shipping ? 0.7 : 1, boxShadow: '0 2px 8px rgba(245,158,11,0.25)' }}>{shipping ? '出貨中...' : '建立出貨'}</button>
            )}
          </div>
          </div>

          {/* ====== Right sidebar ====== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 1. PDF button — same as Orders page */}
            <button onClick={() => {
              if (!invoiceNumber && !s.invoice_number) {
                if (!confirm('尚未填寫發票號碼，是否仍要列印？\n（建議先填寫發票號碼以便入帳）')) return;
              }
              window.open(`/api/pdf?type=sale&id=${sale.id}`, '_blank');
            }} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>下載 PDF</button>

            {/* 2. 客戶資訊 */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>客戶資訊</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{s.customer_name || sale.customer_name || '未命名客戶'}</div>
              {[
                { label: '業務', value: s.sales_person || sale.sales_person },
                { label: '銷貨日期', value: s.sale_date || sale.sale_date, mono: true },
              ].filter(f => f.value).map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{f.label}</span>
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, ...(f.mono ? S.mono : {}) }}>{f.value}</span>
                </div>
              ))}
            </div>

            {/* 3. 發票資訊 — 日期可選 + 號碼即時編輯 */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>發票資訊</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>發票日期</span>
                <input type="date" value={invoiceDate?.slice(0, 10) || ''} onChange={e => setInvoiceDate(e.target.value)}
                  style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', ...S.mono, color: '#374151', textAlign: 'right' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>發票號碼</span>
                <input type="text" placeholder="輸入發票號碼..." value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveInvoice(); }}
                  style={{ flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', ...S.mono, textAlign: 'right', maxWidth: 180 }} />
              </div>
              <button onClick={saveInvoice} disabled={savingInvoice}
                style={{ ...S.btnPrimary, width: '100%', padding: '7px 14px', fontSize: 12, opacity: savingInvoice ? 0.7 : 1, marginTop: 4 }}>
                {savingInvoice ? '儲存中...' : '儲存發票資訊'}
              </button>
              {!invoiceNumber && !s.invoice_number && <div style={{ padding: '4px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontSize: 11, textAlign: 'center', border: '1px solid #fde68a', marginTop: 6 }}>請填寫發票號碼以利入帳</div>}
            </div>

            {/* 2. 運送資訊 — 顯示出貨紀錄，或提示尚未出貨 */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>運送資訊</div>
              {shipments.length > 0 ? shipments.map((sh, i) => (
                <div key={sh.id || i} style={{ marginBottom: i < shipments.length - 1 ? 10 : 0 }}>
                  {[
                    { label: '出貨單號', value: sh.shipment_no },
                    { label: '物流商', value: sh.carrier },
                    { label: '貨運單號', value: sh.tracking_no },
                    { label: '出貨日期', value: sh.ship_date },
                    { label: '狀態', value: sh.status === 'shipped' ? '已出貨' : sh.status === 'delivered' ? '已送達' : sh.status },
                  ].filter(f => f.value).map((f, fi) => (
                    <div key={fi} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{f.label}</span>
                      <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, ...S.mono }}>{f.value}</span>
                    </div>
                  ))}
                  {sh.remark && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{sh.remark}</div>}
                </div>
              )) : (
                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>尚未建立出貨</div>
              )}
            </div>

            {/* 3. Unified Sales Record Timeline */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <DocumentTimeline type="sale" id={sale.id} setTab={setTab} title="單據記錄" />
            </div>

            {/* 4. Remark card — editable */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>備註</div>
              <textarea
                defaultValue={s.remark || ''}
                placeholder="輸入備註..."
                rows={3}
                style={{ width: '100%', fontSize: 13, color: '#374151', lineHeight: 1.6, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit' }}
                onBlur={async (e) => {
                  const val = e.target.value.trim();
                  if (val === (s.remark || '').trim()) return;
                  try {
                    await apiPost({ action: 'update_sale_invoice', sale_id: s.id, remark: val });
                    loadDetail();
                  } catch (err) { setMsg(err.message || '備註更新失敗'); }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ====== Shipment Creation Modal ====== */}
      {showShipForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowShipForm(false)}>
          <div style={{ width: 'min(520px, 94vw)', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>建立出貨單</div>
              <button onClick={() => setShowShipForm(false)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {/* Form */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4, display: 'block' }}>物流商 / 運送方式</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {['黑貓宅急便', '新竹物流', '嘉里大榮', '郵局包裹', '自行配送', '貨運', '超商取貨'].map(c => (
                    <button key={c} type="button" onClick={() => setShipForm(p => ({ ...p, carrier: c }))}
                      style={{ padding: '5px 12px', borderRadius: 6, border: shipForm.carrier === c ? '2px solid #f59e0b' : '1px solid #e5e7eb', background: shipForm.carrier === c ? '#fffbeb' : '#fff', fontSize: 12, fontWeight: shipForm.carrier === c ? 700 : 500, color: shipForm.carrier === c ? '#92400e' : '#6b7280', cursor: 'pointer', transition: 'all 0.12s' }}>
                      {c}
                    </button>
                  ))}
                </div>
                <input value={shipForm.carrier} onChange={e => setShipForm(p => ({ ...p, carrier: e.target.value }))} placeholder="或輸入其他物流商..." style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, width: '100%', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4, display: 'block' }}>貨運單號</label>
                <input value={shipForm.tracking_no} onChange={e => setShipForm(p => ({ ...p, tracking_no: e.target.value }))} placeholder="輸入追蹤號碼" style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, width: '100%', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4, display: 'block' }}>備註</label>
                <textarea value={shipForm.remark} onChange={e => setShipForm(p => ({ ...p, remark: e.target.value }))} placeholder="出貨備註（選填）" rows={2} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, width: '100%', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              {/* Items preview — only remaining unshipped items */}
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>出貨品項{shipments.length > 0 && <span style={{ color: '#f59e0b', marginLeft: 6 }}>（剩餘未出）</span>}</div>
                {remainingItems.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', padding: '4px 0', borderBottom: i < remainingItems.length - 1 ? '1px solid #f0f2f5' : 'none' }}>
                    <span style={{ flex: 1 }}>{it.product_name || it.item_number || it.product_id}</span>
                    <span style={{ width: 60, textAlign: 'right', fontWeight: 600 }}>×{it.remaining}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Submit */}
            <div style={{ padding: '14px 24px 20px', borderTop: '1px solid #f0f2f5', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowShipForm(false)} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>取消</button>
              <button disabled={shipping} onClick={async () => {
                setShipping(true);
                try {
                  await apiPost({ action: 'create_shipment', sale_id: s.id, carrier: shipForm.carrier, tracking_no: shipForm.tracking_no, remark: shipForm.remark });
                  setMsg('出貨單已建立');
                  setShowShipForm(false);
                  setShipForm({ carrier: '', tracking_no: '', remark: '' });
                  loadDetail();
                } catch (err) { setMsg(err.message || '建立出貨失敗'); }
                setShipping(false);
              }} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: shipping ? '#94a3b8' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: shipping ? 'not-allowed' : 'pointer', boxShadow: '0 2px 8px rgba(245,158,11,0.25)' }}>
                {shipping ? '建立中...' : '確認出貨'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 銷貨單主元件 ==========
export default function SalesDocuments({ setTab }) {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total: 0, gross_profit: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSale, setSelectedSale] = useState(null);
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');

  const { gridTemplate, ResizableHeader } = useResizableColumns('sales_list_v2', isTablet ? [50, 160, 250, 100] : [50, 150, 220, 100, 80, 100, 110, 140]);

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const params = { action: 'sales_documents', page: String(page), limit: String(limit), search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const result = await apiGet(params);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, dateFrom, dateTo]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const focusedSlip = window.localStorage.getItem(SALES_DOCUMENT_FOCUS_KEY);
    if (!focusedSlip) return;
    setSearch(focusedSlip);
    load(1, focusedSlip, pageSize);
    window.localStorage.removeItem(SALES_DOCUMENT_FOCUS_KEY);
  }, [load, pageSize]);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(1, search, pageSize);

  // 銷貨退回
  const handleSalesReturn = async (row) => {
    if (!confirm(`確定要對銷貨單 ${row.slip_number} 建立退回單？`)) return;
    try {
      const result = await apiPost({
        action: 'create_sales_return',
        slip_number: row.slip_number,
        sale_id: row.id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        items: row.items || [],
        total: row.total,
        subtotal: row.subtotal,
        reason: '',
      });
      if (result?.error) { alert(result.error); return; }
      alert(`退回單 ${result.return_no || ''} 已建立`);
      await load(data.page, search, pageSize);
    } catch (e) { alert('建立退回單失敗: ' + e.message); }
  };

  // 沖帳
  const handlePayment = async (row) => {
    if (row.payment_status === 'paid') {
      alert('此銷貨單已沖帳完成');
      return;
    }
    const method = prompt(`銷貨單 ${row.slip_number}\n總額：${row.total}\n\n請輸入沖帳方式（現金 / 匯款 / 支票 / 月結沖帳）：`);
    if (!method) return;
    try {
      const result = await apiPost({
        action: 'record_sale_payment',
        sale_id: row.id,
        slip_number: row.slip_number,
        amount: row.total,
        method: method.trim(),
      });
      if (result?.error) { alert(result.error); return; }
      alert('沖帳完成');
      await load(data.page, search, pageSize);
    } catch (e) { alert('沖帳失敗: ' + e.message); }
  };

  const handleExport = async () => {
    try {
      const params = { action: 'sales_documents', page: '1', limit: '9999', export: 'true', search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const result = await apiGet(params);
      const columns = [
        { key: 'slip_number', label: '銷貨單號' },
        { key: 'customer_name', label: '客戶' },
        { key: 'invoice_number', label: '發票號碼' },
        { key: 'sale_date', label: '銷貨日期' },
        { key: 'sales_person', label: '業務' },
        { key: 'subtotal', label: '未稅金額' },
        { key: 'total', label: '總額' },
        { key: 'gross_profit', label: '毛利' },
      ];
      exportCsv(result.rows || [], columns, `銷貨單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert('匯出失敗: ' + e.message); }
  };

  // ★ 如果選中了某筆銷貨單，顯示詳情頁
  if (selectedSale) {
    return (
      <SaleDetailView
        sale={selectedSale}
        onBack={() => setSelectedSale(null)}
        setTab={setTab}
      />
    );
  }

  // ★ 銷貨單列表
  return (
    <div>
      <PageLead eyebrow="SALES" title="銷貨單" description="查看實際銷貨單、發票號碼與毛利，並可點單號查看完整銷貨單內容。" action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', ...(isMobile ? { width: '100%' } : {}) }}><CsvImportButton datasetId="qb_sales_history" onImported={() => load(1, search, pageSize)} compact /><button onClick={handleExport} style={{ ...S.btnGhost, ...(isMobile ? { flex: 1 } : {}) }}>匯出 CSV</button></div>} />
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 8, flexWrap: 'wrap', alignItems: isMobile ? 'stretch' : 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', ...(isMobile ? { width: '100%' } : {}) }}>
            {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
              <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: isMobile ? '8px 12px' : '6px 14px', fontSize: isMobile ? 14 : 14, minHeight: isMobile ? 44 : undefined, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...(isMobile ? { width: '100%' } : {}) }}>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, flex: isMobile ? 1 : undefined, width: isMobile ? undefined : 150, fontSize: isMobile ? 14 : 14, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined, ...S.mono }} />
            <span style={{ color: '#6b7280', fontSize: 14, flexShrink: 0 }}>~</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, flex: isMobile ? 1 : undefined, width: isMobile ? undefined : 150, fontSize: isMobile ? 14 : 14, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined, ...S.mono }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, ...(isMobile ? { width: '100%' } : {}) }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋銷貨單號、客戶、業務或發票..." style={{ ...S.input, flex: 1, minWidth: isMobile ? 0 : 160, fontSize: isMobile ? 14 : 14, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined }} />
            <button onClick={doSearch} style={{ ...S.btnPrimary, padding: isMobile ? '10px 16px' : '6px 18px', fontSize: isMobile ? 14 : 14, minHeight: isMobile ? 44 : undefined, flexShrink: 0 }}>查詢</button>
          </div>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 qb_sales_history 或目前資料不可讀。</div>}
      <div style={{ ...S.statGrid, ...(isMobile ? S.mobile.statGrid : { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }), gap: 10, marginBottom: 10 }}>
        <StatCard code="STOT" label="銷貨筆數" value={fmt(data.total)} tone="blue" />
        <StatCard code="REV" label="本頁營收" value={fmtP(data.summary?.total)} tone="green" />
        <StatCard code="GP" label="本頁毛利" value={fmtP(data.summary?.gross_profit)} tone="yellow" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有銷貨單資料" /> : isMobile ? (
        data.rows.map((row) => (
          <div key={row.id} style={{ ...S.mobileCard, marginBottom: 10, cursor: 'pointer' }} onClick={() => setSelectedSale(row)}>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>銷貨單號</span>
              <span style={{ ...S.mobileCardValue, color: '#3b82f6' }}>{row.slip_number || '-'}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>客戶</span>
              <span style={S.mobileCardValue}>{row.customer_name || '未命名客戶'}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>日期</span>
              <span style={S.mobileCardValue}>{row.sale_date || '-'}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>未稅</span>
              <span style={S.mobileCardValue}>{fmtP(row.subtotal)}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>總額</span>
              <span style={{ ...S.mobileCardValue, color: '#10b981', fontWeight: 700 }}>{fmtP(row.total)}</span>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => handleSalesReturn(row)} style={{ ...S.btnGhost, flex: 1, minHeight: 44, fontSize: 14 }}>退回</button>
              <button onClick={() => handlePayment(row)} style={{ ...S.btnGhost, flex: 1, minHeight: 44, fontSize: 14, color: row.payment_status === 'paid' ? '#10b981' : '#374151' }}>{row.payment_status === 'paid' ? '已沖' : '沖帳'}</button>
            </div>
          </div>
        ))
      ) : (
        <div style={{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }}>
          <ResizableHeader
            headers={isTablet ? [
              { label: '序', align: 'center' },
              { label: '銷貨單號', align: 'center' },
              { label: '客戶', align: 'center' },
              { label: '日期', align: 'center' },
            ] : [
              { label: '序', align: 'center' },
              { label: '銷貨單號', align: 'center' },
              { label: '客戶', align: 'center' },
              { label: '日期', align: 'center' },
              { label: '業務', align: 'center' },
              { label: '未稅', align: 'center' },
              { label: '總額', align: 'center' },
              { label: '操作', align: 'center' },
            ]}
          />
          {data.rows.map((row, idx) => {
            const cell = { padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', fontSize: 13 };
            const cCenter = { ...cell, justifyContent: 'center' };
            const cRight = { ...cell, justifyContent: 'flex-end' };
            const cellLast = { ...cell, borderRight: 'none' };
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: gridTemplate, borderBottom: idx < data.rows.length - 1 ? '1px solid #e5e7eb' : 'none', background: idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => setSelectedSale(row)} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f7ff'} onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'}>
                <div style={{ ...cCenter, color: '#6b7280', ...S.mono }}>{((data.page - 1) * (data.limit || pageSize)) + idx + 1}</div>
                <div style={{ ...cCenter, color: '#3b82f6', fontWeight: 700, ...S.mono, whiteSpace: 'nowrap', gap: 4 }}>{row.slip_number || '-'}<span style={{ fontSize: 9, background: row.tax_inclusive ? '#dcfce7' : '#fef3c7', color: row.tax_inclusive ? '#15803d' : '#92400e', padding: '1px 5px', borderRadius: 4, fontWeight: 600, letterSpacing: 0.3, flexShrink: 0 }}>{row.tax_inclusive ? '含稅' : '未稅'}</span></div>
                <div style={{ ...cell, fontSize: 13, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ ...cCenter, color: '#374151', ...S.mono, whiteSpace: 'nowrap' }}>{row.sale_date || '-'}</div>
                {!isTablet && <div style={{ ...cCenter, color: '#374151' }}>{row.sales_person || <span style={{ color: '#d1d5db' }}>—</span>}</div>}
                {!isTablet && <div style={{ ...cRight, color: '#111827', ...S.mono, whiteSpace: 'nowrap' }}>{fmtP(row.subtotal)}</div>}
                {!isTablet && <div style={{ ...cRight, color: '#10b981', fontWeight: 700, ...S.mono, whiteSpace: 'nowrap' }}>{fmtP(row.total)}</div>}
                {!isTablet && <div style={{ ...cellLast, justifyContent: 'flex-end', gap: 4, flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleSalesReturn(row)} title="銷貨退回" style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11, whiteSpace: 'nowrap' }}>退回</button>
                  <button onClick={() => handlePayment(row)} title="沖帳" style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11, whiteSpace: 'nowrap', color: row.payment_status === 'paid' ? '#10b981' : '#374151' }}>{row.payment_status === 'paid' ? '已沖' : '沖帳'}</button>
                </div>}
              </div>
            );
          })}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => { setPageSize(nextLimit); load(1, search, nextLimit); }}
      />
    </div>
  );
}
