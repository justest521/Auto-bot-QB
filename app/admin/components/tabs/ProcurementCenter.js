'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';

const PO_FOCUS_KEY = 'qb_purchase_order_focus';
const PO_DIRECT_KEY = 'qb_po_direct_open';
const ORDER_FOCUS_KEY = 'qb_order_focus';
const ORDER_DIRECT_KEY = 'qb_order_direct_open';

const STATUS_CFG = {
  waiting:  { label: '等待到貨', dot: t.color.error,   bg: '#fef2f2', ring: t.color.error },
  partial:  { label: '部分到貨', dot: '#d97706',       bg: '#fffbeb', ring: '#d97706' },
  complete: { label: '已齊',     dot: t.color.brand,    bg: '#f0fdf4', ring: t.color.brand },
};

const PO_STATUS_MAP = { draft: '草稿', pending_approval: '待審核', sent: '已寄出', confirmed: '已核准', shipped: '已出貨', received: '已到貨', rejected: '已駁回', cancelled: '已取消' };
const PO_STATUS_COLOR = { draft: { bg: '#f3f4f6', color: t.color.textMuted }, sent: { bg: '#dbeafe', color: '#2563eb' }, confirmed: { bg: t.color.successBg, color: t.color.brand }, shipped: { bg: t.color.warningBg, color: '#b45309' }, received: { bg: t.color.successBg, color: '#15803d' }, rejected: { bg: t.color.errorBg, color: t.color.error }, cancelled: { bg: '#f3f4f6', color: t.color.textDisabled } };

const GRID_COLS = '110px minmax(0,1fr) 58px 58px 58px 58px 58px 58px 88px 80px';

const SORT_COLS = [
  { key: 'item_number', label: '料號' },
  { key: 'description', label: '品名' },
  { key: 'stock_qty', label: '庫存', center: true },
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
    } else if (sortKey === 'item_number' || sortKey === 'description' || sortKey === 'latest_po_date') {
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

/* ── Mini ring progress (SVG) ── */
const RingProgress = ({ pct, size = 32, stroke = 3.5 }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  const color = pct >= 100 ? t.color.brand : pct >= 50 ? '#d97706' : pct > 0 ? t.color.error : t.color.border;
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={t.color.border} strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span style={{ position: 'absolute', fontSize: 9, fontWeight: t.fontWeight.bold, color, ...S.mono }}>{pct}%</span>
    </div>
  );
};

