'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';

const PO_FOCUS_KEY = 'qb_purchase_order_focus';
const PO_DIRECT_KEY = 'qb_po_direct_open';
const ORDER_FOCUS_KEY = 'qb_order_focus';
const ORDER_DIRECT_KEY = 'qb_order_direct_open';

const STATUS_BADGE = {
  waiting:  { label: '等待到貨', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '⏳' },
  partial:  { label: '部分到貨', color: '#b45309', bg: '#fffbeb', border: '#fde68a', icon: '📦' },
  complete: { label: '已齊',     color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', icon: '✓' },
};

const PO_STATUS_MAP = { draft: '草稿', pending_approval: '待審核', sent: '已寄出', confirmed: '已核准', shipped: '已出貨', received: '已到貨', rejected: '已駁回', cancelled: '已取消' };
const PO_STATUS_COLOR = { draft: { bg: '#f3f4f6', color: '#6b7280' }, sent: { bg: '#dbeafe', color: '#2563eb' }, confirmed: { bg: '#dcfce7', color: '#16a34a' }, shipped: { bg: '#fef3c7', color: '#b45309' }, received: { bg: '#dcfce7', color: '#15803d' }, rejected: { bg: '#fee2e2', color: '#dc2626' }, cancelled: { bg: '#f3f4f6', color: '#9ca3af' } };

const GRID_COLS = '120px minmax(0,1fr) 60px 60px 60px 70px 70px 80px 100px';

const SORT_COLS = [
  { key: 'item_number', label: '料號' },
  { key: 'description', label: '品名' },
  { key: 'total_ordered', label: '已採', center: true },
  { key: 'total_received', label: '已到', center: true },
  { key: 'still_needed', label: '尚缺', center: true },
  { key: 'demand_qty', label: '需求', center: true },
  { key: 'waiting_to_ship', label: '待出', center: true },
  { key: 'procurement_status', label: '狀態', center: true },
  { key: 'pct', label: '到貨率', center: true },
];

function sortRows(rows, sortKey, sortDir) {
  const statusOrder = { waiting: 0, partial: 1, complete: 2 };
  return [...rows].sort((a, b) => {
    let va, vb;
    if (sortKey === 'procurement_status') {
      va = statusOrder[a.procurement_status] ?? 0;
      vb = statusOrder[b.procurement_status] ?? 0;
    } else if (sortKey === 'pct') {
      va = a.total_ordered > 0 ? a.total_received / a.total_ordered : 0;
      vb = b.total_ordered > 0 ? b.total_received / b.total_ordered : 0;
    } else if (sortKey === 'item_number' || sortKey === 'description') {
      va = (a[sortKey] || '').toLowerCase();
      vb = (b[sortKey] || '').toLowerCase();
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    } else {
      va = Number(a[sortKey]) || 0;
      vb = Number(b[sortKey]) || 0;
    }
    return sortDir === 'asc' ? va - vb : vb - va;
  });
}

/* ── Reusable pill chip ── */
const Chip = ({ label, value, color, icon }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: `${color}10`, border: `1px solid ${color}30` }}>
    {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
    <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 700, color, ...S.mono }}>{value}</span>
  </div>
);

