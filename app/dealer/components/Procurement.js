'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import D from './DealerStyles';

const fmtNT = (n) => `NT$${Number(n || 0).toLocaleString()}`;

/* ── Customer search input (sales role only) ── */
function CustomerSearchInput({ token, dealerGet, dealerPost, value, onChange, error }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [selected, setSelected] = useState(value || '');
  const dropRef = useRef(null);

  // Sync external value reset (e.g. after order placed)
  useEffect(() => { if (!value) { setQuery(''); setSelected(''); setResults([]); } }, [value]);

  // Debounced search
  useEffect(() => {
    if (query.length < 1 || query === selected) { setResults([]); setShowDrop(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await dealerGet({ action: 'search_customers', token, q: query });
        setResults(res.customers || []);
        setShowDrop(true);
      } catch {}
      finally { setSearching(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectCustomer = (c) => {
    const name = c.company_name || c.name;
    setSelected(name); setQuery(name); setResults([]); setShowDrop(false);
    onChange(name);
  };

  const handleCreate = async () => {
    if (!query.trim()) return;
    try {
      const res = await dealerPost({ action: 'create_customer', token, name: query.trim() });
      if (res?.customer) {
        const name = res.customer.company_name || res.customer.name;
        setSelected(name); setQuery(name); setResults([]); setShowDrop(false);
        onChange(name);
      }
    } catch { alert('新增客戶失敗，請重試'); }
  };

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="搜尋客戶名稱..."
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(''); onChange(''); }}
          onFocus={() => results.length > 0 && setShowDrop(true)}
          style={{ ...D.input, fontSize: D.size.caption, padding: '7px 30px 7px 10px', borderColor: error ? D.color.error : selected ? D.color.brand : '' }}
          autoComplete="off"
        />
        {searching && (
          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: D.color.text3 }}>…</span>
        )}
        {selected && !searching && (
          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: D.color.brand, fontSize: 13 }}>✓</span>
        )}
      </div>
      {showDrop && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${D.color.border}`, borderRadius: D.radius.md, zIndex: 300, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 180, overflowY: 'auto', marginTop: 2 }}>
          {results.map(c => (
            <div key={c.id} onMouseDown={() => selectCustomer(c)}
              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: D.size.tiny, borderBottom: `1px solid ${D.color.borderLight}`, transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = D.color.muted}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <div style={{ fontWeight: D.weight.semi, color: D.color.text }}>{c.company_name || c.name}</div>
              {c.phone && <div style={{ color: D.color.text3, fontSize: 10 }}>{c.phone}</div>}
            </div>
          ))}
          {!searching && results.length === 0 && query.length > 0 && (
            <div onMouseDown={handleCreate}
              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: D.size.tiny, color: D.color.brand, fontWeight: D.weight.semi, display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              新增「{query}」並同步到主系統
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Customer name field (dealer/tech role: plain required input) ── */
function CustomerPlainInput({ value, onChange, error }) {
  return (
    <input
      type="text"
      placeholder="輸入終端客戶名稱（必填）"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ ...D.input, fontSize: D.size.caption, padding: '7px 10px', borderColor: error ? D.color.error : '' }}
    />
  );
}

export default function Procurement({ token, user, roleConfig, dealerGet, dealerPost, cart, setCart, isWide, onOrderPlaced }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [stockOnly, setStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerError, setCustomerError] = useState('');

  const isSalesRole = user?.role === 'sales';

  const fetchProducts = useCallback(async (q = '', pg = 1, so = false) => {
    setLoading(true);
    try {
      const res = await dealerGet({ action: 'products', token, page: pg.toString(), limit: '30', q, stock_only: so ? '1' : '0' });
      if (res?.products) { setProducts(res.products); setTotalPages(Math.ceil((res.total || 0) / 30) || 1); setPage(pg); }
    } catch (e) { console.error('Products fetch:', e); }
    finally { setLoading(false); }
  }, [token, dealerGet]);

  useEffect(() => { fetchProducts(search, 1, stockOnly); }, [search, stockOnly]);

  const addToCart = (p, isPreorder = false) => {
    const exist = cart.find(c => c.item_number === p.item_number);
    if (exist) setCart(cart.map(c => c.item_number === p.item_number ? { ...c, qty: c.qty + 1 } : c));
    else setCart([...cart, { ...p, qty: 1, is_preorder: isPreorder }]);
  };
  const updateQty = (inum, qty) => {
    if (qty <= 0) setCart(cart.filter(c => c.item_number !== inum));
    else setCart(cart.map(c => c.item_number === inum ? { ...c, qty } : c));
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    if (!customerName.trim()) {
      setCustomerError('銷售對象為必填');
      return;
    }
    setCustomerError('');
    setPosting(true);
    try {
      const res = await dealerPost({
        action: 'place_order',
        token,
        customer_name: customerName.trim(),
        items: cart.map(c => ({ item_number: c.item_number, qty: c.qty, is_preorder: c.is_preorder || false })),
      });
      if (res?.success || res?.order) {
        setCart([]);
        setCustomerName('');
        // 跳回訂單頁並自動帶出剛建立的訂單
        if (onOrderPlaced) onOrderPlaced(res?.order?.id);
      } else {
        alert('提交失敗，請重試');
      }
    } catch (e) { console.error(e); alert('提交出錯'); }
    finally { setPosting(false); }
  };

  const cartTotal = cart.reduce((s, c) => s + (c.price || 0) * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const priceLabel = roleConfig?.price_label || '售價';
  const hasPreorder = cart.some(c => c.is_preorder);

  /* ── Customer section (shared between wide panel and mobile bar) ── */
  const renderCustomerField = () => (
    <div>
      <div style={{ fontSize: D.size.tiny, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: customerError ? D.color.error : D.color.text3 }}>銷售對象</span>
        <span style={{ color: D.color.error, fontWeight: D.weight.bold }}>*</span>
        {isSalesRole && <span style={{ fontSize: 9, color: D.color.text3, marginLeft: 2 }}>可搜尋主系統客戶</span>}
      </div>
      {isSalesRole ? (
        <CustomerSearchInput
          token={token}
          dealerGet={dealerGet}
          dealerPost={dealerPost}
          value={customerName}
          onChange={(v) => { setCustomerName(v); if (v) setCustomerError(''); }}
          error={customerError}
        />
      ) : (
        <CustomerPlainInput
          value={customerName}
          onChange={(v) => { setCustomerName(v); if (v) setCustomerError(''); }}
          error={customerError}
        />
      )}
      {customerError && (
        <div style={{ fontSize: 10, color: D.color.error, marginTop: 3 }}>{customerError}</div>
      )}
    </div>
  );

  return (
    <div style={{ padding: `20px 0 ${cart.length > 0 && !isWide ? 200 : 40}px`, paddingRight: isWide && cart.length > 0 ? 308 : 0 }}>
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
              const isOutOfStock = p.stock_qty === 0;
              return (
                <div key={p.item_number} style={{
                  ...D.card, padding: '14px 14px 12px', display: 'flex', flexDirection: 'column',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* top accent */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: p.stock_qty > 0 ? D.color.brand : D.color.border, borderRadius: '12px 12px 0 0' }} />

                  {/* Product image — contain within frame, no cropping */}
                  {p.image_url ? (
                    <div style={{
                      margin: '-14px -14px 12px', height: 150,
                      overflow: 'hidden', borderRadius: `${D.radius.lg} ${D.radius.lg} 0 0`,
                      background: '#f3f4f6', position: 'relative',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <img
                        src={p.image_url}
                        alt={p.description}
                        style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }}
                        onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
                      />
                      {/* Out-of-stock overlay */}
                      {isOutOfStock && (
                        <div style={{
                          position: 'absolute', inset: 0,
                          background: 'rgba(0,0,0,0.4)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ color: '#fff', fontSize: D.size.caption, fontWeight: D.weight.bold, background: 'rgba(0,0,0,0.55)', padding: '4px 14px', borderRadius: D.radius.full, letterSpacing: 1 }}>缺貨</span>
                        </div>
                      )}
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
                    {/* 只有在建議售價與主價格不同時才顯示（避免重複） */}
                    {p.retail_price > 0 && p.retail_price !== p.price && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: D.color.muted, borderRadius: D.radius.sm }}>
                        <span style={{ fontSize: D.size.tiny, color: D.color.text3, fontWeight: D.weight.semi }}>建議售價</span>
                        <span style={{ fontSize: D.size.caption, fontWeight: D.weight.bold, color: D.color.text, fontFamily: D.font.mono }}>{fmtNT(p.retail_price)}</span>
                      </div>
                    )}
                  </div>

                  {/* Cart controls */}
                  {inCart ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {inCart.is_preorder && (
                        <span style={{ ...D.tag('amber'), marginRight: 2, flexShrink: 0, fontSize: 9 }}>📅預定</span>
                      )}
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
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!isOutOfStock && (
                        <button onClick={() => addToCart(p, false)}
                          style={{ ...D.btnPrimary, flex: 1, textAlign: 'center' }}>
                          加入購物車
                        </button>
                      )}
                      {isOutOfStock && (
                        <button onClick={() => addToCart(p, true)}
                          style={{
                            flex: 1, textAlign: 'center', cursor: 'pointer',
                            padding: '9px 14px', borderRadius: D.radius.md, fontSize: D.size.caption,
                            fontWeight: D.weight.bold, border: `1px solid ${D.color.warning}`,
                            background: '#fffbeb', color: '#d97706',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                          }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                          </svg>
                          預定
                        </button>
                      )}
                    </div>
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

      {/* ── Wide: Right-side Cart Panel ── */}
      {isWide && cart.length > 0 && (
        <div style={{
          position: 'fixed', right: 16, top: 57, bottom: 68, width: 288,
          zIndex: 150, background: '#fff',
          borderRadius: `${D.radius.xl} ${D.radius.xl} 0 0`,
          border: `1px solid ${D.color.border}`,
          borderBottom: 'none',
          boxShadow: '-4px 0 32px rgba(0,0,0,0.09)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${D.color.borderLight}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={D.color.brand} strokeWidth="2.2" strokeLinecap="round">
                  <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.4 5h11.8" /><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                </svg>
                <span style={{ fontSize: D.size.caption, fontWeight: D.weight.bold, color: D.color.text }}>購物車</span>
                <span style={{ fontSize: 10, fontFamily: D.font.mono, fontWeight: D.weight.bold, color: D.color.brand, background: D.color.brandDim, padding: '1px 7px', borderRadius: D.radius.full }}>{cartCount}</span>
              </div>
              <button onClick={() => setCart([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.color.text3, fontSize: D.size.tiny, padding: '2px 6px' }}>清空</button>
            </div>
            {/* Customer field */}
            {renderCustomerField()}
          </div>

          {/* Cart items list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            {cart.map(c => (
              <div key={c.item_number} style={{
                marginBottom: 8, padding: '9px 10px',
                background: c.is_preorder ? '#fffbeb' : D.color.muted,
                borderRadius: D.radius.md,
                border: c.is_preorder ? `1px solid #fde68a` : `1px solid transparent`,
              }}>
                {c.is_preorder && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <span style={{ ...D.tag('amber'), fontSize: 9 }}>📅 預定</span>
                  </div>
                )}
                <div style={{ fontSize: D.size.tiny, fontWeight: D.weight.semi, color: D.color.text, lineHeight: 1.35, marginBottom: 6 }}>
                  <code style={{ fontSize: 10, color: D.color.text3, fontFamily: D.font.mono }}>{c.item_number}</code>
                  <div>{c.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => updateQty(c.item_number, c.qty - 1)}
                    style={{ width: 26, height: 26, border: `1px solid ${D.color.border}`, background: '#fff', borderRadius: D.radius.sm, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: D.size.tiny, fontFamily: D.font.mono, fontWeight: D.weight.bold }}>{c.qty}</span>
                  <button onClick={() => updateQty(c.item_number, c.qty + 1)}
                    style={{ width: 26, height: 26, border: `1px solid ${D.color.border}`, background: '#fff', borderRadius: D.radius.sm, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  <span style={{ fontSize: D.size.caption, fontFamily: D.font.mono, color: D.color.brand, fontWeight: D.weight.bold, minWidth: 64, textAlign: 'right' }}>{fmtNT((c.price || 0) * c.qty)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Panel footer */}
          <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${D.color.borderLight}` }}>
            {/* Flow info */}
            <div style={{
              background: D.color.brandDim, borderRadius: D.radius.md,
              padding: '7px 10px', marginBottom: 10, lineHeight: 1.7,
              fontSize: 10, color: D.color.brand,
            }}>
              <div>① 送出訂單 → ② 主系統確認庫存</div>
              <div>③ 安排出貨 → ④ 到貨通知</div>
              {hasPreorder && (
                <div style={{ marginTop: 3, color: '#d97706', fontWeight: D.weight.semi }}>
                  ⚠️ 含預定商品 → 管理員轉採購單
                </div>
              )}
            </div>
            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ fontSize: D.size.caption, color: D.color.text3 }}>合計（未稅）</span>
              <span style={{ fontSize: D.size.h2, fontWeight: D.weight.black, color: D.color.brand, fontFamily: D.font.mono }}>{fmtNT(cartTotal)}</span>
            </div>
            <button onClick={handlePlaceOrder} disabled={posting}
              style={{ ...D.btnPrimary, width: '100%', padding: '12px', fontWeight: D.weight.bold, fontSize: D.size.body, opacity: posting ? 0.6 : 1 }}>
              {posting ? '提交中...' : '✓ 送出訂單'}
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile: Cart floating bar ── */}
      {!isWide && cart.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 68, left: 0, right: 0, zIndex: 150,
          background: '#fff', borderTop: `2px solid ${D.color.brand}`,
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
          padding: '10px 16px 12px',
          borderRadius: '12px 12px 0 0',
        }}>
          {/* Customer field */}
          <div style={{ marginBottom: 8 }}>
            {renderCustomerField()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontWeight: D.weight.semi }}>
                購物車 · {cartCount} 件{hasPreorder && <span style={{ color: '#d97706', marginLeft: 4 }}>含預定</span>}
              </div>
              <div style={{ fontSize: D.size.h2, fontWeight: D.weight.black, color: D.color.brand, fontFamily: D.font.mono, marginTop: 2 }}>{fmtNT(cartTotal)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCart([])} style={{ ...D.btnGhost, padding: '8px 14px', fontSize: D.size.caption }}>清空</button>
              <button onClick={handlePlaceOrder} disabled={posting}
                style={{ ...D.btnPrimary, padding: '10px 24px', fontSize: D.size.body, fontWeight: D.weight.bold, opacity: posting ? 0.6 : 1, minWidth: 90 }}>
                {posting ? '提交中...' : '✓ 送出訂單'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
