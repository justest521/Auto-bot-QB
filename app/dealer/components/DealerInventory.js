'use client';
import { useState, useEffect, useCallback } from 'react';
import D from './DealerStyles';

export default function DealerInventory({ token, dealerGet }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [hasMore, setHasMore] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const stockOnly = stockFilter === 'in' ? '1' : stockFilter === 'out' ? '0' : null;
      const res = await dealerGet({ action: 'products', token, page: String(page), limit: '30', q: search, ...(stockOnly !== null ? { stock_only: stockOnly } : {}) });
      setProducts(res?.products || []);
      setHasMore(res?.total ? page < Math.ceil(res.total / 30) : false);
    } catch (e) { console.error('Inventory fetch:', e); }
    finally { setLoading(false); }
  }, [token, dealerGet, page, search, stockFilter]);

  useEffect(() => { setPage(1); }, [search, stockFilter]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const stats = {
    total: products.length,
    inStock: products.filter(p => p.stock_qty > 0).length,
    lowStock: products.filter(p => p.stock_qty > 0 && p.stock_qty <= 5).length,
    outOfStock: products.filter(p => p.stock_qty === 0).length,
  };

  const getStockInfo = (qty) => {
    if (qty > 5) return { tone: 'green', label: '充足' };
    if (qty > 0) return { tone: 'amber', label: '偏低' };
    return { tone: 'red', label: '缺貨' };
  };

  const FILTERS = [
    { id: 'all', label: '全部' },
    { id: 'in', label: '有庫存' },
    { id: 'out', label: '缺貨' },
  ];

  return (
    <div style={{ padding: '20px 0 40px' }}>
      {/* ── Stats Strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'TOTAL', title: '總產品', value: stats.total, accent: D.color.text },
          { label: 'IN STOCK', title: '有庫存', value: stats.inStock, accent: D.color.success },
          { label: 'LOW', title: '低庫存', value: stats.lowStock, accent: D.color.warning },
          { label: 'OUT', title: '缺貨', value: stats.outOfStock, accent: D.color.error },
        ].map((s, i) => (
          <div key={i} style={{ ...D.card, padding: '12px 10px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.accent, borderRadius: '12px 12px 0 0' }} />
            <div style={{ ...D.sectionLabel, marginBottom: 6, marginTop: 2 }}>{s.label}</div>
            <div style={{ fontSize: D.size.h2, fontWeight: D.weight.black, color: D.color.text, fontFamily: D.font.mono, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginTop: 4 }}>{s.title}</div>
          </div>
        ))}
      </div>

      {/* ── Search & Filter ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={D.color.textDisabled} strokeWidth="2" strokeLinecap="round"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input type="text" placeholder="搜尋產品..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...D.input, paddingLeft: 36 }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setStockFilter(f.id)} style={D.pill(stockFilter === f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Product Cards ── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{
              height: 140, background: `linear-gradient(90deg, ${D.color.muted} 25%, ${D.color.borderLight} 50%, ${D.color.muted} 75%)`,
              backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: D.radius.lg,
            }} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={D.color.textDisabled} strokeWidth={1.5} strokeLinecap="round" style={{ marginBottom: 10 }}>
            <path d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16M10 11h4" />
          </svg>
          <div style={{ color: D.color.textDisabled, fontSize: D.size.body }}>未找到產品</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {products.map(p => {
            const si = getStockInfo(p.stock_qty);
            return (
              <div key={p.item_number} style={{ ...D.card, padding: '14px 14px 12px', overflow: 'hidden' }}>
                {/* Product image */}
                {p.image_url ? (
                  <div style={{ margin: '-14px -14px 10px', height: 130, overflow: 'hidden', borderRadius: `${D.radius.lg} ${D.radius.lg} 0 0` }}>
                    <img src={p.image_url} alt={p.description} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
                  </div>
                ) : null}
                {/* Item number */}
                <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontFamily: D.font.mono, marginBottom: 4, letterSpacing: '0.03em' }}>
                  {p.item_number}
                </div>
                {/* Description */}
                <div style={{ fontSize: D.size.body, fontWeight: D.weight.semi, color: D.color.text, lineHeight: 1.35, marginBottom: 8, minHeight: 36 }}>
                  {p.description}
                </div>
                {/* Category */}
                {p.category && (
                  <div style={{ marginBottom: 10 }}>
                    <span style={D.tag('default')}>{p.category}</span>
                  </div>
                )}
                {/* Stock row */}
                <div style={{ paddingTop: 10, borderTop: `1px solid ${D.color.borderLight}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: p.retail_price > 0 ? 6 : 0 }}>
                    <span style={D.tag(si.tone)}>{si.label}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: D.size.tiny, color: D.color.text3 }}>庫存數量</div>
                      <div style={{ fontSize: D.size.h3, fontWeight: D.weight.bold, color: D.color.text, fontFamily: D.font.mono }}>{p.stock_qty != null ? p.stock_qty : '—'}</div>
                    </div>
                  </div>
                  {p.retail_price > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: D.color.muted, borderRadius: D.radius.sm }}>
                      <span style={{ fontSize: D.size.tiny, color: D.color.text3, fontWeight: D.weight.semi }}>建議售價</span>
                      <span style={{ fontSize: D.size.caption, fontWeight: D.weight.bold, color: D.color.text, fontFamily: D.font.mono }}>NT${Number(p.retail_price || 0).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && (products.length > 0 || page > 1) && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ ...D.btnGhost, padding: '8px 14px', opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? 'default' : 'pointer' }}>
            上一頁
          </button>
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: D.size.body, fontFamily: D.font.mono, color: D.color.text3 }}>
            第 {page} 頁
          </span>
          <button onClick={() => setPage(p => p + 1)} disabled={!hasMore}
            style={{ ...D.btnGhost, padding: '8px 14px', opacity: !hasMore ? 0.4 : 1, cursor: !hasMore ? 'default' : 'pointer' }}>
            下一頁
          </button>
        </div>
      )}
    </div>
  );
}