export default function ProcurementCenter({ setTab }) {
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [page, setPage] = useState(1);
  const [expandedItem, setExpandedItem] = useState(null);
  const [allocationData, setAllocationData] = useState({});
  const [sortKey, setSortKey] = useState('total_received');
  const [sortDir, setSortDir] = useState('desc');

  const load = useCallback(async (p = page, q = search, st = statusF) => {
    setLoading(true);
    try {
      const params = { action: 'procurement_center', page: String(p), search: q };
      if (st) params.status = st;
      setData(await apiGet(params));
    } finally { setLoading(false); }
  }, [search, statusF, page]);

  useEffect(() => { load(1); }, []);

  const loadAllocation = async (item_number) => {
    if (allocationData[item_number]) return;
    try {
      const res = await apiGet({ action: 'po_item_allocation', item_number });
      setAllocationData(prev => ({ ...prev, [item_number]: res.waiting_orders || [] }));
    } catch (_) {}
  };

  const toggleExpand = (item_number) => {
    if (expandedItem === item_number) {
      setExpandedItem(null);
    } else {
      setExpandedItem(item_number);
      loadAllocation(item_number);
    }
  };

  const sm = data.summary || {};
  const overallPct = sm.total_ordered > 0 ? Math.round((sm.total_received / sm.total_ordered) * 100) : 0;

  return (
    <div>
      <PageLead eyebrow="Procurement Center" title="採購中心" description="所有採購品項的到貨、配貨總覽" />

      {/* ── Summary Card ── */}
      <div style={{ ...S.card, marginBottom: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Progress row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>到貨進度</span>
          <div style={{ flex: 1, minWidth: 100, height: 8, borderRadius: 4, background: '#e5e7eb', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(overallPct, 100)}%`, height: '100%', borderRadius: 4, background: overallPct >= 80 ? 'linear-gradient(90deg, #16a34a, #22c55e)' : overallPct >= 30 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #ef4444, #f87171)', transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 800, ...S.mono, color: overallPct >= 80 ? '#16a34a' : overallPct >= 30 ? '#b45309' : '#dc2626', whiteSpace: 'nowrap' }}>{overallPct}%</span>
            <span style={{ fontSize: 12, ...S.mono, color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmt(sm.total_received)}/{fmt(sm.total_ordered)}</span>
          </div>
        </div>
        {/* Chips + filters row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Chip icon="⏳" label="待到" value={fmt(sm.waiting)} color="#dc2626" />
          <Chip icon="📦" label="部分" value={fmt(sm.partial)} color="#f59e0b" />
          <Chip icon="✓" label="已齊" value={fmt(sm.complete)} color="#16a34a" />
          <Chip label="總額" value={fmtP(sm.total_cost)} color="#2563eb" />
          <div style={{ flex: 1, display: isMobile ? 'none' : 'block' }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
            {[['', '全部'], ['waiting', '等待到貨'], ['partial', '部分到貨'], ['complete', '已齊']].map(([key, label]) => (
              <button key={key} onClick={() => { setStatusF(key); load(1, search, key); }} style={{
                padding: '4px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid',
                cursor: 'pointer', transition: 'all 0.15s', flex: isMobile ? 1 : 'auto',
                background: statusF === key ? '#1d4ed8' : '#fff',
                color: statusF === key ? '#fff' : '#6b7280',
                borderColor: statusF === key ? '#1d4ed8' : '#e5e7eb',
              }}>{label}</button>
            ))}
          </div>
        </div>
        {/* Search row */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 300, width: isMobile ? '100%' : 'auto' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, search, statusF)} placeholder="搜尋料號或品名..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: '100%', fontSize: 12, padding: isMobile ? '10px 12px 10px 30px' : '6px 10px 6px 30px', borderRadius: 6 }} />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af', pointerEvents: 'none' }}>&#x1F50D;</span>
          </div>
          <button onClick={() => load(1, search, statusF)} style={{ ...S.btnPrimary, ...(isMobile ? { width: '100%', minHeight: 44 } : {}), padding: isMobile ? '12px 16px' : '6px 18px', fontSize: 12, borderRadius: 6 }}>查詢</button>
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? <Loading /> : data.rows?.length === 0 ? <EmptyState text="目前沒有採購中的品項" /> : (
        <div style={{ ...S.card, padding: 0, overflow: isMobile ? 'auto' : 'hidden', border: '1px solid #e5e7eb', ...(isMobile ? { overflowX: 'auto', WebkitOverflowScrolling: 'touch' } : {}) }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 0, padding: '10px 16px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', alignItems: 'center', minWidth: isMobile ? 'min-content' : 'auto' }}>
            {SORT_COLS.map(col => (
              <div key={col.key}
                onClick={() => { if (sortKey === col.key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); } else { setSortKey(col.key); setSortDir('desc'); } }}
                style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: col.center ? 'center' : 'flex-start', gap: 3, fontSize: 12, fontWeight: 700, color: sortKey === col.key ? '#1d4ed8' : '#6b7280', transition: 'color 0.15s' }}
              >
                {col.label}
                <span style={{ fontSize: 9, opacity: sortKey === col.key ? 1 : 0.3, transition: 'opacity 0.15s' }}>
                  {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {sortRows(data.rows, sortKey, sortDir).map((row, idx) => {
            const badge = STATUS_BADGE[row.procurement_status] || STATUS_BADGE.waiting;
            const pct = row.total_ordered > 0 ? Math.round((row.total_received / row.total_ordered) * 100) : 0;
            const isExpanded = expandedItem === row.item_number;
            const waiting = allocationData[row.item_number] || [];
            const pctColor = pct >= 100 ? '#16a34a' : pct >= 50 ? '#f59e0b' : pct > 0 ? '#ea580c' : '#e5e7eb';

            return (
              <div key={row.item_number}>
                {/* Main row */}
                <div
                  onClick={() => toggleExpand(row.item_number)}
                  style={{
                    display: 'grid', gridTemplateColumns: GRID_COLS, gap: 0, padding: '10px 16px',
                    borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none', alignItems: 'center', cursor: 'pointer',
                    background: isExpanded ? '#eef2ff' : idx % 2 === 0 ? '#fff' : '#fafbfd',
                    transition: 'all 0.15s',
                    borderLeft: isExpanded ? '3px solid #3b82f6' : '3px solid transparent',
                    minWidth: isMobile ? 'min-content' : 'auto',
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#f0f7ff'; }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'; }}
                >
                  <div style={{ fontWeight: 700, ...S.mono, fontSize: 12, color: '#1e40af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.item_number}</div>
                  <div style={{ fontSize: 12, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{row.description || '-'}</div>
                  <div style={{ textAlign: 'center', fontWeight: 600, ...S.mono, fontSize: 13, color: '#374151' }}>{row.total_ordered}</div>
                  <div style={{ textAlign: 'center', fontWeight: 700, ...S.mono, fontSize: 13, color: row.total_received > 0 ? '#059669' : '#d1d5db' }}>{row.total_received}</div>
                  <div style={{ textAlign: 'center', fontWeight: 700, ...S.mono, fontSize: 13, color: row.still_needed > 0 ? '#dc2626' : '#16a34a' }}>{row.still_needed}</div>
                  <div style={{ textAlign: 'center', ...S.mono, fontSize: 12, color: '#6b7280' }}>{row.demand_qty || 0}</div>
                  <div style={{ textAlign: 'center', fontWeight: 600, ...S.mono, fontSize: 12, color: row.waiting_to_ship > 0 ? '#b45309' : '#d1d5db' }}>{row.waiting_to_ship}</div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 9 }}>{badge.icon}</span>{badge.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                    <div style={{ width: 40, height: 5, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3, background: pctColor, transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, ...S.mono, color: pctColor, minWidth: 28 }}>{pct}%</span>
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div style={{ background: 'linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)', borderTop: '1px solid #c7d2fe', padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
                      {/* Left: PO list */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>相關採購單</span>
                          <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: '#dbeafe', color: '#2563eb', fontWeight: 600 }}>{row.po_count} 張</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {row.po_list.map(po => {
                            const sc = PO_STATUS_COLOR[po.status] || { bg: '#f3f4f6', color: '#6b7280' };
                            return (
                              <div key={po.po_id}
                                onClick={e => { e.stopPropagation(); window.localStorage.setItem(PO_DIRECT_KEY, JSON.stringify({ id: po.po_id, po_no: po.po_no, status: po.status, po_date: po.po_date, vendor_id: po.vendor_id })); setTab?.('purchase_orders'); }}
                                style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.12)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)'; }}
                              >
                                <span style={{ fontWeight: 700, color: '#1e40af', ...S.mono, fontSize: 12 }}>{po.po_no}</span>
                                <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{PO_STATUS_MAP[po.status] || po.status}</span>
                                <span style={{ color: '#9ca3af', ...S.mono, fontSize: 11 }}>{po.po_date?.slice(0, 10) || ''}</span>
                                {po.vendor_name && <span style={{ color: '#374151', marginLeft: 'auto', fontSize: 11, fontWeight: 500 }}>{po.vendor_name}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: FIFO allocation */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9' }}>配貨建議</span>
                          <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: '#ede9fe', color: '#7c3aed', fontWeight: 600 }}>FIFO</span>
                        </div>
                        {waiting.length === 0 ? (
                          <div style={{ padding: '16px', background: '#fff', borderRadius: 8, border: '1px dashed #d1d5db', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>目前無待出貨訂單需要此品項</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {waiting.map((wo, i) => (
                              <div key={wo.order_id || i}
                                onClick={e => { e.stopPropagation(); if (wo.order_id) { window.localStorage.setItem(ORDER_DIRECT_KEY, JSON.stringify({ id: wo.order_id, order_no: wo.order_no })); setTab?.('orders'); } }}
                                style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e9d5ff', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.12)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e9d5ff'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)'; }}
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#ede9fe', color: '#7c3aed', fontSize: 10, fontWeight: 700 }}>#{i + 1}</span>
                                <span style={{ fontWeight: 700, color: '#6d28d9', ...S.mono, fontSize: 11 }}>{wo.order_no || '-'}</span>
                                <span style={{ color: '#374151', fontSize: 12 }}>{wo.customer_name}</span>
                                <span style={{ padding: '1px 6px', borderRadius: 4, background: '#fef3c7', color: '#b45309', fontWeight: 700, ...S.mono, fontSize: 11 }}>x{wo.qty_needed}</span>
                                <span style={{ color: '#9ca3af', marginLeft: 'auto', ...S.mono, fontSize: 10 }}>{wo.created_at ? fmtDate(wo.created_at) : wo.order_date ? wo.order_date.slice(0, 10) : ''}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Pager page={data.page || 1} limit={data.limit || 50} total={data.total || 0} onPageChange={p => { setPage(p); load(p, search, statusF); }} />
    </div>
  );
}
