'use client';
import { useState, useEffect, useCallback } from 'react';
import D from './DealerStyles';

export default function DealerInventory({ token, dealerGet }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('全部');
  const [hasMore, setHasMore] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const stock_only = stockFilter === '有庫存' ? true : stockFilter === '缺貨' ? false : null;
      const response = await dealerGet({
        action: 'products',
        token,
        page,
        limit: '30',
        q: search,
        stock_only,
      });
      setProducts(response?.data || []);
      setHasMore(response?.hasMore || false);
    } catch (error) {
      console.error('Fetch products error:', error);
    } finally {
      setLoading(false);
    }
  }, [token, dealerGet, page, search, stockFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, stockFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const stats = {
    total: products.length,
    inStock: products.filter(p => p.stock_qty > 0).length,
    lowStock: products.filter(p => p.stock_qty > 0 && p.stock_qty <= 5).length,
    outOfStock: products.filter(p => p.stock_qty === 0).length,
  };

  const getStockStatus = (qty) => {
    if (qty > 5) return { color: D.color.success, label: '充足', dot: '🟢' };
    if (qty > 0) return { color: D.color.warning, label: '偏低', dot: '🟡' };
    return { color: D.color.error, label: '缺貨', dot: '🔴' };
  };

  return (
    <div style={{ padding: D.size.lg }}>
      {/* Summary Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: D.size.md,
        marginBottom: D.size.xl,
      }}>
        {[
          { label: '總產品數', value: stats.total },
          { label: '有庫存', value: stats.inStock },
          { label: '低庫存', value: stats.lowStock },
          { label: '缺貨', value: stats.outOfStock },
        ].map(stat => (
          <div key={stat.label} style={{
            background: D.color.background,
            border: `1px solid ${D.color.border}`,
            borderRadius: D.radius.md,
            padding: D.size.md,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: D.font.sm, color: D.color.textSecondary }}>
              {stat.label}
            </div>
            <div style={{ fontSize: D.font.xl, fontWeight: 'bold', color: D.color.primary, marginTop: D.size.xs }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div style={{
        display: 'flex',
        gap: D.size.md,
        marginBottom: D.size.lg,
        flexWrap: 'wrap',
      }}>
        <input
          type="text"
          placeholder="搜尋產品..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: '200px',
            padding: D.size.sm,
            border: `1px solid ${D.color.border}`,
            borderRadius: D.radius.sm,
            fontSize: D.font.base,
            fontFamily: D.font.family,
          }}
        />
        <div style={{ display: 'flex', gap: D.size.sm }}>
          {['全部', '有庫存', '缺貨'].map(filter => (
            <button
              key={filter}
              onClick={() => setStockFilter(filter)}
              style={{
                padding: `${D.size.sm} ${D.size.md}`,
                border: `1px solid ${stockFilter === filter ? D.color.primary : D.color.border}`,
                background: stockFilter === filter ? D.color.primary : 'white',
                color: stockFilter === filter ? 'white' : D.color.text,
                borderRadius: D.radius.sm,
                cursor: 'pointer',
                fontSize: D.font.sm,
                fontFamily: D.font.family,
              }}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Product Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: D.size.md,
        marginBottom: D.size.lg,
      }}>
        {products.map(product => {
          const status = getStockStatus(product.stock_qty);
          return (
            <div
              key={product.item_number}
              style={{
                border: `1px solid ${D.color.border}`,
                borderRadius: D.radius.md,
                padding: D.size.md,
                background: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{
                fontFamily: 'monospace',
                fontSize: D.font.xs,
                color: D.color.textSecondary,
                marginBottom: D.size.xs,
              }}>
                {product.item_number}
              </div>
              <div style={{
                fontSize: D.font.base,
                fontWeight: '600',
                color: D.color.text,
                marginBottom: D.size.sm,
                lineHeight: 1.3,
              }}>
                {product.description}
              </div>
              <div style={{ marginBottom: D.size.md }}>
                <span style={{
                  display: 'inline-block',
                  background: D.color.surface,
                  color: D.color.textSecondary,
                  padding: `${D.size.xs} ${D.size.sm}`,
                  borderRadius: D.radius.sm,
                  fontSize: D.font.xs,
                }}>
                  {product.category}
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: `1px solid ${D.color.border}`,
                paddingTop: D.size.md,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: D.size.xs }}>
                  <span style={{ fontSize: D.font.lg }}>{status.dot}</span>
                  <span style={{ fontSize: D.font.sm, color: status.color }}>
                    {status.label}
                  </span>
                </div>
                <div style={{ fontSize: D.font.base, fontWeight: '600', color: D.color.text }}>
                  {product.stock_qty}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {!loading && (products.length > 0 || page > 1) && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: D.size.md,
          marginTop: D.size.xl,
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: `${D.size.sm} ${D.size.md}`,
              border: `1px solid ${D.color.border}`,
              borderRadius: D.radius.sm,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? 0.5 : 1,
              fontFamily: D.font.family,
            }}
          >
            上一頁
          </button>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            padding: `0 ${D.size.md}`,
            fontSize: D.font.sm,
          }}>
            第 {page} 頁
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore}
            style={{
              padding: `${D.size.sm} ${D.size.md}`,
              border: `1px solid ${D.color.border}`,
              borderRadius: D.radius.sm,
              cursor: !hasMore ? 'not-allowed' : 'pointer',
              opacity: !hasMore ? 0.5 : 1,
              fontFamily: D.font.family,
            }}
          >
            下一頁
          </button>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: D.size.lg, color: D.color.textSecondary }}>
          加載中...
        </div>
      )}
    </div>
  );
}