/* ── Summary stat card ── */
const StatCard = ({ label, value, sub, color, active, onClick }) => (
  <div onClick={onClick} style={{
    flex: 1, minWidth: 100, padding: '12px 16px', borderRadius: t.radius.lg, cursor: onClick ? 'pointer' : 'default',
    background: active ? `${color}10` : t.color.bgCard, border: `1.5px solid ${active ? color : t.color.border}`,
    transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 2,
  }}>
    <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, fontWeight: t.fontWeight.medium }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: t.fontWeight.bold, color, ...S.mono, lineHeight: 1.2 }}>{value}</div>
    {sub && <div style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, ...S.mono }}>{sub}</div>}
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
  const [sortKey, setSortKey] = useState('latest_po_date');
  const [sortDir, setSortDir] = useState('desc');

  const load = useCallback(async (pg = page, q = search, st = statusF) => {
    setLoading(true);
    try {
      const params = { action: 'procurement_center', page: String(pg), search: q };
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
    if (expandedItem === item_number) { setExpandedItem(null); }
    else { setExpandedItem(item_number); loadAllocation(item_number); }
  };

  const sm = data.summary || {};
  const overallPct = sm.total_ordered > 0 ? Math.round((sm.total_received / sm.total_ordered) * 100) : 0;
  const pctColor = overallPct >= 80 ? t.color.brand : overallPct >= 30 ? '#d97706' : t.color.error;

  /* Segmented progress: waiting | partial | complete */
  const total = (sm.waiting || 0) + (sm.partial || 0) + (sm.complete || 0);
  const segW = total > 0 ? ((sm.waiting || 0) / total) * 100 : 0;
  const segP = total > 0 ? ((sm.partial || 0) / total) * 100 : 0;
  const segC = total > 0 ? ((sm.complete || 0) / total) * 100 : 0;

  return (
    <div>
      <PageLead eyebrow="Procurement Center" title="採購中心" description="所有採購品項的到貨、配貨總覽" />

      {/* ══ Summary Section ══ */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexDirection: isMobile ? 'column' : 'row' }}>
        <StatCard label="等待到貨" value={fmt(sm.waiting)} color={t.color.error} active={statusF === 'waiting'} onClick={() => { const nv = statusF === 'waiting' ? '' : 'waiting'; setStatusF(nv); load(1, search, nv); }} />
        <StatCard label="部分到貨" value={fmt(sm.partial)} color="#d97706" active={statusF === 'partial'} onClick={() => { const nv = statusF === 'partial' ? '' : 'partial'; setStatusF(nv); load(1, search, nv); }} />
        <StatCard label="已齊" value={fmt(sm.complete)} color={t.color.brand} active={statusF === 'complete'} onClick={() => { const nv = statusF === 'complete' ? '' : 'complete'; setStatusF(nv); load(1, search, nv); }} />
        <StatCard label="採購總額" value={fmtP(sm.total_cost)} sub={`${fmt(sm.total_received)} / ${fmt(sm.total_ordered)} 件到貨`} color={t.color.link} />
      </div>

      {/* ══ Progress Bar (segmented) ══ */}
      <div style={{ ...S.card, marginBottom: 12, padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>到貨進度</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: t.fontWeight.bold, ...S.mono, color: pctColor, lineHeight: 1 }}>{overallPct}%</span>
            <span style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, ...S.mono }}>{fmt(sm.total_received)}/{fmt(sm.total_ordered)}</span>
          </div>
        </div>
        {/* Segmented bar */}
        <div style={{ display: 'flex', height: 10, borderRadius: t.radius.pill, overflow: 'hidden', background: t.color.bgMuted, gap: 1 }}>
          {segC > 0 && <div style={{ width: `${segC}%`, background: `linear-gradient(90deg, ${t.color.brand}, #4ade80)`, transition: 'width 0.5s ease', borderRadius: segW === 0 && segP === 0 ? t.radius.pill : `${t.radius.pill}px 0 0 ${t.radius.pill}px` }} />}
          {segP > 0 && <div style={{ width: `${segP}%`, background: 'linear-gradient(90deg, #f59e0b, #fbbf24)', transition: 'width 0.5s ease' }} />}
          {segW > 0 && <div style={{ width: `${segW}%`, background: `linear-gradient(90deg, ${t.color.error}, #f87171)`, transition: 'width 0.5s ease', borderRadius: segC === 0 && segP === 0 ? t.radius.pill : `0 ${t.radius.pill}px ${t.radius.pill}px 0` }} />}
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: t.fontSize.tiny, color: t.color.textMuted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color.brand }} /> 已齊 {fmt(sm.complete)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> 部分 {fmt(sm.partial)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color.error }} /> 待到 {fmt(sm.waiting)}</span>
        </div>
      </div>

      {/* ══ Search + Filter ══ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: isMobile ? '100%' : 320 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, search, statusF)} placeholder="搜尋料號或品名..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: '100%', fontSize: t.fontSize.caption, padding: '8px 12px 8px 34px', borderRadius: t.radius.md }} />
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: t.color.textDisabled, pointerEvents: 'none' }}>&#x2315;</span>
        </div>
        <button onClick={() => load(1, search, statusF)} style={{ ...S.btnPrimary, padding: '8px 20px', fontSize: t.fontSize.caption, borderRadius: t.radius.md, minHeight: isMobile ? 42 : 'auto' }}>查詢</button>
        {search && <button onClick={() => { setSearch(''); load(1, '', statusF); }} style={{ ...S.btnGhost, padding: '8px 16px', fontSize: t.fontSize.caption, borderRadius: t.radius.md, color: t.color.textMuted }}>清除</button>}
        {statusF && <button onClick={() => { setStatusF(''); load(1, search, ''); }} style={{ ...S.btnGhost, padding: '8px 16px', fontSize: t.fontSize.caption, borderRadius: t.radius.md, color: t.color.textMuted }}>重置篩選</button>}
      </div>

      {/* ══ Table ══ */}
      {loading ? <Loading /> : data.rows?.length === 0 ? <EmptyState text="目前沒有採購中的品項" /> : (
        <div style={{ ...S.card, padding: 0, overflow: isMobile ? 'auto' : 'hidden', border: `1px solid ${t.color.border}`, ...(isMobile ? { overflowX: 'auto', WebkitOverflowScrolling: 'touch' } : {}) }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 0, background: t.color.bgMuted, borderBottom: `2px solid ${t.color.border}`, alignItems: 'center', minWidth: isMobile ? 'min-content' : 'auto' }}>
            {SORT_COLS.map((col, ci) => (
              <div key={col.key}
                onClick={() => { if (sortKey === col.key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); } else { setSortKey(col.key); setSortDir('desc'); } }}
                style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: col.center ? 'flex-end' : 'flex-start', gap: 3, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: sortKey === col.key ? t.color.link : t.color.textMuted, transition: 'color 0.15s', whiteSpace: 'nowrap', padding: '10px 10px', borderRight: ci < SORT_COLS.length - 1 ? `1px solid ${t.color.border}` : 'none' }}
              >
                {col.label}
                <span style={{ fontSize: 8, opacity: sortKey === col.key ? 1 : 0.3 }}>
                  {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {sortRows(data.rows, sortKey, sortDir).map((row, idx) => {
            const cfg = STATUS_CFG[row.procurement_status] || STATUS_CFG.waiting;
            const pct = row.total_ordered > 0 ? Math.round((row.total_received / row.total_ordered) * 100) : 0;
            const isExpanded = expandedItem === row.item_number;
            const waiting = allocationData[row.item_number] || [];

            return (
              <div key={row.item_number}>
                <div
                  onClick={() => toggleExpand(row.item_number)}
                  style={{
                    display: 'grid', gridTemplateColumns: GRID_COLS, gap: 0,
                    borderTop: idx > 0 ? `1px solid ${t.color.borderLight}` : 'none', alignItems: 'center', cursor: 'pointer',
                    background: isExpanded ? '#eef2ff' : idx % 2 === 0 ? t.color.bgCard : t.color.bgMuted,
                    transition: 'all 0.15s',
                    borderLeft: isExpanded ? `3px solid ${t.color.link}` : '3px solid transparent',
                    minWidth: isMobile ? 'min-content' : 'auto',
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#f0f7ff'; }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = isExpanded ? '#eef2ff' : idx % 2 === 0 ? t.color.bgCard : t.color.bgMuted; }}
                >
                  {/* -- Cells with dividers -- */}
                  {(() => {
                    const bdr = { borderRight: `1px solid ${t.color.borderLight}` };
                    const numCell = (val, color, bold) => ({ textAlign: 'right', fontWeight: bold ? t.fontWeight.bold : t.fontWeight.semibold, ...S.mono, fontSize: t.fontSize.body, color: val > 0 ? color : t.color.borderLight, padding: '12px 10px', ...bdr });
                    const zero = (v) => v > 0 ? v.toLocaleString() : '-';
                    return <>
                      <div style={{ fontWeight: t.fontWeight.bold, ...S.mono, fontSize: t.fontSize.caption, color: t.color.link, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '12px 10px', ...bdr }}>{row.item_number}</div>
                      <div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '12px 10px', ...bdr }}>{row.description || '-'}</div>
                      <div style={numCell(row.stock_qty, t.color.link, false)}>{zero(row.stock_qty)}</div>
                      <div style={numCell(row.total_ordered, t.color.textSecondary, false)}>{zero(row.total_ordered)}</div>
                      <div style={numCell(row.total_received, t.color.success, true)}>{zero(row.total_received)}</div>
                      <div style={numCell(row.still_needed, row.still_needed > 0 ? t.color.error : t.color.brand, true)}>{zero(row.still_needed)}</div>
                      <div style={numCell(row.demand_qty, t.color.textMuted, false)}>{zero(row.demand_qty)}</div>
                      <div style={numCell(row.waiting_to_ship, '#d97706', false)}>{zero(row.waiting_to_ship)}</div>
                      {/* Status */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '12px 6px', ...bdr }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, color: cfg.dot, whiteSpace: 'nowrap' }}>{cfg.label}</span>
                      </div>
                      {/* Ring */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 6px' }}>
                        <RingProgress pct={pct} />
                      </div>
                    </>;
                  })()}
                </div>

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div style={{ background: 'linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)', borderTop: `1px solid ${t.color.border}`, padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
                      {/* Left: PO list */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <span style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: t.color.link }}>相關採購單</span>
                          <span style={{ fontSize: t.fontSize.tiny, padding: '1px 8px', borderRadius: t.radius.pill, background: '#dbeafe', color: '#2563eb', fontWeight: t.fontWeight.semibold }}>{row.po_count} 張</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {row.po_list.map(po => {
                            const sc = PO_STATUS_COLOR[po.status] || { bg: '#f3f4f6', color: t.color.textMuted };
                            return (
                              <div key={po.po_id}
                                onClick={e => { e.stopPropagation(); window.localStorage.setItem(PO_DIRECT_KEY, JSON.stringify({ id: po.po_id, po_no: po.po_no, status: po.status, po_date: po.po_date, vendor_id: po.vendor_id })); setTab?.('purchase_orders'); }}
                                style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: t.color.bgCard, borderRadius: t.radius.md, border: `1px solid ${t.color.border}`, fontSize: t.fontSize.caption, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = t.color.link; e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.12)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = t.color.border; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)'; }}
                              >
                                <span style={{ fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{po.po_no}</span>
                                <span style={{ padding: '1px 6px', borderRadius: t.radius.sm, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, background: sc.bg, color: sc.color }}>{PO_STATUS_MAP[po.status] || po.status}</span>
                                <span style={{ color: t.color.textDisabled, ...S.mono, fontSize: t.fontSize.tiny }}>{po.po_date?.slice(0, 10) || ''}</span>
                                {po.vendor_name && <span style={{ color: t.color.textSecondary, marginLeft: 'auto', fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.medium }}>{po.vendor_name}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: FIFO allocation */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <span style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: t.color.purple }}>配貨建議</span>
                          <span style={{ fontSize: t.fontSize.tiny, padding: '1px 8px', borderRadius: t.radius.pill, background: '#ede9fe', color: '#7c3aed', fontWeight: t.fontWeight.semibold }}>FIFO</span>
                        </div>
                        {waiting.length === 0 ? (
                          <div style={{ padding: '16px', background: t.color.bgCard, borderRadius: t.radius.md, border: `1px dashed ${t.color.border}`, fontSize: t.fontSize.caption, color: t.color.textDisabled, textAlign: 'center' }}>目前無待出貨訂單需要此品項</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {waiting.map((wo, i) => (
                              <div key={wo.order_id || i}
                                onClick={e => { e.stopPropagation(); if (wo.order_id) { window.localStorage.setItem(ORDER_DIRECT_KEY, JSON.stringify({ id: wo.order_id, order_no: wo.order_no })); setTab?.('orders'); } }}
                                style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: t.color.bgCard, borderRadius: t.radius.md, border: `1px solid #e9d5ff`, fontSize: t.fontSize.caption, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = t.color.purple; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.12)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e9d5ff'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)'; }}
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#ede9fe', color: t.color.purple, fontSize: 10, fontWeight: t.fontWeight.bold }}>#{i + 1}</span>
                                <span style={{ fontWeight: t.fontWeight.bold, color: t.color.purple, ...S.mono, fontSize: t.fontSize.tiny }}>{wo.order_no || '-'}</span>
                                <span style={{ color: t.color.textSecondary, fontSize: t.fontSize.caption }}>{wo.customer_name}</span>
                                <span style={{ padding: '1px 6px', borderRadius: t.radius.sm, background: t.color.warningBg, color: '#b45309', fontWeight: t.fontWeight.bold, ...S.mono, fontSize: t.fontSize.tiny }}>x{wo.qty_needed}</span>
                                <span style={{ color: t.color.textDisabled, marginLeft: 'auto', ...S.mono, fontSize: t.fontSize.tiny }}>{wo.created_at ? fmtDate(wo.created_at) : wo.order_date ? wo.order_date.slice(0, 10) : ''}</span>
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

      <Pager page={data.page || 1} limit={data.limit || 50} total={data.total || 0} onPageChange={pg => { setPage(pg); load(pg, search, statusF); }} />
    </div>
  );
}
