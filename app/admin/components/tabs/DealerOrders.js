'use client';
import { useState, useEffect, useRef } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { useResponsive } from '@/lib/admin/helpers';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, exportCsv, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, ComingSoonBanner } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

const STOCK_BADGE = {
  sufficient: { label: '充足', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  partial:    { label: '不足', bg: '#fef9c3', color: '#854d0e', border: '#fde68a' },
  no_stock:   { label: '無庫存', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
};

function DealerOrderDetailView({ order, onBack, onRefresh }) {
  const { isMobile } = useResponsive();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [editingRemark, setEditingRemark] = useState(order.remark || '');
  const [processingAction, setProcessingAction] = useState('');

  const STATUS_MAP = { pending: '待處理', confirmed: '已確認', purchasing: '採購中', partial_arrived: '部分到貨', arrived: '已到貨', shipped: '已出貨', completed: '已完成', cancelled: '已取消' };
  const STATUS_COLOR = { pending: '#eab308', confirmed: '#3b82f6', purchasing: '#3b82f6', partial_arrived: '#f59e0b', arrived: '#16a34a', shipped: '#16a34a', completed: '#16a34a', cancelled: '#9ca3af' };
  const STATUS_TONE = { pending: 'yellow', confirmed: 'blue', purchasing: 'blue', arrived: 'green', shipped: 'green', completed: 'green', cancelled: '' };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'dealer_order_detail', order_id: order.id });
        setDetail(result);
      } catch (e) {
        setMsg(e.message || '無法取得訂單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [order.id]);

  const updateOrderStatus = async (newStatus) => {
    try {
      await apiPost({ action: 'update_dealer_order', order_id: order.id, status: newStatus });
      setMsg('訂單狀態已更新');
      const result = await apiGet({ action: 'dealer_order_detail', order_id: order.id });
      setDetail(result);
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '更新狀態失敗');
    }
  };

  const updateOrderRemark = async () => {
    try {
      await apiPost({ action: 'update_dealer_order', order_id: order.id, remark: editingRemark });
      setMsg('備註已更新');
      const result = await apiGet({ action: 'dealer_order_detail', order_id: order.id });
      setDetail(result);
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '更新備註失敗');
    }
  };

  const updateItemQty = async (item, newQty) => {
    if (newQty < 0) return;
    try {
      await apiPost({ action: 'update_dealer_order_item', item_id: item.id, qty: newQty, unit_price: item.unit_price });
      const result = await apiGet({ action: 'dealer_order_detail', order_id: order.id });
      setDetail(result);
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '更新數量失敗');
    }
  };

  const handleInstockToSale = async () => {
    if (!confirm(`確定將訂單 ${order.order_no} 有貨項目轉銷貨？`)) return;
    setProcessingAction('sale');
    setMsg('');
    try {
      const result = await apiPost({ action: 'instock_to_sale', order_id: order.id });
      setMsg(`已轉銷貨單 ${result.sale?.slip_number || ''} (${result.processed_count}/${result.total_items} 項)`);
      onRefresh?.();
    } catch (error) {
      setMsg(error.message || '轉銷貨失敗');
    } finally {
      setProcessingAction('');
    }
  };

  const handleShortageToP0 = async () => {
    if (!confirm(`確定將訂單 ${order.order_no} 缺貨項目轉採購單？`)) return;
    setProcessingAction('po');
    setMsg('');
    try {
      const result = await apiPost({ action: 'shortage_to_po', order_id: order.id });
      setMsg(`已建立採購單 ${result.po_number} (${result.shortage_count} 項缺貨)`);
      onRefresh?.();
    } catch (error) {
      setMsg(error.message || '轉採購單失敗');
    } finally {
      setProcessingAction('');
    }
  };

  const o = detail?.order || order;
  const d = o.dealer || order.dealer || {};
  const items = detail?.items || [];

  const labelStyle = { fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textDisabled, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };
  const cardStyle = { ...S.card, borderRadius: t.radius.lg, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: `1px solid ${t.color.borderLight}` };

  const sufficientCount = items.filter(i => i.stock_status === 'sufficient').length;
  const partialCount = items.filter(i => i.stock_status === 'partial').length;
  const noStockCount = items.filter(i => i.stock_status === 'no_stock').length;
  const shortageCount = partialCount + noStockCount;

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: isMobile ? '0 8px' : '0 12px' }}>
      <div style={{ ...cardStyle, padding: isMobile ? '8px 12px' : '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, minHeight: isMobile ? 44 : 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ width: isMobile ? 32 : 34, height: isMobile ? 32 : 34, borderRadius: t.radius.md, border: `1px solid ${t.color.border}`, background: t.color.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.fontSize.h2, color: t.color.textMuted, transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = t.color.bgMuted; }} onMouseLeave={e => { e.currentTarget.style.background = t.color.bgCard; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: isMobile ? t.fontSize.h2 : t.fontSize.h1, fontWeight: 800, color: t.color.textPrimary, ...S.mono, letterSpacing: -0.5 }}>{order.order_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: t.radius.pill, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[o.status] || t.color.textMuted}14`, color: STATUS_COLOR[o.status] || t.color.textMuted, border: `1px solid ${STATUS_COLOR[o.status] || t.color.textMuted}30` }}>
                {STATUS_MAP[o.status] || o.status}
              </span>
            </div>
            <div style={{ fontSize: t.fontSize.body, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>
              {order.order_date || '-'}
            </div>
          </div>
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') ? t.color.errorBg : t.color.successBg, borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? t.color.error : '#15803d', marginBottom: 10, padding: isMobile ? '8px 12px' : '10px 16px', fontSize: t.fontSize.h3, minHeight: isMobile ? 40 : 'auto' }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: isMobile ? 10 : 20, alignItems: 'start' }}>
          <div>
            {items.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center', ...cardStyle, padding: isMobile ? '8px 12px' : '10px 16px', overflowX: 'auto' }}>
                <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>庫存核對</div>
                <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, background: '#dcfce7', color: '#15803d', whiteSpace: 'nowrap' }}>充足 {sufficientCount}</span>
                {partialCount > 0 && (
                  <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, background: '#fef9c3', color: '#854d0e', whiteSpace: 'nowrap' }}>不足 {partialCount}</span>
                )}
                {noStockCount > 0 && (
                  <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, background: '#fee2e2', color: '#b91c1c', whiteSpace: 'nowrap' }}>無庫存 {noStockCount}</span>
                )}
              </div>
            )}

            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ padding: isMobile ? '8px 12px' : '10px 16px', borderBottom: `1px solid ${t.color.borderLight}` }}>
                <span style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textDisabled }}>訂單明細</span>
                <span style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.medium, color: t.color.textDisabled, marginLeft: 8 }}>{items.length} 項</span>
              </div>
              {items.length > 0 ? (
                <div style={{ overflowX: isMobile ? 'auto' : 'visible' }}>
                  {!isMobile && <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 80px 70px 80px 80px 70px', gap: 10, padding: '8px 16px', background: t.color.bgMuted, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textDisabled, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    <div>料號</div><div>品名</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'center' }}>數量</div><div style={{ textAlign: 'center' }}>庫存</div><div style={{ textAlign: 'center' }}>狀態</div><div style={{ textAlign: 'right' }}>小計</div><div>操作</div>
                  </div>}
                  {items.map((item) => {
                    const badge = item.stock_status ? (STOCK_BADGE[item.stock_status] || STOCK_BADGE.no_stock) : null;
                    return (
                      <div key={item.id} style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: !isMobile ? '120px 1fr 80px 80px 70px 80px 80px 70px' : undefined, gap: isMobile ? 0 : 10, padding: isMobile ? '10px 12px' : '10px 16px', borderTop: `1px solid ${t.color.borderLight}`, background: t.color.bgCard, transition: 'background 0.1s', alignItems: isMobile ? 'flex-start' : 'center', minHeight: isMobile ? 44 : 'auto' }} onMouseEnter={e => !isMobile && (e.currentTarget.style.background=t.color.bgMuted)} onMouseLeave={e => !isMobile && (e.currentTarget.style.background=t.color.bgCard)}>
                        {isMobile ? (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: t.fontSize.h3, color: t.color.link, fontWeight: t.fontWeight.semibold, ...S.mono }}>{item.item_number_snapshot || '-'}</span>
                              <span style={{ color: t.color.textSecondary, fontWeight: t.fontWeight.semibold, fontSize: t.fontSize.h3 }}>{fmtP(item.unit_price)}</span>
                            </div>
                            <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 6 }}>{item.description_snapshot || '-'}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 10, alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button onClick={() => updateItemQty(item, item.qty - 1)} style={{ ...S.btnGhost, padding: '4px 6px', fontSize: t.fontSize.tiny, minWidth: 24, minHeight: 32 }}>-</button>
                                <span style={{ ...S.mono, fontWeight: t.fontWeight.bold, minWidth: 20, textAlign: 'center', fontSize: t.fontSize.body }}>{item.qty}</span>
                                <button onClick={() => updateItemQty(item, item.qty + 1)} style={{ ...S.btnGhost, padding: '4px 6px', fontSize: t.fontSize.tiny, minWidth: 24, minHeight: 32 }}>+</button>
                              </div>
                              <div style={{ textAlign: 'center', fontWeight: t.fontWeight.bold, color: item.stock_qty > 0 ? t.color.success : t.color.error, ...S.mono, fontSize: t.fontSize.body }}>庫:{item.stock_qty ?? '-'}</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 10, alignItems: 'center' }}>
                              {badge ? (
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: t.radius.lg, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                                  {badge.label}{item.stock_status === 'partial' ? `(差${item.shortage})` : ''}
                                </span>
                              ) : <span style={{ color: t.color.textDisabled, fontSize: t.fontSize.tiny }}>-</span>}
                              <span style={{ color: t.color.success, fontWeight: t.fontWeight.bold, ...S.mono, fontSize: t.fontSize.h3 }}>{fmtP(item.line_total || item.unit_price * item.qty)}</span>
                            </div>
                            {item.qty > 0 && <button onClick={() => { if (confirm('刪除此品項？')) updateItemQty(item, 0); }} style={{ ...S.btnGhost, padding: '6px 8px', fontSize: t.fontSize.tiny, color: t.color.error, borderColor: '#fecdd3', width: '100%', minHeight: 40 }}>刪除</button>}
                          </>
                        ) : (
                          <>
                            <div style={{ ...S.mono, fontSize: t.fontSize.h3, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{item.item_number_snapshot || '-'}</div>
                            <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary }}>{item.description_snapshot || '-'}</div>
                            <div style={{ textAlign: 'right', ...S.mono, fontSize: t.fontSize.h3, color: t.color.textMuted }}>{fmtP(item.unit_price)}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                              <button onClick={() => updateItemQty(item, item.qty - 1)} style={{ ...S.btnGhost, padding: '2px 6px', fontSize: t.fontSize.tiny, minWidth: 24 }}>-</button>
                              <span style={{ ...S.mono, fontWeight: t.fontWeight.bold, minWidth: 20, textAlign: 'center', fontSize: t.fontSize.h3 }}>{item.qty}</span>
                              <button onClick={() => updateItemQty(item, item.qty + 1)} style={{ ...S.btnGhost, padding: '2px 6px', fontSize: t.fontSize.tiny, minWidth: 24 }}>+</button>
                            </div>
                            <div style={{ textAlign: 'center', fontWeight: t.fontWeight.bold, color: item.stock_qty > 0 ? t.color.success : t.color.error, ...S.mono, fontSize: t.fontSize.h3 }}>{item.stock_qty ?? '-'}</div>
                            <div style={{ textAlign: 'center' }}>
                              {badge ? (
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: t.radius.lg, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                                  {badge.label}{item.stock_status === 'partial' ? `(差${item.shortage})` : ''}
                                </span>
                              ) : <span style={{ color: t.color.textDisabled, fontSize: t.fontSize.tiny }}>-</span>}
                            </div>
                            <div style={{ color: t.color.success, fontWeight: t.fontWeight.bold, textAlign: 'right', ...S.mono, fontSize: t.fontSize.h2 }}>{fmtP(item.line_total || item.unit_price * item.qty)}</div>
                            <div>{item.qty > 0 && <button onClick={() => { if (confirm('刪除此品項？')) updateItemQty(item, 0); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: t.fontSize.tiny, color: t.color.error, borderColor: '#fecdd3' }}>刪除</button>}</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ padding: isMobile ? '8px 12px' : '10px 16px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderTop: `2px solid ${t.color.success}` }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <span style={{ fontSize: t.fontSize.h3, color: t.color.textMuted }}>小計 <strong style={{ ...S.mono, fontSize: t.fontSize.h2, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{fmtP(o.subtotal || items.reduce((s, i) => s + (i.line_total || i.unit_price * i.qty || 0), 0))}</strong></span>
                        {o.tax_amount > 0 && <span style={{ fontSize: t.fontSize.h3, color: t.color.textMuted }}>稅金 <strong style={{ ...S.mono, fontSize: t.fontSize.h2, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{fmtP(o.tax_amount)}</strong></span>}
                      </div>
                      <div style={{ borderLeft: isMobile ? 'none' : `2px solid ${t.color.success}`, paddingLeft: isMobile ? 0 : 10, textAlign: 'right' }}>
                        <span style={{ fontSize: t.fontSize.caption, color: t.color.brand, fontWeight: t.fontWeight.semibold, display: 'block', marginBottom: 2 }}>合計</span>
                        <span style={{ ...S.mono, fontSize: isMobile ? t.fontSize.h1 : 28, fontWeight: 900, color: t.color.success, letterSpacing: -1 }}>{fmtP(o.total_amount || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: isMobile ? '30px 16px' : '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: t.fontSize.h3 }}>尚無品項</div>
              )}
            </div>

            {items.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
                {sufficientCount > 0 && (
                  <button
                    onClick={handleInstockToSale}
                    disabled={!!processingAction}
                    style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), padding: isMobile ? '8px 12px' : '8px 18px', fontSize: t.fontSize.body, background: t.color.brand, borderColor: t.color.brand, opacity: processingAction === 'sale' ? 0.6 : 1, minHeight: isMobile ? 44 : 'auto' }}
                  >
                    {processingAction === 'sale' ? '處理中...' : `有貨項目 → 轉銷貨 (${sufficientCount}項)`}
                  </button>
                )}
                {shortageCount > 0 && (
                  <button
                    onClick={handleShortageToP0}
                    disabled={!!processingAction}
                    style={{ ...S.btnGhost, ...(isMobile ? { flex: 1, minHeight: 44 } : {}), padding: isMobile ? '8px 12px' : '8px 18px', fontSize: t.fontSize.body, color: t.color.error, borderColor: '#fca5a5', opacity: processingAction === 'po' ? 0.6 : 1 }}
                  >
                    {processingAction === 'po' ? '處理中...' : `缺貨項目 → 轉採購單 (${shortageCount}項)`}
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ ...cardStyle, padding: isMobile ? '8px 12px' : '10px 16px' }}>
              <div style={labelStyle}>下單人資訊</div>
              <div style={{ fontSize: isMobile ? t.fontSize.h2 : 18, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 14, lineHeight: 1.3 }}>{d.company_name || d.display_name || '未綁定下單人'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: '下單人', value: d.display_name },
                  { label: '角色', value: d.role === 'dealer' ? '經銷' : d.role === 'sales' ? '業務' : d.role === 'tech' ? '技師' : d.role },
                  { label: '電話', value: d.phone, mono: true },
                  { label: '信箱', value: d.email, mono: true },
                ].filter(f => f.value).map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: `1px solid ${t.color.borderLight}`, flexWrap: 'wrap', minHeight: isMobile ? 40 : 'auto', alignItems: 'center' }}>
                    <span style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled, flexShrink: 0, fontWeight: t.fontWeight.medium }}>{f.label}</span>
                    <span style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, textAlign: 'right', fontWeight: t.fontWeight.medium, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...cardStyle, padding: isMobile ? '8px 12px' : '10px 16px' }}>
              <div style={labelStyle}>變更狀態</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <button key={k} onClick={() => updateOrderStatus(k)} disabled={o.status === k} style={{ ...S.btnGhost, padding: isMobile ? '8px 12px' : '8px 12px', fontSize: t.fontSize.caption, background: o.status === k ? t.color.link : t.color.bgCard, color: o.status === k ? t.color.bgCard : '#4b5563', borderColor: o.status === k ? t.color.link : t.color.border, opacity: o.status === k ? 1 : 0.8, justifyContent: 'flex-start', textAlign: 'left', minHeight: isMobile ? 40 : 'auto' }}>{v}</button>
                ))}
              </div>
            </div>

            <div style={{ ...cardStyle, padding: isMobile ? '8px 12px' : '10px 16px' }}>
              <div style={labelStyle}>備註</div>
              <textarea value={editingRemark} onChange={(e) => setEditingRemark(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: '100%', fontSize: t.fontSize.caption, minHeight: isMobile ? 80 : 80, padding: isMobile ? '8px 12px' : '12px', borderRadius: t.radius.md, fontFamily: 'inherit', minHeight: isMobile ? 80 : 80 }} placeholder="訂單備註" />
              <button onClick={updateOrderRemark} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), padding: isMobile ? '8px 12px' : '6px 14px', fontSize: t.fontSize.caption, marginTop: 10, width: '100%', minHeight: isMobile ? 44 : 'auto' }}>儲存備註</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DealerOrders() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [consolidating, setConsolidating] = useState(false);
  const [msg, setMsg] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [search, setSearch] = useState('');
  const tableRef = useRef(null);
  const { colWidths, gridTemplate, ResizableHeader } = useResizableColumns('dealer_orders_list', [40, 140, 200, 100, 100, 110]);

  const STATUS_MAP = { pending: '待處理', confirmed: '已確認', purchasing: '採購中', partial_arrived: '部分到貨', arrived: '已到貨', shipped: '已出貨', completed: '已完成', cancelled: '已取消' };
  const STATUS_TONE = { pending: 'yellow', confirmed: 'blue', purchasing: 'blue', arrived: 'green', shipped: 'green', completed: 'green', cancelled: '' };

  const load = async () => { setLoading(true); try { setData(await apiGet({ action: 'dealer_orders', status: statusFilter, search, date_from: dateFrom, date_to: dateTo })); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [statusFilter, search, dateFrom, dateTo]);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load();

  const toggleSelect = (id) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const selectAll = () => {
    const pendingIds = data.rows.filter((r) => r.status === 'pending').map((r) => r.id);
    setSelected(selected.length === pendingIds.length ? [] : pendingIds);
  };

  const consolidate = async () => {
    if (!selected.length) return;
    if (!confirm(`確定將 ${selected.length} 筆訂單彙整為採購單？`)) return;
    setConsolidating(true); setMsg('');
    try {
      const result = await apiPost({ action: 'consolidate_orders_to_po', order_ids: selected });
      setMsg(result.message || '採購單建立成功');
      setSelected([]);
      await load();
    } catch (e) { setMsg(e.message); } finally { setConsolidating(false); }
  };

  const handleExport = async () => {
    try {
      const all = await apiGet({ action: 'dealer_orders', status: '', limit: '9999', export: 'true' });
      exportCsv(all.rows || [], [
        { key: 'order_no', label: '訂單號' },
        { key: r => r.dealer?.display_name || '-', label: '下單人' },
        { key: r => r.dealer?.company_name || '-', label: '公司' },
        { key: 'order_date', label: '日期' },
        { key: 'status', label: '狀態' },
        { key: 'total_amount', label: '金額' },
        { key: 'remark', label: '備註' },
      ], `經銷商訂單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  if (selectedOrder) {
    return (
      <DealerOrderDetailView
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onRefresh={() => load()}
      />
    );
  }

  return (
    <div>
      <PageLead eyebrow="DEALER ORDERS" title="經銷商訂單" description="點擊訂單進入詳情頁。可編輯數量、狀態與備註，有貨轉銷貨、缺貨轉採購。" action={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
          {selected.length > 0 && <button onClick={consolidate} disabled={consolidating} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), minHeight: isMobile ? 44 : 'auto', opacity: consolidating ? 0.7 : 1 }}>{consolidating ? '彙整中...' : `彙整 ${selected.length} 筆`}</button>}
          <button onClick={handleExport} style={{ ...S.btnGhost, ...(isMobile ? { minHeight: 40 } : {}) }}>匯出 CSV</button>
        </div>
      } />
      <ComingSoonBanner tabId="dealer_orders" />
      {msg && <div style={{ ...S.card, background: msg.includes('失敗') ? t.color.errorBg : t.color.successBg, borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? t.color.error : '#15803d', marginBottom: 10, padding: isMobile ? '8px 12px' : '10px 16px', minHeight: isMobile ? 40 : 'auto' }}>{msg}</div>}
      <div style={{ ...S.card, marginBottom: 10, padding: isMobile ? '8px 12px' : '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: isMobile ? '6px 12px' : '6px 14px', fontSize: t.fontSize.body, background: datePreset === key ? t.color.link : t.color.bgCard, color: datePreset === key ? t.color.bgCard : '#4b5563', borderColor: datePreset === key ? t.color.link : t.color.border, minHeight: isMobile ? 40 : 'auto' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 150, fontSize: t.fontSize.body, padding: isMobile ? '6px 12px' : '6px 10px', ...S.mono, minHeight: isMobile ? 40 : 'auto' }} />
          <span style={{ color: t.color.textMuted, fontSize: t.fontSize.body }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 150, fontSize: t.fontSize.body, padding: isMobile ? '6px 12px' : '6px 10px', ...S.mono, minHeight: isMobile ? 40 : 'auto' }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), fontSize: t.fontSize.body, padding: isMobile ? '6px 12px' : '6px 10px', minHeight: isMobile ? 40 : 'auto', width: isMobile ? '100%' : 'auto' }}>
            <option value="">全部狀態</option>
            <option value="pending">待處理</option>
            <option value="confirmed">已確認</option>
            <option value="purchasing">採購中</option>
            <option value="arrived">已到貨</option>
            <option value="shipped">已出貨</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋訂單號、客戶..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), flex: 1, minWidth: 160, fontSize: t.fontSize.body, padding: isMobile ? '6px 12px' : '6px 10px', minHeight: isMobile ? 40 : 'auto' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), padding: isMobile ? '6px 12px' : '6px 16px', fontSize: t.fontSize.body, minHeight: isMobile ? 40 : 'auto' }}>查詢</button>
        </div>
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="沒有訂單" /> : (
        <div ref={tableRef} style={{ ...S.card, padding: isMobile ? 0 : 0, overflowX: 'auto', border: `1px solid ${t.color.border}` }}>
          {!isMobile && <ResizableHeader headers={[
            { label: '', align: 'center', render: () => <input type="checkbox" checked={selected.length > 0 && selected.length === data.rows.filter((r) => r.status === 'pending').length} onChange={selectAll} /> },
            { label: '訂單號', align: 'center' },
            { label: '下單人', align: 'center' },
            { label: '日期', align: 'center' },
            { label: '狀態', align: 'center' },
            { label: '金額', align: 'center' },
          ]} />}
          {data.rows.map((row, idx) => (
            <div key={row.id} style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: !isMobile ? gridTemplate : undefined, gap: 0, padding: isMobile ? '10px 12px' : 0, borderBottom: `1px solid ${t.color.borderLight}`, alignItems: isMobile ? 'flex-start' : 'center', background: selected.includes(row.id) ? '#dbeafe' : idx % 2 === 0 ? t.color.bgCard : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s', minHeight: isMobile ? 44 : 'auto' }} onClick={() => !isMobile && setSelectedOrder(row)} onMouseEnter={(e) => !isMobile && (e.currentTarget.style.background = '#f0f7ff')} onMouseLeave={(e) => !isMobile && (e.currentTarget.style.background = selected.includes(row.id) ? '#dbeafe' : idx % 2 === 0 ? t.color.bgCard : '#fafbfd')}>
              {isMobile ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <input type="checkbox" checked={row.status === 'pending' && selected.includes(row.id)} onChange={() => toggleSelect(row.id)} style={{ cursor: 'pointer' }} />
                    <span style={{ fontSize: t.fontSize.h3, color: t.color.link, fontWeight: t.fontWeight.bold, ...S.mono }}>{row.order_no || '-'}</span>
                    <span style={S.tag(STATUS_TONE[row.status] || '')}>{STATUS_MAP[row.status] || row.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
                    <div>
                      <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary }}>{row.dealer?.display_name || '-'}</div>
                      <div style={{ fontSize: t.fontSize.tiny, color: t.color.textSecondary }}>{row.dealer?.company_name || ''}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: t.fontSize.h3, color: t.color.success, fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(row.total_amount)}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: t.fontSize.caption, color: t.color.textSecondary }}>
                    <span>{row.order_date || '-'}</span>
                    <button onClick={() => setSelectedOrder(row)} style={{ ...S.btnPrimary, padding: '6px 12px', fontSize: t.fontSize.caption, minHeight: 36 }}>詳情</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center', fontSize: t.fontSize.body }} onClick={(e) => e.stopPropagation()}>{row.status === 'pending' && <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelect(row.id)} />}</div>
                  <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', fontSize: t.fontSize.body, color: t.color.link, fontWeight: t.fontWeight.bold, textAlign: 'center', ...S.mono }}>{row.order_no || '-'}</div>
                  <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'left' }}><div><div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary }}>{row.dealer?.display_name || '-'}</div><div style={{ fontSize: t.fontSize.tiny, color: t.color.textSecondary }}>{row.dealer?.company_name || ''} {row.dealer?.role ? `(${row.dealer.role === 'dealer' ? '經銷' : row.dealer.role === 'sales' ? '業務' : '技師'})` : ''}</div></div></div>
                  <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', fontSize: t.fontSize.body, color: t.color.textSecondary, textAlign: 'center', ...S.mono }}>{row.order_date || '-'}</div>
                  <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center' }}><span style={S.tag(STATUS_TONE[row.status] || '')}>{STATUS_MAP[row.status] || row.status}</span></div>
                  <div style={{ padding: '8px 10px', borderRight: 'none', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', fontSize: t.fontSize.h3, color: t.color.success, textAlign: 'right', fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(row.total_amount)}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
