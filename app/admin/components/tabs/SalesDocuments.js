'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, useViewportWidth, exportCsv, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard, CsvImportButton } from '../shared/ui';

const SALES_DOCUMENT_FOCUS_KEY = 'qb_sales_document_focus';
const PO_FOCUS_KEY = 'qb_purchase_order_focus';
const ORDER_FOCUS_KEY = 'qb_order_focus';

// ========== 銷貨單詳情頁 ==========
function SaleDetailView({ sale, onBack, setTab }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [shipping, setShipping] = useState(false);
  const [showShipForm, setShowShipForm] = useState(false);
  const [shipForm, setShipForm] = useState({ carrier: '', tracking_no: '', remark: '' });
  const [timeline, setTimeline] = useState([]);
  const [approvalData, setApprovalData] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [savingInvoice, setSavingInvoice] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [result, approvalRes] = await Promise.all([
          apiGet({ action: 'sale_detail', slip_number: sale.slip_number }),
          apiGet({ action: 'approvals', doc_type: 'sale' }),
        ]);
        setDetail(result);
        setTimeline(result.timeline || []);
        setInvoiceNumber(result.sale?.invoice_number || sale.invoice_number || '');
        // Find approval for this sale
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
    })();
  }, [sale.slip_number, sale.id]);

  const s = detail?.sale || sale;
  const invoice = detail?.invoice;
  const items = detail?.items || [];

  const saveInvoice = async () => {
    setSavingInvoice(true); setMsg('');
    try {
      await apiPost({ action: 'update_sale_invoice', sale_id: sale.id, invoice_number: invoiceNumber.trim() });
      setMsg('發票號碼已儲存');
    } catch (e) { setMsg(e.message || '儲存失敗'); }
    finally { setSavingInvoice(false); }
  };

  const STOCK_BADGE = {
    sufficient: { label: '充足', color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
    partial: { label: '部分', color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
    no_stock: { label: '無庫存', color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
  };

  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 };
  const cardStyle = { ...S.card, borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5', marginBottom: 0 };

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header ====== */}
      <div style={{ ...cardStyle, padding: '16px 24px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{sale.slip_number || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: '#dcfce714', color: '#16a34a', border: '1px solid #16a34a30' }}>
                銷貨單
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, ...S.mono }}>
              {s.sale_date || sale.sale_date || '-'}
              {s.invoice_number && <span style={{ color: '#d1d5db' }}> &middot; </span>}
              {s.invoice_number && <span>發票 {s.invoice_number}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 方案 A：銷貨免審，顯示自動核准標籤 */}
          {approvalData?.status === 'approved' && <span style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>{approvalData?.approved_by === 'system' ? '自動核准' : '已核准'}</span>}
          {/* 銷貨免審 — 建立出貨 */}
          <button onClick={() => setShowShipForm(true)} disabled={shipping} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: shipping ? 0.7 : 1, transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(245,158,11,0.25)' }}>{shipping ? '出貨中...' : '建立出貨'}</button>
          {/* PDF：列印前提醒發票號碼 */}
          <button onClick={() => {
            if (!invoiceNumber && !s.invoice_number) {
              if (!confirm('尚未填寫發票號碼，是否仍要列印？\n（建議先填寫發票號碼以便入帳）')) return;
            }
            window.open(`/api/pdf?type=sale&id=${sale.id}`, '_blank');
          }} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}>PDF</button>
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 10, padding: '10px 16px', fontSize: 14 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 10, alignItems: 'start' }}>
          {/* ====== Left: Items ====== */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>商品明細</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
            </div>
            {items.length > 0 ? (
              <div>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '130px 80px 50px 80px 85px minmax(0,1fr)', gap: 6, padding: '6px 10px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  <div>料號</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'center' }}>數量</div><div style={{ textAlign: 'center' }}>庫存</div><div style={{ textAlign: 'right' }}>小計</div><div>備註</div>
                </div>
                {/* Table rows */}
                {items.map((item, i) => {
                  const badge = STOCK_BADGE[item.stock_status] || STOCK_BADGE.no_stock;
                  return (
                    <div key={item.id || i} style={{ display: 'grid', gridTemplateColumns: '130px 80px 50px 80px 85px minmax(0,1fr)', gap: 6, padding: '14px 10px', borderTop: '1px solid #f3f5f7', background: '#fff', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background='#f8fafc'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
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

          {/* ====== Right sidebar ====== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 1. PDF button — 銷貨免審，直接可用 */}
            <button onClick={() => {
              if (!invoiceNumber && !s.invoice_number) {
                if (!confirm('尚未填寫發票號碼，是否仍要列印？\n（建議先填寫發票號碼以便入帳）')) return;
              }
              window.open(`/api/pdf?type=sale&id=${sale.id}`, '_blank');
            }} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>下載 PDF</button>
            {!invoiceNumber && !s.invoice_number && <div style={{ padding: '6px 10px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontSize: 11, textAlign: 'center', border: '1px solid #fde68a' }}>請填寫發票號碼以利入帳</div>}

            {/* 2. Customer card */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>客戶資訊</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{s.customer_name || sale.customer_name || '未命名客戶'}</div>
              {[
                { label: '業務', value: s.sales_person || sale.sales_person },
                { label: '發票號碼', value: s.invoice_number, mono: true },
                { label: '銷貨日期', value: s.sale_date || sale.sale_date, mono: true },
              ].filter(f => f.value).map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{f.label}</span>
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, ...(f.mono ? S.mono : {}), overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.value}</span>
                </div>
              ))}
            </div>

            {/* 2.5 Invoice Number — 銷貨免審，直接可編輯 */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>發票資訊</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text" placeholder="輸入發票號碼..."
                  value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', ...S.mono }}
                  onKeyDown={e => { if (e.key === 'Enter') saveInvoice(); }}
                />
                <button onClick={saveInvoice} disabled={savingInvoice}
                  style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 12, opacity: savingInvoice ? 0.7 : 1 }}>
                  {savingInvoice ? '...' : '儲存'}
                </button>
              </div>
            </div>

            {/* 3. Unified Sales Record Timeline */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>銷貨紀錄</div>
              {(() => {
                const fmtTime = (t) => { if (!t) return ''; const d = new Date(t); if (isNaN(d.getTime())) return typeof t === 'string' ? t.slice(0, 10) : ''; const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
                const saleStatusMap = { draft: '草稿', issued: '已開立', paid: '已收款', void: '作廢' };
                const saleColorMap = { draft: '#f59e0b', issued: '#3b82f6', paid: '#16a34a', void: '#ef4444' };

                const entries = [];
                const statusKey = String(s.status || 'issued').toLowerCase();

                // 銷貨建立
                entries.push({ dot: '#16a34a', label: '銷貨建立', ref: s.slip_number, refType: 'sale', time: s.sale_date, status: 'done' });

                // 審核狀態 — 銷貨免審（方案 A），顯示自動核准
                if (approvalData) {
                  const apSt = approvalData.status;
                  const isAutoApproved = approvalData.approved_by === 'system';
                  const apDot = apSt === 'approved' ? '#16a34a' : apSt === 'rejected' ? '#dc2626' : apSt === 'pending' ? '#2563eb' : '#d1d5db';
                  const apText = apSt === 'approved' ? (isAutoApproved ? '自動核准（訂單已審）' : '已核准') : apSt === 'rejected' ? '已駁回' : apSt === 'pending' ? '待審核' : apSt;
                  entries.push({ dot: apDot, label: '審核簽核', detail: apText, time: approvalData.reviewed_at || approvalData.created_at, status: apSt === 'approved' ? 'done' : apSt === 'pending' ? 'current' : apSt === 'rejected' ? 'rejected' : 'pending' });
                } else {
                  entries.push({ dot: '#16a34a', label: '審核', detail: '免審（銷貨自動通過）', status: 'done' });
                }

                // 發票
                if (invoice || s.invoice_number) {
                  entries.push({ dot: s.invoice_number ? '#16a34a' : '#d1d5db', label: '發票', ref: s.invoice_number, refType: 'invoice', detail: invoice?.invoice_type || (s.invoice_number ? '已開' : '未開'), status: s.invoice_number ? 'done' : 'pending' });
                }

                // 毛利信息
                entries.push({ dot: (s.gross_profit || 0) >= 0 ? '#16a34a' : '#ef4444', label: '毛利', detail: `NT$${Number(s.gross_profit || 0).toLocaleString()} · ${s.total > 0 ? ((s.gross_profit || 0) / s.total * 100).toFixed(1) : '0'}%`, status: (s.gross_profit || 0) >= 0 ? 'done' : 'warning' });

                // 付款狀態
                entries.push({ dot: statusKey === 'paid' ? '#16a34a' : '#d1d5db', label: '付款', detail: { draft: '草稿', issued: '未付款', paid: '已收款', void: '作廢' }[statusKey] || statusKey, status: statusKey === 'paid' ? 'done' : statusKey === 'issued' ? 'pending' : statusKey === 'void' ? 'rejected' : 'pending' });

                // 其他timeline事件
                timeline?.forEach(ev => {
                  const eventText = ev.event || '';
                  if (!eventText.match(/銷貨|審核|approval|批准/i) && eventText.trim()) {
                    const dotColor = ev.status === 'done' ? '#16a34a' : ev.status === 'pending' ? '#f59e0b' : ev.status === 'rejected' ? '#ef4444' : '#d1d5db';
                    entries.push({ dot: dotColor, label: eventText, time: ev.time, status: ev.status || 'pending' });
                  }
                });

                return (
                  <div style={{ position: 'relative', paddingLeft: 18 }}>
                    {entries.map((e, i) => {
                      const isLast = i === entries.length - 1;
                      const isCurrent = e.status === 'current' || e.status === 'warning';
                      return (
                        <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 14, minHeight: isLast ? 'auto' : 28 }}>
                          {!isLast && <div style={{ position: 'absolute', left: -11, top: 10, width: 2, bottom: 0, background: '#e5e7eb' }} />}
                          <div style={{ position: 'absolute', left: -14, top: 3, width: isCurrent ? 10 : 8, height: isCurrent ? 10 : 8, borderRadius: '50%', background: e.dot, border: '2px solid #fff', boxShadow: isCurrent ? `0 0 0 3px ${e.dot}25` : `0 0 0 1.5px ${e.dot}30` }} />
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', lineHeight: 1.3 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: e.status === 'done' ? '#1f2937' : e.status === 'rejected' ? '#dc2626' : isCurrent ? '#1d4ed8' : '#9ca3af' }}>{e.label}</span>
                            {e.ref && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', ...S.mono, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => {
                                if (e.refType === 'sale') { window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, e.ref); setTab?.('sales_documents'); }
                                else if (e.refType === 'invoice') { /* handle invoice click if needed */ }
                              }}>{e.ref}</span>
                            )}
                            {e.detail && <span style={{ fontSize: 11, fontWeight: 600, color: e.detailColor || (e.status === 'done' ? '#6b7280' : e.status === 'warning' ? '#92400e' : '#9ca3af'), background: isCurrent || e.status === 'warning' ? `${e.dot}14` : 'transparent', padding: isCurrent || e.status === 'warning' ? '1px 6px' : 0, borderRadius: 4 }}>{e.detail}</span>}
                          </div>
                          {e.time && <div style={{ fontSize: 10, color: '#b0b5bf', marginTop: 1, ...S.mono }}>{fmtTime(e.time)}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
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
                    onRefresh?.();
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
                <input value={shipForm.carrier} onChange={e => setShipForm(p => ({ ...p, carrier: e.target.value }))} placeholder="例：黑貓宅急便、自行配送" style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, width: '100%', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4, display: 'block' }}>貨運單號</label>
                <input value={shipForm.tracking_no} onChange={e => setShipForm(p => ({ ...p, tracking_no: e.target.value }))} placeholder="輸入追蹤號碼" style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, width: '100%', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4, display: 'block' }}>備註</label>
                <textarea value={shipForm.remark} onChange={e => setShipForm(p => ({ ...p, remark: e.target.value }))} placeholder="出貨備註（選填）" rows={2} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, width: '100%', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              {/* Items preview */}
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>出貨品項</div>
                {(s.items || []).map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', padding: '4px 0', borderBottom: i < (s.items||[]).length - 1 ? '1px solid #f0f2f5' : 'none' }}>
                    <span style={{ flex: 1 }}>{it.product_name || it.product_id}</span>
                    <span style={{ width: 60, textAlign: 'right', fontWeight: 600 }}>×{it.quantity}</span>
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
                  onRefresh?.();
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
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total: 0, gross_profit: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSale, setSelectedSale] = useState(null);
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');

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
      <PageLead eyebrow="SALES" title="銷貨單" description="查看實際銷貨單、發票號碼與毛利，並可點單號查看完整銷貨單內容。" action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><CsvImportButton datasetId="qb_sales_history" onImported={() => load(1, search, pageSize)} compact /><button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button></div>} />
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 14, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 14 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px', ...S.mono }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋銷貨單號、客戶、業務或發票..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 14, padding: '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 14 }}>查詢</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 qb_sales_history 或目前資料不可讀。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        <StatCard code="STOT" label="銷貨筆數" value={fmt(data.total)} tone="blue" />
        <StatCard code="REV" label="本頁營收" value={fmtP(data.summary?.total)} tone="green" />
        <StatCard code="GP" label="本頁毛利" value={fmtP(data.summary?.gross_profit)} tone="yellow" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有銷貨單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '50px 160px minmax(0,1fr) 100px' : '50px 170px minmax(0,1.3fr) 120px 120px 120px 120px 120px', gap: 10, padding: '8px 16px', borderBottom: '2px solid #e6edf5', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>
            <div>序</div>
            <div>銷貨單號</div>
            <div>客戶 / 發票</div>
            <div>日期</div>
            {!isTablet && <div>業務</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>未稅</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>毛利</div>}
          </div>
          {data.rows.map((row, idx) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '50px 160px minmax(0,1fr) 100px' : '50px 170px minmax(0,1.3fr) 120px 120px 120px 120px 120px', gap: 10, padding: '10px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => setSelectedSale(row)} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f7ff'} onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'}>
              <div style={{ fontSize: 12, color: '#6b7280', ...S.mono }}>{((data.page - 1) * (data.limit || pageSize)) + idx + 1}</div>
              <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{row.slip_number || '-'}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, ...S.mono }}>{row.invoice_number ? `INV ${row.invoice_number}` : ''}</div>
              </div>
              <div style={{ fontSize: 12, color: '#374151', ...S.mono }}>{row.sale_date || '-'}</div>
              {!isTablet && <div style={{ fontSize: 12, color: '#374151' }}>{row.sales_person || '-'}</div>}
              {!isTablet && <div style={{ fontSize: 14, color: '#111827', textAlign: 'right', ...S.mono }}>{fmtP(row.subtotal)}</div>}
              {!isTablet && <div style={{ fontSize: 14, color: '#10b981', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>}
              {!isTablet && <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 14, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{fmtP(row.gross_profit)}</span>
              </div>}
            </div>
          ))}
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
