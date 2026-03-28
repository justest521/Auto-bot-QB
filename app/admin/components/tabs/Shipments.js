'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, getPresetDateRange, useViewportWidth } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard } from '../shared/ui';

const STATUS_MAP = { pending: '待出貨', packed: '已包裝', shipped: '已出貨', delivered: '已送達', returned: '已退回', cancelled: '已取消' };
const STATUS_COLOR = { pending: '#f59e0b', packed: '#8b5cf6', shipped: '#3b82f6', delivered: '#16a34a', returned: '#ef4444', cancelled: '#6b7280' };
const cardStyle = { ...S.card, borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5' };
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 };

// ========== 出貨單明細頁 ==========
function ShipmentDetailView({ shipment: initShip, onBack, onRefresh }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [processing, setProcessing] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'shipment_detail', shipment_id: initShip.id });
        setDetail(result);
      } catch (e) {
        setMsg(e.message || '無法取得出貨單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [initShip.id]);

  const ship = detail?.shipment || initShip;
  const items = detail?.items || [];
  const order = detail?.order;
  const customer = detail?.customer;
  const statusKey = ship.status || 'pending';

  const updateStatus = async (newStatus, notifyLine = false) => {
    if (!confirm(`確定將狀態改為「${STATUS_MAP[newStatus]}」？`)) return;
    setProcessing(newStatus); setMsg('');
    try {
      await apiPost({ action: 'update_shipment_status', shipment_id: ship.id, status: newStatus, notify_line: notifyLine });
      setMsg(`已更新為 ${STATUS_MAP[newStatus]}`);
      const result = await apiGet({ action: 'shipment_detail', shipment_id: ship.id });
      setDetail(result);
      if (onRefresh) onRefresh();
    } catch (e) { setMsg(e.message || '更新失敗'); }
    finally { setProcessing(''); }
  };

  // Status flow buttons
  const nextActions = [];
  if (statusKey === 'pending') nextActions.push({ status: 'shipped', label: '標記出貨', color: '#3b82f6', notify: true });
  if (statusKey === 'shipped') nextActions.push({ status: 'delivered', label: '標記送達', color: '#16a34a', notify: true });
  if (statusKey !== 'cancelled' && statusKey !== 'delivered' && statusKey !== 'returned') nextActions.push({ status: 'cancelled', label: '取消出貨', color: '#ef4444', notify: false });
  if (statusKey === 'delivered') nextActions.push({ status: 'returned', label: '退回', color: '#ef4444', notify: false });

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* Header */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{ship.shipment_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${STATUS_COLOR[statusKey] || '#6b7280'}14`, color: STATUS_COLOR[statusKey] || '#6b7280', border: `1px solid ${STATUS_COLOR[statusKey] || '#6b7280'}30` }}>
                {STATUS_MAP[statusKey] || statusKey}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4, ...S.mono }}>
              {fmtDate(ship.ship_date || ship.created_at)}
              {ship.carrier && <span style={{ color: '#d1d5db' }}> &middot; </span>}
              {ship.carrier && <span>{ship.carrier}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {nextActions.map(a => (
            <button key={a.status} onClick={() => updateStatus(a.status, a.notify)} disabled={!!processing}
              style={{ padding: '9px 22px', borderRadius: 10, border: a.status === 'cancelled' || a.status === 'returned' ? `1px solid ${a.color}40` : 'none', background: a.status === 'cancelled' || a.status === 'returned' ? '#fff' : `linear-gradient(135deg, ${a.color}, ${a.color}dd)`, color: a.status === 'cancelled' || a.status === 'returned' ? a.color : '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: processing ? 0.7 : 1, transition: 'all 0.15s', boxShadow: a.status === 'cancelled' || a.status === 'returned' ? 'none' : `0 2px 8px ${a.color}40` }}>
              {processing === a.status ? '處理中...' : a.label}
            </button>
          ))}
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') || msg.includes('錯誤') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') || msg.includes('錯誤') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') || msg.includes('錯誤') ? '#b42318' : '#15803d', marginBottom: 10, padding: '10px 16px', fontSize: 14 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 10, alignItems: 'start' }}>
          {/* Left: Items */}
          <div>
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f2f5' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>出貨品項</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
              </div>
              {items.length > 0 ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr) 75px 75px 90px', gap: 8, padding: '8px 16px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    <div>料號</div><div>品名</div><div style={{ textAlign: 'center' }}>訂購數</div><div style={{ textAlign: 'center' }}>出貨數</div><div style={{ textAlign: 'right' }}>單價</div>
                  </div>
                  {items.map((item, i) => (
                    <div key={item.id || i} style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr) 75px 75px 90px', gap: 8, padding: '10px 16px', borderTop: '1px solid #f3f5f7', background: '#fff', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      <div style={{ ...S.mono, fontSize: 14, color: '#374151' }}>{item.item_number || '-'}</div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937', lineHeight: 1.4 }}>{item.description || '-'}</div>
                      <div style={{ textAlign: 'center', ...S.mono, fontSize: 14, color: '#6b7280' }}>{item.order_qty || '-'}</div>
                      <div style={{ textAlign: 'center', ...S.mono, fontSize: 14, fontWeight: 800, color: '#059669' }}>{item.qty_shipped || 0}</div>
                      <div style={{ textAlign: 'right', ...S.mono, fontSize: 14, color: '#6b7280' }}>{fmtP(item.unit_price)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: 14 }}>尚無出貨品項明細</div>
              )}
            </div>

            {/* Status timeline */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>狀態流程</div>
              <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                {['pending', 'shipped', 'delivered'].map((st, i) => {
                  const isActive = ['pending', 'packed', 'shipped', 'delivered'].indexOf(statusKey) >= i;
                  const isCurrent = statusKey === st;
                  return (
                    <div key={st} style={{ display: 'flex', alignItems: 'center' }}>
                      {i > 0 && <div style={{ width: 40, height: 2, background: isActive ? '#16a34a' : '#e5e7eb' }} />}
                      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: isCurrent ? STATUS_COLOR[st] : isActive ? '#dcfce7' : '#f3f4f6', color: isCurrent ? '#fff' : isActive ? '#15803d' : '#9ca3af', border: isCurrent ? 'none' : `2px solid ${isActive ? '#86efac' : '#e5e7eb'}` }}>
                        {i + 1}
                      </div>
                      <span style={{ marginLeft: 6, fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? STATUS_COLOR[st] : isActive ? '#15803d' : '#9ca3af' }}>{STATUS_MAP[st]}</span>
                    </div>
                  );
                })}
                {(statusKey === 'cancelled' || statusKey === 'returned') && (
                  <div style={{ display: 'flex', alignItems: 'center', marginLeft: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: '#fee2e2', color: '#ef4444' }}>✕</div>
                    <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{STATUS_MAP[statusKey]}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Logistics card */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>物流資訊</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: '出貨單號', value: ship.shipment_no, mono: true },
                  { label: '物流商', value: ship.carrier },
                  { label: '追蹤編號', value: ship.tracking_no, mono: true },
                  { label: '出貨日期', value: fmtDate(ship.ship_date || ship.created_at), mono: true },
                  { label: '送貨地址', value: ship.shipping_address },
                  { label: '備註', value: ship.remark },
                ].filter(f => f.value).map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                    <span style={{ fontSize: 12, color: '#b0b8c4', flexShrink: 0, fontWeight: 500 }}>{f.label}</span>
                    <span style={{ fontSize: 14, color: '#1f2937', textAlign: 'right', fontWeight: 500, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Order card */}
            {order && (
              <div style={{ ...cardStyle, padding: '10px 16px' }}>
                <div style={labelStyle}>關聯訂單</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 10, ...S.mono }}>{order.order_no || '-'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: '訂單日期', value: order.order_date, mono: true },
                    { label: '訂單狀態', value: order.status },
                    { label: '出貨狀態', value: order.shipping_status },
                    { label: '訂單金額', value: fmtP(order.total_amount), mono: true },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                      <span style={{ fontSize: 12, color: '#b0b8c4', flexShrink: 0, fontWeight: 500 }}>{f.label}</span>
                      <span style={{ fontSize: 14, color: '#1f2937', textAlign: 'right', fontWeight: 500, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Customer card */}
            {customer && (
              <div style={{ ...cardStyle, padding: '10px 16px' }}>
                <div style={labelStyle}>客戶資訊</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 10, lineHeight: 1.3 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: '聯絡人', value: customer.name },
                    { label: '電話', value: customer.phone, mono: true },
                    { label: '地址', value: customer.address },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                      <span style={{ fontSize: 12, color: '#b0b8c4', flexShrink: 0, fontWeight: 500 }}>{f.label}</span>
                      <span style={{ fontSize: 14, color: '#1f2937', textAlign: 'right', fontWeight: 500, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 出貨管理主元件 ==========
export default function Shipments() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ shipments: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ order_id: '', carrier: '', tracking_no: '', shipping_address: '', remark: '' });
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [pageSize, setPageSize] = useState(20);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const load = useCallback(async (page = 1, q = search, st = statusF, df = dateFrom, dt = dateTo) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'shipments', page: String(page), limit: String(pageSize), search: q, status: st, date_from: df, date_to: dt })); } finally { setLoading(false); }
  }, [search, statusF, dateFrom, dateTo, pageSize]);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try { await apiPost({ action: 'create_shipment', ...form }); setCreateOpen(false); setForm({ order_id: '', carrier: '', tracking_no: '', shipping_address: '', remark: '' }); load(); } catch (e) { alert(e.message); }
  };

  const handleStatus = async (e, id, status) => {
    e.stopPropagation();
    try { await apiPost({ action: 'update_shipment_status', shipment_id: id, status, notify_line: true }); load(); } catch (e2) { alert(e2.message); }
  };

  const handleExport = async () => {
    try {
      const result = await apiGet({ action: 'shipments', page: '1', search, status: statusF, date_from: dateFrom, date_to: dateTo, limit: '9999', export: 'true' });
      const rows = result.shipments || [];
      const columns = [
        { key: 'shipment_no', label: '出貨單號' },
        { key: (row) => (STATUS_MAP[row.status] || row.status), label: '狀態' },
        { key: (row) => fmtDate(row.ship_date || row.created_at), label: '出貨日期' },
        { key: 'carrier', label: '物流商' },
        { key: 'tracking_no', label: '物流單號' },
        { key: 'remark', label: '備註' },
      ];
      exportCsv(rows, columns, `出貨_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert(e.message); }
  };

  // ★ 明細頁
  if (selectedShipment) {
    return (
      <ShipmentDetailView
        shipment={selectedShipment}
        onBack={() => { setSelectedShipment(null); load(); }}
        onRefresh={() => load()}
      />
    );
  }

  const sm = data.summary || {};

  return (
    <div>
      <PageLead eyebrow="Shipments" title="出貨管理" description="追蹤訂單出貨進度、物流資訊與到貨狀態。"
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>
          <button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 建立出貨</button>
        </div>} />

      <div style={{ ...S.statGrid, gap: 10, marginBottom: 10 }}>
        <StatCard code="PEND" label="待出貨" value={fmt(sm.pending)} tone="blue" accent="#f59e0b" />
        <StatCard code="SHIP" label="已出貨" value={fmt(sm.shipped)} tone="blue" accent="#3b82f6" />
        <StatCard code="DELV" label="已送達" value={fmt(sm.delivered)} tone="blue" accent="#16a34a" />
      </div>

      {/* Filter bar */}
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="pending">待出貨</option>
            <option value="shipped">已出貨</option>
            <option value="delivered">已送達</option>
            <option value="cancelled">已取消</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusF, dateFrom, dateTo)} placeholder="搜尋..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }} />
          <button onClick={() => load(1, search, statusF, dateFrom, dateTo)} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 13 }}>查詢</button>
        </div>
      </div>

      {/* Shipment list as table */}
      {loading ? <Loading /> : data.shipments.length === 0 ? <EmptyState text="目前沒有出貨記錄" /> : (
        <div style={{ ...S.card, borderRadius: 14, padding: 0, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '40px 160px 100px minmax(0,1fr) 120px 100px 160px', gap: 10, padding: '8px 16px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            <div>#</div><div>出貨單號</div><div>物流商</div><div>追蹤編號</div><div>出貨日期</div><div>狀態</div><div>操作</div>
          </div>
          {/* Table rows */}
          {data.shipments.map((s, idx) => (
            <div key={s.id} onClick={() => setSelectedShipment(s)}
              style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '40px 160px 100px minmax(0,1fr) 120px 100px 160px', gap: 10, padding: '10px 16px', borderTop: '1px solid #f3f5f7', background: '#fff', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <div style={{ fontSize: 13, color: '#b0b8c4', fontWeight: 500 }}>{(data.page * (data.limit || pageSize)) + idx + 1}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{s.shipment_no || '-'}</div>
              <div style={{ fontSize: 14, color: '#374151' }}>{s.carrier || '-'}</div>
              <div style={{ fontSize: 14, color: '#374151', ...S.mono }}>{s.tracking_no || '-'}</div>
              <div style={{ fontSize: 13, color: '#6b7280', ...S.mono }}>{fmtDate(s.ship_date || s.created_at)}</div>
              <div>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${STATUS_COLOR[s.status] || '#6b7280'}14`, color: STATUS_COLOR[s.status] || '#6b7280', border: `1px solid ${STATUS_COLOR[s.status] || '#6b7280'}30` }}>
                  {STATUS_MAP[s.status] || s.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {s.status === 'pending' && <button onClick={(e) => handleStatus(e, s.id, 'shipped')} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11, borderColor: '#93c5fd', color: '#3b82f6' }}>出貨</button>}
                {s.status === 'shipped' && <button onClick={(e) => handleStatus(e, s.id, 'delivered')} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11, borderColor: '#86efac', color: '#16a34a' }}>送達</button>}
                {s.status !== 'cancelled' && s.status !== 'delivered' && s.status !== 'returned' && <button onClick={(e) => handleStatus(e, s.id, 'cancelled')} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11, borderColor: '#fecaca', color: '#ef4444' }}>取消</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Pager page={data.page} limit={data.limit || pageSize} total={data.total} onPageChange={(p) => load(p, search, statusF, dateFrom, dateTo)} />
      </div>

      {/* Create modal */}
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '90vw', borderRadius: 14, padding: '16px 18px 20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>建立出貨單</h3>
            {[
              { key: 'order_id', label: '訂單 ID', type: 'text' },
              { key: 'carrier', label: '物流商', type: 'text' },
              { key: 'tracking_no', label: '物流單號', type: 'text' },
              { key: 'shipping_address', label: '送貨地址', type: 'text' },
              { key: 'remark', label: '備註', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={S.label}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={S.input} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button>
              <button onClick={handleCreate} style={S.btnPrimary}>建立出貨</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
