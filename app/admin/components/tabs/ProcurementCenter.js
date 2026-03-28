'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';

const PO_FOCUS_KEY = 'qb_purchase_order_focus';
const PO_DIRECT_KEY = 'qb_po_direct_open';
const ORDER_FOCUS_KEY = 'qb_order_focus';
const ORDER_DIRECT_KEY = 'qb_order_direct_open';

const STATUS_BADGE = {
  waiting:  { label: '等待到貨', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  partial:  { label: '部分到貨', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  complete: { label: '已齊',     color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
};

const PO_STATUS_MAP = { draft: '草稿', pending_approval: '待審核', sent: '已寄出', confirmed: '已核准', shipped: '已出貨', received: '已到貨', rejected: '已駁回', cancelled: '已取消' };
const PO_STATUS_TAG = { draft: 'default', sent: 'blue', confirmed: 'green', shipped: 'yellow', received: 'green', rejected: 'red', cancelled: 'gray' };

export default function ProcurementCenter({ setTab }) {
  const [data, setData] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [page, setPage] = useState(1);
  const [expandedItem, setExpandedItem] = useState(null);
  const [allocationData, setAllocationData] = useState({});

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
    if (allocationData[item_number]) return; // already loaded
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

  return (
    <div>
      <PageLead eyebrow="Procurement Center" title="採購中心" description="所有採購品項的到貨、配貨總覽" />

      {/* Row 1: Progress + summary chips  |  Row 2: Filters + search */}
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>到貨進度</span>
          <div style={{ flex: 1, minWidth: 120, height: 7, borderRadius: 4, background: '#e5e7eb' }}>
            {sm.total_ordered > 0 && <div style={{ width: `${Math.min(Math.round((sm.total_received / sm.total_ordered) * 100), 100)}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #3b82f6, #16a34a)', transition: 'width 0.5s' }} />}
          </div>
          <span style={{ fontSize: 12, ...S.mono, color: '#6b7280', whiteSpace: 'nowrap' }}>{fmt(sm.total_received)}/{fmt(sm.total_ordered)} 件 <strong style={{ color: '#2563eb' }}>{sm.total_ordered > 0 ? Math.round((sm.total_received / sm.total_ordered) * 100) : 0}%</strong></span>
          <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>|</span>
          <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, whiteSpace: 'nowrap' }}>待到 {fmt(sm.waiting)}</span>
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>部分 {fmt(sm.partial)}</span>
          <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>已齊 {fmt(sm.complete)}</span>
          <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>|</span>
          <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>總額 <strong style={{ ...S.mono, color: '#1d4ed8' }}>{fmtP(sm.total_cost)}</strong></span>
        </div>
        {/* Row 2 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {[['', '全部'], ['waiting', '等待到貨'], ['partial', '部分到貨'], ['complete', '已齊']].map(([key, label]) => (
            <button key={key} onClick={() => { setStatusF(key); load(1, search, key); }} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 12, background: statusF === key ? '#3b82f6' : '#fff', color: statusF === key ? '#fff' : '#4b5563', borderColor: statusF === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, search, statusF)} placeholder="搜尋料號或品名..." style={{ ...S.input, maxWidth: 220, fontSize: 12, padding: '5px 10px' }} />
          <button onClick={() => load(1, search, statusF)} style={{ ...S.btnPrimary, padding: '5px 14px', fontSize: 12 }}>查詢</button>
        </div>
      </div>

      {/* Table */}
      {loading ? <Loading /> : data.rows?.length === 0 ? <EmptyState text="目前沒有採購中的品項" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) 70px 70px 70px 80px 80px 70px 90px', gap: 10, padding: '8px 16px', borderBottom: '2px solid #e6edf5', color: '#6b7280', fontSize: 12, fontWeight: 600, alignItems: 'center' }}>
            <div>料號</div>
            <div>品名</div>
            <div style={{ textAlign: 'center' }}>已採</div>
            <div style={{ textAlign: 'center' }}>已到</div>
            <div style={{ textAlign: 'center' }}>尚缺</div>
            <div style={{ textAlign: 'center' }}>客戶需求</div>
            <div style={{ textAlign: 'center' }}>待出貨</div>
            <div style={{ textAlign: 'center' }}>狀態</div>
            <div style={{ textAlign: 'center' }}>到貨率</div>
          </div>

          {data.rows.map((row, idx) => {
            const badge = STATUS_BADGE[row.procurement_status] || STATUS_BADGE.waiting;
            const pct = row.total_ordered > 0 ? Math.round((row.total_received / row.total_ordered) * 100) : 0;
            const isExpanded = expandedItem === row.item_number;
            const waiting = allocationData[row.item_number] || [];

            return (
              <div key={row.item_number}>
                {/* Main row */}
                <div
                  onClick={() => toggleExpand(row.item_number)}
                  style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) 70px 70px 70px 80px 80px 70px 90px', gap: 10, padding: '10px 16px', borderTop: idx > 0 ? '1px solid #f0f2f5' : 'none', alignItems: 'center', cursor: 'pointer', background: isExpanded ? '#f8fafc' : idx % 2 === 0 ? '#fff' : '#fafbfd', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                  onMouseLeave={e => e.currentTarget.style.background = isExpanded ? '#f8fafc' : idx % 2 === 0 ? '#fff' : '#fafbfd'}
                >
                  <div style={{ fontWeight: 700, ...S.mono, fontSize: 13, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.item_number}</div>
                  <div style={{ fontSize: 13, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description || '-'}</div>
                  <div style={{ textAlign: 'center', fontWeight: 600, ...S.mono, fontSize: 14, color: '#374151' }}>{row.total_ordered}</div>
                  <div style={{ textAlign: 'center', fontWeight: 700, ...S.mono, fontSize: 14, color: row.total_received > 0 ? '#059669' : '#9ca3af' }}>{row.total_received}</div>
                  <div style={{ textAlign: 'center', fontWeight: 700, ...S.mono, fontSize: 14, color: row.still_needed > 0 ? '#dc2626' : '#16a34a' }}>{row.still_needed}</div>
                  <div style={{ textAlign: 'center', ...S.mono, fontSize: 13, color: '#6b7280' }}>{row.demand_qty || 0}</div>
                  <div style={{ textAlign: 'center', fontWeight: 600, ...S.mono, fontSize: 13, color: row.waiting_to_ship > 0 ? '#b45309' : '#9ca3af' }}>{row.waiting_to_ship}</div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>{badge.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    <div style={{ flex: 1, maxWidth: 50, height: 6, borderRadius: 3, background: '#e5e7eb' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct >= 100 ? '#16a34a' : pct > 0 ? '#f59e0b' : '#e5e7eb', transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, ...S.mono, color: pct >= 100 ? '#16a34a' : '#6b7280' }}>{pct}%</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ background: '#f8fafc', borderTop: '1px solid #e5e7eb', padding: '12px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      {/* Left: PO list */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>相關採購單 ({row.po_count} 張)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {row.po_list.map(po => (
                            <div key={po.po_id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, cursor: 'pointer' }}
                              onClick={e => { e.stopPropagation(); window.localStorage.setItem(PO_DIRECT_KEY, JSON.stringify({ id: po.po_id, po_no: po.po_no, status: po.status, po_date: po.po_date, vendor_id: po.vendor_id })); setTab?.('purchase_orders'); }}
                              onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
                              onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                            >
                              <span style={{ fontWeight: 700, color: '#3b82f6', ...S.mono }}>{po.po_no}</span>
                              <span style={S.tag(PO_STATUS_TAG[po.status] || 'default')}>{PO_STATUS_MAP[po.status] || po.status}</span>
                              <span style={{ color: '#9ca3af', ...S.mono }}>{po.po_date?.slice(0, 10) || ''}</span>
                              {po.expected_date && <span style={{ color: '#6b7280', fontSize: 11 }}>預計 {po.expected_date.slice(0, 10)}</span>}
                              {po.vendor_name && <span style={{ color: '#374151', marginLeft: 'auto' }}>{po.vendor_name}</span>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right: FIFO allocation */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 8 }}>配貨建議 · 先訂先出 (FIFO)</div>
                        {waiting.length === 0 ? (
                          <div style={{ padding: '12px', background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>目前無待出貨訂單需要此品項</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {waiting.map((wo, i) => (
                              <div key={wo.order_id || i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', background: '#fff', borderRadius: 6, border: '1px solid #e9d5ff', fontSize: 12, cursor: 'pointer' }}
                                onClick={e => { e.stopPropagation(); if (wo.order_id) { window.localStorage.setItem(ORDER_DIRECT_KEY, JSON.stringify({ id: wo.order_id, order_no: wo.order_no })); setTab?.('orders'); } }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#7c3aed'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = '#e9d5ff'}
                              >
                                <span style={{ fontWeight: 700, color: '#7c3aed', ...S.mono, minWidth: 70 }}>{wo.order_no || '-'}</span>
                                <span style={{ color: '#374151' }}>{wo.customer_name}</span>
                                <span style={{ ...S.mono, fontWeight: 700, color: '#b45309' }}>需 {wo.qty_needed}</span>
                                <span style={{ color: '#9ca3af', marginLeft: 'auto', ...S.mono }}>{wo.created_at ? fmtDate(wo.created_at) : wo.order_date ? wo.order_date.slice(0, 10) : ''}</span>
                                <span style={{ fontSize: 10, color: '#6b7280' }}>#{i + 1}</span>
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
