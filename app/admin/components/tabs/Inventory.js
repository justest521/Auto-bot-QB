'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, ComingSoonBanner, ProductEditModal } from '../shared/ui';
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
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [expanded, setExpanded] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const tableRef = useRef(null);

  // Close expanded card when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        setExpanded(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleSort = (key) => {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortKey(key); setSortDir('asc'); }
  };

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
        { key: 'cost_price', label: '最近進貨成本' },
        { key: 'product_status', label: '狀態' },
      ], `庫存清單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  const sorted = [...(data.items || [])].sort((a, b) => {
    if (!sortKey) return 0;
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'stock_qty' || sortKey === 'safety_stock' || sortKey === 'cost_price') { av = Number(av || 0); bv = Number(bv || 0); }
    else { av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase(); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const stockColor = (it) => {
    const qty = Number(it.stock_qty || 0);
    const safe = Number(it.safety_stock || 0);
    if (qty <= 0) return t.color.error;
    if (qty <= safe) return t.color.warning;
    return t.color.brand;
  };

  const STATUS_LABEL = { Current: '上架中', 'New Announced': '新品預告', Legacy: '舊型', Discontinued: '已停產' };

  const sm = data.summary || {};
  return (
    <div>
      <PageLead eyebrow="Inventory" title="庫存管理" description="即時掌握所有商品庫存量、安全庫存水位，並可手動進行入庫/出庫異動。"
        action={<button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>} />
      <ComingSoonBanner tabId="inventory" />
      {saveMessage ? <div style={{ padding: '8px 14px', marginBottom: 12, borderRadius: t.radius.md, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: t.fontSize.caption }}>{saveMessage}</div> : null}
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
        <div ref={tableRef}>
          {isMobile ? (
            /* ── Mobile: Card layout ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sorted.map(it => (
                <div key={it.item_number}>
                  <div
                    onClick={() => setExpanded(expanded === it.item_number ? null : it.item_number)}
                    style={{ ...S.mobileCard, padding: '12px', cursor: 'pointer', borderColor: expanded === it.item_number ? '#93c5fd' : t.color.border, transition: 'border-color 0.15s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      {it.image_url ? (
                        <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', background: t.color.bgMuted, border: `1px solid ${t.color.border}`, flexShrink: 0 }}>
                          <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                        </div>
                      ) : null}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: t.color.link, fontWeight: t.fontWeight.semibold, ...S.mono, fontSize: t.fontSize.h3 }}>{it.item_number}</div>
                        <div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.description || '-'}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: t.fontWeight.bold, color: stockColor(it), fontSize: t.fontSize.h3, ...S.mono }}>{it.stock_qty ?? 0}</div>
                        <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>/ {it.safety_stock ?? 0}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={S.tag(it.product_status === 'Current' ? 'green' : 'default')}>{it.product_status || '-'}</span>
                      <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>{it.category || ''}</span>
                      <span style={{ marginLeft: 'auto', fontSize: t.fontSize.tiny, color: t.color.textMuted }}>{expanded === it.item_number ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {/* ── Mobile Expanded Detail ── */}
                  {expanded === it.item_number && (
                    <div style={{ background: t.color.infoBg, border: `1px solid ${t.color.borderLight}`, borderRadius: 10, padding: '12px', marginTop: -4, marginBottom: 4 }}>
                      {it.image_url && (
                        <div style={{ width: 100, height: 100, borderRadius: 8, overflow: 'hidden', background: t.color.bgCard, border: `1px solid ${t.color.border}`, margin: '0 auto 12px', display: 'block' }}>
                          <img src={it.image_url} alt={it.item_number} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                        <div><div style={S.label}>牌價</div><div style={{ color: t.color.textPrimary, fontSize: t.fontSize.h3, ...S.mono }}>{fmtP(it.tw_retail_price)}</div></div>
                        <div><div style={S.label}>進貨價</div><div style={{ color: t.color.warning, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(it.tw_reseller_price)}</div></div>
                        <div><div style={S.label}>最近進貨成本</div><div style={{ color: it.cost_price > 0 ? '#0369a1' : t.color.textDisabled, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, ...S.mono }}>{it.cost_price > 0 ? fmtP(it.cost_price) : '-'}</div></div>
                        <div><div style={S.label}>成本毛利率</div><div style={{ color: it.tw_retail_price > 0 && it.cost_price > 0 ? t.color.success : t.color.textDisabled, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, ...S.mono }}>{it.tw_retail_price > 0 && it.cost_price > 0 ? `${Math.round((1 - it.cost_price / it.tw_retail_price) * 100)}%` : '-'}</div></div>
                        <div><div style={S.label}>US PRICE</div><div style={{ color: t.color.textSecondary, fontSize: t.fontSize.h3, ...S.mono }}>{it.us_price ? `$${Number(it.us_price).toFixed(2)}` : '-'}</div></div>
                        <div><div style={S.label}>分類</div><div style={{ color: t.color.textSecondary, fontSize: t.fontSize.body }}>{it.category || '-'}</div></div>
                        <div><div style={S.label}>重量</div><div style={{ color: t.color.textSecondary, fontSize: t.fontSize.body, ...S.mono }}>{it.weight_kg ? `${it.weight_kg} kg` : '-'}</div></div>
                        <div><div style={S.label}>產地</div><div style={{ color: t.color.textSecondary, fontSize: t.fontSize.body }}>{it.origin_country || '-'}</div></div>
                        <div><div style={S.label}>替代型號</div><div style={{ color: it.replacement_model ? t.color.link : t.color.textMuted, fontSize: t.fontSize.body, ...S.mono }}>{it.replacement_model || '-'}</div></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={(e) => { e.stopPropagation(); setEditingProduct(it); }} style={{ ...S.btnGhost, flex: 1, minHeight: 40, fontSize: t.fontSize.caption }}>編輯商品</button>
                        <button onClick={(e) => { e.stopPropagation(); setAdjOpen(it.item_number); }} style={{ ...S.btnPrimary, flex: 1, minHeight: 40, fontSize: t.fontSize.caption }}>庫存異動</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* ── Desktop: Row-based cards with expand ── */
            <div>
              {/* Header row */}
              <div style={{ display: 'flex', padding: '8px 16px', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textMuted, ...S.mono, borderBottom: `1px solid ${t.color.borderLight}`, marginBottom: 4 }}>
                <div style={{ width: 40 }}></div>
                <div style={{ width: 140, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('item_number')}>ITEM_NO{sortKey === 'item_number' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</div>
                <div style={{ flex: 1 }}>DESCRIPTION</div>
                <div style={{ width: 100, textAlign: 'center' }}>分類</div>
                <div style={{ width: 80, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('stock_qty')}>庫存{sortKey === 'stock_qty' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</div>
                <div style={{ width: 80, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('safety_stock')}>安全水位{sortKey === 'safety_stock' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</div>
                <div style={{ width: 100, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('cost_price')}>成本{sortKey === 'cost_price' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</div>
                <div style={{ width: 80, textAlign: 'center' }}>狀態</div>
                <div style={{ width: 80, textAlign: 'center' }}>操作</div>
              </div>
              {/* Data rows */}
              {sorted.map(it => (
                <div key={it.item_number}>
                  <div
                    onClick={() => setExpanded(expanded === it.item_number ? null : it.item_number)}
                    style={{
                      ...S.card,
                      cursor: 'pointer',
                      padding: '10px 16px',
                      marginBottom: expanded === it.item_number ? 0 : 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0,
                      borderColor: expanded === it.item_number ? '#93c5fd' : t.color.border,
                      borderBottomLeftRadius: expanded === it.item_number ? 0 : undefined,
                      borderBottomRightRadius: expanded === it.item_number ? 0 : undefined,
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {/* Thumbnail */}
                    <div style={{ width: 40, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {it.image_url ? (
                        <div style={{ width: 32, height: 32, borderRadius: 4, overflow: 'hidden', background: t.color.bgMuted, border: `1px solid ${t.color.border}` }}>
                          <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                        </div>
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: 4, background: t.color.bgMuted, border: `1px dashed ${t.color.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.color.textDisabled, fontSize: t.fontSize.tiny }}>--</div>
                      )}
                    </div>
                    {/* Item number */}
                    <div style={{ width: 140, fontWeight: t.fontWeight.bold, color: t.color.link, fontSize: t.fontSize.h3, ...S.mono, flexShrink: 0 }}>{it.item_number}</div>
                    {/* Description */}
                    <div style={{ flex: 1, fontSize: t.fontSize.body, color: t.color.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{it.description || '-'}</div>
                    {/* Category */}
                    <div style={{ width: 100, textAlign: 'center', flexShrink: 0 }}>
                      {it.category ? <span style={{ ...S.tag(''), fontSize: t.fontSize.tiny, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.category}</span> : <span style={{ color: t.color.textDisabled }}>-</span>}
                    </div>
                    {/* Stock qty */}
                    <div style={{ width: 80, textAlign: 'right', fontWeight: t.fontWeight.bold, color: stockColor(it), ...S.mono, flexShrink: 0 }}>{it.stock_qty ?? 0}</div>
                    {/* Safety stock */}
                    <div style={{ width: 80, textAlign: 'right', color: t.color.textSecondary, ...S.mono, flexShrink: 0 }}>{it.safety_stock ?? 0}</div>
                    {/* Cost price */}
                    <div style={{ width: 100, textAlign: 'right', color: it.cost_price > 0 ? t.color.textPrimary : t.color.textDisabled, ...S.mono, flexShrink: 0 }}>{it.cost_price > 0 ? fmtP(it.cost_price) : '-'}</div>
                    {/* Status */}
                    <div style={{ width: 80, textAlign: 'center', flexShrink: 0 }}>
                      <span style={S.tag(it.product_status === 'Current' ? 'green' : it.product_status === 'Discontinued' ? 'red' : 'default')}>{STATUS_LABEL[it.product_status] || it.product_status || '-'}</span>
                    </div>
                    {/* Actions */}
                    <div style={{ width: 80, textAlign: 'center', flexShrink: 0 }}>
                      <button onClick={(e) => { e.stopPropagation(); setAdjOpen(it.item_number); }} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: t.fontSize.caption }}>異動</button>
                    </div>
                  </div>
                  {/* ── Desktop Expanded Detail Card ── */}
                  {expanded === it.item_number && (
                    <div style={{
                      background: t.color.infoBg,
                      border: `1px solid #93c5fd`,
                      borderTop: 'none',
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 10,
                      padding: '14px 20px',
                      marginBottom: 10,
                      display: 'flex',
                      gap: 16,
                    }}>
                      {/* Image area */}
                      <div style={{ flexShrink: 0 }}>
                        {it.image_url ? (
                          <div style={{ width: 100, height: 100, borderRadius: 8, overflow: 'hidden', background: t.color.bgCard, border: `1px solid ${t.color.border}` }}>
                            <img src={it.image_url} alt={it.item_number} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                          </div>
                        ) : (
                          <div style={{ width: 100, height: 100, borderRadius: 8, border: `2px dashed ${t.color.border}`, background: t.color.bgCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: t.color.textDisabled, fontSize: t.fontSize.tiny }}>
                            <span style={{ fontSize: t.fontSize.h1, marginBottom: 2, opacity: 0.4 }}>&#9633;</span>
                            尚無圖片
                          </div>
                        )}
                      </div>
                      {/* Detail fields grid */}
                      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                        <div><div style={S.label}>牌價</div><div style={{ color: t.color.textPrimary, fontSize: t.fontSize.h3, ...S.mono }}>{fmtP(it.tw_retail_price)}</div></div>
                        <div><div style={S.label}>進貨價</div><div style={{ color: t.color.warning, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(it.tw_reseller_price)}</div></div>
                        <div><div style={S.label}>最近進貨成本</div><div style={{ color: it.cost_price > 0 ? '#0369a1' : t.color.textDisabled, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, ...S.mono }}>{it.cost_price > 0 ? fmtP(it.cost_price) : '-'}</div></div>
                        <div><div style={S.label}>成本毛利率</div><div style={{ color: it.tw_retail_price > 0 && it.cost_price > 0 ? t.color.success : t.color.textDisabled, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, ...S.mono }}>{it.tw_retail_price > 0 && it.cost_price > 0 ? `${Math.round((1 - it.cost_price / it.tw_retail_price) * 100)}%` : '-'}</div></div>
                        <div><div style={S.label}>US PRICE</div><div style={{ color: t.color.textSecondary, fontSize: t.fontSize.h3, ...S.mono }}>{it.us_price ? `$${Number(it.us_price).toFixed(2)}` : '-'}</div></div>
                        <div><div style={S.label}>狀態</div><div style={{ color: t.color.textSecondary, fontSize: t.fontSize.h3 }}>{STATUS_LABEL[it.product_status] || it.product_status || '-'}</div></div>
                        <div><div style={S.label}>重量</div><div style={{ color: t.color.textSecondary, fontSize: t.fontSize.h3, ...S.mono }}>{it.weight_kg ? `${it.weight_kg} kg` : '-'}</div></div>
                        <div><div style={S.label}>產地</div><div style={{ color: t.color.textSecondary, fontSize: t.fontSize.h3 }}>{it.origin_country || '-'}</div></div>
                        <div><div style={S.label}>替代型號</div><div style={{ color: it.replacement_model ? t.color.link : t.color.textMuted, fontSize: t.fontSize.h3, ...S.mono }}>{it.replacement_model || '-'}</div></div>
                      </div>
                      {/* Edit button */}
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingProduct(it); }}
                          style={{ ...S.btnGhost, padding: '6px 14px', fontSize: t.fontSize.caption }}
                        >
                          編輯商品
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(pg) => load(pg, search, filter)} />

      {/* ── Adjustment Modal ── */}
      {adjOpen && (
        <div style={{ position: 'fixed', inset: 0, background: t.color.overlay, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(isMobile ? S.mobileModalOverlay : {}) }}>
          <div style={{ ...S.card, ...(isMobile ? S.mobileModal : {}), width: isMobile ? undefined : 400, maxWidth: '90vw', borderRadius: t.radius.xl, padding: `${t.spacing.lg}px ${t.spacing.lg + 2}px ${t.spacing.xl}px` }}>
            <h3 style={{ margin: '0 0 12px', fontSize: t.fontSize.h2 }}>庫存異動 — {adjOpen}</h3>
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

      {/* ── Product Edit Modal ── */}
      <ProductEditModal
        key={editingProduct?.item_number || ''}
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        categories={[]}
        onSaved={async () => {
          setSaveMessage(`商品 ${editingProduct?.item_number || ''} 已更新`);
          await load(data.page, search, filter);
          setTimeout(() => setSaveMessage(''), 3000);
        }}
      />
    </div>
  );
}
