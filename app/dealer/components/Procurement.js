'use client';
import { useState, useEffect, useCallback } from 'react';
import D from './DealerStyles';

const fmtNT = (n) => `NT$${Number(n || 0).toLocaleString()}`;

export default function Procurement({ token, user, roleConfig, dealerGet, dealerPost, cart, setCart }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [stockOnly, setStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  const fetchProducts = useCallback(async (q = '', pg = 1, so = false) => {
    setLoading(true);
    try {
      const res = await dealerGet({ action: 'products', token, page: pg.toString(), limit: '30', q, stock_only: so ? '1' : '0' });
      if (res?.products) { setProducts(res.products); setTotalPages(Math.ceil((res.total || 0) / 30) || 1); setPage(pg); }
    } catch (e) { console.error('Products fetch:', e); }
    finally { setLoading(false); }
  }, [token, dealerGet]);

  useEffect(() => { fetchProducts(search, 1, stockOnly); }, [search, stockOnly]);

  const addToCart = (p) => {
    const exist = cart.find(c => c.item_number === p.item_number);
    if (exist) setCart(cart.map(c => c.item_number === p.item_number ? { ...c, qty: c.qty + 1 } : c));
    else setCart([...cart, { ...p, qty: 1 }]);
  };
  const updateQty = (inum, qty) => {
    if (qty <= 0) setCart(cart.filter(c => c.item_number !== inum));
    else setCart(cart.map(c => c.item_number === inum ? { ...c, qty } : c));
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    setPosting(true);
    try {
      const res = await dealerPost({ action: 'place_order', token, items: cart.map(c => ({ item_number: c.item_number, qty: c.qty })) });
      if (res?.success) { alert('訂單提交成功！'); setCart([]); fetchProducts(search, page, stockOnly); }
      else alert('提交失敗，請重試');
    } catch (e) { console.error(e); alert('提交出錯'); }
    finally { setPosting(false); }
  };

  const cartTotal = cart.reduce((s, c) => s + (c.price || 0) * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const priceLabel = roleConfig?.price_label || '售價';

  return (
    <div style={{ padding: '20px 0 120px' }}>
      {/* ── Search row ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={D.color.textDisabled} strokeWidth="2" strokeLinecap="round"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input type="text" placeholder="搜尋產品編號或名稱..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...D.input, paddingLeft: 36 }} />
        </div>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
          background: stockOnly ? D.color.brandDim : D.color.card,
          borderRadius: D.radius.md, border: `1px solid ${stockOnly ? D.color.brand : D.color.border}`,
          cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s',
        }}>
          <input type="checkbox" checked={stockOnly} onChange={e => setStockOnly(e.target.checked)} style={{ cursor: 'pointer', accentColor: D.color.brand }} />
          <span style={{ fontSize: D.size.body, color: stockOnly ? D.color.brand : D.color.text2, fontWeight: D.weight.medium }}>僅有貨</span>
        </label>
      </div>

      {/* ── Product Grid ── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{
              height: 180, background: `linear-gradient(90deg, ${D.color.muted} 25%, ${D.color.borderLight} 50%, ${D.color.muted} 75%)`,
              backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: D.radius.lg,
            }} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={D.color.textDisabled} strokeWidth={1.5} strokeLinecap="round" style={{ marginBottom: 10 }}>
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <div style={{ color: D.color.textDisabled, fontSize: D.size.body }}>未找到相符的產品</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginBottom: 20 }}>
            {products.map(p => {
              const inCart = cart.find(c => c.item_number === p.item_number);
              return (
                <div key={p.item_number} style={{
                  ...D.card, padding: '14px 14px 12px', display: 'flex', flexDirection: 'column',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* top accent */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: p.stock_qty > 0 ? D.color.brand : D.color.border, borderRadius: '12px 12px 0 0' }} />

                  {/* Product image */}
                  {p.image_url ? (
                    <div style={{ margin: '-14px -14px 10px', height: 140, overflow: 'hidden', borderRadius: `${D.radius.lg} ${D.radius.lg} 0 0` }}>
                      <img src={p.image_url} alt={p.description} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
                    </div>
                  ) : null}

                  {/* Item number badge */}
                  <div style={{
                    display: 'inline-flex', padding: '4px 10px', background: D.color.brandDim,
                    borderRadius: D.radius.xs, marginBottom: 8, alignSelf: 'flex-start',
                  }}>
                    <code style={{ fontSize: D.size.tiny, color: D.color.brand, fontFamily: D.font.mono, fontWeight: D.weight.bold }}>{p.item_number}</code>
                  </div>

                  {/* Description */}
                  <div style={{ fontSize: D.size.body, fontWeight: D.weight.semi, color: D.color.text, flex: 1, lineHeight: 1.4, marginBottom: 10 }}>
                    {p.description}
                  </div>

                  {/* Price + Stock row */}
                  <div style={{ paddingTop: 10, borderTop: `1px solid ${D.color.borderLight}`, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: D.size.tiny, color: D.color.text3 }}>{priceLabel}</div>
                        <div style={{ fontSize: D.size.h2, fontWeight: D.weight.black, color: D.color.brand, fontFamily: D.font.mono, lineHeight: 1.2, marginTop: 2 }}>
                          {fmtNT(p.price)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: D.size.tiny, color: D.color.text3 }}>庫存</div>
                        <div style={{
                          fontSize: D.size.h3, fontWeight: D.weight.bold, fontFamily: D.font.mono, marginTop: 2,
                          color: p.stock_qty > 5 ? D.color.success : p.stock_qty > 0 ? D.color.warning : D.color.error,
                        }}>
                          {p.stock_qty != null ? p.stock_qty : '—'}
                        </div>
                      </div>
                    </div>
                    {p.retail_price > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: D.color.muted, borderRadius: D.radius.sm }}>
                        <span style={{ fontSize: D.size.tiny, color: D.color.text3, fontWeight: D.weight.semi }}>建議售價</span>
                        <span style={{ fontSize: D.size.caption, fontWeight: D.weight.bold, color: D.color.text, fontFamily: D.font.mono }}>{fmtNT(p.retail_price)}</span>
                      </div>
                    )}
                  </div>

                  {/* Cart controls */}
                  {inCart ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button onClick={() => updateQty(p.item_number, inCart.qty - 1)}
                        style={{ width: 34, height: 34, border: `1px solid ${D.color.border}`, background: D.color.card, borderRadius: D.radius.sm, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        -
                      </button>
                      <input type="number" min="1" value={inCart.qty}
                        onChange={e => updateQty(p.item_number, parseInt(e.target.value) || 1)}
                        style={{ flex: 1, height: 34, border: `1px solid ${D.color.border}`, borderRadius: D.radius.sm, textAlign: 'center', fontSize: D.size.body, fontFamily: D.font.mono, fontWeight: D.weight.bold }}
                      />
                      <button onClick={() => updateQty(p.item_number, inCart.qty + 1)}
                        style={{ width: 34, height: 34, border: `1px solid ${D.color.border}`, background: D.color.card, borderRadius: D.radius.sm, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        +
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(p)} disabled={p.stock_qty === 0}
                      style={{
                        ...D.btnPrimary, width: '100%', textAlign: 'center',
                        opacity: p.stock_qty === 0 ? 0.4 : 1,
                        cursor: p.stock_qty === 0 ? 'not-allowed' : 'pointer',
                      }}>
                      {p.stock_qty === 0 ? '暫無庫存' : '加入購物車'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
              <button onClick={() => fetchProducts(search, Math.max(1, page - 1), stockOnly)} disabled={page === 1}
                style={{ ...D.btnGhost, padding: '8px 14px', opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? 'default' : 'pointer' }}>
                上一頁
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pn = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                if (pn > totalPages) return null;
                return (
                  <button key={pn} onClick={() => fetchProducts(search, pn, stockOnly)}
                    style={{
                      ...D.btnGhost, padding: '8px 14px', minWidth: 38, textAlign: 'center',
                      fontFamily: D.font.mono, fontWeight: pn === page ? D.weight.bold : D.weight.normal,
                      background: pn === page ? D.color.brand : D.color.card,
                      color: pn === page ? '#fff' : D.color.text2,
                      borderColor: pn === page ? D.color.brand : D.color.border,
                    }}>
                    {pn}
                  </button>
                );
              })}
              <button onClick={() => fetchProducts(search, Math.min(totalPages, page + 1), stockOnly)} disabled={page === totalPages}
                style={{ ...D.btnGhost, padding: '8px 14px', opacity: page === totalPages ? 0.4 : 1, cursor: page === totalPages ? 'default' : 'pointer' }}>
                下一頁
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Cart floating bar ── */}
      {cart.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderTop: `1px solid ${D.color.border}`, boxShadow: D.shadow.float,
          padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: D.size.caption, color: D.color.text3 }}>購物車 · {cartCount} 項</div>
            <div style={{ fontSize: D.size.h2, fontWeight: D.weight.black, color: D.color.brand, fontFamily: D.font.mono, marginTop: 2 }}>{fmtNT(cartTotal)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setCart([])} style={{ ...D.btnGhost, padding: '8px 16px' }}>清空</button>
            <button onClick={handlePlaceOrder} disabled={posting}
              style={{ ...D.btnPrimary, padding: '8px 20px', opacity: posting ? 0.6 : 1 }}>
              {posting ? '提交中...' : '下單'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
