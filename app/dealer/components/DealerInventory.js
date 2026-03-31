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
    if (qty > 5) return { color: D.color.success, label: '充足', dotColor: D.color.success };
    if (qty > 0) return { color: D.color.warning, label: '偏低', dotColor: D.color.warning };
    return { color: D.color.error, label: '缺貨', dotColor: D.color.error };
  };

  return (
    <div style={{ padding: 32 }}>
      {/* Summary Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 32,
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
            padding: 12,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: D.size.body, color: D.color.text3 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: D.size.h3, fontWeight: 'bold', color: D.color.primary, marginTop: 4 }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 32,
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
            padding: 8,
            border: `1px solid ${D.color.border}`,
            borderRadius: D.radius.sm,
            fontSize: D.size.body,
            fontFamily: D.font.mono,
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {['全部', '有庫存', '缺貨'].map(filter => (
            <button
              key={filter}
              onClick={() => setStockFilter(filter)}
              style={{
                padding: `8 12`,
                border: `1px solid ${stockFilter === filter ? D.color.primary : D.color.border}`,
                background: stockFilter === filter ? D.color.primary : 'white',
                color: stockFilter === filter ? 'white' : D.color.text,
                borderRadius: D.radius.sm,
                cursor: 'pointer',
                fontSize: D.size.body,
                fontFamily: D.font.mono,
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
        gap: 12,
        marginBottom: 32,
      }}>
        {products.map(product => {
          const status = getStockStatus(product.stock_qty);
          return (
            <div
              key={product.item_number}
              style={{
                border: `1px solid ${D.color.border}`,
                borderRadius: D.radius.md,
                padding: 12,
                background: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{
                fontFamily: 'monospace',
                fontSize: D.size.caption,
                color: D.color.text3,
                marginBottom: 4,
              }}>
                {product.item_number}
              </div>
              <div style={{
                fontSize: D.size.body,
                fontWeight: '600',
                color: D.color.text,
                marginBottom: 8,
                lineHeight: 1.3,
              }}>
                {product.description}
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={{
                  display: 'inline-block',
                  background: D.color.surface,
                  color: D.color.text3,
                  padding: `4 8`,
                  borderRadius: D.radius.sm,
                  fontSize: D.size.caption,
                }}>
                  {product.category}
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: `1px solid ${D.color.border}`,
                paddingTop: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.dotColor, display: 'inline-block' }} />
                  <span style={{ fontSize: D.size.body, color: status.color }}>
                    {status.label}
                  </span>
                </div>
                <div style={{ fontSize: D.size.body, fontWeight: '600', color: D.color.text }}>
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
          gap: 12,
          marginTop: 32,
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: `8 12`,
              border: `1px solid ${D.color.border}`,
              borderRadius: D.radius.sm,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? 0.5 : 1,
              fontFamily: D.font.mono,
            }}
          >
            上一頁
          </button>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            padding: `0 12`,
            fontSize: D.size.body,
          }}>
            第 {page} 頁
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore}
            style={{
              padding: `8 12`,
              border: `1px solid ${D.color.border}`,
              borderRadius: D.radius.sm,
              cursor: !hasMore ? 'not-allowed' : 'pointer',
              opacity: !hasMore ? 0.5 : 1,
              fontFamily: D.font.mono,
            }}
          >
            下一頁
          </button>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 32, color: D.color.text3 }}>
          加載中...
        </div>
      )}
    </div>
  );
}
