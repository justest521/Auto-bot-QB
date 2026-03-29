'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard } from '../shared/ui';
import { useViewportWidth } from '@/lib/admin/helpers';
import { useResizableColumns } from '../shared/ResizableTable';

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
  const [editingItemId, setEditingItemId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [showAddItem, setShowAddItem] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState([]);
  const [replacingItemId, setReplacingItemId] = useState(null);
  const [replaceSearch, setReplaceSearch] = useState('');
  const [replaceResults, setReplaceResults] = useState([]);

  // Receiving states
  const [showReceiving, setShowReceiving] = useState(false);
  const [receivingQtys, setReceivingQtys] = useState({});
  const [submittingReceive, setSubmittingReceive] = useState(false);
  const [allocationData, setAllocationData] = useState({});

  const [approvalData, setApprovalData] = useState(null);
  const [submittingApproval, setSubmittingApproval] = useState(false);

  // Vendor selection states
  const [vendorInfo, setVendorInfo] = useState(null);
  const [vendorSearch, setVendorSearch] = useState('');
  const [showVendorPicker, setShowVendorPicker] = useState(false);
  const [savingVendor, setSavingVendor] = useState(false);

  const statusKey = String(po.status || 'draft').toLowerCase();
  const PO_STATUS_MAP = { draft: '草稿', pending_approval: '待審核', sent: '已寄出', confirmed: '已核准', shipped: '已出貨', received: '已到貨', rejected: '已駁回', cancelled: '已取消' };
  const PO_STATUS_COLOR = { draft: '#6b7280', sent: '#3b82f6', confirmed: '#16a34a', shipped: '#f59e0b', received: '#10b981', rejected: '#ef4444', cancelled: '#9ca3af' };
  const isEditable = statusKey === 'draft' || statusKey === 'sent';
  const isApproved = approvalData?.status === 'approved';
  const isPending = approvalData?.status === 'pending';
  const isRejected = approvalData?.status === 'rejected';
  const canSend = isApproved; // 只有核准後才能寄給原廠

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const fetches = [
          apiGet({ action: 'po_items', po_id: po.id }),
          apiGet({ action: 'approvals', doc_type: 'purchase_order' }),
        ];
        // If PO has vendor_id, fetch vendor info
        if (po.vendor_id) {
          fetches.push(apiGet({ action: 'vendors', search: '', limit: 100 }));
        }
        const results = await Promise.all(fetches);
        const [result, approvalRes] = results;
        setDetail(result);
        setTimeline(result.timeline || []);
        // Find approval for this PO
        const poApprovals = (approvalRes.rows || []).filter(a => String(a.doc_id) === String(po.id));
        if (poApprovals.length > 0) {
          poApprovals.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          setApprovalData(poApprovals[0]);
        }
        // Set vendor info if available
        if (po.vendor_id && results[2]) {
          const v = (results[2].vendors || []).find(v => String(v.id) === String(po.vendor_id));
          if (v) setVendorInfo(v);
        }
      } catch (e) {
        setMsg(e.message || '無法取得採購單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [po.id]);

  const submitForApproval = async () => {
    if (!confirm(`確定送審採購單 ${po.po_no}？`)) return;
    setSubmittingApproval(true); setMsg('');
    try {
      const remark = `採購單 ${po.po_no}，含 ${items.length} 項`;
      await apiPost({ action: 'submit_approval', doc_type: 'purchase_order', doc_id: po.id, doc_no: po.po_no, requested_by: 'admin', amount: totalAmount || po.total_amount, remark });
      setMsg('已送審');
      // Refresh approval data
      const approvalRes = await apiGet({ action: 'approvals', doc_type: 'purchase_order' });
      const poApprovals = (approvalRes.rows || []).filter(a => String(a.doc_id) === String(po.id));
      if (poApprovals.length > 0) {
        poApprovals.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setApprovalData(poApprovals[0]);
      }
      onRefresh?.();
    } catch (e) { setMsg(e.message || '送審失敗'); }
    finally { setSubmittingApproval(false); }
  };

  // Vendor: load all vendors when picker opens, filter locally
  const [allVendors, setAllVendors] = useState([]);
  const [vendorLoading, setVendorLoading] = useState(false);

  const openVendorPicker = async () => {
    setShowVendorPicker(true);
    setVendorSearch('');
    if (allVendors.length === 0) {
      setVendorLoading(true);
      try {
        const res = await apiGet({ action: 'vendors', search: '', limit: 200 });
        setAllVendors(res.vendors || []);
      } catch (_) { setAllVendors([]); }
      finally { setVendorLoading(false); }
    }
  };

  // Fuzzy filter: match any part of vendor_name, vendor_code, contact_name
  const filteredVendors = (() => {
    if (!vendorSearch.trim()) return allVendors;
    const kw = vendorSearch.trim().toLowerCase();
    return allVendors.filter(v => {
      const fields = [v.vendor_name, v.vendor_code, v.contact_name, v.phone, v.mobile, v.email].filter(Boolean).join(' ').toLowerCase();
      // fuzzy: every character of keyword appears in order
      let idx = 0;
      for (const ch of kw) { idx = fields.indexOf(ch, idx); if (idx === -1) return false; idx++; }
      return true;
    });
  })();

  const selectVendor = async (vendor) => {
    setSavingVendor(true); setMsg('');
    try {
      await apiPost({ action: 'update_po_vendor', po_id: po.id, vendor_id: vendor.id });
      setVendorInfo(vendor);
      setShowVendorPicker(false);
      setVendorSearch('');
      setMsg('廠商已更新');
      onRefresh?.();
    } catch (e) { setMsg(e.message || '更新廠商失敗'); }
    finally { setSavingVendor(false); }
  };

  const clearVendor = async () => {
    if (!confirm('確定移除廠商？')) return;
    setSavingVendor(true); setMsg('');
    try {
      await apiPost({ action: 'update_po_vendor', po_id: po.id, vendor_id: null });
      setVendorInfo(null);
      setMsg('已移除廠商');
      onRefresh?.();
    } catch (e) { setMsg(e.message || '移除廠商失敗'); }
    finally { setSavingVendor(false); }
  };

  const handleConfirm = async () => {
    if (!confirm(`確定確認採購單 ${po.po_no || ''}？`)) return;
    try {
      await apiPost({ action: 'confirm_purchase_order', po_id: po.id });
      setMsg('已核准');
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

  const STOCK_BADGE = {
    sufficient: { label: '充足', color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
    partial: { label: '部分', color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
    no_stock: { label: '無庫存', color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
  };

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

  const refreshPOData = async () => {
    const result = await apiGet({ action: 'po_items', po_id: po.id });
    setDetail(result);
    setTimeline(result.timeline || []);
    onRefresh?.();
  };

  // === Receiving (收貨) functions ===
  const openReceiving = () => {
    const qtys = {};
    items.forEach(it => { qtys[it.id] = 0; });
    setReceivingQtys(qtys);
    setShowReceiving(true);
    setAllocationData({});
  };

  const submitReceiving = async () => {
    const receiveItems = Object.entries(receivingQtys)
      .filter(([, qty]) => qty > 0)
      .map(([po_item_id, qty_this_time]) => ({ po_item_id, qty_this_time: Number(qty_this_time) }));
    if (receiveItems.length === 0) { setMsg('請輸入至少一個品項的到貨數量'); return; }
    setSubmittingReceive(true); setMsg('');
    try {
      await apiPost({ action: 'receive_po_items', po_id: po.id, items: receiveItems });
      setMsg('收貨完成，庫存已更新');
      setShowReceiving(false);
      await refreshPOData();
    } catch (e) { setMsg(e.message || '收貨失敗'); }
    finally { setSubmittingReceive(false); }
  };

  const loadAllocation = async (item_number) => {
    try {
      const res = await apiGet({ action: 'po_item_allocation', item_number });
      setAllocationData(prev => ({ ...prev, [item_number]: res.waiting_orders || [] }));
    } catch (_) {}
  };

  const canReceive = ['confirmed', 'shipped', 'sent'].includes(statusKey);

  const startEditItem = (item, e) => {
    e.stopPropagation();
    setEditingItemId(item.id);
    setEditValues({
      qty: item.qty,
      unit_cost: item.unit_cost,
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
    setEditingItemId(null);
    setEditValues({});
    try {
      await apiPost({ action: 'update_po_item', item_id: savedId, ...savedValues });
      refreshPOData();
    } catch (error) {
      setMsg(error.message || '更新失敗');
      refreshPOData();
    }
  };

  const deleteItem = async (itemId, e) => {
    if (e) e.stopPropagation();
    if (!confirm('確定刪除此品項？')) return;
    try {
      await apiPost({ action: 'delete_po_item', item_id: itemId });
      refreshPOData();
      setMsg('品項已刪除');
    } catch (error) {
      setMsg(error.message || '刪除失敗');
    }
  };

  const handleAddItem = async (product) => {
    setMsg('');
    try {
      await apiPost({ action: 'add_po_item', po_id: po.id, item_number: product.item_number });
      await refreshPOData();
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
      await apiPost({ action: 'replace_po_item', item_id: itemId, new_item_number: newProduct.item_number });
      await refreshPOData();
      setReplacingItemId(null);
      setReplaceSearch('');
      setReplaceResults([]);
      setMsg(`已替換為 ${newProduct.item_number}`);
    } catch (error) {
      setMsg(error.message || '替換失敗');
    }
  };

  const [convertingStockIn, setConvertingStockIn] = useState(false);
  const handleConvertToStockIn = async () => {
    if (!confirm(`確定將採購單 ${po.po_no} 轉為進貨單？`)) return;
    setConvertingStockIn(true); setMsg('');
    try {
      const stockInItems = items.map(it => ({
        item_number: it.item_number || it.item_number_snapshot,
        description: it.description || it.description_snapshot || '',
        qty_received: Number(it.qty || it.quantity || 1),
        unit_cost: Number(it.unit_cost || it.unit_price || 0),
        line_total: Number(it.line_total || (it.unit_cost || it.unit_price || 0) * (it.qty || it.quantity || 1)),
      }));
      const res = await apiPost({ action: 'create_stock_in', po_id: po.id, vendor_id: po.vendor_id || null, remark: `從採購單 ${po.po_no} 轉入`, items: stockInItems });
      setMsg(`已建立進貨單（${res.count || stockInItems.length} 項）`);
      await refreshPOData();
    } catch (err) { setMsg(err.message || '轉進貨失敗'); }
    setConvertingStockIn(false);
  };

  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };
  const cardStyle = { ...S.card, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5', marginBottom: 0 };

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header ====== */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{po.po_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: `${PO_STATUS_COLOR[statusKey] || '#6b7280'}14`, color: PO_STATUS_COLOR[statusKey] || '#6b7280', border: `1px solid ${PO_STATUS_COLOR[statusKey] || '#6b7280'}30` }}>
                {PO_STATUS_MAP[statusKey] || statusKey}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, ...S.mono }}>
              {po.po_date || '-'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 送審 / 審核中 / 已駁回重送 */}
          {!isApproved && statusKey === 'draft' && (
            <button onClick={submitForApproval} disabled={submittingApproval || isPending}
              style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: isPending ? '#94a3b8' : isRejected ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: isPending ? 'default' : 'pointer', opacity: submittingApproval ? 0.7 : 1, transition: 'all 0.15s', boxShadow: isPending ? 'none' : '0 2px 8px rgba(37,99,235,0.25)' }}>
              {submittingApproval ? '送審中...' : isPending ? '審核中' : isRejected ? '重送審' : '送審'}
            </button>
          )}
          {isPending && <span style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' }}>待審核</span>}
          {isRejected && <span style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#fee2e2', color: '#dc2626' }}>已駁回</span>}
          {/* 核准後才能寄給原廠 */}
          {canSend && <button onClick={handleSendEmail} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(79,70,229,0.25)' }}>寄給原廠</button>}
          {(statusKey === 'confirmed' || statusKey === 'shipped') && <button onClick={handleConvertToStockIn} disabled={convertingStockIn} style={{ padding: '9px 22px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: convertingStockIn ? 'not-allowed' : 'pointer', opacity: convertingStockIn ? 0.7 : 1, transition: 'all 0.15s' }}>{convertingStockIn ? '轉換中...' : '轉進貨'}</button>}
          <button onClick={handleExport} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}>匯出</button>
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10, padding: '10px 16px', fontSize: 14 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 10, alignItems: 'start' }}>
          {/* ====== Left: Items ====== */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'visible' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>採購明細</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
            </div>
{items.length > 0 ? (
  <div>
    {/* Table header */}
    <div style={{ display: 'grid', gridTemplateColumns: '130px 80px 50px 60px 80px 85px minmax(0,1fr) 70px', gap: 6, padding: '8px 12px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
      <div>料號</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'center' }}>數量</div><div style={{ textAlign: 'center' }}>到貨</div><div style={{ textAlign: 'center' }}>庫存</div><div style={{ textAlign: 'right' }}>小計</div><div>備註</div><div></div>
    </div>
    {items.map((item) => {
      const badge = STOCK_BADGE[item.stock_status] || STOCK_BADGE.no_stock;
      const isEditing = editingItemId === item.id;
      const inputStyle = { width: '100%', padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, textAlign: 'center', outline: 'none' };
      const rowBg = isEditing ? '#fffbeb' : '#fff';
      return (
        <div key={item.id || item.item_number}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 80px 50px 60px 80px 85px minmax(0,1fr) 70px', gap: 6, padding: '10px 12px', borderTop: '1px solid #f3f5f7', alignItems: 'center', fontSize: 13, background: rowBg, transition: 'background 0.1s' }} onMouseEnter={e => !isEditing && (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e => !isEditing && (e.currentTarget.style.background=rowBg)}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151', fontWeight: 600, ...S.mono, fontSize: 14 }} title={`${item.item_number || '-'} — ${item.description || ''}`}>
            {item.item_number || '-'}
          </div>
          <div onClick={(e) => isEditable && !isEditing && startEditItem(item, e)} style={{ color: '#6b7280', textAlign: 'right', ...S.mono, fontSize: 14, cursor: isEditable && !isEditing ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 4 }} onMouseEnter={e => isEditable && !isEditing && (e.currentTarget.style.background='#f3f4f6')} onMouseLeave={e => isEditable && !isEditing && (e.currentTarget.style.background='transparent')}>
            {isEditing ? (
              <input type="number" value={editValues.unit_cost} onChange={e => setEditValues({ ...editValues, unit_cost: parseFloat(e.target.value) || 0 })} style={inputStyle} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} />
            ) : fmtP(item.unit_cost)}
          </div>
          <div onClick={(e) => isEditable && !isEditing && startEditItem(item, e)} style={{ textAlign: 'center', fontWeight: 600, ...S.mono, fontSize: 14, cursor: isEditable && !isEditing ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 4 }} onMouseEnter={e => isEditable && !isEditing && (e.currentTarget.style.background='#f3f4f6')} onMouseLeave={e => isEditable && !isEditing && (e.currentTarget.style.background='transparent')}>
            {isEditing ? (
              <input type="number" value={editValues.qty} onChange={e => setEditValues({ ...editValues, qty: parseInt(e.target.value) || 0 })} style={inputStyle} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} />
            ) : item.qty || 0}
          </div>
          {/* 到貨進度 */}
          <div style={{ textAlign: 'center' }}>
            {(() => {
              const received = Number(item.qty_received) || 0;
              const total = Number(item.qty) || 1;
              const pct = Math.min(Math.round((received / total) * 100), 100);
              const done = received >= total;
              return (
                <div title={`已到 ${received} / ${total}`}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: done ? '#16a34a' : received > 0 ? '#f59e0b' : '#9ca3af', ...S.mono }}>{received}/{total}</div>
                  <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e5e7eb', marginTop: 2 }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: done ? '#16a34a' : received > 0 ? '#f59e0b' : '#e5e7eb', transition: 'width 0.3s' }} />
                  </div>
                </div>
              );
            })()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span style={{ fontWeight: 700, color: badge.color, ...S.mono, fontSize: 12 }}>{item.stock_qty ?? '—'}</span>
            {item.stock_status && <span style={{ padding: '1px 5px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>
              {badge.label}{item.stock_status === 'partial' ? `(差${item.shortage})` : ''}
            </span>}
          </div>
          <div style={{ color: '#059669', fontWeight: 800, textAlign: 'right', ...S.mono, fontSize: 14 }}>{fmtP(item.line_total)}</div>
          <div onClick={(e) => isEditable && !isEditing && startEditItem(item, e)} style={{ fontSize: 13, color: '#6b7280', cursor: isEditable && !isEditing ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 4, lineHeight: 1.4 }} onMouseEnter={e => isEditable && !isEditing && (e.currentTarget.style.background='#f3f4f6')} onMouseLeave={e => isEditable && !isEditing && (e.currentTarget.style.background='transparent')}>
            {isEditing ? (
              <input type="text" value={editValues.item_note} onChange={e => setEditValues({ ...editValues, item_note: e.target.value })} style={{ ...inputStyle, textAlign: 'left' }} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} placeholder="備註" />
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
            ) : isEditable ? (
              <>
                <button onClick={(e) => startEditItem(item, e)} title="編輯" style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>
                <button onClick={(e) => { e.stopPropagation(); setReplacingItemId(replacingItemId === item.id ? null : item.id); setReplaceSearch(''); setReplaceResults([]); }} title="替換" style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⇄</button>
                <button onClick={(e) => deleteItem(item.id, e)} title="刪除" style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </>
            ) : null}
          </div>
        </div>
        {replacingItemId === item.id && (
          <div style={{ padding: '10px 24px 14px', background: '#f5f3ff', borderTop: '1px solid #e9d5ff' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>替換 {item.item_number} →</span>
              <button onClick={() => { setReplacingItemId(null); setReplaceSearch(''); setReplaceResults([]); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: 11 }}>取消</button>
            </div>
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="輸入 2 字以上搜尋料號或品名..." value={replaceSearch} autoFocus
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
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>{fmtP(p.cost_price || 0)}</span>
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
    {isEditable && (
      <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f2f5' }}>
        {showAddItem ? (
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>新增品項</span>
              <button onClick={() => { setShowAddItem(false); setAddSearch(''); setAddResults([]); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: 11 }}>取消</button>
            </div>
            <input type="text" placeholder="輸入 2 字以上搜尋料號或品名..." value={addSearch} autoFocus
              onChange={e => { setAddSearch(e.target.value); searchProducts(e.target.value, setAddResults); }}
              onKeyDown={e => { if (e.key === 'Escape') { setShowAddItem(false); setAddSearch(''); setAddResults([]); } }}
              style={{ width: '100%', maxWidth: 400, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }}
            />
            {addResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', maxWidth: 500, maxHeight: 200, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, marginTop: 4 }}>
                {addResults.map(p => (
                  <div key={p.id || p.item_number} onClick={() => handleAddItem(p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }} onMouseEnter={e => e.currentTarget.style.background='#f0fdf4'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                    <div>
                      <span style={{ fontWeight: 700, ...S.mono, marginRight: 8 }}>{p.item_number}</span>
                      <span style={{ color: '#6b7280' }}>{p.description || ''}</span>
                    </div>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{fmtP(p.cost_price || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setShowAddItem(true)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, color: '#3b82f6', borderColor: '#93c5fd' }}>＋ 新增品項</button>
        )}
      </div>
    )}
    {/* Totals */}
    {items.length > 0 && (
      <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #eff6ff, #eef2ff)', borderTop: '2px solid #bfdbfe' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 24 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, color: '#6b7280' }}>小計 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(totalAmount)}</strong></span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>({items.length} 項)</span>
          </div>
          <div style={{ borderLeft: '2px solid #93c5fd', paddingLeft: 20, textAlign: 'right' }}>
            <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, display: 'block', marginBottom: 2 }}>採購合計</span>
            <span style={{ ...S.mono, fontSize: 22, fontWeight: 900, color: '#1d4ed8', letterSpacing: -1 }}>{fmtP(totalAmount)}</span>
          </div>
        </div>
      </div>
    )}
  </div>
) : (
  <EmptyState text="尚無品項" />
)}
          </div>

          {/* ====== Receiving Panel ====== */}
          {showReceiving && (
            <div style={{ gridColumn: '1 / -1', background: '#fff', borderRadius: 12, border: '2px solid #059669', padding: 20, boxShadow: '0 4px 16px rgba(5,150,105,0.12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>📦 收貨登記</span>
                  <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>輸入本次到貨數量</span>
                </div>
                <button onClick={() => setShowReceiving(false)} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 12 }}>取消</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 70px 70px 80px', gap: 6, padding: '8px 12px', background: '#f0fdf4', fontSize: 12, fontWeight: 700, color: '#6b7280', borderRadius: 8, marginBottom: 8 }}>
                <div>料號</div><div>品名</div><div style={{ textAlign: 'center' }}>訂購</div><div style={{ textAlign: 'center' }}>已到</div><div style={{ textAlign: 'center' }}>本次到貨</div>
              </div>
              {items.map(item => {
                const received = Number(item.qty_received) || 0;
                const remaining = (Number(item.qty) || 0) - received;
                const waitingOrders = allocationData[item.item_number] || null;
                return (
                  <div key={item.id}>
                    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 70px 70px 80px', gap: 6, padding: '10px 12px', borderBottom: waitingOrders ? 'none' : '1px solid #f0f2f5', alignItems: 'center', fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontWeight: 600, ...S.mono }}>{item.item_number}</span>
                        <button onClick={() => { if (waitingOrders) { setAllocationData(prev => { const n = { ...prev }; delete n[item.item_number]; return n; }); } else { loadAllocation(item.item_number); } }} title="查看配貨建議 (FIFO)" style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #c7d2fe', background: waitingOrders ? '#eef2ff' : '#fff', color: '#6366f1', cursor: 'pointer', fontSize: 10, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⇄</button>
                      </div>
                      <div style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '-'}</div>
                      <div style={{ textAlign: 'center', ...S.mono }}>{item.qty || 0}</div>
                      <div style={{ textAlign: 'center', ...S.mono, color: received > 0 ? '#059669' : '#9ca3af' }}>{received}</div>
                      <div style={{ textAlign: 'center' }}>
                        {remaining > 0 ? (
                          <input type="number" min="0" max={remaining} value={receivingQtys[item.id] || ''} onChange={e => setReceivingQtys(prev => ({ ...prev, [item.id]: Math.min(Number(e.target.value) || 0, remaining) }))} style={{ width: 60, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, textAlign: 'center', ...S.mono }} placeholder="0" />
                        ) : (
                          <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>已齊</span>
                        )}
                      </div>
                    </div>
                    {/* FIFO allocation suggestion */}
                    {waitingOrders && (
                      <div style={{ padding: '6px 10px 10px 20px', background: '#f5f3ff', borderBottom: '1px solid #f0f2f5', borderRadius: '0 0 6px 6px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', marginBottom: 4 }}>配貨建議 (先訂先出)</div>
                        {waitingOrders.length === 0 ? (
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>目前無待出貨訂單需要此品項</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {waitingOrders.map((wo, idx) => (
                              <div key={wo.order_id || idx} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#fff', border: '1px solid #e9d5ff' }}>
                                <span style={{ fontWeight: 600, color: '#7c3aed', cursor: 'pointer' }} onClick={() => { if (wo.order_id) { window.localStorage.setItem(ORDER_FOCUS_KEY, wo.order_id); setTab?.('orders'); } }}>{wo.order_no || '-'}</span>
                                <span style={{ color: '#6b7280' }}>{wo.customer_name || ''}</span>
                                <span style={{ ...S.mono, color: '#374151' }}>需 {wo.qty_needed}</span>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>{wo.order_date ? fmtDate(wo.order_date) : ''}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Quick fill + allocation */}
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <button onClick={() => {
                  const qtys = {};
                  items.forEach(it => {
                    const remaining = (Number(it.qty) || 0) - (Number(it.qty_received) || 0);
                    qtys[it.id] = Math.max(remaining, 0);
                  });
                  setReceivingQtys(qtys);
                }} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 12, color: '#059669', borderColor: '#86efac' }}>全部到齊</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowReceiving(false)} style={{ ...S.btnGhost, padding: '8px 20px', fontSize: 13 }}>取消</button>
                  <button onClick={submitReceiving} disabled={submittingReceive} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: submittingReceive ? '#94a3b8' : '#059669', color: '#fff', fontSize: 14, fontWeight: 700, cursor: submittingReceive ? 'not-allowed' : 'pointer' }}>
                    {submittingReceive ? '處理中...' : '確認收貨'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ====== Right sidebar ====== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 1. PDF button */}
            <button onClick={() => window.open(`/api/pdf?type=po&id=${po.id}`, '_blank')} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>下載 PDF</button>

            {/* Receive goods button */}
            {canReceive && (
              <button onClick={openReceiving} style={{ width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 8, background: showReceiving ? '#94a3b8' : '#059669', color: '#fff', cursor: 'pointer' }}>
                📦 收貨登記
              </button>
            )}

            {/* 2. Vendor card */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>廠商資訊</span>
                {vendorInfo && isEditable && (
                  <span onClick={clearVendor} style={{ fontSize: 11, color: '#ef4444', cursor: 'pointer' }}>移除</span>
                )}
              </div>
              {vendorInfo ? (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{vendorInfo.vendor_name || vendorInfo.company_name || '未命名'}</div>
                  {vendorInfo.vendor_code && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>編號: {vendorInfo.vendor_code}</div>}
                  {vendorInfo.contact_name && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>聯絡人: {vendorInfo.contact_name}</div>}
                  {vendorInfo.phone && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>電話: {vendorInfo.phone}</div>}
                  {vendorInfo.mobile && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>手機: {vendorInfo.mobile}</div>}
                  {vendorInfo.email && <div style={{ fontSize: 12, color: '#2563eb', marginBottom: 2 }}>{vendorInfo.email}</div>}
                  {vendorInfo.address && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{vendorInfo.address}</div>}
                  {isEditable && (
                    <button onClick={openVendorPicker} style={{ ...S.btnGhost, fontSize: 12, padding: '3px 10px', marginTop: 6, color: '#6b7280', borderColor: '#d1d5db' }}>更換廠商</button>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>未指定廠商</div>
                  {isEditable && (
                    <button onClick={openVendorPicker} style={{ ...S.btnGhost, fontSize: 13, padding: '6px 14px', color: '#3b82f6', borderColor: '#93c5fd', width: '100%', justifyContent: 'center' }}>＋ 選擇廠商</button>
                  )}
                </div>
              )}
              {/* Vendor picker overlay */}
              {showVendorPicker && (
                <div style={{ marginTop: 8, padding: '8px 0' }}>
                  <input
                    autoFocus
                    placeholder="搜尋廠商名稱、編號、聯絡人..."
                    value={vendorSearch}
                    onChange={e => setVendorSearch(e.target.value)}
                    style={{ ...S.input, fontSize: 13, padding: '6px 10px', width: '100%', marginBottom: 6 }}
                  />
                  {vendorLoading ? (
                    <div style={{ textAlign: 'center', padding: 12, fontSize: 12, color: '#9ca3af' }}>載入中...</div>
                  ) : (
                    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }}>
                      {filteredVendors.length > 0 ? filteredVendors.map(v => (
                        <div key={v.id} onClick={() => selectVendor(v)} style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{v.vendor_name}</div>
                            {v.contact_name && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{v.contact_name}</div>}
                          </div>
                          <span style={{ fontSize: 10, color: '#c0c4cc', fontFamily: 'monospace', flexShrink: 0, marginLeft: 8 }}>{v.vendor_code}</span>
                        </div>
                      )) : (
                        <div style={{ textAlign: 'center', padding: 12, fontSize: 12, color: '#9ca3af' }}>{vendorSearch ? '找不到符合的廠商' : '尚無廠商資料'}</div>
                      )}
                    </div>
                  )}
                  <button onClick={() => { setShowVendorPicker(false); setVendorSearch(''); }} style={{ ...S.btnGhost, fontSize: 12, padding: '3px 10px', marginTop: 6, color: '#6b7280', width: '100%', justifyContent: 'center' }}>取消</button>
                </div>
              )}
            </div>

            {/* 3. Unified record timeline card - combine source order + creation + approval + receiving */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
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

                // Approval status — use real approvalData
                if (approvalData) {
                  const aStatus = approvalData.status;
                  const aTime = approvalData.reviewed_at || approvalData.created_at;
                  if (aStatus === 'approved') {
                    entries.push({ dot: '#16a34a', label: '採購簽核', detail: '已核准', time: aTime, status: 'done' });
                  } else if (aStatus === 'pending') {
                    entries.push({ dot: '#f59e0b', label: '採購簽核', detail: '待審核', time: approvalData.created_at, status: 'current' });
                  } else if (aStatus === 'rejected') {
                    entries.push({ dot: '#ef4444', label: '採購簽核', detail: '已駁回', time: aTime, status: 'rejected' });
                  }
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

            {/* 4. Remark card — editable */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>備註</div>
              <textarea
                defaultValue={po.remark || ''}
                placeholder="輸入備註..."
                rows={3}
                style={{ width: '100%', fontSize: 13, color: '#374151', lineHeight: 1.6, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit' }}
                onBlur={async (e) => {
                  const val = e.target.value.trim();
                  if (val === (po.remark || '').trim()) return;
                  try {
                    await apiPost({ action: 'update_po_remark', po_id: po.id, remark: val });
                    onRefresh?.();
                  } catch (err) { setMsg(err.message || '備註更新失敗'); }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {emailDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '90vw', borderRadius: 14, padding: '16px 18px 20px', marginBottom: 0 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 20 }}>寄送採購單給原廠</h3>
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

// ========== 新增採購單 Modal ==========
function CreatePOModal({ onClose, onCreated }) {
  const [vendorSearch, setVendorSearch] = useState('');
  const [allVendors, setAllVendors] = useState([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [remark, setRemark] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    (async () => {
      setVendorLoading(true);
      try {
        const res = await apiGet({ action: 'vendors', search: '', limit: 200 });
        setAllVendors(res.vendors || []);
      } catch (_) {}
      finally { setVendorLoading(false); }
    })();
  }, []);

  const filteredVendors = (() => {
    if (!vendorSearch.trim()) return allVendors;
    const kw = vendorSearch.trim().toLowerCase();
    return allVendors.filter(v => {
      const fields = [v.vendor_name, v.vendor_code, v.contact_name].filter(Boolean).join(' ').toLowerCase();
      return fields.includes(kw);
    });
  })();

  const searchProducts = (keyword) => {
    setProductSearch(keyword);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!keyword || keyword.length < 2) { setProductResults([]); return; }
    searchRef.current = setTimeout(async () => {
      try {
        const res = await apiGet({ action: 'products', q: keyword, page: 1, limit: 8, lite: 1 });
        setProductResults(res.rows || res.products || []);
      } catch (_) { setProductResults([]); }
    }, 400);
  };

  const addItem = (product) => {
    if (items.some(i => i.item_number === product.item_number)) return;
    const cost = Number(product.tw_reseller_price || product.cost_price || 0);
    setItems(prev => [...prev, {
      item_number: product.item_number,
      description: product.description || product.product_name || '',
      qty: 1,
      unit_cost: cost,
      line_total: cost,
    }]);
    setProductSearch('');
    setProductResults([]);
  };

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'qty' || field === 'unit_cost') {
        updated.line_total = Number(updated.qty || 0) * Number(updated.unit_cost || 0);
      }
      return updated;
    }));
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const totalAmount = items.reduce((s, i) => s + Number(i.line_total || 0), 0);

  const handleCreate = async () => {
    if (items.length === 0) { setError('請至少加入一個品項'); return; }
    setSaving(true); setError('');
    try {
      await apiPost({
        action: 'create_purchase_order',
        vendor_id: selectedVendor?.id || null,
        remark,
        items,
      });
      onCreated?.();
    } catch (e) { setError(e.message || '建立失敗'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 'min(960px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={S.eyebrow}>Create Purchase Order</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>新增採購單</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {error && <div style={{ ...S.card, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          {/* Vendor selection */}
          <div style={S.card}>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>選擇廠商</div>
              {selectedVendor ? (
                <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{selectedVendor.vendor_name}</div>
                    {selectedVendor.contact_name && <div style={{ fontSize: 11, color: '#6b7280' }}>{selectedVendor.contact_name}</div>}
                  </div>
                  <span onClick={() => setSelectedVendor(null)} style={{ fontSize: 16, cursor: 'pointer', color: '#9ca3af' }}>×</span>
                </div>
              ) : (
                <div>
                  <input placeholder="搜尋廠商..." value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} style={{ ...S.input, fontSize: 13, marginBottom: 6 }} />
                  <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }}>
                    {vendorLoading ? <div style={{ padding: 10, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>載入中...</div> :
                      filteredVendors.length > 0 ? filteredVendors.map(v => (
                        <div key={v.id} onClick={() => { setSelectedVendor(v); setVendorSearch(''); }}
                          style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                          <span style={{ fontWeight: 600 }}>{v.vendor_name}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 8 }}>{v.vendor_code}</span>
                        </div>
                      )) : <div style={{ padding: 10, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>無廠商資料</div>
                    }
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Remark */}
          <div style={S.card}>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>備註</div>
              <textarea value={remark} onChange={e => setRemark(e.target.value)} placeholder="輸入備註..." rows={4} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </div>
        </div>

        {/* Items */}
        <div style={{ ...S.card, marginBottom: 12 }}>
          <div style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>採購明細</div>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{items.length} 項</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input placeholder="搜尋料號或品名..." value={productSearch} onChange={e => searchProducts(e.target.value)} style={{ ...S.input, flex: 1, fontSize: 13 }} />
            </div>
            {productResults.length > 0 && (
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', marginBottom: 10 }}>
                {productResults.map(p => (
                  <div key={p.item_number} onClick={() => addItem(p)}
                    style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <div>
                      <span style={{ ...S.mono, fontWeight: 700, color: '#2563eb' }}>{p.item_number}</span>
                      <span style={{ marginLeft: 8, color: '#374151' }}>{p.description || p.product_name || ''}</span>
                    </div>
                    <span style={{ ...S.mono, color: '#6b7280', fontSize: 12 }}>{fmtP(p.tw_reseller_price || 0)}</span>
                  </div>
                ))}
              </div>
            )}
            {items.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>料號</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600, width: 70 }}>數量</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600, width: 100 }}>單價</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>小計</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <div style={{ ...S.mono, fontWeight: 700, color: '#1f2937' }}>{item.item_number}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{item.description}</div>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <input type="number" value={item.qty} min={1} onChange={e => updateItem(idx, 'qty', Number(e.target.value) || 1)} style={{ ...S.input, width: 60, textAlign: 'right', fontSize: 13, padding: '3px 6px' }} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <input type="number" value={item.unit_cost} min={0} onChange={e => updateItem(idx, 'unit_cost', Number(e.target.value) || 0)} style={{ ...S.input, width: 90, textAlign: 'right', fontSize: 13, padding: '3px 6px' }} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', ...S.mono, fontWeight: 700, color: '#10b981' }}>{fmtP(item.line_total)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <span onClick={() => removeItem(idx)} style={{ cursor: 'pointer', color: '#ef4444', fontSize: 16 }}>×</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>搜尋商品加入採購明細</div>
            )}
            {items.length > 0 && (
              <div style={{ padding: '10px 8px', borderTop: '2px solid #bfdbfe', display: 'flex', justifyContent: 'flex-end', gap: 16, alignItems: 'baseline', marginTop: 4 }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{items.length} 項</span>
                <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>採購合計</span>
                <span style={{ ...S.mono, fontSize: 20, fontWeight: 900, color: '#1d4ed8' }}>{fmtP(totalAmount)}</span>
              </div>
            )}
          </div>
        </div>

        <button onClick={handleCreate} disabled={saving || items.length === 0} style={{ ...S.btnPrimary, width: '100%', padding: '12px', fontSize: 15, fontWeight: 700, opacity: saving || items.length === 0 ? 0.5 : 1 }}>
          {saving ? '建立中...' : '建立採購單'}
        </button>
      </div>
    </div>
  );
}

// ========== 採購單主元件 ==========
export default function PurchaseOrders({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const { gridTemplate, ResizableHeader } = useResizableColumns('po_list', isTablet ? [32, 36, 140, 100, 72, 200, 90] : [32, 36, 140, 100, 72, 200, 90, 90, 50]);
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [msg, setMsg] = useState('');
  const [selectedPO, setSelectedPO] = useState(null);
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [exportFilter, setExportFilter] = useState('');

  const toggleSelect = (id) => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleSelectAll = () => {
    if (selectedIds.size === data.rows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(data.rows.map(r => r.id)));
  };

  const PO_STATUS_MAP = { draft: '草稿', pending_approval: '待審核', sent: '已寄出', confirmed: '已核准', shipped: '已出貨', received: '已到貨', rejected: '已駁回', cancelled: '已取消' };
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
    // Direct open: jump straight to detail view
    const directPO = window.localStorage.getItem('qb_po_direct_open');
    if (directPO) {
      try {
        const po = JSON.parse(directPO);
        if (po?.id) setSelectedPO(po);
      } catch (_) {}
      window.localStorage.removeItem('qb_po_direct_open');
      return;
    }
    // Search focus: filter the list
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
        action={<div style={{ display: 'flex', gap: 8 }}>
          <button onClick={async () => {
            const rows = selectedIds.size > 0 ? data.rows.filter(r => selectedIds.has(r.id)) : data.rows;
            if (!rows.length) { setMsg('沒有可匯出的資料'); return; }
            setMsg('匯出中...');
            try {
              // Fetch items for each PO
              const allDetails = await Promise.all(rows.map(r => apiGet({ action: 'po_items', po_id: r.id }).catch(() => ({ items: [] }))));
              const header = ['採購單號', '日期', '狀態', '廠商名稱', '料號', '品名', '數量', '單價', '小計', '採購單合計', '備註'];
              const csvRows = [];
              rows.forEach((r, ri) => {
                const items = allDetails[ri]?.items || [];
                const statusLabel = PO_STATUS_MAP[String(r.status || '').toLowerCase()] || r.status;
                const vendorName = r.vendor?.vendor_name || '';
                const remark = (r.remark || '').replace(/,/g, '，').replace(/\n/g, ' ');
                if (items.length === 0) {
                  csvRows.push([r.po_no, r.po_date?.slice(0, 10) || '', statusLabel, vendorName, '', '', '', '', '', r.total_amount || 0, remark]);
                } else {
                  items.forEach((it, ii) => {
                    csvRows.push([
                      ii === 0 ? r.po_no : '', ii === 0 ? (r.po_date?.slice(0, 10) || '') : '', ii === 0 ? statusLabel : '', ii === 0 ? vendorName : '',
                      it.item_number || it.item_number_snapshot || '', (it.description || it.description_snapshot || '').replace(/,/g, '，'),
                      it.qty || it.quantity || 0, it.unit_cost || it.unit_price || 0, it.line_total || 0,
                      ii === 0 ? (r.total_amount || 0) : '', ii === 0 ? remark : '',
                    ]);
                  });
                }
              });
              // Grand total row
              const grandTotal = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
              csvRows.push(['', '', '', '', '', '', '', '', '', grandTotal, '合計']);
              const bom = '\uFEFF';
              const csv = bom + [header, ...csvRows].map(r => r.join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `採購單_${dateFrom || 'all'}_${dateTo || 'all'}.csv`; a.click(); URL.revokeObjectURL(url);
              // Mark as exported
              const exportedIds = rows.map(r => r.id);
              await apiPost({ action: 'mark_po_exported', po_ids: exportedIds }).catch(() => {});
              await load(data.page, search, statusF);
              setSelectedIds(new Set());
              setMsg('已匯出並標記');
              setTimeout(() => setMsg(''), 2000);
            } catch (e) { setMsg('匯出失敗: ' + (e.message || '')); }
          }} style={{ ...S.btnGhost, padding: '8px 16px', fontSize: 14 }}>匯出{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}</button>
          <button onClick={() => setShowCreatePO(true)} style={S.btnPrimary}>+ 新增採購單</button>
        </div>} />
      {msg && <div style={{ ...S.card, background: msg.includes('失敗') || msg.includes('錯誤') ? '#fef2f2' : '#edfdf3', borderColor: msg.includes('失敗') || msg.includes('錯誤') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') || msg.includes('錯誤') ? '#dc2626' : '#15803d', marginBottom: 10, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}
      <div style={S.statGrid}>
        <StatCard code="DFT" label="草稿" value={fmt(sm.draft)} tone="blue" />
        <StatCard code="SENT" label="已寄出" value={fmt(sm.sent)} tone="blue" accent="#6366f1" />
        <StatCard code="CNF" label="已核准" value={fmt(sm.confirmed)} tone="blue" accent="#3b82f6" />
        <StatCard code="SHIP" label="已出貨" value={fmt(sm.shipped)} tone="blue" accent="#f59e0b" />
        <StatCard code="RCV" label="已到貨" value={fmt(sm.received)} tone="blue" accent="#16a34a" />
      </div>
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 14, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 14 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px', ...S.mono }} />
          <select value={statusF} onChange={(e) => { setStatusF(e.target.value); load(1, search, e.target.value); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="sent">已寄出</option>
            <option value="confirmed">已核准</option>
            <option value="shipped">已出貨</option>
            <option value="received">已到貨</option>
            <option value="rejected">退回</option>
          </select>
          <select value={exportFilter || ''} onChange={(e) => { setExportFilter(e.target.value); }} style={{ ...S.input, width: 120, fontSize: 14, padding: '6px 10px' }}>
            <option value="">全部</option>
            <option value="exported">已匯出</option>
            <option value="not_exported">未匯出</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusF)} placeholder="搜尋採購單號..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 14, padding: '6px 10px' }} />
          <button onClick={() => load(1, search, statusF)} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 14 }}>查詢</button>
        </div>
      </div>
      {(() => {
        const filteredRows = exportFilter ? data.rows.filter(r => exportFilter === 'exported' ? !!r.exported_at : !r.exported_at) : data.rows;
        return loading ? <Loading /> : filteredRows.length === 0 ? <EmptyState text={exportFilter ? '無符合篩選的採購單' : '目前沒有採購單'} /> : (
        <div style={{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }}>
          <ResizableHeader
            headers={[
              { label: <input type="checkbox" checked={filteredRows.length > 0 && selectedIds.size === filteredRows.length} onChange={() => { if (selectedIds.size === filteredRows.length) setSelectedIds(new Set()); else setSelectedIds(new Set(filteredRows.map(r => r.id))); }} style={{ cursor: 'pointer', width: 15, height: 15 }} />, align: 'center' },
              { label: '序', align: 'center' },
              { label: '採購單號', align: 'center' },
              { label: '日期', align: 'center' },
              { label: '狀態', align: 'center' },
              { label: '備註', align: 'left' },
              { label: '金額', align: 'right' },
              ...(isTablet ? [] : [{ label: '廠商名稱', align: 'left' }]),
              { label: '操作', align: 'right' },
            ]}
            style={{ gap: 10, padding: '6px 14px', color: '#6b7280', fontSize: 12 }}
          />
          {filteredRows.map((row, idx) => {
            const statusKey = String(row.status || 'draft').toLowerCase();
            const cell = { padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', fontSize: 13 };
            const cCenter = { ...cell, justifyContent: 'center' };
            const cLeft = { ...cell, justifyContent: 'flex-start' };
            const cRight = { ...cell, justifyContent: 'flex-end' };
            const colCount = isTablet ? 8 : 9;
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: gridTemplate, alignItems: 'center', background: selectedIds.has(row.id) ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s', borderBottom: idx < filteredRows.length - 1 ? '1px solid #e5e7eb' : 'none' }} onClick={() => setSelectedPO(row)} onMouseEnter={(e) => { if (!selectedIds.has(row.id)) e.currentTarget.style.background = '#f0f7ff'; }} onMouseLeave={(e) => { if (!selectedIds.has(row.id)) e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'; }}>
                <div onClick={(e) => { e.stopPropagation(); toggleSelect(row.id); }} style={{ ...cCenter, borderRight: 'none' }}><input type="checkbox" checked={selectedIds.has(row.id)} readOnly style={{ cursor: 'pointer', width: 15, height: 15 }} /></div>
                <div style={{ ...cCenter, fontSize: 12, color: '#6b7280', ...S.mono }}>{((data.page - 1) * (data.limit || 30)) + idx + 1}</div>
                <div style={{ ...cCenter, fontSize: 12, color: '#3b82f6', fontWeight: 700, ...S.mono, gap: 4 }}>{row.po_no || '-'}{row.exported_at && <span title={`已匯出 ${row.exported_at.slice(0,10)}`} style={{ fontSize: 9, background: '#dbeafe', color: '#2563eb', padding: '1px 5px', borderRadius: 4, fontWeight: 600, letterSpacing: 0.3, flexShrink: 0 }}>已匯出</span>}</div>
                <div style={{ ...cCenter, fontSize: 12, color: '#374151', ...S.mono }}>{row.po_date?.slice(0, 10) || '-'}</div>
                <div style={cCenter}><span style={S.tag(PO_STATUS_COLOR[statusKey] || 'default')}>{PO_STATUS_MAP[statusKey] || statusKey}</span></div>
                <div style={{ ...cLeft, fontSize: 14, color: '#374151', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.remark || '-'}</div>
                <div style={{ ...cRight, fontSize: 14, color: '#10b981', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
                {!isTablet && <div style={{ ...cLeft, fontSize: 12, color: '#374151', fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.vendor?.vendor_name || '-'}</div>}
                <div style={{ ...cRight, borderRight: 'none', fontSize: 12, color: '#9ca3af' }}>→</div>
              </div>
            );
          })}
        </div>
      );
      })()}
      <Pager page={data.page || 1} limit={data.limit || 30} total={data.total || 0} onPageChange={(p) => load(p, search, statusF)} />

      {/* Create PO Modal */}
      {showCreatePO && <CreatePOModal onClose={() => setShowCreatePO(false)} onCreated={() => { setShowCreatePO(false); load(); }} />}
    </div>
  );
}
