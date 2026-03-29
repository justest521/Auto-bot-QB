'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, StatCard, PanelHeader, Pager } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';
import { QuoteCreateModal } from './QuoteCreateModal';

function getPresetDateRange(preset) {
  const todayInTaipei = () => {
    const now = new Date();
    const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    return new Date(taipei.getFullYear(), taipei.getMonth(), taipei.getDate());
  };

  const today = todayInTaipei();
  const start = new Date(today);
  const end = new Date(today);

  if (preset === 'week') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
  } else if (preset === 'month') {
    start.setDate(1);
  } else if (preset === 'quarter') {
    const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(quarterStartMonth, 1);
  } else if (preset === 'year') {
    start.setMonth(0, 1);
  }

  return {
    from: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    to: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
  };
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayInTaipei() {
  const now = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return new Date(taipei.getFullYear(), taipei.getMonth(), taipei.getDate());
}

// Focus keys for navigation
const SALES_DOCUMENT_FOCUS_KEY = 'qb_sales_document_focus';
const PO_FOCUS_KEY = 'qb_purchase_order_focus';
const ORDER_FOCUS_KEY = 'qb_order_focus';

// ========== 報價單詳情頁 ==========
function QuoteDetailView({ quote, onBack, onRefresh, salesUsers, setTab }) {
  const { isMobile, isTablet } = useResponsive();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [editingSales, setEditingSales] = useState(false);
  const [convertingOrder, setConvertingOrder] = useState(false);
  const [localStatus, setLocalStatus] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [showAddItem, setShowAddItem] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState([]);
  const [replacingItemId, setReplacingItemId] = useState(null);
  const [replaceSearch, setReplaceSearch] = useState('');
  const [replaceResults, setReplaceResults] = useState([]);

  const statusKey = String(localStatus || quote.status || 'draft').toLowerCase();
  const QUOTE_STATUS_MAP = { draft: '草稿', sent: '已發送', approved: '已核准', converted: '已轉單', closed: '已結案' };
  const QUOTE_STATUS_COLOR = { draft: '#6b7280', sent: '#3b82f6', approved: '#16a34a', converted: '#059669', closed: '#9ca3af' };
  const QUOTE_STATUS_TONE = { draft: '', sent: 'blue', approved: 'green', converted: 'green', closed: '' };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'quote_detail', quote_id: quote.id });
        setDetail(result);
      } catch (e) {
        setMsg(e.message || '無法取得報價單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [quote.id]);

  const convertToOrder = async () => {
    if (!confirm(`確定將報價單 ${quote.quote_no || ''} 轉為訂單？`)) return;
    setConvertingOrder(true);
    try {
      const result = await apiPost({ action: 'convert_quote_to_order', quote_id: quote.id });
      setMsg(`已轉成訂單 ${result.order?.order_no || ''}`.trim());
      setLocalStatus('converted');
      // Reload detail to refresh timeline
      const refreshed = await apiGet({ action: 'quote_detail', quote_id: quote.id });
      setDetail(refreshed);
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '轉訂單失敗');
    } finally {
      setConvertingOrder(false);
    }
  };

  const updateSalesPerson = async (value) => {
    try {
      await apiPost({ action: 'update_quote', quote_id: quote.id, sales_person: value });
      setMsg('已更新業務');
      setEditingSales(false);
      // Refresh detail
      const result = await apiGet({ action: 'quote_detail', quote_id: quote.id });
      setDetail(result);
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '更新失敗');
    }
  };

  const deleteQuote = async () => {
    if (!confirm(`確定刪除報價單 ${quote.quote_no}？此操作無法復原。`)) return;
    try {
      await apiPost({ action: 'delete_quote', quote_id: quote.id });
      onBack();
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '刪除失敗');
    }
  };

  const sendToLine = async () => {
    try {
      const result = await apiPost({ action: 'send_quote_to_line', quote_id: quote.id });
      setMsg(result.message || '已發送');
      const refreshed = await apiGet({ action: 'quote_detail', quote_id: quote.id });
      setDetail(refreshed);
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '發送失敗');
    }
  };

  const q = detail?.quote || quote;
  const c = q.customer || quote.customer || {};
  const items = detail?.items || [];
  const isConverted = statusKey === 'converted';
  const isEditable = statusKey === 'draft' || statusKey === 'sent';
  const isDeletable = statusKey === 'draft' || statusKey === 'sent';

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

  const refreshQuoteData = async () => {
    const result = await apiGet({ action: 'quote_detail', quote_id: quote.id });
    setDetail(result);
    onRefresh?.();
  };

  const startEditItem = (item, e) => {
    e.stopPropagation();
    setEditingItemId(item.id);
    setEditValues({
      qty: item.qty,
      unit_price: item.unit_price,
      item_note: item.item_note || '',
    });
  };

  const saveEditItem = async (e) => {
    e.stopPropagation();
    try {
      await apiPost({
        action: 'update_quote_item',
        item_id: editingItemId,
        qty: editValues.qty,
        unit_price: editValues.unit_price,
        item_note: editValues.item_note,
      });
      setEditingItemId(null);
      setEditValues({});
      await refreshQuoteData();
    } catch (err) {
      setMsg(err.message || '更新品項失敗');
    }
  };

  const cancelEdit = (e) => {
    e.stopPropagation();
    setEditingItemId(null);
    setEditValues({});
  };

  const deleteItem = async (itemId, e) => {
    e.stopPropagation();
    if (!confirm('確定刪除此品項？')) return;
    try {
      await apiPost({ action: 'delete_quote_item', item_id: itemId });
      await refreshQuoteData();
    } catch (err) {
      setMsg(err.message || '刪除失敗');
    }
  };

  const handleReplaceItem = async (oldItemId, newProduct) => {
    try {
      await apiPost({
        action: 'delete_quote_item',
        item_id: oldItemId,
      });
      await apiPost({
        action: 'add_quote_item',
        quote_id: quote.id,
        item_number: newProduct.item_number,
        qty: editValues.qty || 1,
        unit_price: newProduct.tw_retail_price,
      });
      setReplacingItemId(null);
      setReplaceSearch('');
      setReplaceResults([]);
      await refreshQuoteData();
    } catch (err) {
      setMsg(err.message || '替換失敗');
    }
  };

  const addItem = async (product) => {
    try {
      await apiPost({
        action: 'add_quote_item',
        quote_id: quote.id,
        item_number: product.item_number,
        qty: 1,
        unit_price: product.tw_retail_price,
      });
      setShowAddItem(false);
      setAddSearch('');
      setAddResults([]);
      await refreshQuoteData();
    } catch (err) {
      setMsg(err.message || '新增失敗');
    }
  };

  const fmtTime = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return dateStr; }
  };

  // Mobile modal fullscreen styling
  const modalContainerStyle = isMobile ? {
    ...S.mobileModal,
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100vh',
    zIndex: 1000,
    overflowY: 'auto',
  } : {
    padding: '16px',
  };

  const cardStyle = { ...S.card, marginBottom: 10, padding: isMobile ? '12px 14px' : '16px' };
  const labelStyle = { fontSize: isMobile ? 12 : 13, fontWeight: 700, color: '#6b7280', marginBottom: isMobile ? 6 : 8, textTransform: 'uppercase', letterSpacing: 0.5 };

  if (loading) return <Loading />;

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header (same as Order) ====== */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{q.quote_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: `${QUOTE_STATUS_COLOR[statusKey] || '#6b7280'}14`, color: QUOTE_STATUS_COLOR[statusKey] || '#6b7280', border: `1px solid ${QUOTE_STATUS_COLOR[statusKey] || '#6b7280'}30` }}>
                {QUOTE_STATUS_MAP[statusKey] || statusKey}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, ...S.mono }}>{q.quote_date || '-'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{c.company_name || c.name || '未綁定客戶'}</div>
            {c.phone && <div style={{ fontSize: 12, color: '#6b7280', ...S.mono, marginTop: 2 }}>{c.phone}</div>}
          </div>
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10, padding: '10px 16px', fontSize: 14 }}>{msg}</div>}

      {/* ====== Two-column grid (same as Order) ====== */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: 10, alignItems: 'start' }}>
        {/* ====== Left: Items ====== */}
        <div>
      {/* Quote items */}
      {items.length > 0 ? (
        <div style={{ ...cardStyle, padding: 0, overflow: isMobile ? 'hidden' : 'visible', marginBottom: 10 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>商品明細</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
          </div>
          {isMobile ? (
            // Mobile card layout
            <div>
              <div style={{ fontSize: isMobile ? 12 : 13, fontWeight: 700, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>品項清單</div>
              {items.map((item) => {
                const badge = STOCK_BADGE[item.stock_status] || STOCK_BADGE.no_stock;
                const isEditing = editingItemId === item.id;
                const inputStyle = { width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, outline: 'none', minHeight: 32 };
                return (
                  <div key={item.id || item.item_number_snapshot} style={{ ...S.mobileCard, marginBottom: 8, padding: '12px', background: isEditing ? '#fffbeb' : '#f8fafc', border: isEditing ? '2px solid #fbbf24' : '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...S.mobileCardLabel, marginBottom: 4 }}>料號</div>
                        <div style={{ ...S.mobileCardValue, fontFamily: 'monospace', fontSize: 13, fontWeight: 600, wordBreak: 'break-word' }} title={`${item.item_number_snapshot || '-'} — ${item.description_snapshot || ''}`}>{item.item_number_snapshot || '-'}</div>
                        {item.description_snapshot && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, wordBreak: 'break-word' }}>{item.description_snapshot}</div>}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={S.mobileCardLabel}>單價</div>
                        {isEditing ? (
                          <input type="number" value={editValues.unit_price} onChange={e => setEditValues({ ...editValues, unit_price: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                        ) : (
                          <div style={S.mobileCardValue}>{fmtP(item.unit_price)}</div>
                        )}
                      </div>
                      <div>
                        <div style={S.mobileCardLabel}>數量</div>
                        {isEditing ? (
                          <input type="number" value={editValues.qty} onChange={e => setEditValues({ ...editValues, qty: parseInt(e.target.value) || 0 })} style={inputStyle} />
                        ) : (
                          <div style={S.mobileCardValue}>{item.qty || 0}</div>
                        )}
                      </div>
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={S.mobileCardLabel}>庫存</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontWeight: 700, color: badge.color, fontFamily: 'monospace', fontSize: 12 }}>{item.stock_qty ?? '—'}</span>
                        {item.stock_status && <span style={{ padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>
                          {badge.label}{item.stock_status === 'partial' ? `(差${item.shortage})` : ''}
                        </span>}
                      </div>
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={S.mobileCardLabel}>小計</div>
                      <div style={{ ...S.mobileCardValue, color: '#059669', fontWeight: 800, fontFamily: 'monospace' }}>{fmtP(item.line_total)}</div>
                    </div>

                    {isEditable && (
                      <>
                        <div style={{ marginBottom: 8 }}>
                          <div style={S.mobileCardLabel}>備註</div>
                          {isEditing ? (
                            <input type="text" value={editValues.item_note} onChange={e => setEditValues({ ...editValues, item_note: e.target.value })} style={{ ...inputStyle, textAlign: 'left' }} placeholder="備註" />
                          ) : (
                            <div style={{ ...S.mobileCardValue, wordBreak: 'break-word' }}>{item.item_note || '—'}</div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 6 }}>
                          {isEditing ? (
                            <>
                              <button onClick={saveEditItem} style={{ ...S.btnPrimary, flex: 1, minHeight: 44, fontSize: 12 }}>保存</button>
                              <button onClick={cancelEdit} style={{ ...S.btnGhost, flex: 1, minHeight: 44, fontSize: 12 }}>取消</button>
                            </>
                          ) : (
                            <>
                              <button onClick={(e) => startEditItem(item, e)} style={{ ...S.btnGhost, flex: 1, minHeight: 44, fontSize: 12 }}>編輯</button>
                              <button onClick={(e) => { e.stopPropagation(); setReplacingItemId(replacingItemId === item.id ? null : item.id); setReplaceSearch(''); setReplaceResults([]); }} style={{ ...S.btnGhost, flex: 1, minHeight: 44, fontSize: 12 }}>替換</button>
                              <button onClick={(e) => deleteItem(item.id, e)} style={{ ...S.btnGhost, flex: 1, minHeight: 44, fontSize: 12, color: '#dc2626' }}>刪除</button>
                            </>
                          )}
                        </div>
                      </>
                    )}

                    {replacingItemId === item.id && (
                      <div style={{ marginTop: 8, padding: '8px', background: '#f5f3ff', borderRadius: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 6 }}>替換 {item.item_number_snapshot}</div>
                        <input type="text" placeholder="輸入 2 字以上搜尋料號..." value={replaceSearch} autoFocus
                          onChange={e => { setReplaceSearch(e.target.value); searchProducts(e.target.value, setReplaceResults); }}
                          onKeyDown={e => { if (e.key === 'Escape') { setReplacingItemId(null); setReplaceSearch(''); setReplaceResults([]); } }}
                          style={{ ...inputStyle, marginBottom: 6 }}
                        />
                        {replaceResults.length > 0 && (
                          <div style={{ maxHeight: 200, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4 }}>
                            {replaceResults.map(p => (
                              <div key={p.id || p.item_number} onClick={() => handleReplaceItem(item.id, p)} style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <span style={{ fontWeight: 700, fontFamily: 'monospace', marginRight: 6 }}>{p.item_number}</span>
                                  <span style={{ color: '#6b7280' }}>{p.description || ''}</span>
                                </div>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>{fmtP(p.tw_retail_price || 0)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Desktop table layout
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '130px 80px 50px 80px 85px minmax(0,1fr) 70px', gap: 6, padding: '8px 12px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                <div>料號</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'center' }}>數量</div><div style={{ textAlign: 'center' }}>庫存</div><div style={{ textAlign: 'right' }}>小計</div><div>備註</div><div></div>
              </div>
              {items.map((item) => {
                const badge = STOCK_BADGE[item.stock_status] || STOCK_BADGE.no_stock;
                const isEditing = editingItemId === item.id;
                const inputStyle = { width: '100%', padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, textAlign: 'center', outline: 'none' };
                const rowBg = isEditing ? '#fffbeb' : '#fff';
                return (
                  <div key={item.id || item.item_number_snapshot}>
                  <div style={{ display: 'grid', gridTemplateColumns: '130px 80px 50px 80px 85px minmax(0,1fr) 70px', gap: 6, padding: '10px 12px', borderTop: '1px solid #f3f5f7', alignItems: 'center', fontSize: 13, background: rowBg, transition: 'background 0.1s' }} onMouseEnter={e => !isEditing && (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e => !isEditing && (e.currentTarget.style.background=rowBg)}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151', fontWeight: 600, ...S.mono, fontSize: 14 }} title={`${item.item_number_snapshot || '-'} — ${item.description_snapshot || ''}`}>
                      {item.item_number_snapshot || '-'}
                    </div>
                    <div onClick={(e) => isEditable && !isEditing && startEditItem(item, e)} style={{ color: '#6b7280', textAlign: 'right', ...S.mono, fontSize: 14, cursor: isEditable && !isEditing ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 4 }} onMouseEnter={e => isEditable && !isEditing && (e.currentTarget.style.background='#f3f4f6')} onMouseLeave={e => isEditable && !isEditing && (e.currentTarget.style.background='transparent')}>
                      {isEditing ? (
                        <input type="number" value={editValues.unit_price} onChange={e => setEditValues({ ...editValues, unit_price: parseFloat(e.target.value) || 0 })} style={inputStyle} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} />
                      ) : fmtP(item.unit_price)}
                    </div>
                    <div onClick={(e) => isEditable && !isEditing && startEditItem(item, e)} style={{ textAlign: 'center', fontWeight: 600, ...S.mono, fontSize: 14, cursor: isEditable && !isEditing ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 4 }} onMouseEnter={e => isEditable && !isEditing && (e.currentTarget.style.background='#f3f4f6')} onMouseLeave={e => isEditable && !isEditing && (e.currentTarget.style.background='transparent')}>
                      {isEditing ? (
                        <input type="number" value={editValues.qty} onChange={e => setEditValues({ ...editValues, qty: parseInt(e.target.value) || 0 })} style={inputStyle} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') saveEditItem(e); if (e.key === 'Escape') cancelEdit(e); }} />
                      ) : item.qty || 0}
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
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>替換 {item.item_number_snapshot} →</span>
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
                                <span style={{ fontSize: 12, color: '#9ca3af' }}>{fmtP(p.tw_retail_price || 0)}</span>
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
            </div>
          )}

          {/* Add item button */}
          {isEditable && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f2f5' }}>
              {showAddItem ? (
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 600, color: '#374151' }}>新增品項</span>
                    <button onClick={() => { setShowAddItem(false); setAddSearch(''); setAddResults([]); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: isMobile ? 11 : 12, minHeight: isMobile ? 36 : undefined }}>取消</button>
                  </div>
                  <input type="text" placeholder="輸入 2 字以上搜尋料號或品名..." value={addSearch} autoFocus
                    onChange={e => { setAddSearch(e.target.value); searchProducts(e.target.value, setAddResults); }}
                    style={{ width: '100%', maxWidth: isMobile ? '100%' : 400, padding: isMobile ? '8px 10px' : '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: isMobile ? 13 : 14, outline: 'none', minHeight: isMobile ? 44 : undefined }}
                  />
                  {addResults.length > 0 && (
                    <div style={{ position: 'relative', marginTop: 4, maxHeight: 200, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                      {addResults.map(p => (
                        <div key={p.id || p.item_number} onClick={() => addItem(p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: isMobile ? 12 : 13 }} onMouseEnter={e => e.currentTarget.style.background='#f5f3ff'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                          <div>
                            <span style={{ fontWeight: 700, ...S.mono, marginRight: 8 }}>{p.item_number}</span>
                            <span style={{ color: '#6b7280' }}>{p.description || ''}</span>
                          </div>
                          <span style={{ fontSize: isMobile ? 11 : 12, color: '#9ca3af' }}>{fmtP(p.tw_retail_price || 0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setShowAddItem(true)} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: isMobile ? 13 : 14, minHeight: isMobile ? 44 : undefined }}>+ 新增品項</button>
              )}
            </div>
          )}

          {/* Green summary bar (same as Order) */}
          <div style={{ padding: isMobile ? '16px 12px' : '20px 24px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderTop: '2px solid #d1fae5' }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'flex-end', alignItems: isMobile ? 'stretch' : 'flex-end', gap: isMobile ? 8 : 24 }}>
              {isMobile ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>小計</span>
                      <div style={{ ...S.mono, fontSize: 14, color: '#374151', fontWeight: 600 }}>{fmtP(q.subtotal || items.reduce((s, i) => s + (i.line_total || 0), 0))}</div>
                    </div>
                    {Number(q.discount_amount) > 0 && <div><span style={{ fontSize: 12, color: '#ef4444' }}>折扣</span><div style={{ ...S.mono, fontSize: 14, fontWeight: 600, color: '#ef4444' }}>-{fmtP(q.discount_amount)}</div></div>}
                    {Number(q.shipping_fee) > 0 && <div><span style={{ fontSize: 12, color: '#6b7280' }}>運費</span><div style={{ ...S.mono, fontSize: 14, color: '#374151', fontWeight: 600 }}>{fmtP(q.shipping_fee)}</div></div>}
                    {Number(q.tax_amount) > 0 && <div><span style={{ fontSize: 12, color: '#6b7280' }}>稅額</span><div style={{ ...S.mono, fontSize: 14, color: '#374151', fontWeight: 600 }}>{fmtP(q.tax_amount)}</div></div>}
                  </div>
                  <div style={{ borderTop: '2px solid #a7f3d0', paddingTop: 12, textAlign: 'left' }}>
                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: 4 }}>合計</span>
                    <span style={{ ...S.mono, fontSize: 20, fontWeight: 900, color: '#059669' }}>{fmtP(q.total_amount || 0)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 14, color: '#6b7280' }}>小計 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(q.subtotal || items.reduce((s, i) => s + (i.line_total || 0), 0))}</strong></span>
                    {Number(q.discount_amount) > 0 && <span style={{ fontSize: 14, color: '#ef4444' }}>折扣 <strong style={{ ...S.mono, fontSize: 16, fontWeight: 600 }}>-{fmtP(q.discount_amount)}</strong></span>}
                    {Number(q.shipping_fee) > 0 && <span style={{ fontSize: 14, color: '#6b7280' }}>運費 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(q.shipping_fee)}</strong></span>}
                    {Number(q.tax_amount) > 0 && <span style={{ fontSize: 14, color: '#6b7280' }}>稅額 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(q.tax_amount)}</strong></span>}
                  </div>
                  <div style={{ borderLeft: '2px solid #a7f3d0', paddingLeft: 20, textAlign: 'right' }}>
                    <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: 2 }}>合計</span>
                    <span style={{ ...S.mono, fontSize: 28, fontWeight: 900, color: '#059669', letterSpacing: -1 }}>{fmtP(q.total_amount || 0)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: 14, marginBottom: 10 }}>尚無品項</div>
      )}
        </div>

        {/* ====== Right sidebar (same as Order) ====== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...(isMobile ? { gridColumn: '1/-1' } : {}) }}>
          {/* 1. PDF button */}
          <button onClick={() => window.open(`/api/pdf?type=quote&id=${quote.id}`, '_blank')} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>下載 PDF</button>

          {/* 2. 客戶資訊 */}
          <div style={{ ...cardStyle, padding: '10px 16px' }}>
            <div style={labelStyle}>客戶資訊</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{c.company_name || c.name || '未綁定客戶'}</div>
            {[
              { label: '報價日期', value: q.quote_date, mono: true },
              { label: '有效期', value: q.valid_until, mono: true },
            ].filter(f => f.value).map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{f.label}</span>
                <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, ...(f.mono ? S.mono : {}) }}>{f.value}</span>
              </div>
            ))}
          </div>

          {/* 3. 負責業務 */}
          <div style={{ ...cardStyle, padding: '10px 16px' }}>
            <div style={labelStyle}>負責業務</div>
            {editingSales ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={q.sales_person || ''} onChange={(e) => updateSalesPerson(e.target.value)} style={{ ...S.input, fontSize: 14, flex: 1 }}>
                  <option value="">-- 未指定 --</option>
                  {(salesUsers || []).map(u => <option key={u.id} value={u.display_name}>{u.display_name}</option>)}
                </select>
                <button onClick={() => setEditingSales(false)} style={{ ...S.btnGhost, padding: '4px 8px', fontSize: 12 }}>完成</button>
              </div>
            ) : (
              <span onClick={() => isEditable && setEditingSales(true)} style={{ fontSize: 14, fontWeight: 600, color: isEditable ? '#3b82f6' : q.sales_person ? '#111827' : '#9ca3af', cursor: isEditable ? 'pointer' : 'default' }}>{q.sales_person || '未指派'}</span>
            )}
          </div>

          {/* 4. 備註 */}
          <div style={{ ...cardStyle, padding: '10px 16px' }}>
            <div style={labelStyle}>備註</div>
            <textarea
              defaultValue={q.remark || ''}
              placeholder="輸入備註..."
              rows={3}
              style={{ width: '100%', fontSize: 13, color: '#374151', lineHeight: 1.5, border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }}
              onBlur={async (e) => {
                const val = e.target.value.trim();
                if (val === (q.remark || '').trim()) return;
                try {
                  await apiPost({ action: 'update_quote', quote_id: q.id, remark: val });
                  onRefresh?.();
                } catch (err) { setMsg(err.message || '備註更新失敗'); }
              }}
            />
          </div>

          {/* 5. 進度 timeline */}
          <div style={{ ...cardStyle, padding: '10px 16px' }}>
            <div style={labelStyle}>進度</div>
        {(() => {
        // Build unified timeline entries
        const entries = [];

        // Quote created
        entries.push({ dot: '#16a34a', label: '報價建立', ref: quote.quote_no, refType: 'quote', time: quote.quote_date || quote.created_at, status: 'done' });

        // Process existing timeline events if available
        if (detail?.timeline && detail.timeline.length > 0) {
          detail.timeline.forEach(ev => {
            const dotColor = ev.status === 'done' ? '#16a34a' : ev.status === 'pending' ? '#f59e0b' : ev.status === 'rejected' ? '#ef4444' : ev.status === 'expired' ? '#9ca3af' : '#d1d5db';
            const text = ev.event || '';
            const saMatch = text.match(/(SA-\d+)/);
            const qtMatch = text.match(/(QT\d+)/);
            const poMatch = text.match(/(PO-[\w-]+)/);
            const soMatch = text.match(/(SO\d+)/);

            let refType = null;
            let ref = null;
            if (saMatch) { refType = 'sale'; ref = saMatch[1]; }
            else if (qtMatch) { refType = 'quote'; ref = qtMatch[1]; }
            else if (poMatch) { refType = 'po'; ref = poMatch[1]; }
            else if (soMatch) { refType = 'order'; ref = soMatch[1]; }

            entries.push({
              dot: dotColor,
              label: ev.event ? (text.includes('轉訂單') ? '轉訂單' : text.includes('建立') ? '建立' : text) : '事件',
              ref: ref,
              refType: refType,
              detail: ev.by ? `由 ${ev.by}` : '',
              time: ev.time,
              status: ev.status || 'pending'
            });
          });
        }

        // Add current status based on quote status (skip if timeline already has a matching event)
        const hasConvertEvent = entries.some(e => e.label === '轉訂單' && e.ref);
        if (statusKey === 'sent') {
          entries.push({ dot: '#3b82f6', label: '已發送', detail: '等待客戶回應', status: 'current' });
        } else if (statusKey === 'approved') {
          entries.push({ dot: '#16a34a', label: '已核准', detail: '客戶已核准', status: 'done' });
        } else if (statusKey === 'converted' && !hasConvertEvent) {
          entries.push({ dot: '#059669', label: '轉訂單', detail: '已轉為訂單', status: 'done' });
        } else if (statusKey === 'closed') {
          entries.push({ dot: '#9ca3af', label: '已結案', detail: '報價已結案', status: 'pending' });
        }

        return entries.length > 0 ? (
          <div style={{ position: 'relative', paddingLeft: isMobile ? 14 : 18 }}>
            {entries.map((e, i) => {
              const isLast = i === entries.length - 1;
              const isCurrent = e.status === 'current' || e.status === 'warning';
              return (
                <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 14, minHeight: isLast ? 'auto' : 28 }}>
                  {!isLast && <div style={{ position: 'absolute', left: isMobile ? -11 : -11, top: 10, width: 2, bottom: 0, background: '#e5e7eb' }} />}
                  <div style={{ position: 'absolute', left: isMobile ? -14 : -14, top: 3, width: isCurrent ? 10 : 8, height: isCurrent ? 10 : 8, borderRadius: '50%', background: e.dot, border: '2px solid #fff', boxShadow: isCurrent ? `0 0 0 3px ${e.dot}25` : `0 0 0 1.5px ${e.dot}30` }} />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', lineHeight: 1.3 }}>
                    <span style={{ fontSize: isMobile ? 11 : 12, fontWeight: 700, color: e.status === 'done' ? '#1f2937' : e.status === 'rejected' ? '#dc2626' : isCurrent ? '#1d4ed8' : '#9ca3af' }}>{e.label}</span>
                    {e.ref && (() => {
                      const clickHandler = e.refType === 'sale' ? () => { window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, e.ref); setTab?.('sales_documents'); }
                        : e.refType === 'po' ? () => { window.localStorage.setItem(PO_FOCUS_KEY, e.ref); setTab?.('purchase_orders'); }
                        : e.refType === 'quote' ? () => { window.localStorage.setItem('qb_quote_focus', e.ref); setTab?.('quotes'); }
                        : e.refType === 'order' ? () => { window.localStorage.setItem(ORDER_FOCUS_KEY, e.ref); setTab?.('orders'); }
                        : null;
                      return <span style={{ fontSize: isMobile ? 10 : 12, fontWeight: 700, color: '#2563eb', ...S.mono, cursor: clickHandler ? 'pointer' : 'default', textDecoration: clickHandler ? 'underline' : 'none' }} onClick={clickHandler}>{e.ref}</span>;
                    })()}
                    {e.detail && <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 600, color: e.status === 'done' ? '#6b7280' : e.status === 'warning' ? '#92400e' : '#9ca3af', background: isCurrent || e.status === 'warning' ? `${e.dot}14` : 'transparent', padding: isCurrent || e.status === 'warning' ? '1px 6px' : 0, borderRadius: 4 }}>{e.detail}</span>}
                  </div>
                  {e.time && <div style={{ fontSize: isMobile ? 9 : 10, color: '#b0b5bf', marginTop: 1, ...S.mono }}>{fmtTime(e.time)}</div>}
                </div>
              );
            })}
          </div>
        ) : null;
      })()}
      </div>

          {/* 6. Action buttons */}
          {!isConverted && isEditable && (
            <button onClick={convertToOrder} disabled={convertingOrder} style={{ ...S.btnPrimary, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 700 }}>
              {convertingOrder ? '轉換中...' : '轉為訂單'}
            </button>
          )}
          {isEditable && (
            <button onClick={sendToLine} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600 }}>發送 LINE</button>
          )}
          {isDeletable && (
            <button onClick={deleteQuote} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, color: '#dc2626' }}>刪除報價單</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ========== 報價單主元件 ==========
export default function Quotes({ setTab }) {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total_amount: 0, open_count: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [showCreate, setShowCreate] = useState(false);
  const [editingQuote, setEditingQuote] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [statusFilter, setStatusFilter] = useState('');
  const [salesUsers, setSalesUsers] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());

  const QUOTE_DEFAULT_WIDTHS = isTablet
    ? [36, 42, 130, 200, 90, 80]
    : [36, 36, 140, 200, 70, 86, 72, 88, 150, 120];
  const { gridTemplate: quoteGridTemplate, ResizableHeader: QuoteHeader } = useResizableColumns('quotes_list', QUOTE_DEFAULT_WIDTHS);

  const QUOTE_STATUS_MAP = { draft: '草稿', sent: '已發送', approved: '已核准', converted: '已轉單', closed: '已結案' };
  const QUOTE_STATUS_TONE = { draft: '', sent: 'blue', approved: 'green', converted: 'green', closed: '' };

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const params = { action: 'quotes', page: String(page), limit: String(limit), search: q };
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
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const focusedQuote = window.localStorage.getItem('qb_quote_focus');
    if (!focusedQuote) return;
    setSearch(focusedQuote);
    load(1, focusedQuote);
    window.localStorage.removeItem('qb_quote_focus');
  }, [load]);
  useEffect(() => {
    apiGet({ action: 'staff_list' }).then(res => {
      setSalesUsers((res.staff || []).map(s => ({ id: s.id, display_name: s.name, username: s.name })));
    }).catch(() => {});
  }, []);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(1, search, pageSize);

  const duplicateQuote = async (quote) => {
    try {
      setActionMessage('複製中...');
      const detail = await apiGet({ action: 'quotes', page: '1', limit: '1', search: quote.quote_no || '' });
      const original = (detail.rows || [])[0] || quote;
      await apiPost({
        action: 'create_quote',
        customer_id: original.customer_id,
        quote_date: toDateInputValue(todayInTaipei()),
        valid_until: toDateInputValue(new Date(todayInTaipei().getTime() + 7 * 86400000)),
        status: 'draft',
        remark: `(複製自 ${original.quote_no || ''}) ${original.remark || ''}`.trim(),
        discount_amount: Number(original.discount_amount || 0),
        shipping_fee: Number(original.shipping_fee || 0),
        items: [],
      });
      setActionMessage('報價單已複製（明細請手動補充）');
      await load(1, search, pageSize);
    } catch (error) {
      setActionMessage(error.message || '複製報價單失敗');
    }
  };

  const handleExport = async () => {
    try {
      const params = { action: 'quotes', page: '1', limit: '9999', export: 'true', search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (statusFilter) params.status = statusFilter;
      const result = await apiGet(params);
      const columns = [
        { key: 'quote_no', label: '報價單號' },
        { key: (row) => row.customer?.company_name || row.customer?.name || '-', label: '客戶' },
        { key: 'status', label: '狀態' },
        { key: 'quote_date', label: '報價日期' },
        { key: 'valid_until', label: '有效期限' },
        { key: 'total_amount', label: '總金額' },
        { key: 'remark', label: '備註' },
      ];
      exportCsv(result.rows || [], columns, `報價單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert('匯出失敗: ' + e.message); }
  };

  if (selectedQuote) {
    return (
      <QuoteDetailView
        quote={selectedQuote}
        onBack={() => setSelectedQuote(null)}
        onRefresh={() => load()}
        salesUsers={salesUsers}
        setTab={setTab}
      />
    );
  }

  return (
    <div>
      <PageLead
        eyebrow="QUOTES"
        title="報價單"
        description="管理報價單，確認後可轉為訂單進入銷售流程。"
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleExport} style={{ ...S.btnGhost, minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 13 : 14 }}>匯出 CSV</button>
          <button onClick={() => data.table_ready && setShowCreate(true)} disabled={!data.table_ready} style={{ ...S.btnPrimary, opacity: data.table_ready ? 1 : 0.6, cursor: data.table_ready ? 'pointer' : 'not-allowed', minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 13 : 14 }}>+ 新增報價單</button>
        </div>}
      />
      {actionMessage ? (
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10 }}>
          {actionMessage}
        </div>
      ) : null}
      <div style={{ ...S.card, marginBottom: 10, padding: isMobile ? '10px 12px' : '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: isMobile ? '6px 10px' : '6px 14px', fontSize: isMobile ? 12 : 14, minHeight: isMobile ? 44 : undefined, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          {!isMobile && (
            <>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px', ...S.mono }} />
              <span style={{ color: '#6b7280', fontSize: 14 }}>~</span>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px', ...S.mono }} />
            </>
          )}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, width: isMobile ? '100%' : 150, fontSize: isMobile ? 13 : 14, padding: isMobile ? '8px 10px' : '6px 10px', minHeight: isMobile ? 44 : undefined, ...(isMobile ? S.mobile.input : {}) }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="sent">已發送</option>
            <option value="approved">已核准</option>
            <option value="converted">已轉單</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋單號、客戶或備註..." style={{ ...S.input, flex: 1, minWidth: isMobile ? '100%' : 160, fontSize: isMobile ? 13 : 14, padding: isMobile ? '8px 10px' : '6px 10px', minHeight: isMobile ? 44 : undefined, ...(isMobile ? S.mobile.input : {}) }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: isMobile ? '8px 12px' : '6px 16px', fontSize: isMobile ? 13 : 14, minHeight: isMobile ? 44 : undefined }}>查詢</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 erp_quotes 資料表。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        <StatCard code="QTOT" label="報價總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="OPEN" label="待處理" value={fmt(data.summary?.open_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有報價單資料" /> : (
        isMobile ? (
          // Mobile card layout
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            {data.rows.map((row) => {
              const statusKey = String(row.status || 'draft').toLowerCase();
              return (
                <div key={row.id} onClick={() => setSelectedQuote(row)} style={{ ...S.mobileCard, cursor: 'pointer', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>單號</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', ...S.mono, wordBreak: 'break-word' }}>{row.quote_no || '-'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <span style={{ ...S.tag(QUOTE_STATUS_TONE[statusKey] || ''), fontSize: 11, minHeight: 24, display: 'flex', alignItems: 'center' }}>{QUOTE_STATUS_MAP[statusKey] || statusKey}</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>客戶</div>
                      <div style={{ fontSize: 13, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>日期</div>
                      <div style={{ fontSize: 13, color: '#111827', fontWeight: 600, ...S.mono }}>{row.quote_date || '-'}</div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>總金額</div>
                    <div style={{ fontSize: 15, color: '#059669', fontWeight: 800, ...S.mono }}>{fmtP(row.total_amount)}</div>
                  </div>

                  {row.remark && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>備註</div>
                      <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.remark}</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                    <button onClick={(e) => { e.stopPropagation(); duplicateQuote(row); }} style={{ ...S.btnGhost, flex: 1, fontSize: 12, minHeight: 36 }}>複製</button>
                    <button onClick={(e) => { e.stopPropagation(); window.open(`/api/pdf?type=quote&id=${row.id}`, '_blank'); }} style={{ ...S.btnGhost, flex: 1, fontSize: 12, minHeight: 36 }}>PDF</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Desktop table layout
          <div style={{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', ...S.tableScroll }}>
            <QuoteHeader headers={isTablet ? [
              { label: '', align: 'center', render: () => <input type="checkbox" checked={data.rows.length > 0 && checkedIds.size === data.rows.length} onChange={(e) => { if (e.target.checked) { setCheckedIds(new Set(data.rows.map(r => r.id))); } else { setCheckedIds(new Set()); } }} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#3b82f6' }} /> },
              { label: '序', align: 'center' },
              { label: '單號', align: 'center' },
              { label: '客戶', align: 'center' },
              { label: '日期', align: 'center' },
              { label: '狀態', align: 'center' },
            ] : [
              { label: '', align: 'center', render: () => <input type="checkbox" checked={data.rows.length > 0 && checkedIds.size === data.rows.length} onChange={(e) => { if (e.target.checked) { setCheckedIds(new Set(data.rows.map(r => r.id))); } else { setCheckedIds(new Set()); } }} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#3b82f6' }} /> },
              { label: '序', align: 'center' },
              { label: '單號', align: 'center' },
              { label: '客戶', align: 'center' },
              { label: '業務', align: 'center' },
              { label: '日期', align: 'center' },
              { label: '狀態', align: 'center' },
              { label: '總金額', align: 'center' },
              { label: '備註', align: 'center' },
              { label: '操作', align: 'center' },
            ]} />
            {data.rows.map((row, idx) => {
              const statusKey = String(row.status || 'draft').toLowerCase();
              const isChecked = checkedIds.has(row.id);
              const cell = { padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' };
              const cCenter = { ...cell, justifyContent: 'center' };
              const cRight = { ...cell, justifyContent: 'flex-end' };
              const cellLast = { ...cell, borderRight: 'none', justifyContent: 'flex-end' };
              return (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: quoteGridTemplate, borderBottom: idx < data.rows.length - 1 ? '1px solid #e5e7eb' : 'none', background: isChecked ? '#eff6ff' : (idx % 2 === 0 ? '#fff' : '#fafbfd'), cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => setSelectedQuote(row)} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f7ff'} onMouseLeave={(e) => e.currentTarget.style.background = isChecked ? '#eff6ff' : (idx % 2 === 0 ? '#fff' : '#fafbfd')}>
                  <div style={cCenter} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isChecked} onChange={() => { setCheckedIds(prev => { const next = new Set(prev); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; }); }} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#3b82f6' }} />
                  </div>
                  <div style={{ ...cCenter, fontSize: 13, color: '#6b7280', ...S.mono }}>{((data.page - 1) * (data.limit || pageSize)) + idx + 1}</div>
                  <div style={{ ...cCenter, fontSize: 13, color: '#3b82f6', fontWeight: 700, ...S.mono, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.quote_no || '-'}</div>
                  <div style={cell}>
                    <span style={{ fontSize: 13, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</span>
                  </div>
                  {!isTablet && <div style={{ ...cCenter, fontSize: 13, color: '#374151', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.sales_person || <span style={{ color: '#d1d5db' }}>—</span>}</div>}
                  <div style={{ ...cCenter, fontSize: 13, color: '#374151', ...S.mono, whiteSpace: 'nowrap' }}>{row.quote_date || '-'}</div>
                  <div style={cCenter}><span style={S.tag(QUOTE_STATUS_TONE[statusKey] || '')}>{QUOTE_STATUS_MAP[statusKey] || statusKey}</span></div>
                  {!isTablet && <div style={{ ...cRight, fontSize: 13, color: '#10b981', fontWeight: 700, ...S.mono, whiteSpace: 'nowrap' }}>{fmtP(row.total_amount)}</div>}
                  {!isTablet && <div style={{ ...cell, fontSize: 13, color: '#374151' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.remark || '-'}</span></div>}
                  <div style={{ ...cellLast, gap: 4, flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => duplicateQuote(row)} title="複製報價單" style={{ ...S.btnGhost, padding: '4px 6px', fontSize: 12, whiteSpace: 'nowrap', minHeight: 44 }}>複製</button>
                    <button onClick={() => window.open(`/api/pdf?type=quote&id=${row.id}`, '_blank')} style={{ ...S.btnGhost, padding: '4px 6px', fontSize: 12, whiteSpace: 'nowrap', minHeight: 44 }}>PDF</button>
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
      <QuoteCreateModal open={showCreate || !!editingQuote} editQuote={editingQuote} onClose={() => { setShowCreate(false); setEditingQuote(null); }} onCreated={() => { load(1, search, pageSize); setEditingQuote(null); }} tableReady={data.table_ready} />
    </div>
  );
}
