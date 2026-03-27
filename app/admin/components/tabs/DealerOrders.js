'use client';
import { useState, useEffect, useRef } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, exportCsv, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, ComingSoonBanner } from '../shared/ui';

const STOCK_BADGE = {
  sufficient: { label: '充足', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  partial:    { label: '不足', bg: '#fef9c3', color: '#854d0e', border: '#fde68a' },
  no_stock:   { label: '無庫存', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
};

// ========== 經銷商訂單詳情頁 ==========
function DealerOrderDetailView({ order, onBack, onRefresh }) {
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

  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 };
  const cardStyle = { ...S.card, borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5' };

  // Compute stock summary
  const sufficientCount = items.filter(i => i.stock_status === 'sufficient').length;
  const partialCount = items.filter(i => i.stock_status === 'partial').length;
  const noStockCount = items.filter(i => i.stock_status === 'no_stock').length;
  const shortageCount = partialCount + noStockCount;

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header ====== */}
      <div style={{ ...cardStyle, padding: '16px 18px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{order.order_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${STATUS_COLOR[o.status] || '#6b7280'}14`, color: STATUS_COLOR[o.status] || '#6b7280', border: `1px solid ${STATUS_COLOR[o.status] || '#6b7280'}30` }}>
                {STATUS_MAP[o.status] || o.status}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4, ...S.mono }}>
              {order.order_date || '-'}
            </div>
          </div>
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10, padding: '10px 16px', fontSize: 14 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          {/* ====== Left: Items ====== */}
          <div>
            {/* Stock summary */}
            {items.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center', ...cardStyle, padding: '10px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>庫存核對</div>
                <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#dcfce7', color: '#15803d' }}>充足 {sufficientCount}</span>
                {partialCount > 0 && (
                  <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#fef9c3', color: '#854d0e' }}>不足 {partialCount}</span>
                )}
                {noStockCount > 0 && (
                  <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#b91c1c' }}>無庫存 {noStockCount}</span>
                )}
              </div>
            )}

            {/* Items card */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>訂單明細</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
              </div>
              {items.length > 0 ? (
                <div>
                  {/* Table header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 80px 70px 80px 80px 70px', gap: 8, padding: '8px 16px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    <div>料號</div><div>品名</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'center' }}>數量</div><div style={{ textAlign: 'center' }}>庫存</div><div style={{ textAlign: 'center' }}>狀態</div><div style={{ textAlign: 'right' }}>小計</div><div>操作</div>
                  </div>
                  {/* Table rows */}
                  {items.map((item) => {
                    const badge = item.stock_status ? (STOCK_BADGE[item.stock_status] || STOCK_BADGE.no_stock) : null;
                    return (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 80px 70px 80px 80px 70px', gap: 8, padding: '10px 16px', borderTop: '1px solid #f3f5f7', background: '#fff', transition: 'background 0.1s', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.background='#f8fafc'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                        <div style={{ ...S.mono, fontSize: 14, color: '#374151', fontWeight: 600 }}>{item.item_number_snapshot || '-'}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{item.description_snapshot || '-'}</div>
                        <div style={{ textAlign: 'right', ...S.mono, fontSize: 14, color: '#6b7280' }}>{fmtP(item.unit_price)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                          <button onClick={() => updateItemQty(item, item.qty - 1)} style={{ ...S.btnGhost, padding: '2px 6px', fontSize: 11, minWidth: 24 }}>-</button>
                          <span style={{ ...S.mono, fontWeight: 700, minWidth: 20, textAlign: 'center', fontSize: 14 }}>{item.qty}</span>
                          <button onClick={() => updateItemQty(item, item.qty + 1)} style={{ ...S.btnGhost, padding: '2px 6px', fontSize: 11, minWidth: 24 }}>+</button>
                        </div>
                        <div style={{ textAlign: 'center', fontWeight: 700, color: item.stock_qty > 0 ? '#15803d' : '#b91c1c', ...S.mono, fontSize: 14 }}>{item.stock_qty ?? '-'}</div>
                        <div style={{ textAlign: 'center' }}>
                          {badge ? (
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                              {badge.label}{item.stock_status === 'partial' ? `(差${item.shortage})` : ''}
                            </span>
                          ) : <span style={{ color: '#9ca3af', fontSize: 10 }}>-</span>}
                        </div>
                        <div style={{ color: '#059669', fontWeight: 800, textAlign: 'right', ...S.mono, fontSize: 16 }}>{fmtP(item.line_total || item.unit_price * item.qty)}</div>
                        <div>{item.qty > 0 && <button onClick={() => { if (confirm('刪除此品項？')) updateItemQty(item, 0); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: 10, color: '#ef4444', borderColor: '#fecdd3' }}>刪除</button>}</div>
                      </div>
                    );
                  })}
                  {/* Totals */}
                  <div style={{ padding: '10px 16px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderTop: '2px solid #d1fae5' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 14, color: '#6b7280' }}>小計 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(o.subtotal || items.reduce((s, i) => s + (i.line_total || i.unit_price * i.qty || 0), 0))}</strong></span>
                        {o.tax_amount > 0 && <span style={{ fontSize: 14, color: '#6b7280' }}>稅金 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(o.tax_amount)}</strong></span>}
                      </div>
                      <div style={{ borderLeft: '2px solid #a7f3d0', paddingLeft: 10, textAlign: 'right' }}>
                        <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: 2 }}>合計</span>
                        <span style={{ ...S.mono, fontSize: 28, fontWeight: 900, color: '#059669', letterSpacing: -1 }}>{fmtP(o.total_amount || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: 14 }}>尚無品項</div>
              )}
            </div>

            {/* Smart action buttons */}
            {items.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
                {sufficientCount > 0 && (
                  <button
                    onClick={handleInstockToSale}
                    disabled={!!processingAction}
                    style={{ ...S.btnPrimary, padding: '8px 18px', fontSize: 13, background: '#16a34a', borderColor: '#16a34a', opacity: processingAction === 'sale' ? 0.6 : 1 }}
                  >
                    {processingAction === 'sale' ? '處理中...' : `有貨項目 → 轉銷貨 (${sufficientCount}項)`}
                  </button>
                )}
                {shortageCount > 0 && (
                  <button
                    onClick={handleShortageToP0}
                    disabled={!!processingAction}
                    style={{ ...S.btnGhost, padding: '8px 18px', fontSize: 13, color: '#dc2626', borderColor: '#fca5a5', opacity: processingAction === 'po' ? 0.6 : 1 }}
                  >
                    {processingAction === 'po' ? '處理中...' : `缺貨項目 → 轉採購單 (${shortageCount}項)`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ====== Right sidebar ====== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Dealer card */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>下單人資訊</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 14, lineHeight: 1.3 }}>{d.company_name || d.display_name || '未綁定下單人'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: '下單人', value: d.display_name },
                  { label: '角色', value: d.role === 'dealer' ? '經銷' : d.role === 'sales' ? '業務' : d.role === 'tech' ? '技師' : d.role },
                  { label: '電話', value: d.phone, mono: true },
                  { label: '信箱', value: d.email, mono: true },
                ].filter(f => f.value).map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                    <span style={{ fontSize: 12, color: '#b0b8c4', flexShrink: 0, fontWeight: 500 }}>{f.label}</span>
                    <span style={{ fontSize: 14, color: '#1f2937', textAlign: 'right', fontWeight: 500, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status change card */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>變更狀態</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <button key={k} onClick={() => updateOrderStatus(k)} disabled={o.status === k} style={{ ...S.btnGhost, padding: '8px 12px', fontSize: 12, background: o.status === k ? '#3b82f6' : '#fff', color: o.status === k ? '#fff' : '#4b5563', borderColor: o.status === k ? '#3b82f6' : '#e5e7eb', opacity: o.status === k ? 1 : 0.8, justifyContent: 'flex-start', textAlign: 'left' }}>{v}</button>
                ))}
              </div>
            </div>

            {/* Remark card */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>備註</div>
              <textarea value={editingRemark} onChange={(e) => setEditingRemark(e.target.value)} style={{ ...S.input, width: '100%', fontSize: 12, minHeight: 80, padding: '12px', borderRadius: 8, fontFamily: 'inherit' }} placeholder="訂單備註" />
              <button onClick={updateOrderRemark} style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 12, marginTop: 10, width: '100%' }}>儲存備註</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DealerOrders() {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [consolidating, setConsolidating] = useState(false);
  const [msg, setMsg] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedOrder, setSelectedOrder] = useState(null);
  // Date filter
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [search, setSearch] = useState('');
  const tableRef = useRef(null);

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

  // If selectedOrder is set, show detail view
  if (selectedOrder) {
    return (
      <DealerOrderDetailView
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onRefresh={() => load()}
      />
    );
  }

  // List view
  return (
    <div>
      <PageLead eyebrow="DEALER ORDERS" title="經銷商訂單" description="點擊訂單進入詳情頁。可編輯數量、狀態與備註，有貨轉銷貨、缺貨轉採購。" action={
        <div style={{ display: 'flex', gap: 8 }}>
          {selected.length > 0 && <button onClick={consolidate} disabled={consolidating} style={{ ...S.btnPrimary, opacity: consolidating ? 0.7 : 1 }}>{consolidating ? '彙整中...' : `彙整 ${selected.length} 筆 → 採購單`}</button>}
          <button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>
        </div>
      } />
      <ComingSoonBanner tabId="dealer_orders" />
      {msg && <div style={{ ...S.card, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10 }}>{msg}</div>}
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, fontSize: 13, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="pending">待處理</option>
            <option value="confirmed">已確認</option>
            <option value="purchasing">採購中</option>
            <option value="arrived">已到貨</option>
            <option value="shipped">已出貨</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋訂單號、客戶..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: '6px 16px', fontSize: 13 }}>查詢</button>
        </div>
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="沒有訂單" /> : (
        <div ref={tableRef} style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 140px minmax(0,1fr) 100px 100px 110px', gap: 10, padding: '8px 16px', borderBottom: '2px solid #e6edf5', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>
            <div><input type="checkbox" checked={selected.length > 0 && selected.length === data.rows.filter((r) => r.status === 'pending').length} onChange={selectAll} /></div>
            <div>訂單號</div><div>下單人</div><div>日期</div><div>狀態</div><div style={{ textAlign: 'right' }}>金額</div>
          </div>
          {data.rows.map((row, idx) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '40px 140px minmax(0,1fr) 100px 100px 110px', gap: 10, padding: '10px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: selected.includes(row.id) ? '#dbeafe' : idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => setSelectedOrder(row)} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f7ff'} onMouseLeave={(e) => e.currentTarget.style.background = selected.includes(row.id) ? '#dbeafe' : idx % 2 === 0 ? '#fff' : '#fafbfd'}>
              <div onClick={(e) => e.stopPropagation()}>{row.status === 'pending' && <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelect(row.id)} />}</div>
              <div style={{ fontSize: 13, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{row.order_no || '-'}</div>
              <div><div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{row.dealer?.display_name || '-'}</div><div style={{ fontSize: 11, color: '#374151' }}>{row.dealer?.company_name || ''} {row.dealer?.role ? `(${row.dealer.role === 'dealer' ? '經銷' : row.dealer.role === 'sales' ? '業務' : '技師'})` : ''}</div></div>
              <div style={{ fontSize: 13, color: '#374151', ...S.mono }}>{row.order_date || '-'}</div>
              <div><span style={S.tag(STATUS_TONE[row.status] || '')}>{STATUS_MAP[row.status] || row.status}</span></div>
              <div style={{ fontSize: 14, color: '#10b981', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
