'use client';
import { useState, useEffect, useCallback } from 'react';
import D from './DealerStyles';

export default function Procurement({ token, user, roleConfig, dealerGet, dealerPost, cart, setCart }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [stockOnly, setStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  const fetchProducts = useCallback(
    async (searchQuery = '', pageNum = 1, stockFilter = false) => {
      setLoading(true);
      try {
        const res = await dealerGet({
          action: 'products',
          token,
          page: pageNum.toString(),
          limit: '30',
          q: searchQuery,
          stock_only: stockFilter ? '1' : '0',
        });

        if (res?.data?.items) {
          setProducts(res.data.items);
          setTotalPages(res.data.total_pages || 1);
          setPage(pageNum);
        }
      } catch (error) {
        console.error('Failed to fetch products:', error);
      } finally {
        setLoading(false);
      }
    },
    [token, dealerGet]
  );

  useEffect(() => {
    fetchProducts(search, 1, stockOnly);
  }, [search, stockOnly]);

  const handleAddToCart = (product) => {
    const existing = cart.find((c) => c.item_number === product.item_number);
    if (existing) {
      setCart(
        cart.map((c) =>
          c.item_number === product.item_number ? { ...c, qty: c.qty + 1 } : c
        )
      );
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  const handleRemoveFromCart = (itemNumber) => {
    setCart(cart.filter((c) => c.item_number !== itemNumber));
  };

  const handleUpdateQty = (itemNumber, qty) => {
    if (qty <= 0) {
      handleRemoveFromCart(itemNumber);
    } else {
      setCart(
        cart.map((c) => (c.item_number === itemNumber ? { ...c, qty } : c))
      );
    }
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;

    setPosting(true);
    try {
      const res = await dealerPost({
        action: 'place_order',
        token,
        items: cart.map((c) => ({
          item_number: c.item_number,
          qty: c.qty,
        })),
      });

      if (res?.success) {
        alert('訂單提交成功！');
        setCart([]);
        fetchProducts(search, page, stockOnly);
      } else {
        alert('訂單提交失敗，請重試');
      }
    } catch (error) {
      console.error('Failed to place order:', error);
      alert('訂單提交出錯');
    } finally {
      setPosting(false);
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price || 0) * item.qty, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const priceLabel = roleConfig?.price_label || '售價';

  return (
    <div style={{ padding: D.size.lg, paddingBottom: cart.length > 0 ? '120px' : D.size.lg }}>
      {/* Search Bar */}
      <div
        style={{
          display: 'flex',
          gap: D.size.md,
          marginBottom: D.size.lg,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '250px' }}>
          <input
            type="text"
            placeholder="搜尋產品..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: `${D.size.sm} ${D.size.md}`,
              border: `1px solid ${D.color.border}`,
              borderRadius: D.radius.md,
              fontSize: D.size.body,
              fontFamily: D.font.base,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: D.size.sm,
            padding: `${D.size.sm} ${D.size.md}`,
            backgroundColor: stockOnly ? '#f0fdf4' : D.color.card,
            borderRadius: D.radius.md,
            border: `1px solid ${D.color.border}`,
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'all 0.2s',
          }}
        >
          <input
            type="checkbox"
            checked={stockOnly}
            onChange={(e) => setStockOnly(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span
            style={{
              fontSize: D.size.body,
              color: D.color.text,
              fontWeight: D.weight.medium,
            }}
          >
            僅顯示有貨
          </span>
        </label>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: D.size.xl }}>
          <p style={{ color: D.color.text2 }}>加載中...</p>
        </div>
      ) : products.length > 0 ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: D.size.md,
              marginBottom: D.size.xl,
            }}
          >
            {products.map((product) => {
              const inCart = cart.find((c) => c.item_number === product.item_number);
              return (
                <div
                  key={product.item_number}
                  style={{
                    padding: D.size.md,
                    backgroundColor: D.color.card,
                    borderRadius: D.radius.md,
                    border: `1px solid ${D.color.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    e.currentTarget.style.borderColor = '#16a34a';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = D.color.border;
                  }}
                >
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#f0fdf4',
                      borderRadius: D.radius.sm,
                      marginBottom: D.size.md,
                    }}
                  >
                    <code
                      style={{
                        fontSize: D.size.caption,
                        color: '#16a34a',
                        fontFamily: D.font.mono,
                        fontWeight: D.weight.bold,
                      }}
                    >
                      {product.item_number}
                    </code>
                  </div>

                  <p
                    style={{
                      fontSize: D.size.body,
                      fontWeight: D.weight.semi,
                      color: D.color.text,
                      margin: `0 0 ${D.size.sm} 0`,
                      flex: 1,
                    }}
                  >
                    {product.description}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: D.size.md,
                      paddingTop: D.size.md,
                      borderTop: `1px solid ${D.color.border}`,
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontSize: D.size.caption,
                          color: D.color.text2,
                          margin: 0,
                        }}
                      >
                        {priceLabel}
                      </p>
                      <p
                        style={{
                          fontSize: D.size.h2,
                          fontWeight: D.weight.bold,
                          color: '#16a34a',
                          margin: '4px 0 0 0',
                        }}
                      >
                        ${product.price?.toLocaleString() || 0}
                      </p>
                    </div>
                    <div
                      style={{
                        textAlign: 'right',
                      }}
                    >
                      <p
                        style={{
                          fontSize: D.size.caption,
                          color: D.color.text2,
                          margin: 0,
                        }}
                      >
                        庫存
                      </p>
                      <p
                        style={{
                          fontSize: D.size.h2,
                          fontWeight: D.weight.bold,
                          color:
                            product.stock_qty > 0
                              ? '#16a34a'
                              : D.color.text2,
                          margin: '4px 0 0 0',
                        }}
                      >
                        {product.stock_qty}
                      </p>
                    </div>
                  </div>

                  {inCart ? (
                    <div
                      style={{
                        display: 'flex',
                        gap: D.size.xs,
                        alignItems: 'center',
                      }}
                    >
                      <button
                        onClick={() => handleUpdateQty(product.item_number, inCart.qty - 1)}
                        style={{
                          padding: '6px 10px',
                          border: `1px solid ${D.color.border}`,
                          backgroundColor: D.color.card,
                          borderRadius: D.radius.sm,
                          cursor: 'pointer',
                          fontSize: D.size.body,
                        }}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={inCart.qty}
                        onChange={(e) =>
                          handleUpdateQty(product.item_number, parseInt(e.target.value) || 1)
                        }
                        style={{
                          flex: 1,
                          padding: '6px',
                          border: `1px solid ${D.color.border}`,
                          borderRadius: D.radius.sm,
                          textAlign: 'center',
                          fontSize: D.size.body,
                        }}
                      />
                      <button
                        onClick={() => handleUpdateQty(product.item_number, inCart.qty + 1)}
                        style={{
                          padding: '6px 10px',
                          border: `1px solid ${D.color.border}`,
                          backgroundColor: D.color.card,
                          borderRadius: D.radius.sm,
                          cursor: 'pointer',
                          fontSize: D.size.body,
                        }}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAddToCart(product)}
                      disabled={product.stock_qty === 0}
                      style={{
                        padding: `${D.size.sm} ${D.size.md}`,
                        backgroundColor: product.stock_qty === 0 ? D.color.border : '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: D.radius.md,
                        cursor: product.stock_qty === 0 ? 'not-allowed' : 'pointer',
                        fontWeight: D.weight.semi,
                        fontSize: D.size.body,
                        transition: 'all 0.2s',
                        opacity: product.stock_qty === 0 ? 0.6 : 1,
                      }}
                      onHover={(e) => {
                        if (product.stock_qty > 0) {
                          e.currentTarget.style.backgroundColor = '#15803d';
                        }
                      }}
                    >
                      加入購物車
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: D.size.sm,
                marginBottom: D.size.xl,
              }}
            >
              <button
                onClick={() => fetchProducts(search, Math.max(1, page - 1), stockOnly)}
                disabled={page === 1}
                style={{
                  padding: `${D.size.sm} ${D.size.md}`,
                  border: `1px solid ${D.color.border}`,
                  backgroundColor: page === 1 ? D.color.border : 'white',
                  borderRadius: D.radius.md,
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  fontSize: D.size.body,
                }}
              >
                上一頁
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = Math.max(1, page - 2) + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => fetchProducts(search, pageNum, stockOnly)}
                    style={{
                      padding: `${D.size.sm} ${D.size.md}`,
                      backgroundColor: pageNum === page ? '#16a34a' : 'white',
                      color: pageNum === page ? 'white' : D.color.text,
                      border: `1px solid ${pageNum === page ? '#16a34a' : D.color.border}`,
                      borderRadius: D.radius.md,
                      cursor: 'pointer',
                      fontSize: D.size.body,
                      fontWeight:
                        pageNum === page ? D.weight.semi : D.weight.normal,
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => fetchProducts(search, Math.min(totalPages, page + 1), stockOnly)}
                disabled={page === totalPages}
                style={{
                  padding: `${D.size.sm} ${D.size.md}`,
                  border: `1px solid ${D.color.border}`,
                  backgroundColor: page === totalPages ? D.color.border : 'white',
                  borderRadius: D.radius.md,
                  cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  fontSize: D.size.body,
                }}
              >
                下一頁
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: D.size.xl }}>
          <p style={{ color: D.color.text2 }}>未找到相符的產品</p>
        </div>
      )}

      {/* Cart Floating Bar */}
      {cart.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'white',
            borderTop: `1px solid ${D.color.border}`,
            boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
            padding: D.size.md,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 100,
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: D.size.body, color: D.color.text2 }}>
              購物車 · {cartItemCount} 項
            </p>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: D.size.h2,
                fontWeight: D.weight.bold,
                color: '#16a34a',
              }}
            >
              ${cartTotal.toLocaleString()}
            </p>
          </div>

          <div style={{ display: 'flex', gap: D.size.md }}>
            <button
              onClick={() => setCart([])}
              style={{
                padding: `${D.size.sm} ${D.size.md}`,
                border: `1px solid ${D.color.border}`,
                backgroundColor: 'white',
                borderRadius: D.radius.md,
                cursor: 'pointer',
                fontWeight: D.weight.medium,
                fontSize: D.size.body,
              }}
            >
              清空
            </button>
            <button
              onClick={handlePlaceOrder}
              disabled={posting}
              style={{
                padding: `${D.size.sm} ${D.size.md}`,
                backgroundColor: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: D.radius.md,
                cursor: posting ? 'not-allowed' : 'pointer',
                fontWeight: D.weight.semi,
                fontSize: D.size.body,
                opacity: posting ? 0.7 : 1,
              }}
            >
              {posting ? '提交中...' : '下單'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
