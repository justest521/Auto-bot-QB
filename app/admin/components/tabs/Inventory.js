'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, ComingSoonBanner } from '../shared/ui';
import { StatCard } from '../shared/ui';

export default function Inventory() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ items: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [adjOpen, setAdjOpen] = useState(null);
  const [adjQty, setAdjQty] = useState('');
  const [adjType, setAdjType] = useState('in');
  const [adjNotes, setAdjNotes] = useState('');

  const load = useCallback(async (page = 1, q = search, f = filter) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'inventory', page: String(page), search: q, filter: f, limit: '30' })); } finally { setLoading(false); }
  }, [search, filter]);

  useEffect(() => { load(); }, []);

  const handleAdjust = async () => {
    if (!adjOpen || !adjQty) return;
    try {
      await apiPost({ action: 'inventory_adjust', item_number: adjOpen, movement_type: adjType, quantity: adjQty, notes: adjNotes });
      setAdjOpen(null); setAdjQty(''); setAdjNotes('');
      load(data.page, search, filter);
    } catch (e) { alert(e.message); }
  };

  const handleExport = async () => {
    try {
      const all = await apiGet({ action: 'inventory', page: '1', search, filter, limit: '9999', export: 'true' });
      exportCsv(all.items || [], [
        { key: 'item_number', label: '料號' },
        { key: 'description', label: '品名' },
        { key: 'category', label: '分類' },
        { key: 'stock_qty', label: '庫存數量' },
        { key: 'safety_stock', label: '安全水位' },
        { key: 'product_status', label: '狀態' },
      ], `庫存清單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  const sm = data.summary || {};
  return (
    <div>
      <PageLead eyebrow="Inventory" title="庫存管理" description="即時掌握所有商品庫存量、安全庫存水位，並可手動進行入庫/出庫異動。"
        action={<button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>} />
      <ComingSoonBanner tabId="inventory" />
      <div style={{ ...S.statGrid, gridTemplateColumns: isMobile ? '1fr 1fr' : S.statGrid.gridTemplateColumns }}>
        <StatCard code="ALL" label="總商品數" value={fmt(sm.total_products)} tone="blue" />
        <StatCard code="LOW" label="低於安全水位" value={fmt(sm.low_stock)} tone="blue" accent="#f59e0b" />
        <StatCard code="OUT" label="零庫存商品" value={fmt(sm.out_of_stock)} tone="blue" accent="#ef4444" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, filter)} placeholder="搜尋料號或品名..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), flex: 1 }} />
        <select value={filter} onChange={(e) => { setFilter(e.target.value); load(1, search, e.target.value); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 160 }}>
          <option value="all">全部</option>
          <option value="low_stock">低庫存</option>
          <option value="out_of_stock">零庫存</option>
        </select>
        <button onClick={() => load(1, search, filter)} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}) }}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.items.length === 0 ? <EmptyState text="沒有符合條件的商品" /> : (
        isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.items.map(it => (
              <div key={it.item_number} style={{ ...S.mobileCard, padding: '12px' }}>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>料號</span>
                  <span style={{ ...S.mobileCardValue, color: '#3b82f6', fontWeight: 600, ...S.mono }}>{it.item_number}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>品名</span>
                  <span style={S.mobileCardValue}>{it.description || '-'}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>分類</span>
                  <span style={S.mobileCardValue}>{it.category || '-'}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>庫存</span>
                  <span style={{ ...S.mobileCardValue, fontWeight: 700, color: Number(it.stock_qty || 0) <= 0 ? '#ef4444' : Number(it.stock_qty) <= Number(it.safety_stock) ? '#f59e0b' : '#16a34a' }}>{it.stock_qty ?? 0}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>安全水位</span>
                  <span style={S.mobileCardValue}>{it.safety_stock ?? 0}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>狀態</span>
                  <span style={S.mobileCardValue}><span style={S.tag(it.product_status === 'Current' ? 'green' : 'default')}>{it.product_status || '-'}</span></span>
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e5e7eb' }}>
                  <button onClick={() => setAdjOpen(it.item_number)} style={{ ...S.btnPrimary, width: '100%', minHeight: 44 }}>異動</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={S.tableScroll}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
              <thead><tr style={{ background: '#f3f4f6' }}>
                {['料號','品名','分類','庫存','安全水位','狀態','操作'].map(h => <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', fontWeight: 700, borderBottom: '1px solid #dbe3ee' }}>{h}</th>)}
              </tr></thead>
              <tbody>{data.items.map(it => (
                <tr key={it.item_number} style={{ borderBottom: '1px solid #edf0f5' }}>
                  <td style={{ padding: '10px 16px', ...S.mono, color: '#3b82f6', fontWeight: 600 }}>{it.item_number}</td>
                  <td style={{ padding: '10px 16px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.description || '-'}</td>
                  <td style={{ padding: '10px 16px', color: '#374151' }}>{it.category || '-'}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: Number(it.stock_qty || 0) <= 0 ? '#ef4444' : Number(it.stock_qty) <= Number(it.safety_stock) ? '#f59e0b' : '#16a34a' }}>{it.stock_qty ?? 0}</td>
                  <td style={{ padding: '10px 16px', color: '#374151' }}>{it.safety_stock ?? 0}</td>
                  <td style={{ padding: '10px 16px' }}><span style={S.tag(it.product_status === 'Current' ? 'green' : 'default')}>{it.product_status || '-'}</span></td>
                  <td style={{ padding: '10px 16px' }}><button onClick={() => setAdjOpen(it.item_number)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 12 }}>異動</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, filter)} />
      {adjOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(isMobile ? S.mobileModalOverlay : {}) }}>
          <div style={{ ...S.card, ...(isMobile ? S.mobileModal : {}), width: isMobile ? undefined : 400, maxWidth: '90vw', borderRadius: 14, padding: '16px 18px 20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>庫存異動 — {adjOpen}</h3>
            <div style={{ marginBottom: 10 }}>
              <label style={{ ...S.label, marginBottom: 6 }}>異動類型</label>
              <select value={adjType} onChange={(e) => setAdjType(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}>
                <option value="in">入庫 (增加)</option>
                <option value="out">出庫 (減少)</option>
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ ...S.label, marginBottom: 6 }}>數量</label>
              <input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} placeholder="輸入數量" min="1" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ ...S.label, marginBottom: 6 }}>備註</label>
              <input value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} placeholder="選填" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: isMobile ? 'stretch' : 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => setAdjOpen(null)} style={{ ...S.btnGhost, ...(isMobile ? { minHeight: 44, flex: 1 } : {}) }}>取消</button>
              <button onClick={handleAdjust} style={{ ...S.btnPrimary, ...(isMobile ? { minHeight: 44, flex: 1 } : {}) }}>確認異動</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
