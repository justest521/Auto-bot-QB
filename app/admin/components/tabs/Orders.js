'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, getPresetDateRange, useViewportWidth, exportCsv } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard, CsvImportButton } from '../shared/ui';
import { OrderCreateModal } from './OrderCreateModal';

const SALES_DOCUMENT_FOCUS_KEY = 'qb_sales_document_focus';
const PO_FOCUS_KEY = 'qb_purchase_order_focus';
const ORDER_FOCUS_KEY = 'qb_order_focus';

const STOCK_BADGE = {
  sufficient: { label: '充足', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  partial:    { label: '不足', bg: '#fef9c3', color: '#854d0e', border: '#fde68a' },
  no_stock:   { label: '無庫存', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
};

// ========== 訂單詳情頁 ==========
function OrderDetailView({ order, onBack, onRefresh, setTab }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [items, setItems] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [processingAction, setProcessingAction] = useState('');
  const [approvalData, setApprovalData] = useState(null);
  const [convertingId, setConvertingId] = useState('');
  const [showShipForm, setShowShipForm] = useState(false);
  const [shipForm, setShipForm] = useState({ carrier: '', tracking_no: '', remark: '', notify_line: true });
  const [shipItemQty, setShipItemQty] = useState({});
  const [linkedSales, setLinkedSales] = useState([]);
  const [linkedPOs, setLinkedPOs] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [saleItemQty, setSaleItemQty] = useState({});

  const statusKey = String(order.status || 'draft').toLowerCase();
  const payKey = String(order.payment_status || 'unpaid').toLowerCase();
  const shipKey = String(order.shipping_status || 'pending').toLowerCase();
  const ORDER_STATUS_MAP = { pending: '待確認', draft: '草稿', confirmed: '已確認', processing: '處理中', shipped: '已出貨', completed: '完成', cancelled: '已取消' };
  const ORDER_STATUS_COLOR = { pending: '#f59e0b', draft: '#6b7280', confirmed: '#16a34a', processing: '#3b82f6', shipped: '#059669', completed: '#6b7280', cancelled: '#ef4444' };
  const PAY_STATUS_MAP = { unpaid: '未付款', partial: '部分付款', paid: '已付款' };
  const SHIP_STATUS_MAP = { pending: '待出貨', shipped: '已出貨', delivered: '已送達' };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'order_items_with_stock', order_id: order.id });
        setItems(result.items || []);
        setLinkedSales(result.linked_sales || []);
        setLinkedPOs(result.linked_pos || []);
        setTimeline(result.timeline || []);
        const approvalResult = await apiGet({ action: 'approvals', doc_type: 'order' });
        const map = {};
        (approvalResult.rows || []).forEach(a => {
          if (!map[a.doc_id] || new Date(a.created_at) > new Date(map[a.doc_id].created_at)) {
            map[a.doc_id] = a;
          }
        });
        setApprovalData(map[order.id] || null);
      } catch (e) {
        setMsg(e.message || '無法取得訂單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [order.id]);

  const sufficientCount = items.filter(i => i.stock_status === 'sufficient').length;
  const shortageCount = items.filter(i => i.stock_status !== 'sufficient').length;

  const toggleItemSelect = (itemId) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const selectAllByStatus = (items, statuses) => {
    const ids = items.filter(i => statuses.includes(i.stock_status)).map(i => i.id);
    setSelectedItemIds(new Set(ids));
  };

  const convertToSale = async () => {
    if (!confirm(`確定將訂單 ${order.order_no || ''} 轉為銷貨單？`)) return;
    setConvertingId(order.id);
    setMsg('');
    try {
      const result = await apiPost({ action: 'convert_order_to_sale', order_id: order.id });
      setMsg(`已轉成銷貨單 ${result.sale?.slip_number || ''}`.trim());
      if (typeof window !== 'undefined' && result.sale?.slip_number) {
        window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, result.sale.slip_number);
      }
      onRefresh?.();
      setTab?.('sales_documents');
    } catch (error) {
      setMsg(error.message || '訂單轉銷貨失敗');
    } finally {
      setConvertingId('');
    }
  };

  const submitForApproval = async () => {
    if (!confirm(`確定送審訂單 ${order.order_no}？`)) return;
    setConvertingId(order.id);
    setMsg('');
    try {
      await apiPost({ action: 'submit_approval', doc_type: 'order', doc_id: order.id, doc_no: order.order_no, requested_by: 'admin', amount: order.total_amount });
      setMsg('已送審');
      onRefresh?.();
    } catch (error) {
      setMsg(error.message || '送審失敗');
    } finally {
      setConvertingId('');
    }
  };

  const openSaleForm = () => {
    const selectedItems = items.filter(i => selectedItemIds.has(i.id));
    if (selectedItems.length === 0) { setMsg('請先勾選要轉銷貨的品項'); return; }
    // Filter out fully-sold items and use remaining qty as default
    const availableItems = selectedItems.filter(i => (Number(i.remaining_qty) > 0 || (!i.sold_qty && !i.sale_info)));
    if (availableItems.length === 0) { setMsg('所選品項已全部轉銷完畢'); return; }
    const qty = {};
    availableItems.forEach(i => { qty[i.id] = i.remaining_qty != null ? Number(i.remaining_qty) : (Number(i.qty) || 1); });
    setSaleItemQty(qty);
    setShowSaleForm(true);
  };

  const confirmSaleConversion = async () => {
    const saleItems = Object.entries(saleItemQty).filter(([, q]) => Number(q) > 0).map(([id, qty]) => ({ id, qty: Number(qty) }));
    if (saleItems.length === 0) { setMsg('請至少指定一項出貨數量'); return; }
    setProcessingAction('sale');
    setMsg('');
    try {
      const result = await apiPost({ action: 'instock_to_sale', order_id: order.id, items: saleItems });
      setMsg(`已建立銷貨草稿 ${result.sale?.slip_number || ''} (${result.processed_count} 項)，待審核`);
      setSelectedItemIds(new Set());
      setShowSaleForm(false);
      const refreshed = await apiGet({ action: 'order_items_with_stock', order_id: order.id });
      setItems(refreshed.items || []);
      setLinkedSales(refreshed.linked_sales || []);
      setLinkedPOs(refreshed.linked_pos || []);
      setTimeline(refreshed.timeline || []);
      onRefresh?.();
    } catch (error) {
      setMsg(error.message || '轉銷貨失敗');
    } finally {
      setProcessingAction('');
    }
  };

  const handleSelectedToPO = async () => {
    const selectedItems = items.filter(i => selectedItemIds.has(i.id));
    if (selectedItems.length === 0) { setMsg('請先勾選要轉採購的品項'); return; }
    if (!confirm(`確定將 ${selectedItems.length} 項轉為採購單草稿？`)) return;
    setProcessingAction('po');
    setMsg('');
    try {
      const result = await apiPost({ action: 'shortage_to_po', order_id: order.id, item_ids: selectedItems.map(i => i.id) });
      setMsg(`已建立採購單 ${result.po_number} (${result.shortage_count || selectedItems.length} 項)`);
      setSelectedItemIds(new Set());
      // Refresh linked data immediately
      const refreshed = await apiGet({ action: 'order_items_with_stock', order_id: order.id });
      setItems(refreshed.items || []);
      setLinkedSales(refreshed.linked_sales || []);
      setLinkedPOs(refreshed.linked_pos || []);
      onRefresh?.();
    } catch (error) {
      setMsg(error.message || '轉採購單失敗');
    } finally {
      setProcessingAction('');
    }
  };

  const notifyOrderViaLine = async () => {
    setProcessingAction('line');
    setMsg('');
    try {
      const result = await apiPost({ action: 'notify_order_status', order_id: order.id });
      setMsg(result.message || '已發送 LINE 通知');
    } catch (error) {
      setMsg(error.message || 'LINE 通知失敗');
    } finally {
      setProcessingAction('');
    }
  };

  const initShipQty = () => {
    const qty = {};
    const selected = items.filter(i => selectedItemIds.has(i.id));
    (selected.length > 0 ? selected : items).forEach(i => { qty[i.id] = i.qty || 1; });
    setShipItemQty(qty);
  };

  const createShipment = async () => {
    const shipItems = Object.entries(shipItemQty).filter(([, q]) => q > 0).map(([id, qty]) => {
      const item = items.find(i => i.id === id);
      return { order_item_id: id, product_id: item?.product_id, qty_shipped: qty };
    });
    if (shipItems.length === 0) { setMsg('請至少選擇一項出貨品項'); return; }
    setProcessingAction('ship');
    setMsg('');
    try {
      const result = await apiPost({
        action: 'create_shipment',
        order_id: order.id,
        carrier: shipForm.carrier,
        tracking_no: shipForm.tracking_no,
        remark: shipForm.remark,
        notify_line: shipForm.notify_line,
        items: shipItems,
      });
      setMsg(`已建立出貨單 ${result.shipment?.shipment_no || ''}`);
      setShowShipForm(false);
      setSelectedItemIds(new Set());
      onRefresh?.();
    } catch (error) {
      setMsg(error.message || '建立出貨失敗');
    } finally {
      setProcessingAction('');
    }
  };

  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 };
  const cardStyle = { ...S.card, borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5' };
  const isConverted = shipKey === 'shipped' || shipKey === 'delivered';
  const canConvert = approvalData?.status === 'approved';
  const isPending = approvalData?.status === 'pending';
  const isRejected = approvalData?.status === 'rejected';

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header ====== */}
      <div style={{ ...cardStyle, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{order.order_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${ORDER_STATUS_COLOR[statusKey] || '#6b7280'}14`, color: ORDER_STATUS_COLOR[statusKey] || '#6b7280', border: `1px solid ${ORDER_STATUS_COLOR[statusKey] || '#6b7280'}30` }}>
                {ORDER_STATUS_MAP[statusKey] || statusKey}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4, ...S.mono }}>
              {order.order_date || '-'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!isConverted && canConvert && <button onClick={convertToSale} disabled={convertingId === order.id} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: convertingId === order.id ? 0.7 : 1, transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(22,163,74,0.25)' }}>{convertingId === order.id ? '轉銷中...' : '轉銷貨'}</button>}
          {isConverted && <span style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>已轉銷貨</span>}
          {!canConvert && !isConverted && <button onClick={submitForApproval} disabled={convertingId === order.id} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: convertingId === order.id ? 0.7 : 1, transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>{convertingId === order.id ? '送審中...' : isPending ? '審核中' : isRejected ? '重送審' : '送審'}</button>}
          {canConvert && <button onClick={() => { initShipQty(); setShowShipForm(true); }} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(245,158,11,0.25)' }}>建立出貨</button>}
          {canConvert && <button onClick={() => window.open(`/api/pdf?type=order&id=${order.id}`, '_blank')} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}>PDF</button>}
          {order.customer?.line_user_id && <button onClick={notifyOrderViaLine} disabled={!!processingAction} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #86efac', background: '#f0fdf4', fontSize: 13, fontWeight: 600, color: '#16a34a', cursor: 'pointer', opacity: processingAction === 'line' ? 0.6 : 1 }}>LINE</button>}
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 16, padding: '12px 20px', fontSize: 14 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          {/* ====== Left: Items with Stock Check ====== */}
          <div>
            {/* ===== Quick select buttons ===== */}
            <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setSelectedItemIds(new Set(items.map(i => i.id)))} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11 }}>全選</button>
                <button onClick={() => setSelectedItemIds(new Set())} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11 }}>取消全選</button>
                {sufficientCount > 0 && <button onClick={() => selectAllByStatus(items, ['sufficient'])} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11, color: '#15803d', borderColor: '#bbf7d0' }}>選有貨 ({sufficientCount})</button>}
                {shortageCount > 0 && <button onClick={() => selectAllByStatus(items, ['partial', 'no_stock'])} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11, color: '#b91c1c', borderColor: '#fecaca' }}>選缺貨 ({shortageCount})</button>}
                {selectedItemIds.size > 0 && <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600, padding: '4px 0' }}>已選 {selectedItemIds.size} 項</span>}
              </div>
            </div>

            {/* ===== Items table ===== */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f2f5' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>商品明細</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
              </div>
              {items.length > 0 ? (
                <div>
                  {/* Table header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '32px 120px minmax(0,1fr) 75px 60px 60px 80px 70px 70px 80px', gap: 6, padding: '10px 24px', background: '#f8f9fb', fontSize: 11, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    <div></div><div>料號</div><div>品名</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'center' }}>訂購數</div><div style={{ textAlign: 'center' }}>庫存</div><div style={{ textAlign: 'center' }}>庫存狀態</div><div style={{ textAlign: 'center' }}>銷貨</div><div style={{ textAlign: 'center' }}>採購</div><div style={{ textAlign: 'right' }}>小計</div>
                  </div>
                  {/* Table rows */}
                  {items.map((item) => {
                    const badge = STOCK_BADGE[item.stock_status] || STOCK_BADGE.no_stock;
                    const isChecked = selectedItemIds.has(item.id);
                    return (
                      <div key={item.id} onClick={() => toggleItemSelect(item.id)} style={{ display: 'grid', gridTemplateColumns: '32px 120px minmax(0,1fr) 75px 60px 60px 80px 70px 70px 80px', gap: 6, padding: '14px 24px', borderTop: '1px solid #f3f5f7', alignItems: 'center', fontSize: 13, cursor: 'pointer', background: isChecked ? '#f0f7ff' : '#fff', transition: 'background 0.1s' }} onMouseEnter={e => !isChecked && (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e => !isChecked && (e.currentTarget.style.background= isChecked ? '#f0f7ff' : '#fff')}>
                        <div style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={isChecked} onChange={() => {}} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                        </div>
                        <div style={{ color: '#374151', fontWeight: 600, ...S.mono, fontSize: 13 }}>{item.item_number_snapshot}</div>
                        <div style={{ color: '#1f2937', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description_snapshot || '-'}</div>
                        <div style={{ color: '#6b7280', textAlign: 'right', ...S.mono, fontSize: 13 }}>{fmtP(item.unit_price)}</div>
                        <div style={{ textAlign: 'center', fontWeight: 600, ...S.mono, fontSize: 13 }}>{item.qty}</div>
                        <div style={{ textAlign: 'center', fontWeight: 600, color: item.stock_qty > 0 ? '#15803d' : '#b91c1c', ...S.mono, fontSize: 13 }}>{item.stock_qty}</div>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                            {badge.label}{item.stock_status === 'partial' ? `(差${item.shortage})` : ''}
                          </span>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          {item.sale_info ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: item.sale_info.status === 'draft' ? '#fef3c7' : item.sale_info.status === 'paid' ? '#dcfce7' : '#dbeafe', color: item.sale_info.status === 'draft' ? '#92400e' : item.sale_info.status === 'paid' ? '#15803d' : '#1d4ed8', border: `1px solid ${item.sale_info.status === 'draft' ? '#fde68a' : item.sale_info.status === 'paid' ? '#bbf7d0' : '#bfdbfe'}` }}>
                                {item.sale_info.status === 'draft' ? '待審' : item.sale_info.status === 'issued' ? '已開' : item.sale_info.status === 'paid' ? '已收' : item.sale_info.status}
                              </span>
                              <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, ...S.mono }}>{item.sale_info.sold_qty}/{item.qty}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>
                          )}
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          {item.po_info ? (
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: item.po_info.status === 'draft' ? '#fef3c7' : item.po_info.status === 'received' ? '#dcfce7' : '#dbeafe', color: item.po_info.status === 'draft' ? '#92400e' : item.po_info.status === 'received' ? '#15803d' : '#1d4ed8', border: `1px solid ${item.po_info.status === 'draft' ? '#fde68a' : item.po_info.status === 'received' ? '#bbf7d0' : '#bfdbfe'}` }}>
                              {item.po_info.status === 'draft' ? '草稿' : item.po_info.status === 'confirmed' ? '已確認' : item.po_info.status === 'received' ? '已到貨' : item.po_info.status}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>
                          )}
                        </div>
                        <div style={{ color: '#059669', fontWeight: 800, textAlign: 'right', ...S.mono, fontSize: 15 }}>{fmtP(item.line_total || item.unit_price * item.qty)}</div>
                      </div>
                    );
                  })}
                  {/* Totals - matching Quotes style */}
                  <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderTop: '2px solid #d1fae5' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 24 }}>
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 14, color: '#6b7280' }}>小計 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(order.subtotal || items.reduce((s, i) => s + (i.line_total || i.unit_price * i.qty || 0), 0))}</strong></span>
                        {order.discount_amount > 0 && <span style={{ fontSize: 14, color: '#ef4444' }}>折扣 <strong style={{ ...S.mono, fontSize: 16, fontWeight: 600 }}>-{fmtP(order.discount_amount)}</strong></span>}
                        {order.shipping_fee > 0 && <span style={{ fontSize: 14, color: '#6b7280' }}>運費 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(order.shipping_fee)}</strong></span>}
                        {order.tax_amount > 0 && <span style={{ fontSize: 14, color: '#6b7280' }}>稅金 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(order.tax_amount)}</strong></span>}
                      </div>
                      <div style={{ borderLeft: '2px solid #a7f3d0', paddingLeft: 20, textAlign: 'right' }}>
                        <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: 2 }}>合計</span>
                        <span style={{ ...S.mono, fontSize: 28, fontWeight: 900, color: '#059669', letterSpacing: -1 }}>{fmtP(order.total_amount || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: 14 }}>尚無品項</div>
              )}
            </div>

            {/* ===== Bulk action buttons ===== */}
            {!isConverted && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {linkedSales.length > 0 && (
              <span style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                已建立銷貨單 {linkedSales.map(s => s.slip_number).join(', ')}（{linkedSales.some(s => s.status === 'draft') ? '待審核' : '已核准'}）
              </span>
              )}
              {isPending ? (
              <span style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>訂單審核中，請等待審核完成</span>
              ) : items.some(i => (i.remaining_qty != null ? Number(i.remaining_qty) > 0 : !i.sale_info)) && (
              <button
                onClick={openSaleForm}
                disabled={!!processingAction || selectedItemIds.size === 0}
                style={{ ...S.btnPrimary, padding: '8px 18px', fontSize: 13, background: selectedItemIds.size > 0 ? '#16a34a' : '#9ca3af', borderColor: selectedItemIds.size > 0 ? '#16a34a' : '#9ca3af', opacity: processingAction ? 0.6 : 1 }}
              >
                {processingAction === 'sale' ? '處理中...' : `勾選項目 → 送審轉銷貨${selectedItemIds.size > 0 ? ` (${selectedItemIds.size}項)` : ''}`}
              </button>
              )}
              {!isPending && (
              <button
                onClick={handleSelectedToPO}
                disabled={!!processingAction || selectedItemIds.size === 0}
                style={{ ...S.btnGhost, padding: '8px 18px', fontSize: 13, color: selectedItemIds.size > 0 ? '#dc2626' : '#9ca3af', borderColor: selectedItemIds.size > 0 ? '#fca5a5' : '#e5e7eb', opacity: processingAction ? 0.6 : 1 }}
              >
                {processingAction === 'po' ? '處理中...' : `勾選項目 → 轉採購單${selectedItemIds.size > 0 ? ` (${selectedItemIds.size}項)` : ''}`}
              </button>
              )}
            </div>
            )}
          </div>

          {/* ====== Right sidebar ====== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Combined status card: order + payment + shipping + stock */}
            <div style={{ ...cardStyle, padding: '16px 20px' }}>
              <div style={labelStyle}>目前狀態</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: '#f8f9fb' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>訂單</div>
                  <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: `${ORDER_STATUS_COLOR[statusKey] || '#6b7280'}14`, color: ORDER_STATUS_COLOR[statusKey] || '#6b7280' }}>{ORDER_STATUS_MAP[statusKey] || statusKey}</span>
                </div>
                <div style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: '#f8f9fb' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>付款</div>
                  <span style={{ ...S.tag(payKey === 'paid' ? 'green' : payKey === 'partial' ? 'yellow' : ''), fontSize: 12 }}>{PAY_STATUS_MAP[payKey] || payKey}</span>
                </div>
                <div style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: '#f8f9fb' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>出貨</div>
                  <span style={{ ...S.tag(shipKey === 'shipped' || shipKey === 'delivered' ? 'green' : ''), fontSize: 12 }}>{SHIP_STATUS_MAP[shipKey] || shipKey}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #dcfce7' }}>
                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>庫存</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>充足 {sufficientCount}</span>
                {items.filter(i => i.stock_status === 'partial').length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#854d0e' }}>不足 {items.filter(i => i.stock_status === 'partial').length}</span>}
                {items.filter(i => i.stock_status === 'no_stock').length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>無庫存 {items.filter(i => i.stock_status === 'no_stock').length}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>共 {items.length} 項</span>
              </div>
            </div>

            {/* Customer card - compact */}
            <div style={{ ...cardStyle, padding: '16px 20px' }}>
              <div style={labelStyle}>客戶資訊</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{order.customer?.company_name || order.customer?.name || '未綁定客戶'}</div>
              {[
                { label: '電話', value: order.customer?.phone, mono: true },
                { label: '信箱', value: order.customer?.email, mono: true },
              ].filter(f => f.value).map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{f.label}</span>
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, ...(f.mono ? S.mono : {}), overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.value}</span>
                </div>
              ))}
            </div>

            {/* Linked Sales card - compact */}
            {linkedSales.length > 0 && (
              <div style={{ ...cardStyle, padding: '16px 20px' }}>
                <div style={labelStyle}>銷貨紀錄</div>
                {linkedSales.map((sale, i) => {
                  const saleStatusMap = { draft: '草稿', issued: '已開立', paid: '已收款', void: '作廢' };
                  const saleColorMap = { draft: '#f59e0b', issued: '#3b82f6', paid: '#16a34a', void: '#ef4444' };
                  const sk = String(sale.status || 'draft').toLowerCase();
                  const sc = saleColorMap[sk] || '#6b7280';
                  return (
                    <div key={sale.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: i < linkedSales.length - 1 ? 6 : 0, marginBottom: i < linkedSales.length - 1 ? 6 : 0, borderBottom: i < linkedSales.length - 1 ? '1px solid #f5f6f8' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', ...S.mono, cursor: 'pointer' }} onClick={() => { window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, sale.slip_number); setTab?.('sales_documents'); }}>{sale.slip_number}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginTop: 1 }}>{sale.sale_date} · {sale.total_qty != null ? `${sale.total_qty}件` : ''} · NT${Number(sale.total || 0).toLocaleString()}</div>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${sc}14`, color: sc, border: `1px solid ${sc}30` }}>{saleStatusMap[sk] || sk}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Linked POs card - compact */}
            {linkedPOs.length > 0 && (
              <div style={{ ...cardStyle, padding: '16px 20px' }}>
                <div style={labelStyle}>採購紀錄</div>
                {linkedPOs.map((po, i) => {
                  const poStatusMap = { draft: '草稿', confirmed: '已確認', received: '已到貨', cancelled: '已取消' };
                  const poColorMap = { draft: '#f59e0b', confirmed: '#3b82f6', received: '#16a34a', cancelled: '#ef4444' };
                  const pk = String(po.status || 'draft').toLowerCase();
                  const pc = poColorMap[pk] || '#6b7280';
                  return (
                    <div key={po.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: i < linkedPOs.length - 1 ? 6 : 0, marginBottom: i < linkedPOs.length - 1 ? 6 : 0, borderBottom: i < linkedPOs.length - 1 ? '1px solid #f5f6f8' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', ...S.mono, cursor: 'pointer' }} onClick={() => { window.localStorage.setItem(PO_FOCUS_KEY, po.po_no); setTab?.('purchase_orders'); }}>{po.po_no}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginTop: 1 }}>{po.po_date || ''}</div>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${pc}14`, color: pc, border: `1px solid ${pc}30` }}>{poStatusMap[pk] || pk}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Timeline card - compact */}
            {timeline && timeline.length > 0 && (
              <div style={{ ...cardStyle, padding: '16px 20px' }}>
                <div style={labelStyle}>狀態歷程</div>
                <div style={{ position: 'relative', paddingLeft: 16 }}>
                  {timeline.map((ev, i) => {
                    const isLast = i === timeline.length - 1;
                    const dotColor = ev.status === 'done' ? '#16a34a' : ev.status === 'pending' ? '#f59e0b' : ev.status === 'rejected' ? '#ef4444' : ev.status === 'expired' ? '#9ca3af' : '#d1d5db';
                    const fmtTime = (t) => { if (!t) return ''; const d = new Date(t); if (isNaN(d.getTime())) return typeof t === 'string' ? t.slice(0, 10) : ''; const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
                    return (
                      <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 14, minHeight: isLast ? 'auto' : 36 }}>
                        {!isLast && <div style={{ position: 'absolute', left: -10, top: 8, width: 2, bottom: 0, background: '#e5e7eb' }} />}
                        <div style={{ position: 'absolute', left: -13, top: 3, width: 8, height: 8, borderRadius: '50%', background: dotColor, border: '2px solid #fff', boxShadow: `0 0 0 1.5px ${dotColor}30` }} />
                        <div style={{ fontSize: 13, fontWeight: 700, color: ev.status === 'rejected' ? '#ef4444' : ev.status === 'pending' ? '#f59e0b' : '#1f2937', lineHeight: 1.2 }}>{(() => {
                          const text = ev.event || '';
                          const saMatch = text.match(/(SA-\d+)/);
                          const qtMatch = text.match(/(QT\d+)/);
                          const poMatch = text.match(/(PO-[\w-]+)/);
                          const soMatch = text.match(/(SO\d+)/);
                          if (saMatch) { const parts = text.split(saMatch[1]); return <>{parts[0]}<span style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, saMatch[1]); setTab?.('sales_documents'); }}>{saMatch[1]}</span>{parts[1]}</>; }
                          if (qtMatch) { const parts = text.split(qtMatch[1]); return <>{parts[0]}<span style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { window.localStorage.setItem('qb_quote_focus', qtMatch[1]); setTab?.('quotes'); }}>{qtMatch[1]}</span>{parts[1]}</>; }
                          if (poMatch) { const parts = text.split(poMatch[1]); return <>{parts[0]}<span style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { window.localStorage.setItem(PO_FOCUS_KEY, poMatch[1]); setTab?.('purchase_orders'); }}>{poMatch[1]}</span>{parts[1]}</>; }
                          if (soMatch) { const parts = text.split(soMatch[1]); return <>{parts[0]}<span style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { window.localStorage.setItem(ORDER_FOCUS_KEY, soMatch[1]); setTab?.('orders'); }}>{soMatch[1]}</span>{parts[1]}</>; }
                          return text;
                        })()}</div>
                        {ev.time && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, ...S.mono, fontWeight: 600 }}>{fmtTime(ev.time)}</div>}
                        {ev.by && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1, fontWeight: 600 }}>由 {ev.by}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Remark card - compact */}
            {order.remark && (
              <div style={{ ...cardStyle, padding: '16px 20px' }}>
                <div style={labelStyle}>備註</div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontWeight: 700 }}>{order.remark}</div>
              </div>
            )}

            {/* PDF button */}
            <button onClick={() => window.open(`/api/pdf?type=order&id=${order.id}`, '_blank')} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>下載 PDF</button>
          </div>
        </div>
      )}

      {/* ====== Shipment Creation Modal ====== */}
      {showShipForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={() => setShowShipForm(false)}>
          <div style={{ width: 'min(700px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <div style={S.eyebrow}>Create Shipment</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>建立出貨 — {order.order_no}</div>
              </div>
              <button onClick={() => setShowShipForm(false)} style={S.btnGhost}>關閉</button>
            </div>

            {/* Ship items selection */}
            <div style={{ ...cardStyle, marginBottom: 16, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>選擇出貨品項與數量</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{Object.values(shipItemQty).filter(q => q > 0).length} / {items.length} 項</span>
              </div>
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderTop: '1px solid #f3f5f7', background: (shipItemQty[item.id] || 0) > 0 ? '#fefce8' : '#fff' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description_snapshot || '-'}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', ...S.mono, marginTop: 1 }}>{item.item_number_snapshot} · 訂購 {item.qty}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setShipItemQty(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1) }))} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: 13, minWidth: 28 }}>-</button>
                      <span style={{ ...S.mono, fontWeight: 700, minWidth: 24, textAlign: 'center', fontSize: 14 }}>{shipItemQty[item.id] || 0}</span>
                      <button onClick={() => setShipItemQty(prev => ({ ...prev, [item.id]: Math.min(item.qty, (prev[item.id] || 0) + 1) }))} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: 13, minWidth: 28 }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ship form fields */}
            <div style={{ ...cardStyle, padding: '18px 20px', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>物流商</label>
                  <input value={shipForm.carrier} onChange={e => setShipForm(p => ({ ...p, carrier: e.target.value }))} placeholder="例：黑貓、新竹物流" style={{ ...S.input, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>追蹤編號</label>
                  <input value={shipForm.tracking_no} onChange={e => setShipForm(p => ({ ...p, tracking_no: e.target.value }))} placeholder="輸入追蹤編號" style={{ ...S.input, fontSize: 13, ...S.mono }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>備註</label>
                <input value={shipForm.remark} onChange={e => setShipForm(p => ({ ...p, remark: e.target.value }))} placeholder="出貨備註（選填）" style={{ ...S.input, fontSize: 13 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="ship_notify_line" checked={shipForm.notify_line} onChange={e => setShipForm(p => ({ ...p, notify_line: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#16a34a', cursor: 'pointer' }} />
                <label htmlFor="ship_notify_line" style={{ fontSize: 13, color: '#111827', fontWeight: 600, cursor: 'pointer' }}>出貨後自動發 LINE 通知客戶</label>
              </div>
            </div>

            <button onClick={createShipment} disabled={processingAction === 'ship'} style={{ ...S.btnPrimary, width: '100%', padding: '12px', fontSize: 15, fontWeight: 700, background: 'linear-gradient(135deg, #f59e0b, #d97706)', opacity: processingAction === 'ship' ? 0.7 : 1 }}>
              {processingAction === 'ship' ? '出貨中...' : `確認出貨 (${Object.values(shipItemQty).filter(q => q > 0).length} 項)`}
            </button>
          </div>
        </div>
      )}

      {/* ====== Sale Conversion Modal ====== */}
      {showSaleForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={() => setShowSaleForm(false)}>
          <div style={{ width: 'min(700px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <div style={S.eyebrow}>Convert to Sale</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>轉銷貨 — {order.order_no}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>可調整每項出貨數量，未出的數量可之後再轉</div>
              </div>
              <button onClick={() => setShowSaleForm(false)} style={S.btnGhost}>關閉</button>
            </div>

            <div style={{ ...cardStyle, marginBottom: 16, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>選擇出貨數量</span>
                <span style={{ fontSize: 14, color: '#9ca3af' }}>{Object.values(saleItemQty).filter(q => Number(q) > 0).length} / {Object.keys(saleItemQty).length} 項</span>
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {items.filter(i => saleItemQty.hasOwnProperty(i.id)).map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid #f3f5f7', background: Number(saleItemQty[item.id] || 0) > 0 ? '#f0fdf4' : '#fff' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description_snapshot || '-'}</div>
                      <div style={{ fontSize: 13, color: '#9ca3af', ...S.mono, marginTop: 2 }}>{item.item_number_snapshot} · 訂購 {item.qty}{Number(item.sold_qty || 0) > 0 ? ` · 已銷 ${item.sold_qty}` : ''} · 剩餘 {item.remaining_qty != null ? item.remaining_qty : item.qty} · 庫存 {item.stock_qty}</div>
                    </div>
                    {(() => { const maxQty = item.remaining_qty != null ? Number(item.remaining_qty) : Number(item.qty); return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setSaleItemQty(p => ({ ...p, [item.id]: Math.max(0, (Number(p[item.id]) || 0) - 1) }))} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <input type="number" value={saleItemQty[item.id] || 0} onChange={(e) => { const v = Math.max(0, Math.min(Number(e.target.value) || 0, maxQty)); setSaleItemQty(p => ({ ...p, [item.id]: v })); }} style={{ width: 50, textAlign: 'center', ...S.input, ...S.mono, fontSize: 14, fontWeight: 700, padding: '4px 6px' }} min="0" max={maxQty} />
                      <button onClick={() => setSaleItemQty(p => ({ ...p, [item.id]: Math.min(maxQty, (Number(p[item.id]) || 0) + 1) }))} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      <button onClick={() => setSaleItemQty(p => ({ ...p, [item.id]: maxQty }))} style={{ ...S.btnGhost, padding: '4px 8px', fontSize: 11 }}>全部</button>
                    </div>
                    ); })()}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, color: '#374151' }}>
                合計：<strong style={{ color: '#059669', ...S.mono }}>{Object.entries(saleItemQty).reduce((s, [id, q]) => { const it = items.find(i => i.id === id); return s + (it ? Number(it.unit_price || 0) * Number(q || 0) : 0); }, 0).toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 })}</strong>
              </div>
              <button onClick={confirmSaleConversion} disabled={processingAction === 'sale'} style={{ ...S.btnPrimary, padding: '12px 28px', fontSize: 15, fontWeight: 700, background: 'linear-gradient(135deg, #16a34a, #15803d)', opacity: processingAction === 'sale' ? 0.7 : 1 }}>
                {processingAction === 'sale' ? '處理中...' : `確認送審轉銷貨 (${Object.values(saleItemQty).filter(q => Number(q) > 0).length} 項)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Orders({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total_amount: 0, pending_count: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [convertingId, setConvertingId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalMap, setApprovalMap] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  // ★ 新增：選中的訂單（進入詳情頁）
  const [selectedOrder, setSelectedOrder] = useState(null);
  // ★ 批次出貨
  const [batchIds, setBatchIds] = useState(new Set());
  const [batchShipping, setBatchShipping] = useState(false);

  const toggleBatch = (id, e) => { e.stopPropagation(); setBatchIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const handleBatchShip = async () => {
    if (batchIds.size === 0) return;
    if (!confirm(`確定為勾選的 ${batchIds.size} 筆訂單建立出貨？`)) return;
    setBatchShipping(true);
    let ok = 0, fail = 0;
    for (const orderId of batchIds) {
      try { await apiPost({ action: 'create_shipment', order_id: orderId, notify_line: true }); ok++; } catch { fail++; }
    }
    setActionMessage(`批次出貨完成：成功 ${ok} 筆${fail ? `，失敗 ${fail} 筆` : ''}`);
    setBatchIds(new Set());
    setBatchShipping(false);
    load();
  };

  const ORDER_STATUS_MAP = { pending: '待確認', draft: '草稿', confirmed: '已確認', processing: '處理中', shipped: '已出貨', completed: '完成', cancelled: '已取消' };
  const PAY_STATUS_MAP = { unpaid: '未付款', partial: '部分付款', paid: '已付款' };
  const SHIP_STATUS_MAP = { pending: '待出貨', shipped: '已出貨', delivered: '已送達' };

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const params = { action: 'orders', page: String(page), limit: String(limit), search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (statusFilter) params.status = statusFilter;
      const result = await apiGet(params);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, dateFrom, dateTo, statusFilter]);

  useEffect(() => { load(); }, []);

  // Focus on a specific order if navigated from another page
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const focusedOrder = window.localStorage.getItem(ORDER_FOCUS_KEY);
    if (!focusedOrder) return;
    setSearch(focusedOrder);
    load(1, focusedOrder);
    window.localStorage.removeItem(ORDER_FOCUS_KEY);
  }, [load]);

  useEffect(() => {
    if (data.rows.length === 0) return;
    apiGet({ action: 'approvals', doc_type: 'order' })
      .then(result => {
        const map = {};
        (result.rows || []).forEach(a => {
          if (!map[a.doc_id] || new Date(a.created_at) > new Date(map[a.doc_id].created_at)) {
            map[a.doc_id] = a;
          }
        });
        setApprovalMap(map);
      })
      .catch(() => {});
  }, [data.rows]);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(1, search, pageSize);

  const handleExport = async () => {
    try {
      const params = { action: 'orders', page: '1', limit: '9999', export: 'true', search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const result = await apiGet(params);
      const columns = [
        { key: 'order_no', label: '訂單號' },
        { key: (row) => row.customer?.company_name || row.customer?.name || '-', label: '客戶' },
        { key: 'status', label: '狀態' },
        { key: 'order_date', label: '訂單日期' },
        { key: 'total_amount', label: '總金額' },
        { key: 'payment_status', label: '付款狀態' },
        { key: 'shipping_status', label: '出貨狀態' },
      ];
      exportCsv(result.rows || [], columns, `訂單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert('匯出失敗: ' + e.message); }
  };

  // ★ 如果選中了某筆訂單，顯示詳情頁
  if (selectedOrder) {
    return (
      <OrderDetailView
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onRefresh={() => load()}
        setTab={setTab}
      />
    );
  }

  return (
    <div>
      <PageLead eyebrow="ORDERS" title="訂單" description="點擊訂單進入詳情，自動比對庫存。有貨可轉銷貨，缺貨可轉採購單。" action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{batchIds.size > 0 && <button onClick={handleBatchShip} disabled={batchShipping} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: batchShipping ? 0.7 : 1 }}>{batchShipping ? '出貨中...' : `批次出貨 (${batchIds.size})`}</button>}<CsvImportButton datasetId="erp_orders" onImported={() => load(1, search, pageSize)} compact /><button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button><button onClick={() => data.table_ready && setShowCreate(true)} disabled={!data.table_ready} style={{ ...S.btnPrimary, opacity: data.table_ready ? 1 : 0.6, cursor: data.table_ready ? 'pointer' : 'not-allowed' }}>+ 新增訂單</button></div>} />
      {actionMessage ? (
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 14 }}>
          {actionMessage}
        </div>
      ) : null}
      <div style={{ ...S.card, marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="confirmed">已確認</option>
            <option value="shipped">已出貨</option>
            <option value="completed">完成</option>
            <option value="cancelled">已取消</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋訂單號..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 13 }}>查詢</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 erp_orders 資料表。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="OTOT" label="訂單總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="PEND" label="未完成" value={fmt(data.summary?.pending_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有訂單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '32px 50px 140px minmax(0,1fr) 100px 100px 100px' : '32px 50px 150px minmax(0,1.2fr) 100px 100px 100px 100px 110px 150px', gap: 10, padding: '12px 16px', borderBottom: '2px solid #e6edf5', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>
            <div><input type="checkbox" checked={batchIds.size > 0 && data.rows.every(r => batchIds.has(r.id))} onChange={(e) => { if (e.target.checked) setBatchIds(new Set(data.rows.map(r => r.id))); else setBatchIds(new Set()); }} style={{ cursor: 'pointer' }} /></div>
            <div>序</div>
            <div>訂單號</div>
            <div>客戶</div>
            <div>日期</div>
            <div>狀態</div>
            {!isTablet && <div>付款</div>}
            {!isTablet && <div>出貨</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            <div style={{ textAlign: 'right' }}>操作</div>
          </div>
          {data.rows.map((row, idx) => {
            const statusKey = String(row.status || 'draft').toLowerCase();
            const payKey = String(row.payment_status || 'unpaid').toLowerCase();
            const shipKey = String(row.shipping_status || 'pending').toLowerCase();

            return (
              <div key={row.id} onClick={() => setSelectedOrder(row)} style={{ display: 'grid', gridTemplateColumns: isTablet ? '32px 50px 140px minmax(0,1fr) 100px 100px 100px' : '32px 50px 150px minmax(0,1.2fr) 100px 100px 100px 100px 110px 150px', gap: 10, padding: '12px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: batchIds.has(row.id) ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={(e) => { if (!batchIds.has(row.id)) e.currentTarget.style.background = '#f0f7ff'; }} onMouseLeave={(e) => { e.currentTarget.style.background = batchIds.has(row.id) ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafbfd'; }}>
                <div><input type="checkbox" checked={batchIds.has(row.id)} onChange={(e) => toggleBatch(row.id, e)} style={{ cursor: 'pointer' }} /></div>
                <div style={{ fontSize: 12, color: '#6b7280', ...S.mono }}>{((data.page - 1) * (data.limit || pageSize)) + idx + 1}</div>
                <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{row.order_no || '-'}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</div>
                </div>
                <div style={{ fontSize: 13, color: '#374151', ...S.mono }}>{row.order_date || '-'}</div>
                <div><span style={S.tag(statusKey === 'confirmed' ? 'green' : '')}>{ORDER_STATUS_MAP[statusKey] || statusKey}</span></div>
                {!isTablet && <div><span style={S.tag(payKey === 'paid' ? 'green' : payKey === 'partial' ? 'yellow' : '')}>{PAY_STATUS_MAP[payKey] || payKey}</span></div>}
                {!isTablet && <div><span style={S.tag(shipKey === 'shipped' || shipKey === 'delivered' ? 'green' : '')}>{SHIP_STATUS_MAP[shipKey] || shipKey}</span></div>}
                {!isTablet && <div style={{ fontSize: 14, color: '#10b981', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const approval = approvalMap[row.id];
                    const shipKey_local = String(row.shipping_status || 'pending').toLowerCase();
                    const isConverted = shipKey_local === 'shipped' || shipKey_local === 'delivered';
                    if (isConverted) return <span style={{ ...S.tag('green'), fontSize: 11 }}>已轉銷貨</span>;
                    return null;
                  })()}
                  <button onClick={(e) => { e.stopPropagation(); window.open(`/api/pdf?type=order&id=${row.id}`, '_blank'); }} style={{ ...S.btnGhost, padding: '5px 8px', fontSize: 11 }}>PDF</button>
                </div>
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
      <OrderCreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { load(1, search, pageSize); setShowCreate(false); }} tableReady={data.table_ready} />
    </div>
  );
}
