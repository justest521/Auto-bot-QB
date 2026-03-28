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
  const [editingItemId, setEditingItemId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [showAddItem, setShowAddItem] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState([]);
  const [addSearching, setAddSearching] = useState(false);
  const [replacingItemId, setReplacingItemId] = useState(null);
  const [replaceSearch, setReplaceSearch] = useState('');
  const [replaceResults, setReplaceResults] = useState([]);

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
        const [result, approvalResult] = await Promise.all([
          apiGet({ action: 'order_items_with_stock', order_id: order.id }),
          apiGet({ action: 'approvals', doc_type: 'order' }),
        ]);
        setItems(result.items || []);
        setLinkedSales(result.linked_sales || []);
        setLinkedPOs(result.linked_pos || []);
        setTimeline(result.timeline || []);
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
    // 防呆：已有 PO 的品項不可勾選
    const item = items.find(i => i.id === itemId);
    if (item && (item.po_ref || item.po_info)) return;
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const selectAllByStatus = (items, statuses) => {
    const ids = items.filter(i => statuses.includes(i.stock_status) && !i.po_ref && !i.po_info).map(i => i.id);
    setSelectedItemIds(new Set(ids));
  };

  const startEditItem = (item, e) => {
    e.stopPropagation();
    if (item.sale_ref) return;
    setEditingItemId(item.id);
    setEditValues({
      qty: item.qty,
      unit_price: item.unit_price,
      discount_rate: item.discount_rate || 0,
      item_note: item.item_note || '',
    });
  };

  const cancelEdit = (e) => {
    if (e) e.stopPropagation();
    setEditingItemId(null);
    setEditValues({});
  };

  const saveEditItem = async (e) => {
    if (e) e.stopPropagation();
    setMsg('');
    const savedId = editingItemId;
    const savedValues = { ...editValues };
    // 樂觀更新：先即時更新本地 state
    setItems(prev => prev.map(item => {
      if (item.id !== savedId) return item;
      const newQty = savedValues.qty !== undefined ? Number(savedValues.qty) : Number(item.qty);
      const newPrice = savedValues.unit_price !== undefined ? Number(savedValues.unit_price) : Number(item.unit_price);
      const dr = savedValues.discount_rate !== undefined ? Number(savedValues.discount_rate) : Number(item.discount_rate || 0);
      const discounted = dr > 0 ? Math.round(newPrice * (1 - dr / 100)) : newPrice;
      return { ...item, qty: newQty, unit_price: newPrice, discount_rate: dr, item_note: savedValues.item_note ?? item.item_note, line_total: newQty * discounted };
    }));
    setEditingItemId(null);
    setEditValues({});
    try {
      await apiPost({ action: 'update_order_item', item_id: savedId, ...savedValues });
      // 背景 refresh 拿到最新庫存等資料
      refreshOrderData();
      onRefresh?.();
    } catch (error) {
      setMsg(error.message || '更新失敗');
      // 失敗時重新載入正確資料
      refreshOrderData();
    }
  };

  const deleteItem = async (itemId, e) => {
    if (e) e.stopPropagation();
    if (!confirm('確定刪除此品項？')) return;
    try {
      await apiPost({ action: 'delete_order_item', item_id: itemId });
      const refreshed = await apiGet({ action: 'order_items_with_stock', order_id: order.id });
      setItems(refreshed.items || []);
      setLinkedSales(refreshed.linked_sales || []);
      setLinkedPOs(refreshed.linked_pos || []);
      setTimeline(refreshed.timeline || []);
      onRefresh?.();
      setMsg('品項已刪除');
    } catch (error) {
      setMsg(error.message || '刪除失敗');
    }
  };

  // 產品搜尋 (add/replace 共用)
  const searchTimeoutRef = useRef(null);
  const searchProducts = (keyword, setResults) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!keyword || keyword.length < 2) { setResults([]); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await apiGet({ action: 'products', q: keyword, page: 1, limit: 8, lite: 1 });
        setResults(res.rows || res.products || []);
      } catch (_) { setResults([]); }
    }, 400);
  };

  const refreshOrderData = async () => {
    const refreshed = await apiGet({ action: 'order_items_with_stock', order_id: order.id });
    setItems(refreshed.items || []);
    setLinkedSales(refreshed.linked_sales || []);
    setLinkedPOs(refreshed.linked_pos || []);
    setTimeline(refreshed.timeline || []);
    onRefresh?.();
  };

  const handleAddItem = async (product) => {
    setMsg('');
    try {
      await apiPost({ action: 'add_order_item', order_id: order.id, item_number: product.item_number });
      await refreshOrderData();
      setShowAddItem(false);
      setAddSearch('');
      setAddResults([]);
      setMsg(`已新增 ${product.item_number}`);
    } catch (error) {
      setMsg(error.message || '新增失敗');
    }
  };

  const handleReplaceItem = async (itemId, newProduct) => {
    setMsg('');
    try {
      await apiPost({ action: 'replace_order_item', item_id: itemId, new_item_number: newProduct.item_number });
      await refreshOrderData();
      setReplacingItemId(null);
      setReplaceSearch('');
      setReplaceResults([]);
      setMsg(`已替換為 ${newProduct.item_number}`);
    } catch (error) {
      setMsg(error.message || '替換失敗');
    }
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
    // 防呆：過濾已有採購單的品項
    const alreadyHasPO = selectedItems.filter(i => i.po_ref || i.po_info);
    const canPurchase = selectedItems.filter(i => !i.po_ref && !i.po_info);
    if (canPurchase.length === 0) {
      setMsg(`所選 ${alreadyHasPO.length} 項皆已建立採購單，無需重複採購`);
      return;
    }
    const warnText = alreadyHasPO.length > 0
      ? `\n⚠️ 其中 ${alreadyHasPO.length} 項已有採購單將自動跳過（${alreadyHasPO.map(i => i.item_number_snapshot).join(', ')}）`
      : '';
    if (!confirm(`確定將 ${canPurchase.length} 項轉為採購單草稿？${warnText}`)) return;
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

  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 };
  const cardStyle = { ...S.card, borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5', marginBottom: 0 };
  const isConverted = shipKey === 'shipped' || shipKey === 'delivered';
  const canConvert = approvalData?.status === 'approved';
  const isPending = approvalData?.status === 'pending';
  const isRejected = approvalData?.status === 'rejected';

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header ====== */}
      <div style={{ ...cardStyle, padding: '16px 24px', borderRadius: 10, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{order.order_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: `${ORDER_STATUS_COLOR[statusKey] || '#6b7280'}14`, color: ORDER_STATUS_COLOR[statusKey] || '#6b7280', border: `1px solid ${ORDER_STATUS_COLOR[statusKey] || '#6b7280'}30` }}>
                {ORDER_STATUS_MAP[statusKey] || statusKey}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, ...S.mono }}>
              {order.order_date || '-'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!isConverted && canConvert && <button onClick={() => { const allIds = new Set(items.map(i => i.id)); setSelectedItemIds(allIds); openSaleForm(); }} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(22,163,74,0.25)' }}>轉銷貨</button>}
          {isConverted && <span style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>已轉銷貨</span>}
          {!canConvert && !isConverted && <button onClick={submitForApproval} disabled={convertingId === order.id} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: convertingId === order.id ? 0.7 : 1, transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>{convertingId === order.id ? '送審中...' : isPending ? '審核中' : isRejected ? '重送審' : '送審'}</button>}
          {canConvert && <button onClick={() => { initShipQty(); setShowShipForm(true); }} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(245,158,11,0.25)' }}>建立出貨</button>}
          {canConvert && <button onClick={() => window.open(`/api/pdf?type=order&id=${order.id}`, '_blank')} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}>PDF</button>}
          {order.customer?.line_user_id && <button onClick={notifyOrderViaLine} disabled={!!processingAction} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #86efac', background: '#f0fdf4', fontSize: 13, fontWeight: 600, color: '#16a34a', cursor: 'pointer', opacity: processingAction === 'line' ? 0.6 : 1 }}>LINE</button>}
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 16, padding: '12px 20px', fontSize: 14 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 10, alignItems: 'start' }}>
          {/* ====== Left: Items with Stock Check ====== */}
          <div>
            {/* ===== Quick select buttons ===== */}
            <div style={{ padding: '6px 12px', marginBottom: 10, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setSelectedItemIds(new Set(items.filter(i => !i.po_ref && !i.po_info).map(i => i.id)))} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12 }}>全選</button>
                <button onClick={() => setSelectedItemIds(new Set())} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12 }}>取消全選</button>
                {sufficientCount > 0 && <button onClick={() => selectAllByStatus(items, ['sufficient'])} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12, color: '#15803d', borderColor: '#bbf7d0' }}>選有貨 ({sufficientCount})</button>}
                {shortageCount > 0 && <button onClick={() => selectAllByStatus(items, ['partial', 'no_stock'])} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12, color: '#b91c1c', borderColor: '#fecaca' }}>選缺貨 ({shortageCount})</button>}
                {selectedItemIds.size > 0 && <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600, padding: '4px 0' }}>已選 {selectedItemIds.size} 項</span>}
                {items.filter(i => i.po_ref || i.po_info).length > 0 && <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, padding: '4px 8px', background: '#fffbeb', borderRadius: 4 }}>已有 {items.filter(i => i.po_ref || i.po_info).length} 項已建採購單</span>}
              </div>
            </div>

            {/* ===== Items table ===== */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'visible', marginBottom: 10 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>商品明細</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
              </div>
              {items.length > 0 ? (
                <div>
                  {/* Table header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '32px 130px 80px 50px 80px 85px minmax(0,1fr) 70px', gap: 6, padding: '6px 10px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    <div></div><div>料號</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'center' }}>數量</div><div style={{ textAlign: 'center' }}>庫存</div><div style={{ textAlign: 'right' }}>小計</div><div>備註</div><div></div>
                  </div>
                  {/* Table rows */}
                  {items.map((item) => {
                    const badge = STOCK_BADGE[item.stock_status] || STOCK_BADGE.no_stock;
                    const isChecked = selectedItemIds.has(item.id);
                    const hasPO = !!(item.po_ref || item.po_info);
                    const isEditing = editingItemId === item.id;
                    const cannotEdit = !!item.sale_ref;
                    const inputStyle = { width: '100%', padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, textAlign: 'center', outline: 'none' };
                    const rowBg = isEditing ? '#fffbeb' : isChecked ? '#f0f7ff' : hasPO ? '#fafafa' : '#fff';
                    return (
                      <div key={item.id}>
                      <div onClick={() => !isEditing && toggleItemSelect(item.id)} style={{ display: 'grid', gridTemplateColumns: '32px 130px 80px 50px 80px 85px minmax(0,1fr) 70px', gap: 6, padding: '14px 10px 14px 10px', borderTop: '1px solid #f3f5f7', alignItems: 'center', fontSize: 13, cursor: isEditing ? 'default' : 'pointer', background: rowBg, opacity: hasPO && !isEditing ? 0.7 : 1, transition: 'background 0.1s' }} onMouseEnter={e => !isChecked && !isEditing && (e.currentTarget.style.background= hasPO ? '#fafafa' : '#f8fafc')} onMouseLeave={e => !isChecked && !isEditing && (e.currentTarget.style.background= isEditing ? '#fffbeb' : isChecked ? '#f0f7ff' : hasPO ? '#fafafa' : '#fff')}>
                        <div style={{ textAlign: 'center' }}>
                          {cannotEdit ? (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af' }}>已銷</span>
                          ) : hasPO ? (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af' }}>已採購</span>
                          ) : (
                            <input type="checkbox" checked={isChecked} onChange={() => {}} style={{ cursor: 'pointer', width: 18, height: 18, accentColor: '#3b82f6' }} />
                          )}
                        </div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151', fontWeight: 600, ...S.mono, fontSize: 14 }} title={`${item.item_number_snapshot} — ${item.description_snapshot || ''}`}>
                          {item.item_number_snapshot}
                        </div>
                        <div onClick={(e) => !cannotEdit && !isEditing && startEditItem(item, e)} style={{ color: '#6b7280', textAlign: 'right', ...S.mono, fontSize: 14, cursor: cannotEdit || isEditing ? 'default' : 'pointer', transition: 'background 0.1s', padding: '2px 4px', borderRadius: 4, background: !cannotEdit && !isEditing ? 'transparent' : 'transparent' }} onMouseEnter={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = '#f3f4f6')} onMouseLeave={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = 'transparent')}>
                          {isEditing ? (
                            <input type="number" value={editValues.unit_price} onChange={(e) => setEditValues({ ...editValues, unit_price: parseFloat(e.target.value) || 0 })} style={inputStyle} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} />
                          ) : (
                            fmtP(item.unit_price)
                          )}
                        </div>
                        <div onClick={(e) => !cannotEdit && !isEditing && startEditItem(item, e)} style={{ textAlign: 'center', fontWeight: 600, ...S.mono, fontSize: 14, cursor: cannotEdit || isEditing ? 'default' : 'pointer', padding: '2px 4px', borderRadius: 4, background: 'transparent' }} onMouseEnter={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = '#f3f4f6')} onMouseLeave={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = 'transparent')}>
                          {isEditing ? (
                            <input type="number" value={editValues.qty} onChange={(e) => setEditValues({ ...editValues, qty: parseInt(e.target.value) || 0 })} style={inputStyle} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} />
                          ) : (
                            item.qty
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <span style={{ fontWeight: 700, color: badge.color, ...S.mono, fontSize: 12 }}>{item.stock_qty}</span>
                          <span style={{ padding: '1px 5px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>
                            {badge.label}{item.stock_status === 'partial' ? `(差${item.shortage})` : ''}
                          </span>
                        </div>
                        <div style={{ color: '#059669', fontWeight: 800, textAlign: 'right', ...S.mono, fontSize: 14 }}>{fmtP(item.line_total || item.unit_price * item.qty)}</div>
                        <div onClick={(e) => !cannotEdit && !isEditing && startEditItem(item, e)} style={{ fontSize: 14, color: '#6b7280', cursor: cannotEdit || isEditing ? 'default' : 'pointer', padding: '2px 4px', borderRadius: 4, background: 'transparent', lineHeight: 1.4 }} onMouseEnter={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = '#f3f4f6')} onMouseLeave={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = 'transparent')}>
                          {isEditing ? (
                            <input type="text" value={editValues.item_note} onChange={(e) => setEditValues({ ...editValues, item_note: e.target.value })} style={{ ...inputStyle, textAlign: 'left' }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} placeholder="備註" />
                          ) : (
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{item.item_note || '—'}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center' }}>
                          {isEditing ? (
                            <>
                              <button onClick={saveEditItem} style={{ width: 18, height: 18, borderRadius: 4, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</button>
                              <button onClick={cancelEdit} style={{ width: 18, height: 18, borderRadius: 4, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                            </>
                          ) : (
                            <>
                              {!cannotEdit && <button onClick={(e) => startEditItem(item, e)} title="編輯" style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>}
                              {!cannotEdit && !hasPO && <button onClick={(e) => { e.stopPropagation(); setReplacingItemId(replacingItemId === item.id ? null : item.id); setReplaceSearch(''); setReplaceResults([]); }} title="替換" style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⇄</button>}
                              {!cannotEdit && !hasPO && <button onClick={(e) => deleteItem(item.id, e)} title="刪除" style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>}
                            </>
                          )}
                        </div>
                      </div>
                      {replacingItemId === item.id && (
                        <div style={{ padding: '10px 24px 14px', background: '#f5f3ff', borderTop: '1px solid #e9d5ff' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>替換 {item.item_number_snapshot} →</span>
                            <button onClick={() => { setReplacingItemId(null); setReplaceSearch(''); setReplaceResults([]); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: 11 }}>取消</button>
                          </div>
                          <div style={{ position: 'relative' }}>
                            <input type="text" placeholder="輸入 2 字以上搜尋料號或品名..." value={replaceSearch}
                              ref={el => { if (el && replacingItemId === item.id && !el.dataset.focused) { el.focus(); el.dataset.focused = '1'; } }}
                              onChange={e => { setReplaceSearch(e.target.value); searchProducts(e.target.value, setReplaceResults); }}
                              onKeyDown={e => { if (e.key === 'Escape') { setReplacingItemId(null); setReplaceSearch(''); setReplaceResults([]); } }}
                              style={{ width: '100%', maxWidth: 400, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }}
                            />
                            {replaceResults.length > 0 && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', maxWidth: 500, maxHeight: 200, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, marginTop: 4 }}>
                                {replaceResults.map(p => (
                                  <div key={p.id || p.item_number} onClick={() => handleReplaceItem(item.id, p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }} onMouseEnter={e => e.currentTarget.style.background='#f5f3ff'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                    <div>
                                      <span style={{ fontWeight: 700, ...S.mono, marginRight: 8 }}>{p.item_number}</span>
                                      <span style={{ color: '#6b7280' }}>{p.description || ''}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#9ca3af' }}>
                                      <span>{fmtP(p.tw_retail_price || 0)}</span>
                                      <span>庫存 {p.stock_qty || 0}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      </div>
                    );
                  })}
                  {/* Add Item Row */}
                  {!showAddItem ? (
                    <div style={{ padding: '10px 24px', borderTop: '1px dashed #e5e7eb' }}>
                      <button onClick={() => setShowAddItem(true)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 12, color: '#3b82f6', borderColor: '#bfdbfe' }}>＋ 新增品項</button>
                    </div>
                  ) : (
                    <div style={{ padding: '14px 24px', borderTop: '1px dashed #e5e7eb', background: '#f0f9ff' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>新增品項</span>
                        <button onClick={() => { setShowAddItem(false); setAddSearch(''); setAddResults([]); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: 11 }}>取消</button>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text" placeholder="輸入 2 字以上搜尋料號或品名..." value={addSearch}
                          ref={el => { if (el && showAddItem && !el.dataset.focused) { el.focus(); el.dataset.focused = '1'; } }}
                          onChange={e => { setAddSearch(e.target.value); searchProducts(e.target.value, setAddResults); }}
                          onKeyDown={e => { if (e.key === 'Escape') { setShowAddItem(false); setAddSearch(''); setAddResults([]); } }}
                          style={{ width: '100%', maxWidth: 400, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }}
                        />
                        {addResults.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', maxWidth: 500, maxHeight: 240, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, marginTop: 4 }}>
                            {addResults.map(p => (
                              <div key={p.id || p.item_number} onClick={() => handleAddItem(p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }} onMouseEnter={e => e.currentTarget.style.background='#f0f7ff'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                <div>
                                  <span style={{ fontWeight: 700, ...S.mono, marginRight: 8 }}>{p.item_number}</span>
                                  <span style={{ color: '#6b7280' }}>{p.description || ''}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#9ca3af' }}>
                                  <span>{fmtP(p.tw_retail_price || 0)}</span>
                                  <span>庫存 {p.stock_qty || 0}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
            {/* 1. PDF button */}
            <button onClick={() => window.open(`/api/pdf?type=order&id=${order.id}`, '_blank')} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>下載 PDF</button>

            {/* 2. Customer card */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>客戶資訊</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{order.customer?.company_name || order.customer?.name || '未綁定客戶'}</div>
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

            {/* 3. Combined Order Record — progress + sales + POs + timeline */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>訂單記錄</div>
              {(() => {
                const fmtTime = (t) => { if (!t) return ''; const d = new Date(t); if (isNaN(d.getTime())) return typeof t === 'string' ? t.slice(0, 10) : ''; const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
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
                const saleStatusMap = { draft: '草稿', issued: '已開立', paid: '已收款', void: '作廢' };
                const saleColorMap = { draft: '#f59e0b', issued: '#3b82f6', paid: '#16a34a', void: '#ef4444' };
                const poStatusMap = { draft: '草稿', confirmed: '已確認', received: '已到貨', cancelled: '已取消' };
                const poColorMap = { draft: '#f59e0b', confirmed: '#3b82f6', received: '#16a34a', cancelled: '#ef4444' };

                // Progress stages as entries
                const hasQuote = timeline.some(e => (e.event || '').match(/QT\d+|報價/));
                const insufficientCount = items.filter(i => i.stock_status === 'partial').length;
                const noStockCount = items.filter(i => i.stock_status === 'no_stock').length;
                const totalQty = items.reduce((s, i) => s + Number(i.qty || 0), 0);
                const totalSold = items.reduce((s, i) => s + Number(i.sold_qty || 0), 0);

                // Quote
                if (hasQuote) {
                  const qtEv = timeline.find(e => (e.event || '').match(/QT\d+|報價/));
                  const qtNo = (qtEv?.event || '').match(/(QT\d+)/)?.[1] || '';
                  entries.push({ dot: '#16a34a', label: '報價', ref: qtNo, refType: 'quote', time: qtEv?.time, status: 'done' });
                }
                // Order created
                const orderEv = timeline.find(e => (e.event || '').match(/建立訂單/));
                entries.push({ dot: '#16a34a', label: '訂單建立', ref: order.order_no, time: orderEv?.time || order.created_at, status: 'done' });
                // Approval
                if (approvalData || statusKey === 'confirmed') {
                  const as = approvalData?.status;
                  const dotColor = (as === 'approved' || statusKey === 'confirmed') ? '#16a34a' : as === 'rejected' ? '#dc2626' : as === 'pending' ? '#2563eb' : '#d1d5db';
                  const statusText = as === 'approved' ? '已核准' : as === 'rejected' ? '已駁回' : as === 'pending' ? '待審核' : '已確認';
                  entries.push({ dot: dotColor, label: '審核簽核', detail: statusText, time: approvalData?.approved_at || approvalData?.created_at, status: as === 'approved' || statusKey === 'confirmed' ? 'done' : as === 'pending' ? 'current' : as === 'rejected' ? 'rejected' : 'pending' });
                }
                // POs
                linkedPOs.forEach(po => {
                  const pk = String(po.status || 'draft').toLowerCase();
                  const pc = poColorMap[pk] || '#6b7280';
                  const poItems = items.filter(i => i.po_info || (i.po_ref && i.po_ref === po.id));
                  const poItemText = poItems.length > 0 ? poItems.map(i => i.item_number_snapshot).join(', ') : '';
                  const detailParts = [poStatusMap[pk] || pk];
                  if (poItemText) detailParts.push(poItemText);
                  entries.push({ dot: pc, label: '採購', ref: po.po_no, refType: 'po', detail: detailParts.join(' · '), detailColor: pc, time: po.po_date, status: pk === 'received' ? 'done' : 'current' });
                });
                // Stock
                const stockOk = noStockCount === 0 && insufficientCount === 0;
                entries.push({ dot: stockOk ? '#16a34a' : '#d97706', label: '庫存', detail: stockOk ? `全部充足 (${items.length}項)` : `充足${sufficientCount} 不足${insufficientCount} 無庫存${noStockCount}`, status: stockOk ? 'done' : 'warning' });
                // Sales
                linkedSales.forEach(sale => {
                  const sk = String(sale.status || 'draft').toLowerCase();
                  const sc = saleColorMap[sk] || '#6b7280';
                  const saleItems = items.filter(i => i.sale_info);
                  const saleItemText = saleItems.length > 0 ? saleItems.map(i => `${i.item_number_snapshot}(${i.sale_info?.sold_qty || 0}/${i.qty})`).join(', ') : '';
                  const detailParts = [saleStatusMap[sk] || sk];
                  if (sale.total_qty != null) detailParts.push(sale.total_qty + '件');
                  detailParts.push('NT$' + Number(sale.total || 0).toLocaleString());
                  if (saleItemText) detailParts.push(saleItemText);
                  entries.push({ dot: sc, label: '銷貨', ref: sale.slip_number, refType: 'sale', detail: detailParts.join(' · '), detailColor: sc, time: sale.sale_date, status: sk === 'paid' ? 'done' : 'current' });
                });
                // Payment
                entries.push({ dot: payKey === 'paid' ? '#16a34a' : payKey === 'partial' ? '#2563eb' : '#d1d5db', label: '付款', detail: PAY_STATUS_MAP[payKey] || payKey, status: payKey === 'paid' ? 'done' : payKey === 'partial' ? 'current' : 'pending' });
                // Shipping
                entries.push({ dot: (shipKey === 'shipped' || shipKey === 'delivered') ? '#16a34a' : '#d1d5db', label: '出貨', detail: SHIP_STATUS_MAP[shipKey] || shipKey, status: (shipKey === 'shipped' || shipKey === 'delivered') ? 'done' : 'pending' });
                // Completion
                const isCompleted = statusKey === 'completed' || (payKey === 'paid' && (shipKey === 'shipped' || shipKey === 'delivered'));
                if (isCompleted) {
                  entries.push({ dot: '#16a34a', label: '完成', detail: '訂單完成', status: 'done' });
                }

                return (
                  <div style={{ position: 'relative', paddingLeft: 18 }}>
                    {entries.map((e, i) => {
                      const isLast = i === entries.length - 1;
                      const isCurrent = e.status === 'current' || e.status === 'warning';
                      const nextDot = !isLast ? (entries[i + 1]?.dot || '#e5e7eb') : '#e5e7eb';
                      return (
                        <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 14, minHeight: isLast ? 'auto' : 28 }}>
                          {!isLast && <div style={{ position: 'absolute', left: -11, top: 10, width: 2, bottom: 0, background: '#e5e7eb' }} />}
                          <div style={{ position: 'absolute', left: -14, top: 3, width: isCurrent ? 10 : 8, height: isCurrent ? 10 : 8, borderRadius: '50%', background: e.dot, border: '2px solid #fff', boxShadow: isCurrent ? `0 0 0 3px ${e.dot}25` : `0 0 0 1.5px ${e.dot}30` }} />
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', lineHeight: 1.3 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: e.status === 'done' ? '#1f2937' : e.status === 'rejected' ? '#dc2626' : isCurrent ? '#1d4ed8' : '#9ca3af' }}>{e.label}</span>
                            {e.ref && (() => {
                              const clickHandler = e.refType === 'sale' ? () => { window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, e.ref); setTab?.('sales_documents'); }
                                : e.refType === 'po' ? () => { window.localStorage.setItem(PO_FOCUS_KEY, e.ref); setTab?.('purchase_orders'); }
                                : e.refType === 'quote' ? () => { window.localStorage.setItem('qb_quote_focus', e.ref); setTab?.('quotes'); }
                                : null;
                              return <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', ...S.mono, cursor: clickHandler ? 'pointer' : 'default', textDecoration: clickHandler ? 'underline' : 'none' }} onClick={clickHandler}>{e.ref}</span>;
                            })()}
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

            {/* 4. Remark card */}
            {order.remark && (
              <div style={{ ...cardStyle, padding: '10px 16px' }}>
                <div style={labelStyle}>備註</div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontWeight: 700 }}>{order.remark}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== Shipment Creation Modal ====== */}
      {showShipForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={() => setShowShipForm(false)}>
          <div style={{ width: 'min(700px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={S.eyebrow}>Create Shipment</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>建立出貨 — {order.order_no}</div>
              </div>
              <button onClick={() => setShowShipForm(false)} style={S.btnGhost}>關閉</button>
            </div>

            {/* Ship items selection */}
            <div style={{ ...cardStyle, marginBottom: 10, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div style={{ ...cardStyle, padding: '10px 16px', marginBottom: 10 }}>
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
          <div style={{ width: 'min(700px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={S.eyebrow}>Convert to Sale</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>轉銷貨 — {order.order_no}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>可調整每項出貨數量，未出的數量可之後再轉</div>
              </div>
              <button onClick={() => setShowSaleForm(false)} style={S.btnGhost}>關閉</button>
            </div>

            <div style={{ ...cardStyle, marginBottom: 10, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10 }}>
          {actionMessage}
        </div>
      ) : null}
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 14, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 14 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="confirmed">已確認</option>
            <option value="shipped">已出貨</option>
            <option value="completed">完成</option>
            <option value="cancelled">已取消</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋訂單號..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 14, padding: '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 14 }}>查詢</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 erp_orders 資料表。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        <StatCard code="OTOT" label="訂單總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="PEND" label="未完成" value={fmt(data.summary?.pending_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有訂單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '32px 50px 140px minmax(0,1fr) 100px 100px 100px' : '32px 50px 150px minmax(0,1.2fr) 100px 100px 100px 100px 110px 150px', gap: 10, padding: '8px 16px', borderBottom: '2px solid #e6edf5', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>
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
              <div key={row.id} onClick={() => setSelectedOrder(row)} style={{ display: 'grid', gridTemplateColumns: isTablet ? '32px 50px 140px minmax(0,1fr) 100px 100px 100px' : '32px 50px 150px minmax(0,1.2fr) 100px 100px 100px 100px 110px 150px', gap: 10, padding: '10px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: batchIds.has(row.id) ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={(e) => { if (!batchIds.has(row.id)) e.currentTarget.style.background = '#f0f7ff'; }} onMouseLeave={(e) => { e.currentTarget.style.background = batchIds.has(row.id) ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafbfd'; }}>
                <div><input type="checkbox" checked={batchIds.has(row.id)} onChange={(e) => toggleBatch(row.id, e)} style={{ cursor: 'pointer' }} /></div>
                <div style={{ fontSize: 12, color: '#6b7280', ...S.mono }}>{((data.page - 1) * (data.limit || pageSize)) + idx + 1}</div>
                <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{row.order_no || '-'}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</div>
                </div>
                <div style={{ fontSize: 12, color: '#374151', ...S.mono }}>{row.order_date || '-'}</div>
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
                  <button onClick={(e) => { e.stopPropagation(); window.open(`/api/pdf?type=order&id=${row.id}`, '_blank'); }} style={{ ...S.btnGhost, padding: '5px 8px', fontSize: 12 }}>PDF</button>
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
