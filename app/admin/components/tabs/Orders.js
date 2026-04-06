'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost, openPdf } from '@/lib/admin/api';
import { fmt, fmtP, getPresetDateRange, useResponsive, exportCsv } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard, CsvImportButton } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';
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
function OrderDetailView({ order: orderProp, onBack, onRefresh, setTab, erpFeatures = {} }) {
  const { isMobile, isTablet } = useResponsive();
  const [orderFull, setOrderFull] = useState(orderProp); // Will be enriched with customer data
  const order = orderFull; // Use enriched order everywhere
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [items, setItems] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [processingAction, setProcessingAction] = useState('');
  const [approvalData, setApprovalData] = useState(null);
  const [orderPayments, setOrderPayments] = useState([]);
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
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('transfer');
  const [payType, setPayType] = useState('full');
  const [payProcessing, setPayProcessing] = useState(false);

  // Sync parent prop updates (e.g., after onRefresh re-fetches order data)
  useEffect(() => {
    setOrderFull(prev => ({ ...prev, ...orderProp }));
  }, [orderProp.status, orderProp.payment_status, orderProp.shipping_status]);

  const statusKey = String(order.status || 'draft').toLowerCase();
  const payKey = String(order.payment_status || 'unpaid').toLowerCase();
  const shipKey = String(order.shipping_status || 'pending').toLowerCase();
  const ORDER_STATUS_MAP = { draft: '草稿', pending_approval: '待審核', confirmed: '已核准', processing: '出貨中', completed: '已完成', rejected: '已駁回', shipped: '已出貨', cancelled: '已取消', pending: '待確認', purchasing: '採購中' };
  const ORDER_STATUS_COLOR = { draft: '#6b7280', pending_approval: '#f59e0b', confirmed: '#16a34a', processing: '#3b82f6', completed: '#059669', rejected: '#ef4444', shipped: '#059669', cancelled: '#ef4444', pending: '#f59e0b', purchasing: '#8b5cf6' };
  const PAY_STATUS_MAP = { unpaid: '未付款', partial: '部分付款', paid: '已付款' };
  const SHIP_STATUS_MAP = { pending: '待出貨', partial: '部分出貨', shipped: '已出貨', delivered: '已送達' };
  const totalPaidAmount = orderPayments.filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount || 0), 0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'order_items_with_stock', order_id: order.id });
        const loadedItems = result.items || [];
        setItems(loadedItems);
        setLinkedSales(result.linked_sales || []);
        setLinkedPOs(result.linked_pos || []);
        setTimeline(result.timeline || []);
        // Enrich order with full data from API (customer, status, etc.)
        if (result.order_data) setOrderFull(prev => ({ ...prev, ...result.order_data }));
        // Fetch approvals for both order and related sales
        const [orderApprovalRes, saleApprovalRes] = await Promise.all([
          apiGet({ action: 'approvals', doc_type: 'order' }),
          apiGet({ action: 'approvals', doc_type: 'sale' }),
        ]);
        // Find approval: first check order-level, then check linked sale-level
        const orderMap = {};
        (orderApprovalRes.rows || []).forEach(a => {
          if (!orderMap[a.doc_id] || new Date(a.created_at) > new Date(orderMap[a.doc_id].created_at)) orderMap[a.doc_id] = a;
        });
        let foundApproval = orderMap[order.id] || null;
        if (!foundApproval) {
          const saleIds = new Set((result.linked_sales || []).map(s => String(s.id)));
          const saleApprovals = (saleApprovalRes.rows || []).filter(a => saleIds.has(String(a.doc_id)));
          if (saleApprovals.length > 0) {
            saleApprovals.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            foundApproval = saleApprovals[0];
          }
        }
        setApprovalData(foundApproval);
        // Fetch payment records for this order
        try {
          const payRes = await apiGet({ action: 'order_payments', order_id: order.id });
          setOrderPayments(payRes.payments || []);
        } catch (_) { /* ignore */ }
      } catch (e) {
        setMsg(e.message || '無法取得訂單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [order.id]);

  const sufficientCount = items.filter(i => i.stock_status === 'sufficient').length;
  const shortageCount = items.filter(i => i.stock_status !== 'sufficient').length;

  // ── Item-level action groups ──
  const [itemGroupFilter, setItemGroupFilter] = useState('all');
  const getItemGroup = (item) => {
    const fullySold = item.sale_info && Number(item.remaining_qty || 0) <= 0;
    if (fullySold || item.po_ref || item.po_info) return 'done';
    if (item.stock_status === 'sufficient' || item.stock_status === 'partial') return 'to_sell';
    return 'to_purchase'; // no_stock + no PO
  };
  const ITEM_GROUPS = [
    { id: 'to_purchase', label: '待採購',   dot: '#ef4444', tip: '無庫存且無採購單' },
    { id: 'to_sell',     label: '可轉銷貨', dot: '#f59e0b', tip: '有庫存未銷完' },
    { id: 'done',        label: '已處理',   dot: '#16a34a', tip: '已採購或已銷完' },
    { id: 'all',         label: '全部',     dot: '#9ca3af', tip: '所有品項' },
  ];
  const itemGroupCounts = items.reduce((acc, i) => {
    const g = getItemGroup(i); acc[g] = (acc[g] || 0) + 1; return acc;
  }, {});
  const visibleItems = itemGroupFilter === 'all' ? items : items.filter(i => getItemGroup(i) === itemGroupFilter);

  const toggleItemSelect = (itemId) => {
    // 已全部銷完的品項不可勾選
    const item = items.find(i => i.id === itemId);
    if (item && item.sale_info && Number(item.remaining_qty || 0) <= 0) return;
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const selectAllByStatus = (items, statuses) => {
    const ids = items.filter(i => statuses.includes(i.stock_status) && !(i.sale_info && Number(i.remaining_qty || 0) <= 0)).map(i => i.id);
    setSelectedItemIds(new Set(ids));
  };

  const startEditItem = (item, e) => {
    e.stopPropagation();
    if (isEditLocked || item.sale_ref) return;
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
    if (isEditLocked) return;
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
    if (isEditLocked) return;
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
      const result = await apiPost({ action: 'submit_approval', doc_type: 'order', doc_id: order.id, doc_no: order.order_no, requested_by: 'admin', amount: order.total_amount });
      setMsg(result.message || (result.auto_approved ? '已自動核准' : '已送審，等待審核'));
      onRefresh?.();
    } catch (error) {
      // If auto_restored, show as success and refresh
      if (error.message?.includes('已自動恢復') || error.message?.includes('不需重新送審')) {
        setMsg(error.message);
        onRefresh?.();
      } else {
        setMsg(error.message || '送審失敗');
      }
    } finally {
      setConvertingId('');
    }
  };

  const revertToDraft = async () => {
    if (!confirm(`確定將訂單 ${order.order_no} 退回草稿？退回後可重新編輯品項與金額。`)) return;
    setMsg('');
    try {
      await apiPost({ action: 'update_order_status', order_id: order.id, status: 'draft' });
      setMsg('已退回草稿，可重新編輯');
      onRefresh?.();
    } catch (error) {
      setMsg(error.message || '退回失敗');
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
      setMsg(`已建立銷貨單 ${result.sale?.slip_number || ''} (${result.processed_count} 項)，已自動核准`);
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
      ? `\n其中 ${alreadyHasPO.length} 項已有採購單將自動跳過（${alreadyHasPO.map(i => i.item_number_snapshot).join(', ')}）`
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

  const labelStyle = { fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };
  const cardStyle = { ...S.card, borderRadius: t.radius.lg, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5', marginBottom: 0 };
  // isConverted = all items fully sold AND shipped (not just shipping status)
  const allItemsSold = items.length > 0 && items.every(i => Number(i.sold_qty || 0) >= Number(i.qty || 0));
  const isConverted = allItemsSold && (shipKey === 'shipped' || shipKey === 'delivered');
  // 用訂單本身的 status 判斷，不再依賴 erp_approvals 表
  const orderStatus = order.status || 'draft';
  const approvalEnabled = erpFeatures.order_approval !== false;
  // Allow conversion if confirmed/processing, OR if has linked sales (previously approved, PO arrival scenario)
  // When approval is OFF, draft orders can also convert directly
  const hasPriorApproval = linkedSales.length > 0; // If there are sales, it was previously approved
  const canConvert = ['confirmed', 'processing'].includes(orderStatus)
    || hasPriorApproval  // 有銷貨記錄 = 曾經核准過，任何狀態都可轉銷貨
    || (!approvalEnabled && ['draft', 'rejected'].includes(orderStatus));
  const isPending = orderStatus === 'pending_approval';
  const isRejected = orderStatus === 'rejected';
  const isLocked = approvalEnabled && (isPending || (approvalData?.status === 'pending' && approvalData?.doc_type === 'order')); // 審核中鎖定所有操作
  const isEditLocked = approvalEnabled ? !['draft', 'rejected'].includes(orderStatus) : !['draft', 'rejected', 'confirmed'].includes(orderStatus); // 審核關閉時 confirmed 也可編輯

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header ====== */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: t.radius.md, border: `1px solid ${t.color.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: t.color.textMuted, transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: t.fontSize.h1, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono, letterSpacing: -0.5 }}>{order.order_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: t.radius.lg, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: `${ORDER_STATUS_COLOR[statusKey] || '#6b7280'}14`, color: ORDER_STATUS_COLOR[statusKey] || '#6b7280', border: `1px solid ${ORDER_STATUS_COLOR[statusKey] || '#6b7280'}30` }}>
                {ORDER_STATUS_MAP[statusKey] || statusKey}
              </span>
              <span style={{ fontSize: 9, background: order.tax_inclusive ? '#dcfce7' : '#fef3c7', color: order.tax_inclusive ? '#15803d' : '#92400e', padding: '1px 5px', borderRadius: t.radius.sm, fontWeight: t.fontWeight.semibold, letterSpacing: 0.3 }}>{order.tax_inclusive ? '含稅' : '未稅'}</span>
            </div>
            <div style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>
              {order.order_date || '-'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>{order.customer?.company_name || order.customer?.name || '未綁定客戶'}</div>
            {order.customer?.phone && <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, ...S.mono, marginTop: 2 }}>{order.customer.phone}</div>}
          </div>
          {order.customer?.line_user_id && <button onClick={notifyOrderViaLine} disabled={!!processingAction} style={{ padding: '6px 12px', borderRadius: t.radius.md, border: '1px solid #86efac', background: '#f0fdf4', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.brand, cursor: 'pointer', opacity: processingAction === 'line' ? 0.6 : 1 }}>LINE</button>}
        </div>
      </div>

      {msg && (() => {
        const isErr = msg.includes('失敗') || msg.includes('已在簽核') || msg.includes('駁回') || msg.includes('取消') || msg.includes('無法') || msg.includes('錯誤');
        return <div style={{ ...cardStyle, background: isErr ? '#fff1f2' : '#edfdf3', borderColor: isErr ? '#fecdd3' : '#bbf7d0', color: isErr ? '#b42318' : '#15803d', marginBottom: 10, padding: '10px 16px', fontSize: t.fontSize.h3 }}>{msg}</div>;
      })()}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: 10, alignItems: 'start' }}>
          {/* ====== Left: Items with Stock Check ====== */}
          <div style={{ position: 'relative' }}>
            {/* 審核中鎖定遮罩 */}
            {isLocked && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10, borderRadius: t.radius.xl, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60 }}>
                <div style={{ background: '#fff', padding: '12px 24px', borderRadius: t.radius.lg, boxShadow: '0 4px 24px rgba(0,0,0,0.25)', border: '1px solid #fde68a', textAlign: 'center' }}>
                  <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: '#92400e' }}>訂單審核中</div>
                  <div style={{ fontSize: t.fontSize.caption, color: '#b45309', marginTop: 4 }}>審核完成後才能進行操作</div>
                </div>
              </div>
            )}
            {/* ===== Item Group Tabs ===== */}
            <div style={{ marginBottom: 10, opacity: isLocked ? 0.5 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}>
              <div style={{ display: 'flex', gap: 0, background: t.color.bgMuted, border: `1px solid ${t.color.borderLight}`, borderRadius: t.radius.lg, padding: 3, flexWrap: 'wrap' }}>
                {ITEM_GROUPS.map(g => {
                  const isActive = itemGroupFilter === g.id;
                  const cnt = itemGroupCounts[g.id] || 0;
                  return (
                    <button key={g.id} title={g.tip}
                      onClick={() => {
                        setItemGroupFilter(g.id);
                        // Auto-select items in group (except 'done' and 'all')
                        if (g.id === 'all') {
                          setSelectedItemIds(new Set());
                        } else if (g.id !== 'done') {
                          const ids = items.filter(i => getItemGroup(i) === g.id).map(i => i.id);
                          setSelectedItemIds(new Set(ids));
                        } else {
                          setSelectedItemIds(new Set());
                        }
                      }}
                      style={{
                        flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        padding: '6px 12px', borderRadius: t.radius.md, cursor: 'pointer', border: 'none',
                        background: isActive ? '#fff' : 'transparent',
                        boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        color: isActive ? t.color.textPrimary : t.color.textMuted,
                        fontWeight: isActive ? t.fontWeight.bold : t.fontWeight.normal,
                        fontSize: t.fontSize.caption, transition: 'all 0.12s', whiteSpace: 'nowrap',
                      }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? g.dot : '#d1d5db', flexShrink: 0 }} />
                      {g.label}
                      {cnt > 0 && (
                        <span style={{ fontSize: 11, fontWeight: t.fontWeight.bold, padding: '1px 6px', borderRadius: 99, background: isActive ? g.dot : t.color.bgCard, color: isActive ? '#fff' : t.color.textMuted, border: `1px solid ${isActive ? g.dot : t.color.borderLight}` }}>{cnt}</span>
                      )}
                    </button>
                  );
                })}
                {selectedItemIds.size > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', fontSize: t.fontSize.caption }}>
                    <span style={{ color: t.color.link, fontWeight: t.fontWeight.semibold }}>已選 {selectedItemIds.size} 項</span>
                    <button onClick={() => setSelectedItemIds(new Set())} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: t.fontSize.tiny }}>清除</button>
                  </div>
                )}
              </div>
            </div>

            {/* ===== Items table ===== */}
            <div style={{ ...cardStyle, padding: 0, overflow: isMobile ? 'hidden' : 'visible', marginBottom: 10, opacity: isLocked ? 0.5 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5' }}>
                <span style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textDisabled }}>商品明細</span>
                <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.medium, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
              </div>
              {items.length > 0 ? (
                <div>
                  {isMobile ? null : (
                  /* Table header (desktop only) */
                  <div style={{ display: 'grid', gridTemplateColumns: '32px 130px 80px 50px 80px 85px minmax(0,1fr) 70px', gap: 6, padding: '8px 12px', background: '#f8f9fb', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    <div></div><div>料號</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'center' }}>數量</div><div style={{ textAlign: 'center' }}>庫存</div><div style={{ textAlign: 'right' }}>小計</div><div>備註</div><div></div>
                  </div>
                  )}
                  {/* Table rows / Mobile cards */}
                  {visibleItems.map((item) => {
                    const badge = STOCK_BADGE[item.stock_status] || STOCK_BADGE.no_stock;
                    const isChecked = selectedItemIds.has(item.id);
                    const hasPO = !!(item.po_ref || item.po_info);
                    const isEditing = editingItemId === item.id;
                    const cannotEdit = !!item.sale_ref;
                    const fullySold = item.sale_info && Number(item.remaining_qty || 0) <= 0;
                    const inputStyle = { width: '100%', padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: t.radius.sm, fontSize: t.fontSize.caption, textAlign: 'center', outline: 'none' };
                    const rowBg = isEditing ? '#fffbeb' : isChecked ? '#f0f7ff' : hasPO ? '#fafafa' : '#fff';

                    if (isMobile) {
                      return (
                        <div key={item.id} style={{ ...S.mobileCard, marginBottom: 8, marginLeft: 0, marginRight: 0 }}>
                          {/* Mobile card header with checkbox */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
                            <div>
                              {fullySold ? (
                                <span style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: t.radius.sm }}>✓ 已銷</span>
                              ) : hasPO ? (
                                <span style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: '#d97706', background: '#fef3c7', padding: '2px 6px', borderRadius: t.radius.sm }}>✓ 已採</span>
                              ) : (
                                <input type="checkbox" checked={isChecked} onChange={() => toggleItemSelect(item.id)} style={{ cursor: 'pointer', width: 18, height: 18, accentColor: '#3b82f6' }} />
                              )}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{item.item_number_snapshot}</div>
                              <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 2 }}>{item.description_snapshot || ''}</div>
                            </div>
                          </div>
                          {/* Mobile card rows */}
                          <div style={S.mobileCardRow}>
                            <span style={S.mobileCardLabel}>單價</span>
                            <span style={S.mobileCardValue}>
                              {isEditing ? (
                                <input type="number" value={editValues.unit_price} onChange={(e) => setEditValues({ ...editValues, unit_price: parseFloat(e.target.value) || 0 })} style={inputStyle} onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} />
                              ) : (
                                fmtP(item.unit_price)
                              )}
                            </span>
                          </div>
                          <div style={S.mobileCardRow}>
                            <span style={S.mobileCardLabel}>數量</span>
                            <span style={S.mobileCardValue}>
                              {isEditing ? (
                                <input type="number" value={editValues.qty} onChange={(e) => setEditValues({ ...editValues, qty: parseInt(e.target.value) || 0 })} style={inputStyle} onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} />
                              ) : (
                                item.qty
                              )}
                            </span>
                          </div>
                          <div style={S.mobileCardRow}>
                            <span style={S.mobileCardLabel}>庫存</span>
                            <span style={S.mobileCardValue}>
                              <span style={{ fontWeight: t.fontWeight.bold, color: badge.color, ...S.mono, fontSize: t.fontSize.caption }}>{item.stock_qty}</span>
                              <span style={{ padding: '1px 5px', borderRadius: t.radius.md, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap', marginLeft: 4 }}>
                                {badge.label}{item.stock_status === 'partial' ? `(差${item.shortage})` : ''}
                              </span>
                            </span>
                          </div>
                          <div style={S.mobileCardRow}>
                            <span style={S.mobileCardLabel}>小計</span>
                            <span style={{ ...S.mobileCardValue, color: '#059669', fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(item.line_total || item.unit_price * item.qty)}</span>
                          </div>
                          <div style={S.mobileCardRow}>
                            <span style={S.mobileCardLabel}>備註</span>
                            <span style={S.mobileCardValue}>
                              {isEditing ? (
                                <input type="text" value={editValues.item_note} onChange={(e) => setEditValues({ ...editValues, item_note: e.target.value })} style={{ ...inputStyle, textAlign: 'left' }} onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} placeholder="備註" />
                              ) : (
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{item.item_note || '—'}</span>
                              )}
                            </span>
                          </div>
                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
                            {isEditing ? (
                              <>
                                <button onClick={saveEditItem} style={{ flex: 1, padding: '8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, minHeight: 40 }}>保存</button>
                                <button onClick={cancelEdit} style={{ flex: 1, padding: '8px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, minHeight: 40 }}>取消</button>
                              </>
                            ) : (
                              <>
                                {!cannotEdit && <button onClick={(e) => startEditItem(item, e)} style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: t.color.textMuted, cursor: 'pointer', fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, minHeight: 40 }}>編輯</button>}
                                {!cannotEdit && !hasPO && <button onClick={(e) => { e.stopPropagation(); setReplacingItemId(replacingItemId === item.id ? null : item.id); setReplaceSearch(''); setReplaceResults([]); }} style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer', fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, minHeight: 40 }}>替換</button>}
                                {!cannotEdit && !hasPO && <button onClick={(e) => deleteItem(item.id, e)} style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: t.color.error, cursor: 'pointer', fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, minHeight: 40 }}>刪除</button>}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={item.id}>
                      <div onClick={() => !isEditing && toggleItemSelect(item.id)} style={{ display: 'grid', gridTemplateColumns: '32px 130px 80px 50px 80px 85px minmax(0,1fr) 70px', gap: 6, padding: '10px 12px', borderTop: '1px solid #f3f5f7', alignItems: 'center', fontSize: t.fontSize.body, cursor: isEditing ? 'default' : 'pointer', background: rowBg, opacity: hasPO && !isEditing ? 0.7 : 1, transition: 'background 0.1s' }} onMouseEnter={e => !isChecked && !isEditing && (e.currentTarget.style.background= hasPO ? '#fafafa' : '#f8fafc')} onMouseLeave={e => !isChecked && !isEditing && (e.currentTarget.style.background= isEditing ? '#fffbeb' : isChecked ? '#f0f7ff' : hasPO ? '#fafafa' : '#fff')}>
                        <div style={{ textAlign: 'center' }}>
                          {fullySold ? (
                            <span style={{ fontSize: 9, fontWeight: t.fontWeight.bold, color: '#16a34a' }}>✓ 已銷</span>
                          ) : hasPO ? (
                            <span style={{ fontSize: 9, fontWeight: t.fontWeight.bold, color: '#d97706' }}>✓ 已採</span>
                          ) : (
                            <input type="checkbox" checked={isChecked} onChange={() => toggleItemSelect(item.id)} style={{ cursor: 'pointer', width: 18, height: 18, accentColor: '#3b82f6' }} />
                          )}
                        </div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.color.textSecondary, fontWeight: t.fontWeight.semibold, ...S.mono, fontSize: t.fontSize.h3 }} title={`${item.item_number_snapshot} — ${item.description_snapshot || ''}`}>
                          {item.item_number_snapshot}
                        </div>
                        <div onClick={(e) => !cannotEdit && !isEditing && startEditItem(item, e)} style={{ color: t.color.textMuted, textAlign: 'right', ...S.mono, fontSize: t.fontSize.h3, cursor: cannotEdit || isEditing ? 'default' : 'pointer', transition: 'background 0.1s', padding: '2px 4px', borderRadius: t.radius.sm, background: !cannotEdit && !isEditing ? 'transparent' : 'transparent' }} onMouseEnter={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = '#f3f4f6')} onMouseLeave={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = 'transparent')}>
                          {isEditing ? (
                            <input type="number" value={editValues.unit_price} onChange={(e) => setEditValues({ ...editValues, unit_price: parseFloat(e.target.value) || 0 })} style={inputStyle} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} />
                          ) : (
                            fmtP(item.unit_price)
                          )}
                        </div>
                        <div onClick={(e) => !cannotEdit && !isEditing && startEditItem(item, e)} style={{ textAlign: 'center', fontWeight: t.fontWeight.semibold, ...S.mono, fontSize: t.fontSize.h3, cursor: cannotEdit || isEditing ? 'default' : 'pointer', padding: '2px 4px', borderRadius: t.radius.sm, background: 'transparent' }} onMouseEnter={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = '#f3f4f6')} onMouseLeave={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = 'transparent')}>
                          {isEditing ? (
                            <input type="number" value={editValues.qty} onChange={(e) => setEditValues({ ...editValues, qty: parseInt(e.target.value) || 0 })} style={inputStyle} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} />
                          ) : (
                            item.qty
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <span style={{ fontWeight: t.fontWeight.bold, color: badge.color, ...S.mono, fontSize: t.fontSize.caption }}>{item.stock_qty}</span>
                          <span style={{ padding: '1px 5px', borderRadius: t.radius.md, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>
                            {badge.label}{item.stock_status === 'partial' ? `(差${item.shortage})` : ''}
                          </span>
                        </div>
                        <div style={{ color: '#059669', fontWeight: t.fontWeight.bold, textAlign: 'right', ...S.mono, fontSize: t.fontSize.h3 }}>{fmtP(item.line_total || item.unit_price * item.qty)}</div>
                        <div onClick={(e) => !cannotEdit && !isEditing && startEditItem(item, e)} style={{ fontSize: t.fontSize.h3, color: t.color.textMuted, cursor: cannotEdit || isEditing ? 'default' : 'pointer', padding: '2px 4px', borderRadius: t.radius.sm, background: 'transparent', lineHeight: 1.4 }} onMouseEnter={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = '#f3f4f6')} onMouseLeave={(e) => !cannotEdit && !isEditing && (e.currentTarget.style.background = 'transparent')}>
                          {isEditing ? (
                            <input type="text" value={editValues.item_note} onChange={(e) => setEditValues({ ...editValues, item_note: e.target.value })} style={{ ...inputStyle, textAlign: 'left' }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} placeholder="備註" />
                          ) : (
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{item.item_note || '—'}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center' }}>
                          {isEditing ? (
                            <>
                              <button onClick={saveEditItem} style={{ width: 18, height: 18, borderRadius: t.radius.sm, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</button>
                              <button onClick={cancelEdit} style={{ width: 18, height: 18, borderRadius: t.radius.sm, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                            </>
                          ) : (
                            <>
                              {!cannotEdit && <button onClick={(e) => startEditItem(item, e)} title="編輯" style={{ width: 18, height: 18, borderRadius: t.radius.sm, border: '1px solid #d1d5db', background: '#fff', color: t.color.textMuted, cursor: 'pointer', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>}
                              {!cannotEdit && !hasPO && <button onClick={(e) => { e.stopPropagation(); setReplacingItemId(replacingItemId === item.id ? null : item.id); setReplaceSearch(''); setReplaceResults([]); }} title="替換" style={{ width: 18, height: 18, borderRadius: t.radius.sm, border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⇄</button>}
                              {!cannotEdit && !hasPO && <button onClick={(e) => deleteItem(item.id, e)} title="刪除" style={{ width: 18, height: 18, borderRadius: t.radius.sm, border: '1px solid #fecaca', background: '#fef2f2', color: t.color.error, cursor: 'pointer', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>}
                            </>
                          )}
                        </div>
                      </div>
                      {replacingItemId === item.id && (
                        <div style={{ padding: '10px 24px 14px', background: '#f5f3ff', borderTop: '1px solid #e9d5ff' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: '#7c3aed' }}>替換 {item.item_number_snapshot} →</span>
                            <button onClick={() => { setReplacingItemId(null); setReplaceSearch(''); setReplaceResults([]); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: t.fontSize.tiny }}>取消</button>
                          </div>
                          <div style={{ position: 'relative' }}>
                            <input type="text" placeholder="輸入 2 字以上搜尋料號或品名..." value={replaceSearch}
                              ref={el => { if (el && replacingItemId === item.id && !el.dataset.focused) { el.focus(); el.dataset.focused = '1'; } }}
                              onChange={e => { setReplaceSearch(e.target.value); searchProducts(e.target.value, setReplaceResults); }}
                              onKeyDown={e => { if (e.key === 'Escape') { setReplacingItemId(null); setReplaceSearch(''); setReplaceResults([]); } }}
                              style={{ width: '100%', maxWidth: 400, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: t.fontSize.body, outline: 'none' }}
                            />
                            {replaceResults.length > 0 && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', maxWidth: 500, maxHeight: 200, overflowY: 'auto', background: '#fff', border: `1px solid ${t.color.border}`, borderRadius: t.radius.md, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, marginTop: 4 }}>
                                {replaceResults.map(p => (
                                  <div key={p.id || p.item_number} onClick={() => handleReplaceItem(item.id, p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: t.fontSize.body }} onMouseEnter={e => e.currentTarget.style.background='#f5f3ff'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                    <div>
                                      <span style={{ fontWeight: t.fontWeight.bold, ...S.mono, marginRight: 8 }}>{p.item_number}</span>
                                      <span style={{ color: t.color.textMuted }}>{p.description || ''}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, fontSize: t.fontSize.caption, color: t.color.textDisabled }}>
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
                  {isEditLocked ? (
                    <div style={{ padding: '10px 24px', borderTop: '1px dashed #e5e7eb' }}>
                      <span style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled }}>訂單已審核，如需修改請先「退回草稿」</span>
                    </div>
                  ) : !showAddItem ? (
                    <div style={{ padding: '10px 24px', borderTop: '1px dashed #e5e7eb' }}>
                      <button onClick={() => setShowAddItem(true)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: t.fontSize.caption, color: t.color.link, borderColor: '#bfdbfe' }}>＋ 新增品項</button>
                    </div>
                  ) : (
                    <div style={{ padding: '14px 24px', borderTop: '1px dashed #e5e7eb', background: '#f0f9ff' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: '#1d4ed8' }}>新增品項</span>
                        <button onClick={() => { setShowAddItem(false); setAddSearch(''); setAddResults([]); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: t.fontSize.tiny }}>取消</button>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text" placeholder="輸入 2 字以上搜尋料號或品名..." value={addSearch}
                          ref={el => { if (el && showAddItem && !el.dataset.focused) { el.focus(); el.dataset.focused = '1'; } }}
                          onChange={e => { setAddSearch(e.target.value); searchProducts(e.target.value, setAddResults); }}
                          onKeyDown={e => { if (e.key === 'Escape') { setShowAddItem(false); setAddSearch(''); setAddResults([]); } }}
                          style={{ width: '100%', maxWidth: 400, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: t.fontSize.body, outline: 'none' }}
                        />
                        {addResults.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', maxWidth: 500, maxHeight: 240, overflowY: 'auto', background: '#fff', border: `1px solid ${t.color.border}`, borderRadius: t.radius.md, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, marginTop: 4 }}>
                            {addResults.map(p => (
                              <div key={p.id || p.item_number} onClick={() => handleAddItem(p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: t.fontSize.body }} onMouseEnter={e => e.currentTarget.style.background='#f0f7ff'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                <div>
                                  <span style={{ fontWeight: t.fontWeight.bold, ...S.mono, marginRight: 8 }}>{p.item_number}</span>
                                  <span style={{ color: t.color.textMuted }}>{p.description || ''}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 12, fontSize: t.fontSize.caption, color: t.color.textDisabled }}>
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
                  <div style={{ padding: isMobile ? '16px 12px' : '20px 24px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderTop: '2px solid #d1fae5' }}>
                    <div style={{ display: isMobile ? 'flex' : 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'flex-end', alignItems: isMobile ? 'stretch' : 'flex-end', gap: isMobile ? 8 : 24 }}>
                      {isMobile ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>小計</span>
                              <div style={{ ...S.mono, fontSize: t.fontSize.h3, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{fmtP(order.subtotal || items.reduce((s, i) => s + (i.line_total || i.unit_price * i.qty || 0), 0))}</div>
                            </div>
                            {order.discount_amount > 0 && <div><span style={{ fontSize: t.fontSize.caption, color: t.color.error }}>折扣</span><div style={{ ...S.mono, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, color: t.color.error }}>-{fmtP(order.discount_amount)}</div></div>}
                            {order.shipping_fee > 0 && <div><span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>運費</span><div style={{ ...S.mono, fontSize: t.fontSize.h3, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{fmtP(order.shipping_fee)}</div></div>}
                            {order.tax_amount > 0 && <div><span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>稅金</span><div style={{ ...S.mono, fontSize: t.fontSize.h3, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{fmtP(order.tax_amount)}</div></div>}
                          </div>
                          <div style={{ borderTop: '2px solid #a7f3d0', paddingTop: 12, textAlign: 'left' }}>
                            <span style={{ fontSize: t.fontSize.tiny, color: t.color.brand, fontWeight: t.fontWeight.semibold, display: 'block', marginBottom: 4 }}>合計</span>
                            <span style={{ ...S.mono, fontSize: t.fontSize.h1, fontWeight: 900, color: '#059669' }}>{fmtP(order.total_amount || 0)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <span style={{ fontSize: t.fontSize.h3, color: t.color.textMuted }}>小計 <strong style={{ ...S.mono, fontSize: t.fontSize.h2, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{fmtP(order.subtotal || items.reduce((s, i) => s + (i.line_total || i.unit_price * i.qty || 0), 0))}</strong></span>
                            {order.discount_amount > 0 && <span style={{ fontSize: t.fontSize.h3, color: t.color.error }}>折扣 <strong style={{ ...S.mono, fontSize: t.fontSize.h2, fontWeight: t.fontWeight.semibold }}>-{fmtP(order.discount_amount)}</strong></span>}
                            {order.shipping_fee > 0 && <span style={{ fontSize: t.fontSize.h3, color: t.color.textMuted }}>運費 <strong style={{ ...S.mono, fontSize: t.fontSize.h2, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{fmtP(order.shipping_fee)}</strong></span>}
                            {order.tax_amount > 0 && <span style={{ fontSize: t.fontSize.h3, color: t.color.textMuted }}>稅金 <strong style={{ ...S.mono, fontSize: t.fontSize.h2, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{fmtP(order.tax_amount)}</strong></span>}
                          </div>
                          <div style={{ borderLeft: '2px solid #a7f3d0', paddingLeft: 20, textAlign: 'right' }}>
                            <span style={{ fontSize: t.fontSize.caption, color: t.color.brand, fontWeight: t.fontWeight.semibold, display: 'block', marginBottom: 2 }}>合計</span>
                            <span style={{ ...S.mono, fontSize: 28, fontWeight: 900, color: '#059669', letterSpacing: -1 }}>{fmtP(order.total_amount || 0)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: t.fontSize.h3 }}>尚無品項</div>
              )}
            </div>

            {/* ===== Bulk action buttons ===== */}
            {!isConverted && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', ...(isMobile ? { gridColumn: '1/-1' } : {}) }}>
              {linkedSales.length > 0 && (
              <span style={{ padding: '8px 18px', borderRadius: t.radius.lg, fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, background: t.color.infoBg, color: '#2563eb', border: '1px solid #bfdbfe' }}>
                已建立銷貨單 {linkedSales.map(s => s.slip_number).join(', ')}（訂單已審核）
              </span>
              )}
              {!canConvert && !isConverted && (statusKey === 'draft' || statusKey === 'rejected') && erpFeatures.order_approval !== false ? (
              <span style={{ padding: '8px 18px', borderRadius: t.radius.lg, fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, background: t.color.warningBg, color: '#92400e', border: '1px solid #fde68a' }}>請先送審並核准後才能轉銷貨</span>
              ) : isPending && erpFeatures.order_approval !== false ? (
              <span style={{ padding: '8px 18px', borderRadius: t.radius.lg, fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, background: t.color.infoBg, color: '#2563eb', border: '1px solid #bfdbfe' }}>訂單審核中，請等待審核完成</span>
              ) : canConvert && items.some(i => (i.remaining_qty != null ? Number(i.remaining_qty) > 0 : !i.sale_info)) && (
              <button
                onClick={openSaleForm}
                disabled={!!processingAction || selectedItemIds.size === 0}
                style={{ ...S.btnPrimary, padding: '8px 18px', fontSize: t.fontSize.body, background: selectedItemIds.size > 0 ? '#16a34a' : '#9ca3af', borderColor: selectedItemIds.size > 0 ? '#16a34a' : '#9ca3af', opacity: processingAction ? 0.6 : 1 }}
              >
                {processingAction === 'sale' ? '處理中...' : `勾選項目 → 轉銷貨${selectedItemIds.size > 0 ? ` (${selectedItemIds.size}項)` : ''}`}
              </button>
              )}
              {canConvert && (
              <button
                onClick={handleSelectedToPO}
                disabled={!!processingAction || selectedItemIds.size === 0}
                style={{ ...S.btnGhost, padding: '8px 18px', fontSize: t.fontSize.body, color: selectedItemIds.size > 0 ? '#dc2626' : '#9ca3af', borderColor: selectedItemIds.size > 0 ? '#fca5a5' : '#e5e7eb', opacity: processingAction ? 0.6 : 1 }}
              >
                {processingAction === 'po' ? '處理中...' : `勾選項目 → 轉採購單${selectedItemIds.size > 0 ? ` (${selectedItemIds.size}項)` : ''}`}
              </button>
              )}
              {/* 送審 / 建立出貨 / PDF — moved from top bar */}
              {erpFeatures.order_approval !== false && !canConvert && !isConverted && !isPending && (statusKey === 'draft' || statusKey === 'rejected') && (
                <button onClick={submitForApproval} disabled={convertingId === order.id} style={{ padding: '8px 18px', borderRadius: t.radius.lg, border: 'none', background: isRejected ? '#ef4444' : '#3b82f6', color: '#fff', fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, cursor: 'pointer', opacity: convertingId === order.id ? 0.7 : 1 }}>{convertingId === order.id ? '送審中...' : isRejected ? '重新送審' : '送審'}</button>
              )}
              {canConvert && linkedSales.length === 0 && (
                <button onClick={revertToDraft} style={{ ...S.btnGhost, padding: '8px 18px', fontSize: t.fontSize.body, color: t.color.warning, borderColor: '#fde68a' }}>退回草稿</button>
              )}
            </div>
            )}
          </div>

          {/* ====== Right sidebar ====== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...(isMobile ? { gridColumn: '1/-1' } : {}) }}>
            {/* 1. PDF button */}
            <button onClick={() => openPdf('order', order.id)} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, justifyContent: 'center' }}>下載 PDF</button>

            {/* 2. 客戶資訊 */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>客戶資訊</div>
              <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 6 }}>{order.customer?.company_name || order.customer?.name || '未綁定客戶'}</div>
              {[
                { label: '電話', value: order.customer?.phone },
                { label: '訂單日期', value: order.order_date, mono: true },
              ].filter(f => f.value).map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled, fontWeight: t.fontWeight.semibold }}>{f.label}</span>
                  <span style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold, ...(f.mono ? S.mono : {}) }}>{f.value}</span>
                </div>
              ))}
            </div>

            {/* 2.5 Sales person */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>負責業務</div>
              <span style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, color: order.sales_person ? '#111827' : '#9ca3af' }}>{order.sales_person || '未指派'}</span>
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
                const poStatusMap = { draft: '草稿', pending_approval: '待審核', confirmed: '已核准', received: '已到貨', rejected: '已駁回', cancelled: '已取消' };
                const poColorMap = { draft: '#f59e0b', pending_approval: '#f59e0b', confirmed: '#3b82f6', received: '#16a34a', rejected: '#ef4444', cancelled: '#ef4444' };

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
                // Approval status — based on order.status lifecycle (only when approval is enabled)
                if (statusKey !== 'draft' && erpFeatures.order_approval !== false) {
                  const approvalSteps = [];
                  // 送審
                  if (['pending_approval', 'confirmed', 'processing', 'completed'].includes(statusKey)) {
                    const submitEv = timeline.find(e => (e.event || '').match(/送審/));
                    approvalSteps.push({ dot: '#16a34a', label: '送審', detail: '已送審', time: submitEv?.time, status: 'done' });
                  }
                  // 審核結果
                  if (statusKey === 'pending_approval') {
                    approvalSteps.push({ dot: '#f59e0b', label: '審核', detail: '待審核', status: 'current' });
                  } else if (statusKey === 'rejected') {
                    const rejEv = timeline.find(e => (e.event || '').match(/駁回/));
                    approvalSteps.push({ dot: '#dc2626', label: '送審', detail: '已送審', status: 'done' });
                    approvalSteps.push({ dot: '#dc2626', label: '審核', detail: '已駁回', time: rejEv?.time, status: 'rejected' });
                  } else if (['confirmed', 'processing', 'completed'].includes(statusKey)) {
                    const appEv = timeline.find(e => (e.event || '').match(/核准|審核/));
                    approvalSteps.push({ dot: '#16a34a', label: '審核', ref: order.order_no, detail: '已核准', time: appEv?.time, status: 'done' });
                  }
                  approvalSteps.forEach(s => entries.push(s));
                }
                // POs
                linkedPOs.forEach(po => {
                  const pk = String(po.status || 'draft').toLowerCase();
                  const pc = poColorMap[pk] || '#6b7280';
                  const poItemBadges = items.filter(i => i.po_info).map(i => ({ text: `已採購`, item: i.item_number_snapshot }));
                  entries.push({ dot: pc, label: '採購', ref: po.po_no, refType: 'po', detail: poStatusMap[pk] || pk, detailColor: pc, time: po.po_date, status: pk === 'received' ? 'done' : 'current', badges: poItemBadges });
                });
                // Stock-in arrival events (from timeline)
                const arrivalEvents = timeline.filter(e => (e.event || '').startsWith('已到貨'));
                arrivalEvents.forEach(ev => {
                  const refNo = (ev.event || '').replace('已到貨 ', '').trim();
                  entries.push({ dot: '#16a34a', label: '📦 到貨', ref: refNo, detail: ev.detail || '已到貨，可進行銷貨', time: ev.time, status: 'done' });
                });
                // Stock
                const stockOk = noStockCount === 0 && insufficientCount === 0;
                entries.push({ dot: stockOk ? '#16a34a' : '#d97706', label: '庫存', detail: stockOk ? `全部充足 (${items.length}項)` : `充足${sufficientCount} 不足${insufficientCount} 無庫存${noStockCount}`, status: stockOk ? 'done' : 'warning' });
                // Sales
                linkedSales.forEach(sale => {
                  const sk = String(sale.status || 'draft').toLowerCase();
                  const sc = saleColorMap[sk] || '#6b7280';
                  const saleBadges = items
                    .filter(i => i.sale_info?.sale_refs?.includes(sale.slip_number))
                    .map(i => ({ text: `×${i.sale_info.sold_qty}`, item: i.item_number_snapshot }));
                  entries.push({ dot: sc, label: '銷貨', ref: sale.slip_number, refType: 'sale', detail: saleStatusMap[sk] || sk, detailColor: sc, time: sale.created_at, status: sk === 'paid' ? 'done' : 'current', badges: saleBadges });
                });
                // Sale approval note (銷貨免審)
                if (approvalData && approvalData.doc_type === 'sale') {
                  entries.push({ dot: '#16a34a', label: '審核', detail: '免審（銷貨自動通過）', time: approvalData.approved_at, status: 'done' });
                }
                // Payment — show each payment record, or status summary
                if (orderPayments.length > 0) {
                  const typeLabels = { deposit: '訂金', partial: '部分收款', full: '全額收款', balance: '尾款' };
                  const methodLabels = { transfer: '匯款', cash: '現金', check: '支票', credit_card: '信用卡', line_pay: 'LINE Pay', other: '其他' };
                  orderPayments.forEach(p => {
                    const tl = typeLabels[p.payment_type] || '收款';
                    const ml = methodLabels[p.payment_method] || p.payment_method;
                    const verifiedTag = p.verified ? ' ✓已核帳' : '';
                    entries.push({ dot: '#16a34a', label: `付款`, ref: p.payment_number, refType: 'payment', detail: `${tl} NT$${Number(p.amount || 0).toLocaleString()}（${ml}）${verifiedTag}`, time: p.confirmed_at || p.created_at, status: 'done', proof_url: p.proof_url || null, payment_id: p.id });
                  });
                  if (payKey !== 'paid') {
                    entries.push({ dot: '#2563eb', label: '付款', detail: `${PAY_STATUS_MAP[payKey]}，尚欠 NT$${Math.max(0, (order.total_amount || 0) - totalPaidAmount).toLocaleString()}`, status: 'current' });
                  }
                } else {
                  entries.push({ dot: payKey === 'paid' ? '#16a34a' : '#d1d5db', label: '付款', detail: PAY_STATUS_MAP[payKey] || payKey, status: payKey === 'paid' ? 'done' : 'pending' });
                }
                // Shipping — with LINE notification status + item details
                const shipTimelineEvs = timeline.filter(e => (e.event || '').match(/出貨單/));
                const backorderEv = timeline.find(e => e.event === '欠貨');
                if (shipTimelineEvs.length > 0) {
                  shipTimelineEvs.forEach(ev => {
                    const refNo = (ev.event || '').match(/(SH[\w-]+)/)?.[1] || '';
                    const shipLineNote = ev.note || (order.customer?.line_user_id ? '[已送] LINE 出貨通知已發送' : '[未送] 未綁定 LINE，未推播');
                    const shipLineSent = ev.line_sent ?? !!order.customer?.line_user_id;
                    entries.push({ dot: '#16a34a', label: '出貨', ref: refNo, detail: `已出貨${ev.detail ? `：${ev.detail}` : ''}`, time: ev.time, status: 'done', note: shipLineNote, lineSent: shipLineSent });
                  });
                  // 欠貨節點
                  if (backorderEv) {
                    entries.push({ dot: '#f59e0b', label: '欠貨', detail: backorderEv.detail, status: 'current' });
                  }
                } else {
                  const shipDone = shipKey === 'shipped' || shipKey === 'delivered';
                  const shipStarted = shipDone || shipKey === 'partial';
                  const shipLineNote = shipStarted ? (order.customer?.line_user_id ? '[已送] LINE 出貨通知已發送' : '[未送] 未綁定 LINE，未推播') : '';
                  const shipLineSent = !!order.customer?.line_user_id;
                  entries.push({ dot: shipStarted ? (shipDone ? '#16a34a' : '#f59e0b') : '#d1d5db', label: '出貨', detail: SHIP_STATUS_MAP[shipKey] || shipKey, status: shipDone ? 'done' : (shipStarted ? 'partial' : 'pending'), note: shipStarted ? shipLineNote : '', lineSent: shipLineSent });
                }
                // Completion
                const isCompleted = statusKey === 'completed' || (payKey === 'paid' && (shipKey === 'shipped' || shipKey === 'delivered' || shipKey === 'partial'));
                if (isCompleted) {
                  entries.push({ dot: '#16a34a', label: '完成', detail: '訂單完成', status: 'done' });
                }

                // Icon map for visual labels
                const iconMap = { '訂單建立': '📋', '報價': '📝', '送審': '📤', '審核': '✅', '採購': '🛒', '📦 到貨': '📦', '庫存': '📊', '銷貨': '💰', '付款': '💳', '出貨': '🚚', '欠貨': '⚠️', '完成': '🎉' };
                const getIcon = (label) => iconMap[label] || (label.includes('審核') ? '✅' : label.includes('付款') ? '💳' : '•');

                return (
                  <div style={{ position: 'relative', paddingLeft: 22 }}>
                    {entries.map((e, i) => {
                      const isLast = i === entries.length - 1;
                      const isCurrent = e.status === 'current' || e.status === 'warning';
                      const isDone = e.status === 'done';
                      const isRej = e.status === 'rejected';
                      const isPend = e.status === 'pending';
                      // Colors
                      const labelColor = isDone ? '#374151' : isRej ? '#dc2626' : isCurrent ? '#1d4ed8' : '#9ca3af';
                      const lineBg = isDone || isCurrent ? `${e.dot}30` : '#e5e7eb';

                      return (
                        <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 10, minHeight: isLast ? 'auto' : 24 }}>
                          {/* Vertical line */}
                          {!isLast && <div style={{ position: 'absolute', left: -14, top: 18, width: 2, bottom: 0, background: lineBg }} />}
                          {/* Dot with icon */}
                          <div style={{ position: 'absolute', left: -22, top: 0, width: 18, height: 18, borderRadius: '50%', background: isDone ? `${e.dot}18` : isCurrent ? `${e.dot}20` : '#f3f4f6', border: `2px solid ${isDone || isCurrent ? e.dot : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>
                            {isDone ? <span style={{ color: e.dot, fontSize: 9, lineHeight: 1 }}>✓</span> : isCurrent ? <span style={{ width: 5, height: 5, borderRadius: '50%', background: e.dot, display: 'block' }} /> : <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#d1d5db', display: 'block' }} />}
                          </div>
                          {/* Content */}
                          <div style={{ paddingLeft: 2 }}>
                            {/* Main row: label + ref + detail */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', lineHeight: 1.4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: labelColor, whiteSpace: 'nowrap' }}>{e.label}</span>
                              {e.ref && (() => {
                                const clickHandler = e.refType === 'sale' ? () => { window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, e.ref); setTab?.('sales_documents'); }
                                  : e.refType === 'po' ? () => { window.localStorage.setItem(PO_FOCUS_KEY, e.ref); setTab?.('purchase_orders'); }
                                  : e.refType === 'quote' ? () => { window.localStorage.setItem('qb_quote_focus', e.ref); setTab?.('quotes'); }
                                  : e.refType === 'payment' ? () => { setTab?.('收款管理'); }
                                  : e.refType === 'shipment' ? () => { window.localStorage.setItem('qb_shipment_focus', e.ref); setTab?.('shipments'); }
                                  : null;
                                return <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', ...S.mono, cursor: clickHandler ? 'pointer' : 'default', textDecoration: clickHandler ? 'underline' : 'none', background: '#eff6ff', padding: '0 5px', borderRadius: 3 }} onClick={clickHandler}>{e.ref}</span>;
                              })()}
                              {e.detail && <span style={{ fontSize: 11, fontWeight: 600, color: e.detailColor || (isDone ? '#6b7280' : isCurrent ? '#1d4ed8' : isRej ? '#dc2626' : '#9ca3af'), background: (isCurrent || e.status === 'warning') ? `${e.dot}12` : 'transparent', padding: (isCurrent || e.status === 'warning') ? '1px 6px' : 0, borderRadius: 4 }}>{e.detail}</span>}
                            </div>
                            {/* Badges */}
                            {e.badges && e.badges.length > 0 && (
                              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>
                                {e.badges.map((b, bi) => (
                                  <span key={bi} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: e.label === '銷貨' ? '#dbeafe' : '#f3e8ff', color: e.label === '銷貨' ? '#1d4ed8' : '#7c3aed', fontWeight: 600 }}>{b.item} {b.text}</span>
                                ))}
                              </div>
                            )}
                            {/* Proof image or upload button */}
                            {e.proof_url ? (
                              <div style={{ marginTop: 3, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                                <a href={e.proof_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', lineHeight: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                                  <img src={e.proof_url} alt="憑證" style={{ width: 90, height: 60, objectFit: 'cover' }} />
                                </a>
                                <span style={{ fontSize: 10, color: '#3b82f6', cursor: 'pointer' }}>查看</span>
                              </div>
                            ) : e.payment_id ? (
                              <div style={{ marginTop: 3 }}>
                                <input type="file" id={`proof-${e.payment_id}`} accept="image/*" style={{ display: 'none' }} onChange={async (ev) => {
                                  const file = ev.target.files?.[0];
                                  if (!file) return;
                                  try {
                                    const compressImg = (f, maxW = 1200, q = 0.7) => new Promise((resolve, reject) => {
                                      const img = new Image();
                                      const url = URL.createObjectURL(f);
                                      img.onload = () => { URL.revokeObjectURL(url); const c = document.createElement('canvas'); let w = img.width, h = img.height; if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; } c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); resolve(c.toDataURL('image/jpeg', q).split(',')[1]); };
                                      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片讀取失敗')); };
                                      img.src = url;
                                    });
                                    const base64 = await compressImg(file);
                                    setMsg('上傳中...');
                                    const res = await apiPost({ action: 'upload_payment_proof', payment_id: e.payment_id, proof_data: base64, proof_name: file.name.replace(/\.\w+$/, '.jpg') });
                                    setMsg(res.message || '憑證已上傳');
                                    try { const pr = await apiGet({ action: 'order_payments', order_id: order.id }); setOrderPayments(pr.payments || []); } catch(_){}
                                  } catch (err) { setMsg('憑證上傳失敗: ' + (err.message || '')); }
                                  ev.target.value = '';
                                }} />
                                <button onClick={() => document.getElementById(`proof-${e.payment_id}`)?.click()} style={{ fontSize: 10, color: '#6b7280', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s' }} onMouseEnter={ev => { ev.currentTarget.style.borderColor = '#3b82f6'; ev.currentTarget.style.color = '#3b82f6'; }} onMouseLeave={ev => { ev.currentTarget.style.borderColor = '#d1d5db'; ev.currentTarget.style.color = '#6b7280'; }}>📎 上傳憑證</button>
                              </div>
                            ) : null}
                            {/* Note (LINE notification) */}
                            {e.note && <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2, color: e.lineSent ? '#16a34a' : '#d97706', background: e.lineSent ? '#f0fdf4' : '#fffbeb', padding: '1px 6px', borderRadius: 3, display: 'inline-block', border: `1px solid ${e.lineSent ? '#bbf7d0' : '#fde68a'}` }}>{e.note}</div>}
                            {/* Timestamp */}
                            {e.time && <div style={{ fontSize: 10, color: '#c4c9d2', marginTop: 1, ...S.mono }}>{fmtTime(e.time)}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* 4. Payment registration card — clean grid */}
            {payKey !== 'paid' && (approvalEnabled ? (statusKey !== 'draft' && statusKey !== 'pending_approval' && statusKey !== 'rejected') : statusKey !== 'pending_approval') && (
              <div style={{ ...cardStyle, padding: '14px 16px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>登記付款</div>
                  <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>應收 <b style={{ color: t.color.textPrimary }}>NT${(order.total_amount || 0).toLocaleString()}</b></div>
                </div>
                {/* Paid summary */}
                {totalPaidAmount > 0 && (
                  <div style={{ background: '#f0fdf4', borderRadius: 6, padding: '5px 10px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', fontSize: t.fontSize.caption }}>
                    <span style={{ color: '#15803d', fontWeight: t.fontWeight.semibold }}>已收 NT${totalPaidAmount.toLocaleString()}</span>
                    <span style={{ color: t.color.error, fontWeight: t.fontWeight.bold }}>尚欠 NT${Math.max(0, (order.total_amount || 0) - totalPaidAmount).toLocaleString()}</span>
                  </div>
                )}
                {/* 2x2 Grid: Type, Method, Amount, Button */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 8px', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, fontWeight: t.fontWeight.semibold, marginBottom: 3 }}>類型</div>
                    <select value={payType} onChange={e => {
                      const v = e.target.value; setPayType(v);
                      if (v === 'full') setPayAmount(String(order.total_amount || 0));
                      else if (v === 'deposit') setPayAmount(String(Math.round((order.total_amount || 0) * 0.3)));
                      else if (v === 'balance') setPayAmount(String(Math.max(0, (order.total_amount || 0) - totalPaidAmount)));
                    }} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: `1px solid ${t.color.border}`, fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textSecondary, background: t.color.bgMuted, cursor: 'pointer' }}>
                      <option value="full">全額收款</option>
                      <option value="deposit">訂金</option>
                      <option value="partial">部分收款</option>
                      <option value="balance">尾款</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, fontWeight: t.fontWeight.semibold, marginBottom: 3 }}>方式</div>
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: `1px solid ${t.color.border}`, fontSize: t.fontSize.body, color: t.color.textSecondary, background: t.color.bgMuted, cursor: 'pointer' }}>
                      <option value="transfer">匯款</option>
                      <option value="cash">現金</option>
                      <option value="check">支票</option>
                      <option value="credit_card">信用卡</option>
                      <option value="line_pay">LINE Pay</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, fontWeight: t.fontWeight.semibold, marginBottom: 3 }}>金額</div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: t.fontSize.tiny, color: t.color.textDisabled, fontWeight: t.fontWeight.semibold }}>NT$</span>
                      <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0" style={{ ...S.mono, width: '100%', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, padding: '7px 8px 7px 32px', borderRadius: 6, border: `1px solid ${t.color.border}`, outline: 'none', background: t.color.bgMuted }} min="1" onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button disabled={payProcessing || !payAmount} onClick={async () => {
                      if (!payAmount || Number(payAmount) <= 0) return;
                      setPayProcessing(true);
                      try {
                        const payload = { action: 'record_order_payment', order_id: order.id, amount: Number(payAmount), method: payMethod, payment_type: payType };
                        const res = await apiPost(payload);
                        setMsg(res.message || '付款已登記');
                        setPayAmount('');
                        try { const pr = await apiGet({ action: 'order_payments', order_id: order.id }); setOrderPayments(pr.payments || []); } catch(_){}
                        onRefresh?.();
                      } catch (err) { setMsg(err.message || '付款登記失敗'); }
                      setPayProcessing(false);
                    }} style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: 'none', background: payProcessing ? '#94a3b8' : !payAmount ? '#cbd5e1' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, cursor: payProcessing || !payAmount ? 'not-allowed' : 'pointer', boxShadow: payAmount ? '0 2px 6px rgba(37,99,235,0.2)' : 'none' }}>
                      {payProcessing ? '...' : '確認收款'}
                    </button>
                  </div>
                </div>
                {/* Quick fill */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { label: '全額', type: 'full', amt: order.total_amount || 0, color: '#2563eb', bg: '#eff6ff', bd: '#bfdbfe' },
                    { label: '50%', type: 'partial', amt: Math.round((order.total_amount || 0) / 2), color: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe' },
                    { label: '訂金30%', type: 'deposit', amt: Math.round((order.total_amount || 0) * 0.3), color: '#059669', bg: '#ecfdf5', bd: '#a7f3d0' },
                    ...(totalPaidAmount > 0 ? [{ label: '尾款', type: 'balance', amt: Math.max(0, (order.total_amount || 0) - totalPaidAmount), color: t.color.error, bg: '#fef2f2', bd: '#fecaca' }] : []),
                  ].map(q => (
                    <button key={q.type} onClick={() => { setPayType(q.type); setPayAmount(String(q.amt)); }} style={{ flex: 1, fontSize: t.fontSize.tiny, color: q.color, background: q.bg, border: `1px solid ${q.bd}`, borderRadius: 5, padding: '3px 0', cursor: 'pointer', fontWeight: t.fontWeight.semibold, textAlign: 'center' }}>{q.label}</button>
                  ))}
                </div>
                {/* Proof upload note */}
                <div style={{ marginTop: 6, fontSize: t.fontSize.tiny, color: t.color.textMuted }}>
                  確認收款後，可在訂單記錄中上傳匯款憑證
                </div>
              </div>
            )}

            {/* 5. Remark card — editable */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>備註</div>
              <textarea
                defaultValue={order.remark || ''}
                placeholder="輸入備註..."
                rows={3}
                style={{ width: '100%', fontSize: t.fontSize.body, color: t.color.textSecondary, lineHeight: 1.6, border: `1px solid ${t.color.border}`, borderRadius: 6, padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit' }}
                onBlur={async (e) => {
                  const val = e.target.value.trim();
                  if (val === (order.remark || '').trim()) return;
                  try {
                    await apiPost({ action: 'update_order_remark', order_id: order.id, remark: val });
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
        <div style={{ position: 'fixed', inset: 0, background: isMobile ? 'rgba(8,12,20,0.6)' : 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setShowShipForm(false)}>
          <div style={{ width: isMobile ? '100%' : 'min(700px, 100%)', maxHeight: isMobile ? '90vh' : '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: isMobile ? '14px 14px 0 0' : 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={S.eyebrow}>Create Shipment</div>
                <div style={{ fontSize: t.fontSize.h1, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>建立出貨 — {order.order_no}</div>
              </div>
              <button onClick={() => setShowShipForm(false)} style={S.btnGhost}>關閉</button>
            </div>

            {/* Ship items selection */}
            <div style={{ ...cardStyle, marginBottom: 10, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textSecondary }}>選擇出貨品項與數量</span>
                <span style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled }}>{Object.values(shipItemQty).filter(q => q > 0).length} / {items.length} 項</span>
              </div>
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderTop: '1px solid #f3f5f7', background: (shipItemQty[item.id] || 0) > 0 ? '#fefce8' : '#fff' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description_snapshot || '-'}</div>
                      <div style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, ...S.mono, marginTop: 1 }}>{item.item_number_snapshot} · 訂購 {item.qty}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setShipItemQty(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1) }))} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: t.fontSize.body, minWidth: 28 }}>-</button>
                      <span style={{ ...S.mono, fontWeight: t.fontWeight.bold, minWidth: 24, textAlign: 'center', fontSize: t.fontSize.h3 }}>{shipItemQty[item.id] || 0}</span>
                      <button onClick={() => setShipItemQty(prev => ({ ...prev, [item.id]: Math.min(item.qty, (prev[item.id] || 0) + 1) }))} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: t.fontSize.body, minWidth: 28 }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ship form fields */}
            <div style={{ ...cardStyle, padding: '10px 16px', marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, fontWeight: t.fontWeight.semibold, display: 'block', marginBottom: 4 }}>物流商</label>
                  <input value={shipForm.carrier} onChange={e => setShipForm(p => ({ ...p, carrier: e.target.value }))} placeholder="例：黑貓、新竹物流" style={{ ...S.input, fontSize: t.fontSize.body }} />
                </div>
                <div>
                  <label style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, fontWeight: t.fontWeight.semibold, display: 'block', marginBottom: 4 }}>追蹤編號</label>
                  <input value={shipForm.tracking_no} onChange={e => setShipForm(p => ({ ...p, tracking_no: e.target.value }))} placeholder="輸入追蹤編號" style={{ ...S.input, fontSize: t.fontSize.body, ...S.mono }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, fontWeight: t.fontWeight.semibold, display: 'block', marginBottom: 4 }}>備註</label>
                <input value={shipForm.remark} onChange={e => setShipForm(p => ({ ...p, remark: e.target.value }))} placeholder="出貨備註（選填）" style={{ ...S.input, fontSize: t.fontSize.body }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="ship_notify_line" checked={shipForm.notify_line} onChange={e => setShipForm(p => ({ ...p, notify_line: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#16a34a', cursor: 'pointer' }} />
                <label htmlFor="ship_notify_line" style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, fontWeight: t.fontWeight.semibold, cursor: 'pointer' }}>出貨後自動發 LINE 通知客戶</label>
              </div>
            </div>

            <button onClick={createShipment} disabled={processingAction === 'ship'} style={{ ...S.btnPrimary, width: '100%', padding: '12px', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, background: 'linear-gradient(135deg, #f59e0b, #d97706)', opacity: processingAction === 'ship' ? 0.7 : 1 }}>
              {processingAction === 'ship' ? '出貨中...' : `確認出貨 (${Object.values(shipItemQty).filter(q => q > 0).length} 項)`}
            </button>
          </div>
        </div>
      )}

      {/* ====== Sale Conversion Modal ====== */}
      {showSaleForm && (
        <div style={{ position: 'fixed', inset: 0, background: isMobile ? 'rgba(8,12,20,0.6)' : 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setShowSaleForm(false)}>
          <div style={{ width: isMobile ? '100%' : 'min(700px, 100%)', maxHeight: isMobile ? '90vh' : '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: isMobile ? '14px 14px 0 0' : 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={S.eyebrow}>Convert to Sale</div>
                <div style={{ fontSize: t.fontSize.h1, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>轉銷貨 — {order.order_no}</div>
                <div style={{ fontSize: t.fontSize.body, color: t.color.textMuted, marginTop: 4 }}>可調整每項出貨數量，未出的數量可之後再轉</div>
              </div>
              <button onClick={() => setShowSaleForm(false)} style={S.btnGhost}>關閉</button>
            </div>

            <div style={{ ...cardStyle, marginBottom: 10, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textSecondary }}>選擇出貨數量</span>
                <span style={{ fontSize: t.fontSize.h3, color: t.color.textDisabled }}>{Object.values(saleItemQty).filter(q => Number(q) > 0).length} / {Object.keys(saleItemQty).length} 項</span>
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {items.filter(i => saleItemQty.hasOwnProperty(i.id)).map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid #f3f5f7', background: Number(saleItemQty[item.id] || 0) > 0 ? '#f0fdf4' : '#fff' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description_snapshot || '-'}</div>
                      <div style={{ fontSize: t.fontSize.body, color: t.color.textDisabled, ...S.mono, marginTop: 2 }}>{item.item_number_snapshot} · 訂購 {item.qty}{Number(item.sold_qty || 0) > 0 ? ` · 已銷 ${item.sold_qty}` : ''} · 剩餘 {item.remaining_qty != null ? item.remaining_qty : item.qty} · 庫存 {item.stock_qty}</div>
                    </div>
                    {(() => { const maxQty = item.remaining_qty != null ? Number(item.remaining_qty) : Number(item.qty); return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setSaleItemQty(p => ({ ...p, [item.id]: Math.max(0, (Number(p[item.id]) || 0) - 1) }))} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${t.color.border}`, background: '#fff', cursor: 'pointer', fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <input type="number" value={saleItemQty[item.id] || 0} onChange={(e) => { const v = Math.max(0, Math.min(Number(e.target.value) || 0, maxQty)); setSaleItemQty(p => ({ ...p, [item.id]: v })); }} style={{ width: 50, textAlign: 'center', ...S.input, ...S.mono, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, padding: '4px 6px' }} min="0" max={maxQty} />
                      <button onClick={() => setSaleItemQty(p => ({ ...p, [item.id]: Math.min(maxQty, (Number(p[item.id]) || 0) + 1) }))} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${t.color.border}`, background: '#fff', cursor: 'pointer', fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      <button onClick={() => setSaleItemQty(p => ({ ...p, [item.id]: maxQty }))} style={{ ...S.btnGhost, padding: '4px 8px', fontSize: t.fontSize.tiny }}>全部</button>
                    </div>
                    ); })()}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: t.fontSize.h3, color: t.color.textSecondary }}>
                合計：<strong style={{ color: '#059669', ...S.mono }}>{Object.entries(saleItemQty).reduce((s, [id, q]) => { const it = items.find(i => i.id === id); return s + (it ? Number(it.unit_price || 0) * Number(q || 0) : 0); }, 0).toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 })}</strong>
              </div>
              <button onClick={confirmSaleConversion} disabled={processingAction === 'sale'} style={{ ...S.btnPrimary, padding: '12px 28px', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, background: 'linear-gradient(135deg, #16a34a, #15803d)', opacity: processingAction === 'sale' ? 0.7 : 1 }}>
                {processingAction === 'sale' ? '處理中...' : `確認轉銷貨 (${Object.values(saleItemQty).filter(q => Number(q) > 0).length} 項)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status tab groups ──
const STATUS_GROUPS = [
  { id: 'action_needed', label: '待處理',  statuses: ['pending', 'pending_approval'],           dot: '#ef4444' },
  { id: 'in_progress',   label: '備貨出貨', statuses: ['confirmed', 'processing', 'purchasing'], dot: '#f59e0b' },
  { id: 'shipped',       label: '已出貨',   statuses: ['shipped', 'completed'],                  dot: '#16a34a' },
  { id: '',              label: '全部',     statuses: [],                                        dot: '#6b7280' },
  { id: 'cancelled',     label: '已取消',   statuses: ['cancelled', 'rejected'],                 dot: '#d1d5db' },
];

export default function Orders({ setTab, erpFeatures = {} }) {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total_amount: 0, pending_count: 0 }, tab_counts: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [convertingId, setConvertingId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [statusGroupId, setStatusGroupId] = useState('action_needed'); // default: 待處理
  const [approvalMap, setApprovalMap] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  // ★ 新增：選中的訂單（進入詳情頁）
  const [selectedOrder, setSelectedOrder] = useState(null);
  // ★ 可拖拉欄寬
  const ORDER_DEFAULT_WIDTHS = isTablet
    ? [32, 50, 140, 200, 90, 80, 80]
    : [32, 50, 180, 200, 80, 90, 80, 80, 80, 100, 130];
  const { gridTemplate: orderGridTemplate, ResizableHeader: OrderHeader } = useResizableColumns('orders_list', ORDER_DEFAULT_WIDTHS);

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

  const ORDER_STATUS_MAP = { draft: '草稿', pending_approval: '待審核', confirmed: '已核准', processing: '出貨中', completed: '已完成', rejected: '已駁回', shipped: '已出貨', cancelled: '已取消', pending: '待確認', purchasing: '採購中' };
  const PAY_STATUS_MAP = { unpaid: '未付款', partial: '部分付款', paid: '已付款' };
  const SHIP_STATUS_MAP = { pending: '待出貨', partial: '部分出貨', shipped: '已出貨', delivered: '已送達' };

  const load = useCallback(async (page = 1, q = search, limit = pageSize, groupId = statusGroupId) => {
    setLoading(true);
    try {
      const params = { action: 'orders', page: String(page), limit: String(limit), search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      // Compute status filter from group
      const group = STATUS_GROUPS.find(g => g.id === groupId);
      if (group?.statuses?.length > 0) params.status = group.statuses.join(',');
      const result = await apiGet(params);
      setData(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, dateFrom, dateTo, statusGroupId]);

  useEffect(() => { load(); }, []);

  // Focus on a specific order if navigated from another page
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Direct open: jump straight to detail view
    const directOrder = window.localStorage.getItem('qb_order_direct_open');
    if (directOrder) {
      try {
        const order = JSON.parse(directOrder);
        if (order?.id) setSelectedOrder(order);
      } catch (_) {}
      window.localStorage.removeItem('qb_order_direct_open');
      return;
    }
    // Search focus: filter the list
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

  const doSearch = () => load(1, search, pageSize, statusGroupId);

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
        onRefresh={async () => {
          const result = await load();
          // Update selectedOrder with fresh data from the reloaded list
          if (result?.rows) {
            const fresh = result.rows.find(r => r.id === selectedOrder.id);
            if (fresh) setSelectedOrder(fresh);
          }
        }}
        setTab={setTab}
        erpFeatures={erpFeatures}
      />
    );
  }

  return (
    <div>
      <PageLead eyebrow="ORDERS" title="訂單" description="點擊訂單進入詳情，自動比對庫存。有貨可轉銷貨，缺貨可轉採購單。" action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{batchIds.size > 0 && <button onClick={handleBatchShip} disabled={batchShipping} style={{ padding: '7px 18px', borderRadius: t.radius.md, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, cursor: 'pointer', opacity: batchShipping ? 0.7 : 1 }}>{batchShipping ? '出貨中...' : `批次出貨 (${batchIds.size})`}</button>}<CsvImportButton datasetId="erp_orders" onImported={() => load(1, search, pageSize)} compact /><button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button><button onClick={() => data.table_ready && setShowCreate(true)} disabled={!data.table_ready} style={{ ...S.btnPrimary, opacity: data.table_ready ? 1 : 0.6, cursor: data.table_ready ? 'pointer' : 'not-allowed' }}>+ 新增訂單</button></div>} />
      {actionMessage ? (
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10 }}>
          {actionMessage}
        </div>
      ) : null}
      {/* ── Status Tab Group ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, background: t.color.bgCard, border: `1px solid ${t.color.borderLight}`, borderRadius: t.radius.lg, padding: 4, flexWrap: 'wrap' }}>
        {STATUS_GROUPS.map(g => {
          const isActive = statusGroupId === g.id;
          const cnt = g.id === 'action_needed' ? data.tab_counts?.action_needed
                    : g.id === 'in_progress'   ? data.tab_counts?.in_progress
                    : g.id === 'shipped'        ? data.tab_counts?.shipped
                    : g.id === 'cancelled'      ? data.tab_counts?.cancelled
                    : data.total;
          return (
            <button key={g.id} onClick={() => { setStatusGroupId(g.id); load(1, search, pageSize, g.id); }}
              style={{
                flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: isMobile ? '7px 10px' : '8px 16px', borderRadius: t.radius.md, cursor: 'pointer',
                border: 'none', transition: 'all 0.15s',
                background: isActive ? '#fff' : 'transparent',
                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                color: isActive ? t.color.textPrimary : t.color.textMuted,
                fontWeight: isActive ? t.fontWeight.bold : t.fontWeight.normal,
                fontSize: isMobile ? 12 : t.fontSize.body,
                whiteSpace: 'nowrap',
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? g.dot : '#d1d5db', flexShrink: 0, transition: 'background 0.15s' }} />
              {g.label}
              {cnt != null && cnt > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: t.fontWeight.bold, fontFamily: 'monospace',
                  padding: '1px 7px', borderRadius: 99,
                  background: isActive ? g.dot : t.color.bgMuted,
                  color: isActive ? '#fff' : t.color.textMuted,
                  transition: 'all 0.15s',
                }}>{cnt}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Date & Search filters ── */}
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: isMobile ? '4px 10px' : '6px 14px', fontSize: isMobile ? 12 : 14, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          {!isMobile && <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: t.fontSize.h3, padding: '6px 10px', ...S.mono }} />}
          {!isMobile && <span style={{ color: t.color.textMuted, fontSize: t.fontSize.h3 }}>~</span>}
          {!isMobile && <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: t.fontSize.h3, padding: '6px 10px', ...S.mono }} />}
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder={isMobile ? "搜尋..." : "搜尋訂單號、客戶..."} style={{ ...S.input, flex: 1, minWidth: isMobile ? 120 : 160, fontSize: isMobile ? 13 : 14, padding: isMobile ? '6px 8px' : '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: isMobile ? '6px 12px' : '6px 18px', fontSize: isMobile ? 12 : 14 }}>查詢</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 erp_orders 資料表。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        <StatCard code="OTOT" label="訂單總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="PEND" label="未完成" value={fmt(data.summary?.pending_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有訂單資料" /> : (
        isMobile ? (
        <div>
          {data.rows.map((row, idx) => {
            const statusKey = String(row.status || 'draft').toLowerCase();
            const payKey = String(row.payment_status || 'unpaid').toLowerCase();
            const shipKey = String(row.shipping_status || 'pending').toLowerCase();
            return (
              <div key={row.id} onClick={() => setSelectedOrder(row)} style={{ ...S.mobileCard, marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
                  <div>
                    <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{row.order_no || '-'}</div>
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 2 }}>{row.order_date || '-'}</div>
                  </div>
                  <input type="checkbox" checked={batchIds.has(row.id)} onChange={(e) => toggleBatch(row.id, e)} style={{ cursor: 'pointer', width: 18, height: 18, accentColor: '#3b82f6' }} />
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>客戶</span>
                  <span style={S.mobileCardValue}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>狀態</span>
                  <span style={S.mobileCardValue}><span style={S.tag(statusKey === 'confirmed' || statusKey === 'completed' ? 'green' : statusKey === 'processing' ? 'yellow' : statusKey === 'pending_approval' ? 'red' : statusKey === 'rejected' ? 'red' : '')}>{ORDER_STATUS_MAP[statusKey] || statusKey}</span></span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>付款</span>
                  <span style={S.mobileCardValue}><span style={S.tag(payKey === 'paid' ? 'green' : payKey === 'partial' ? 'yellow' : 'gray')}>{PAY_STATUS_MAP[payKey] || payKey}</span></span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>出貨</span>
                  <span style={S.mobileCardValue}><span style={S.tag(shipKey === 'shipped' || shipKey === 'delivered' ? 'green' : shipKey === 'partial' ? 'yellow' : 'gray')}>{SHIP_STATUS_MAP[shipKey] || shipKey}</span></span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>金額</span>
                  <span style={{ ...S.mobileCardValue, color: t.color.success, fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(row.total_amount)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                  {(() => {
                    const shipKey_local = String(row.shipping_status || 'pending').toLowerCase();
                    const isConverted = shipKey_local === 'shipped' || shipKey_local === 'delivered';
                    if (isConverted) return <span style={{ ...S.tag('green'), fontSize: t.fontSize.tiny }}>已轉銷貨</span>;
                    return null;
                  })()}
                  <button onClick={(e) => { e.stopPropagation(); openPdf('order', row.id); }} style={{ flex: 1, ...S.btnGhost, padding: '8px 0', fontSize: t.fontSize.caption, minHeight: 40 }}>PDF</button>
                </div>
              </div>
            );
          })}
        </div>
        ) : (
        <div style={{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }}>
          {/* ── 可拖拉表頭 ── */}
          <OrderHeader headers={isTablet ? [
            { label: '', align: 'center', render: () => <input type="checkbox" checked={batchIds.size > 0 && data.rows.every(r => batchIds.has(r.id))} onChange={(e) => { if (e.target.checked) setBatchIds(new Set(data.rows.map(r => r.id))); else setBatchIds(new Set()); }} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#3b82f6' }} /> },
            { label: '序', align: 'center' },
            { label: '訂單號', align: 'center' },
            { label: '客戶', align: 'center' },
            { label: '日期', align: 'center' },
            { label: '狀態', align: 'center' },
            { label: '操作', align: 'center' },
          ] : [
            { label: '', align: 'center', render: () => <input type="checkbox" checked={batchIds.size > 0 && data.rows.every(r => batchIds.has(r.id))} onChange={(e) => { if (e.target.checked) setBatchIds(new Set(data.rows.map(r => r.id))); else setBatchIds(new Set()); }} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#3b82f6' }} /> },
            { label: '序', align: 'center' },
            { label: '訂單號', align: 'center' },
            { label: '客戶', align: 'center' },
            { label: '業務', align: 'center' },
            { label: '日期', align: 'center' },
            { label: '狀態', align: 'center' },
            { label: '付款', align: 'center' },
            { label: '出貨', align: 'center' },
            { label: '總額', align: 'center' },
            { label: '操作', align: 'center' },
          ]} />
          {/* ── 列表 ── */}
          {data.rows.map((row, idx) => {
            const statusKey = String(row.status || 'draft').toLowerCase();
            const payKey = String(row.payment_status || 'unpaid').toLowerCase();
            const shipKey = String(row.shipping_status || 'pending').toLowerCase();
            const cell = { padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' };
            const cCenter = { ...cell, justifyContent: 'center' };
            const cRight = { ...cell, justifyContent: 'flex-end' };
            const cellLast = { ...cell, borderRight: 'none', justifyContent: 'flex-end' };

            return (
              <div key={row.id} onClick={() => setSelectedOrder(row)} style={{ display: 'grid', gridTemplateColumns: orderGridTemplate, borderBottom: idx < data.rows.length - 1 ? '1px solid #e5e7eb' : 'none', alignItems: 'center', background: batchIds.has(row.id) ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={(e) => { if (!batchIds.has(row.id)) e.currentTarget.style.background = '#f0f7ff'; }} onMouseLeave={(e) => { e.currentTarget.style.background = batchIds.has(row.id) ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafbfd'; }}>
                <div style={cCenter}><input type="checkbox" checked={batchIds.has(row.id)} onChange={(e) => toggleBatch(row.id, e)} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#3b82f6' }} /></div>
                <div style={{ ...cCenter, fontSize: t.fontSize.body, color: t.color.textMuted, ...S.mono }}>{((data.page - 1) * (data.limit || pageSize)) + idx + 1}</div>
                <div style={{ ...cCenter, fontSize: t.fontSize.body, color: t.color.link, fontWeight: t.fontWeight.bold, ...S.mono, whiteSpace: 'nowrap', textOverflow: 'ellipsis', gap: 4 }}>{row.order_no || '-'}<span style={{ fontSize: 9, background: row.tax_inclusive ? '#dcfce7' : '#fef3c7', color: row.tax_inclusive ? '#15803d' : '#92400e', padding: '1px 5px', borderRadius: t.radius.sm, fontWeight: t.fontWeight.semibold, letterSpacing: 0.3, flexShrink: 0 }}>{row.tax_inclusive ? '含稅' : '未稅'}</span></div>
                <div style={cell}>
                  <span style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, fontWeight: t.fontWeight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</span>
                </div>
                {!isTablet && <div style={{ ...cCenter, fontSize: t.fontSize.body, color: t.color.textSecondary, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.sales_person || <span style={{ color: '#d1d5db' }}>—</span>}</div>}
                <div style={{ ...cCenter, fontSize: t.fontSize.body, color: t.color.textSecondary, ...S.mono, whiteSpace: 'nowrap' }}>{row.order_date || '-'}</div>
                <div style={cCenter}><span style={S.tag(statusKey === 'confirmed' || statusKey === 'completed' ? 'green' : statusKey === 'processing' ? 'yellow' : statusKey === 'pending_approval' ? 'red' : statusKey === 'rejected' ? 'red' : '')}>{ORDER_STATUS_MAP[statusKey] || statusKey}</span></div>
                {!isTablet && <div style={cCenter}><span style={S.tag(payKey === 'paid' ? 'green' : payKey === 'partial' ? 'yellow' : 'gray')}>{PAY_STATUS_MAP[payKey] || payKey}</span></div>}
                {!isTablet && <div style={cCenter}><span style={S.tag(shipKey === 'shipped' || shipKey === 'delivered' ? 'green' : shipKey === 'partial' ? 'yellow' : 'gray')}>{SHIP_STATUS_MAP[shipKey] || shipKey}</span></div>}
                {!isTablet && <div style={{ ...cRight, fontSize: t.fontSize.body, color: t.color.success, fontWeight: t.fontWeight.bold, ...S.mono, whiteSpace: 'nowrap' }}>{fmtP(row.total_amount)}</div>}
                <div style={{ ...cellLast, gap: 4, flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const shipKey_local = String(row.shipping_status || 'pending').toLowerCase();
                    const isConverted = shipKey_local === 'shipped' || shipKey_local === 'delivered';
                    if (isConverted) return <span style={{ ...S.tag('green'), fontSize: t.fontSize.tiny }}>已轉銷貨</span>;
                    return null;
                  })()}
                  <button onClick={(e) => { e.stopPropagation(); openPdf('order', row.id); }} style={{ ...S.btnGhost, padding: '4px 6px', fontSize: t.fontSize.caption, whiteSpace: 'nowrap' }}>PDF</button>
                </div>
              </div>
            );
          })}
        </div>
        )
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
