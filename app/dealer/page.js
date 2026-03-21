'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const DEALER_TOKEN_KEY = 'qb_dealer_token';

async function dealerGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/dealer?${qs}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
async function dealerPost(body) {
  const res = await fetch('/api/dealer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function fmtP(n) { return `NT$${Number(n || 0).toLocaleString()}`; }
function fmtDate(d) { if (!d) return '-'; return d.slice(0, 10); }
function timeAgo(t) {
  if (!t) return '';
  const diff = Date.now() - new Date(t).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天前`;
  return fmtDate(t);
}

const ROLE_COLORS = { dealer: '#6366f1', sales: '#f59e0b', technician: '#10b981' };
const ROLE_GRADIENTS = {
  dealer: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  sales: 'linear-gradient(135deg, #f59e0b, #f97316)',
  technician: 'linear-gradient(135deg, #10b981, #06b6d4)',
};

const TAB_LIST = [
  { id: 'catalog', label: '商品目錄', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'cart', label: '下單', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z' },
  { id: 'orders', label: '訂單', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { id: 'stats', label: '業績', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'notifications', label: '通知', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'profile', label: '個人', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
];

// ========== Global CSS ==========
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Noto+Sans+TC:wght@300;400;500;600;700;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#050a18;overflow-x:hidden}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.3);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:rgba(99,102,241,0.5)}

@keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
@keyframes slideDown { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
@keyframes glow { 0%,100%{box-shadow:0 0 5px rgba(99,102,241,0.3)} 50%{box-shadow:0 0 20px rgba(99,102,241,0.6)} }
@keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
@keyframes gridPulse { 0%,100%{opacity:0.03} 50%{opacity:0.06} }
@keyframes countUp { from{opacity:0;transform:scale(0.5)} to{opacity:1;transform:scale(1)} }
@keyframes borderGlow { 0%{border-color:rgba(99,102,241,0.2)} 50%{border-color:rgba(99,102,241,0.5)} 100%{border-color:rgba(99,102,241,0.2)} }
@keyframes ripple { to{transform:scale(4);opacity:0} }

.qb-card{
  background:rgba(15,23,42,0.6);
  backdrop-filter:blur(20px);
  border:1px solid rgba(99,102,241,0.12);
  border-radius:16px;
  transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
}
.qb-card:hover{
  border-color:rgba(99,102,241,0.3);
  box-shadow:0 8px 32px rgba(99,102,241,0.1);
  transform:translateY(-1px);
}
.qb-card-glow{
  background:rgba(15,23,42,0.8);
  backdrop-filter:blur(20px);
  border:1px solid rgba(99,102,241,0.2);
  border-radius:16px;
  box-shadow:0 0 30px rgba(99,102,241,0.05),inset 0 1px 0 rgba(255,255,255,0.05);
}
.qb-glass{
  background:rgba(255,255,255,0.03);
  backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,0.06);
  border-radius:12px;
}
.qb-input{
  background:rgba(15,23,42,0.8);
  border:1px solid rgba(99,102,241,0.15);
  border-radius:12px;
  padding:12px 16px;
  color:#e2e8f0;
  font-size:13px;
  outline:none;
  width:100%;
  font-family:'Noto Sans TC','Inter',sans-serif;
  transition:all 0.3s;
}
.qb-input:focus{
  border-color:rgba(99,102,241,0.5);
  box-shadow:0 0 0 3px rgba(99,102,241,0.1);
}
.qb-input::placeholder{color:rgba(148,163,184,0.5)}
.qb-btn{
  background:linear-gradient(135deg,#6366f1,#8b5cf6);
  color:#fff;border:none;border-radius:12px;
  padding:10px 20px;font-weight:600;cursor:pointer;
  font-size:13px;font-family:'Noto Sans TC','Inter',sans-serif;
  box-shadow:0 4px 15px rgba(99,102,241,0.3);
  transition:all 0.3s;position:relative;overflow:hidden;
}
.qb-btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(99,102,241,0.4)}
.qb-btn:active{transform:translateY(0)}
.qb-btn-ghost{
  background:rgba(99,102,241,0.08);color:#a5b4fc;
  border:1px solid rgba(99,102,241,0.2);border-radius:10px;
  padding:8px 16px;cursor:pointer;font-size:12px;
  font-family:'Noto Sans TC','Inter',sans-serif;transition:all 0.3s;
}
.qb-btn-ghost:hover{background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4)}
.qb-tag{
  display:inline-flex;align-items:center;padding:4px 12px;
  border-radius:8px;font-size:11px;font-weight:600;
  letter-spacing:0.5px;
}
.qb-mono{font-family:'JetBrains Mono',monospace;letter-spacing:0.5px}
.qb-anim-in{animation:fadeInUp 0.5s ease-out both}
.qb-grid-bg{
  position:fixed;top:0;left:0;right:0;bottom:0;
  background-image:linear-gradient(rgba(99,102,241,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.03) 1px,transparent 1px);
  background-size:60px 60px;
  animation:gridPulse 8s ease-in-out infinite;
  pointer-events:none;z-index:0;
}
.qb-orb{
  position:fixed;border-radius:50%;filter:blur(80px);opacity:0.15;pointer-events:none;z-index:0;
}
.qb-stat-num{
  font-size:28px;font-weight:800;letter-spacing:-0.5px;
  background:linear-gradient(135deg,#e2e8f0,#a5b4fc);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  animation:countUp 0.6s ease-out both;
}
.qb-bar{height:6px;border-radius:3px;background:rgba(99,102,241,0.1);overflow:hidden}
.qb-bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#6366f1,#8b5cf6);transition:width 0.8s cubic-bezier(0.4,0,0.2,1)}
.qb-noti-dot{
  position:absolute;top:-2px;right:-2px;width:8px;height:8px;
  background:#ef4444;border-radius:50%;
  animation:pulse 2s infinite;
}
.qb-shimmer{
  background:linear-gradient(90deg,transparent 0%,rgba(99,102,241,0.08) 50%,transparent 100%);
  background-size:200% 100%;
  animation:shimmer 2s infinite linear;
}
`;

// SVG icon helper
function SvgIcon({ d, size = 20, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={d} />
    </svg>
  );
}

// ========== Login Screen ==========
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const result = await dealerPost({ action: 'login', username: username.trim().toLowerCase(), password });
      onLogin(result.token, result.user, result.role_config);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#050a18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', overflow: 'hidden' }}>
      <style>{GLOBAL_CSS}</style>
      <div className="qb-grid-bg" />
      <div className="qb-orb" style={{ width: 400, height: 400, background: '#6366f1', top: '-10%', left: '-10%' }} />
      <div className="qb-orb" style={{ width: 300, height: 300, background: '#8b5cf6', bottom: '-5%', right: '-5%' }} />

      <div className="qb-anim-in" style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
        <div className="qb-card-glow" style={{ padding: '40px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: 1,
              boxShadow: '0 12px 40px rgba(99,102,241,0.4)',
              marginBottom: 20, animation: 'float 3s ease-in-out infinite',
              fontFamily: "'JetBrains Mono', monospace",
            }}>QB</div>
            <div style={{ color: '#fff', fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>Quick Buy</div>
            <div style={{ color: 'rgba(148,163,184,0.6)', fontSize: 13, marginTop: 8, letterSpacing: 2 }}>DEALER PORTAL</div>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={{ color: 'rgba(148,163,184,0.7)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' }}>帳號</label>
              <input className="qb-input" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="輸入帳號" />
            </div>
            <div>
              <label style={{ color: 'rgba(148,163,184,0.7)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' }}>密碼</label>
              <input className="qb-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="輸入密碼" />
            </div>
            {error && (
              <div style={{ color: '#f87171', fontSize: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.15)', animation: 'fadeIn 0.3s' }}>{error}</div>
            )}
            <button className="qb-btn" onClick={submit} disabled={loading} style={{ width: '100%', marginTop: 4, padding: '14px 20px', fontSize: 15, opacity: loading ? 0.7 : 1 }}>
              {loading ? '登入中...' : '登入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== Catalog Tab ==========
function CatalogTab({ token, user, roleConfig, cart, setCart }) {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [stockOnly, setStockOnly] = useState(false);

  const load = useCallback(async (p = page, q = search) => {
    setLoading(true);
    try {
      const result = await dealerGet({ action: 'products', token, page: String(p), limit: '30', q, stock_only: stockOnly ? '1' : '0' });
      setProducts(result.products || []);
      setTotal(result.total || 0);
    } finally { setLoading(false); }
  }, [token, page, search, stockOnly]);

  useEffect(() => { load(1, ''); }, []);
  const doSearch = () => { setPage(1); load(1, search); };
  const addToCart = (product, qty = 1) => {
    setCart(prev => {
      const existing = prev.find(c => c.item_number === product.item_number);
      if (existing) return prev.map(c => c.item_number === product.item_number ? { ...c, qty: c.qty + qty } : c);
      return [...prev, { item_number: product.item_number, description: product.description, price: product.price, qty, stock_qty: product.stock_qty }];
    });
  };
  const cartQty = (itemNumber) => (cart.find(c => c.item_number === itemNumber)?.qty || 0);
  const totalPages = Math.ceil(total / 30);

  return (
    <div className="qb-anim-in">
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="qb-input" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋料號、品名或品牌..." style={{ flex: 1, minWidth: 200 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(148,163,184,0.7)', fontSize: 12, cursor: 'pointer', padding: '8px 12px', borderRadius: 10, background: stockOnly ? 'rgba(99,102,241,0.1)' : 'transparent', border: `1px solid ${stockOnly ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.1)'}`, transition: 'all 0.3s' }}>
          <input type="checkbox" checked={stockOnly} onChange={(e) => setStockOnly(e.target.checked)} style={{ accentColor: '#6366f1' }} />
          有庫存
        </label>
        <button className="qb-btn" onClick={doSearch}>查詢</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: 'rgba(148,163,184,0.6)', fontSize: 12 }}>
          共 <span style={{ color: '#a5b4fc', fontWeight: 700 }} className="qb-mono">{total}</span> 項
        </span>
        <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
          價格：<span style={{ color: '#a5b4fc', fontWeight: 600 }}>{roleConfig?.price_label || '零售價'}</span>
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div className="qb-shimmer" style={{ width: 200, height: 4, borderRadius: 2, margin: '0 auto 12px' }} />
          <span style={{ color: 'rgba(148,163,184,0.5)', fontSize: 12 }}>載入中...</span>
        </div>
      ) : products.length === 0 ? (
        <div style={{ color: 'rgba(148,163,184,0.5)', padding: 60, textAlign: 'center', fontSize: 13 }}>沒有找到商品</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {products.map((p, idx) => {
            const inCart = cartQty(p.item_number);
            return (
              <div key={p.item_number} className="qb-card" style={{
                padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
                borderLeftWidth: 3, borderLeftColor: inCart > 0 ? '#6366f1' : 'rgba(99,102,241,0.12)',
                animationDelay: `${idx * 0.03}s`, animation: 'fadeInUp 0.4s ease-out both',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="qb-mono" style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 700 }}>{p.item_number}</span>
                    {p.brand && <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)', padding: '2px 6px', background: 'rgba(99,102,241,0.06)', borderRadius: 4 }}>{p.brand}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description || '-'}</div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 6, alignItems: 'center' }}>
                    <span className="qb-mono" style={{ fontSize: 15, color: '#34d399', fontWeight: 700 }}>{fmtP(p.price)}</span>
                    {p.stock_qty !== null && (
                      <span style={{ fontSize: 11, color: p.stock_qty > 0 ? 'rgba(52,211,153,0.8)' : 'rgba(248,113,113,0.8)' }}>
                        庫存 {p.stock_qty}
                      </span>
                    )}
                    {roleConfig?.can_see_cost && <span className="qb-mono" style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)' }}>成本 {fmtP(p.cost_price)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {inCart > 0 && <span className="qb-tag qb-mono" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: 13 }}>{inCart}</span>}
                  <button className="qb-btn" onClick={() => addToCart(p)} style={{ padding: '8px 16px', fontSize: 12 }}>+ 加入</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20, alignItems: 'center' }}>
          <button className="qb-btn-ghost" onClick={() => { const np = Math.max(1, page - 1); setPage(np); load(np, search); }} disabled={page <= 1} style={{ opacity: page <= 1 ? 0.3 : 1 }}>上一頁</button>
          <span className="qb-mono" style={{ color: 'rgba(148,163,184,0.5)', fontSize: 12 }}>{page} / {totalPages}</span>
          <button className="qb-btn-ghost" onClick={() => { const np = Math.min(totalPages, page + 1); setPage(np); load(np, search); }} disabled={page >= totalPages} style={{ opacity: page >= totalPages ? 0.3 : 1 }}>下一頁</button>
        </div>
      )}
    </div>
  );
}

// ========== Cart / Place Order Tab ==========
function CartTab({ token, user, cart, setCart, setActiveTab }) {
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const updateQty = (itemNumber, qty) => {
    if (qty <= 0) setCart(prev => prev.filter(c => c.item_number !== itemNumber));
    else setCart(prev => prev.map(c => c.item_number === itemNumber ? { ...c, qty } : c));
  };

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  const submit = async () => {
    if (!cart.length) return;
    if (!confirm(`確定送出訂單？共 ${cart.length} 項，金額 ${fmtP(total)}`)) return;
    setSubmitting(true);
    setMessage('');
    try {
      const result = await dealerPost({ action: 'place_order', token, items: cart.map(c => ({ item_number: c.item_number, qty: c.qty })), remark });
      setMessage(result.message || '訂單建立成功');
      setCart([]);
      setRemark('');
      setTimeout(() => setActiveTab('orders'), 1500);
    } catch (err) {
      setMessage(err.message || '下單失敗');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="qb-anim-in">
      {message && (
        <div style={{ padding: '14px 18px', borderRadius: 12, marginBottom: 20, fontSize: 13, background: message.includes('失敗') ? 'rgba(239,68,68,0.08)' : 'rgba(52,211,153,0.08)', color: message.includes('失敗') ? '#f87171' : '#34d399', border: `1px solid ${message.includes('失敗') ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.15)'}`, animation: 'slideDown 0.3s' }}>
          {message}
        </div>
      )}

      {cart.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
            <SvgIcon d={TAB_LIST[1].icon} size={64} color="rgba(99,102,241,0.3)" />
          </div>
          <div style={{ color: 'rgba(148,163,184,0.5)', fontSize: 14, marginBottom: 20 }}>購物車是空的</div>
          <button className="qb-btn" onClick={() => setActiveTab('catalog')}>前往商品目錄</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
            {cart.map((item, idx) => (
              <div key={item.item_number} className="qb-card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s both` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="qb-mono" style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 700 }}>{item.item_number}</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', marginTop: 2 }}>{item.description || '-'}</div>
                  <div className="qb-mono" style={{ fontSize: 12, color: '#34d399', marginTop: 4 }}>{fmtP(item.price)} x {item.qty} = {fmtP(item.price * item.qty)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button className="qb-btn-ghost" onClick={() => updateQty(item.item_number, item.qty - 1)} style={{ padding: '6px 12px', fontSize: 14, fontWeight: 700 }}>-</button>
                  <span className="qb-mono" style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{item.qty}</span>
                  <button className="qb-btn-ghost" onClick={() => updateQty(item.item_number, item.qty + 1)} style={{ padding: '6px 12px', fontSize: 14, fontWeight: 700 }}>+</button>
                  <button className="qb-btn-ghost" onClick={() => updateQty(item.item_number, 0)} style={{ padding: '6px 10px', fontSize: 11, color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}>刪除</button>
                </div>
              </div>
            ))}
          </div>

          <div className="qb-card-glow" style={{ padding: '24px' }}>
            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#e2e8f0' }}>
                <span>小計 ({cart.reduce((s, c) => s + c.qty, 0)} 項)</span>
                <span className="qb-mono">{fmtP(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(148,163,184,0.5)' }}>
                <span>稅額 5%</span>
                <span className="qb-mono">{fmtP(tax)}</span>
              </div>
              <div style={{ height: 1, background: 'rgba(99,102,241,0.1)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800 }}>
                <span style={{ color: '#e2e8f0' }}>總額</span>
                <span className="qb-mono" style={{ color: '#34d399' }}>{fmtP(total)}</span>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: 'rgba(148,163,184,0.6)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 8, letterSpacing: 1 }}>備註</label>
              <textarea className="qb-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="訂單備註（選填）" rows={2} style={{ resize: 'vertical' }} />
            </div>
            <button className="qb-btn" onClick={submit} disabled={submitting} style={{ width: '100%', padding: '14px', fontSize: 15, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? '送出中...' : '確認送出訂單'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ========== Orders Tab ==========
function OrdersTab({ token }) {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const STATUS_TONE = { pending: '#eab308', confirmed: '#6366f1', purchasing: '#3b82f6', partial_arrived: '#f59e0b', arrived: '#34d399', shipped: '#22d3ee', completed: '#10b981', cancelled: '#ef4444' };

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const result = await dealerGet({ action: 'my_orders', token, page: String(p), limit: '20', status: statusFilter });
      setOrders(result.orders || []);
      setTotal(result.total || 0);
    } finally { setLoading(false); }
  }, [token, page, statusFilter]);

  useEffect(() => { load(1); }, [statusFilter]);
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="qb-anim-in">
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[['', '全部'], ['pending', '待處理'], ['confirmed', '已確認'], ['purchasing', '採購中'], ['arrived', '已到貨'], ['shipped', '已出貨']].map(([key, label]) => (
          <button key={key} onClick={() => { setStatusFilter(key); setPage(1); }} className="qb-btn-ghost" style={{
            background: statusFilter === key ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: statusFilter === key ? '#a5b4fc' : 'rgba(148,163,184,0.5)',
            borderColor: statusFilter === key ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.1)',
            fontSize: 12, padding: '6px 14px',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ color: 'rgba(148,163,184,0.5)', fontSize: 12, marginBottom: 14 }}>
        共 <span className="qb-mono" style={{ color: '#a5b4fc' }}>{total}</span> 筆訂單
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div className="qb-shimmer" style={{ width: 200, height: 4, borderRadius: 2, margin: '0 auto' }} />
        </div>
      ) : orders.length === 0 ? (
        <div style={{ color: 'rgba(148,163,184,0.5)', padding: 60, textAlign: 'center', fontSize: 13 }}>沒有訂單</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {orders.map((order, idx) => {
            const isExpanded = expandedId === order.id;
            const statusColor = STATUS_TONE[order.status] || '#94a3b8';
            return (
              <div key={order.id} className="qb-card" style={{ overflow: 'hidden', animation: `fadeInUp 0.3s ease-out ${idx * 0.04}s both` }}>
                <div onClick={() => setExpandedId(isExpanded ? null : order.id)} style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="qb-mono" style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 700, minWidth: 130 }}>{order.order_no || '-'}</span>
                  <span className="qb-tag" style={{ background: `${statusColor}15`, color: statusColor }}>{order.status_label || order.status}</span>
                  <span className="qb-mono" style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)' }}>{order.order_date || ''}</span>
                  <span className="qb-mono" style={{ fontSize: 14, color: '#34d399', fontWeight: 700, marginLeft: 'auto' }}>{fmtP(order.total_amount)}</span>
                  <span style={{ color: 'rgba(148,163,184,0.3)', fontSize: 10, transition: 'transform 0.3s', transform: isExpanded ? 'rotate(180deg)' : '' }}>&#x25BC;</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 18px 16px', borderTop: '1px solid rgba(99,102,241,0.08)', animation: 'slideDown 0.3s' }}>
                    {order.remark && <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', padding: '12px 0 8px' }}>備註：{order.remark}</div>}
                    <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                      {(order.items || []).map((item, i) => (
                        <div key={i} className="qb-glass" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', fontSize: 12 }}>
                          <span className="qb-mono" style={{ color: '#a5b4fc', fontWeight: 600, minWidth: 110 }}>{item.item_number_snapshot}</span>
                          <span style={{ color: '#e2e8f0', flex: 1 }}>{item.description_snapshot || '-'}</span>
                          <span className="qb-mono" style={{ color: 'rgba(148,163,184,0.5)' }}>x{item.qty}</span>
                          <span className="qb-mono" style={{ color: '#34d399', fontWeight: 600 }}>{fmtP(item.line_total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20, alignItems: 'center' }}>
          <button className="qb-btn-ghost" onClick={() => { const np = Math.max(1, page - 1); setPage(np); load(np); }} disabled={page <= 1} style={{ opacity: page <= 1 ? 0.3 : 1 }}>上一頁</button>
          <span className="qb-mono" style={{ color: 'rgba(148,163,184,0.5)', fontSize: 12 }}>{page} / {totalPages}</span>
          <button className="qb-btn-ghost" onClick={() => { const np = Math.min(totalPages, page + 1); setPage(np); load(np); }} disabled={page >= totalPages} style={{ opacity: page >= totalPages ? 0.3 : 1 }}>下一頁</button>
        </div>
      )}
    </div>
  );
}

// ========== Stats / Performance Tab ==========
function StatsTab({ token, user, roleConfig }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('month');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await dealerGet({ action: 'my_performance', token, range });
      setData(result);
    } finally { setLoading(false); }
  }, [token, range]);

  useEffect(() => { load(); }, [range]);

  const RANGES = [['month', '本月'], ['quarter', '本季'], ['year', '本年']];
  const maxTrend = data ? Math.max(...(data.monthly_trend || []).map(m => m.amount), 1) : 1;

  return (
    <div className="qb-anim-in">
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {RANGES.map(([k, l]) => (
          <button key={k} onClick={() => setRange(k)} className="qb-btn-ghost" style={{
            background: range === k ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: range === k ? '#a5b4fc' : 'rgba(148,163,184,0.5)',
            borderColor: range === k ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.1)',
          }}>{l}</button>
        ))}
      </div>

      {loading || !data ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div className="qb-shimmer" style={{ width: 200, height: 4, borderRadius: 2, margin: '0 auto' }} />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: '訂單金額', value: fmtP(data.total_amount), color: '#34d399' },
              { label: '訂單數', value: data.total_orders, color: '#a5b4fc' },
              { label: '平均單價', value: fmtP(data.avg_order_amount), color: '#f59e0b' },
            ].map((kpi, idx) => (
              <div key={idx} className="qb-card-glow" style={{ padding: '20px', textAlign: 'center', animation: `fadeInUp 0.5s ease-out ${idx * 0.1}s both` }}>
                <div style={{ color: 'rgba(148,163,184,0.5)', fontSize: 11, fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>{kpi.label}</div>
                <div className="qb-stat-num qb-mono" style={{ background: `linear-gradient(135deg, ${kpi.color}, #e2e8f0)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Monthly Trend */}
          <div className="qb-card-glow" style={{ padding: '24px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>月度趨勢</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
              {(data.monthly_trend || []).map((m, idx) => (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span className="qb-mono" style={{ fontSize: 10, color: 'rgba(148,163,184,0.5)' }}>{fmtP(m.amount)}</span>
                  <div style={{
                    width: '100%', maxWidth: 50, borderRadius: '6px 6px 0 0',
                    background: 'linear-gradient(180deg, #6366f1, rgba(99,102,241,0.3))',
                    height: `${Math.max(4, (m.amount / maxTrend) * 100)}%`,
                    transition: 'height 0.8s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: m.amount > 0 ? '0 -4px 12px rgba(99,102,241,0.3)' : 'none',
                    animation: `fadeInUp 0.5s ease-out ${idx * 0.1}s both`,
                  }} />
                  <span className="qb-mono" style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)' }}>{m.month.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Breakdown */}
          {(data.status_breakdown || []).length > 0 && (
            <div className="qb-card-glow" style={{ padding: '24px', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>訂單狀態</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {(data.status_breakdown || []).map((s, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: '#a5b4fc', minWidth: 70 }}>{s.label}</span>
                    <div className="qb-bar" style={{ flex: 1 }}>
                      <div className="qb-bar-fill" style={{ width: `${Math.max(3, (s.count / Math.max(data.total_orders, 1)) * 100)}%` }} />
                    </div>
                    <span className="qb-mono" style={{ fontSize: 12, color: 'rgba(148,163,184,0.6)', minWidth: 30, textAlign: 'right' }}>{s.count}</span>
                    <span className="qb-mono" style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', minWidth: 80, textAlign: 'right' }}>{fmtP(s.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Products */}
          {(data.top_products || []).length > 0 && (
            <div className="qb-card-glow" style={{ padding: '24px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>熱銷商品 TOP 10</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.top_products.map((p, idx) => (
                  <div key={idx} className="qb-glass" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800,
                      background: idx < 3 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99,102,241,0.1)',
                      color: idx < 3 ? '#fff' : 'rgba(148,163,184,0.5)',
                    }}>{idx + 1}</span>
                    <span className="qb-mono" style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600, minWidth: 100 }}>{p.item_number}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>
                    <span className="qb-mono" style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>x{p.total_qty}</span>
                    <span className="qb-mono" style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>{fmtP(p.total_amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ========== Notifications Tab ==========
function NotificationsTab({ token }) {
  const [notifications, setNotifications] = useState([]);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await dealerGet({ action: 'my_notifications', token });
        setNotifications(result.notifications || []);
        setNewCount(result.new_count || 0);
      } finally { setLoading(false); }
    })();
  }, [token]);

  const TYPE_ICON = {
    arrival: { color: '#34d399', bg: 'rgba(52,211,153,0.1)', icon: 'M5 8l4 4 6-6' },
    shipped: { color: '#22d3ee', bg: 'rgba(34,211,238,0.1)', icon: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0' },
    confirmed: { color: '#6366f1', bg: 'rgba(99,102,241,0.1)', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    purchasing: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    completed: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
    cancelled: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' },
    info: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  };

  return (
    <div className="qb-anim-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>通知中心</span>
        {newCount > 0 && (
          <span className="qb-tag" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', animation: 'pulse 2s infinite' }}>{newCount} 則新通知</span>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div className="qb-shimmer" style={{ width: 200, height: 4, borderRadius: 2, margin: '0 auto' }} />
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'rgba(148,163,184,0.5)', fontSize: 13 }}>沒有通知</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {notifications.map((n, idx) => {
            const cfg = TYPE_ICON[n.type] || TYPE_ICON.info;
            const isNew = n.time > new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
            return (
              <div key={n.id} className="qb-card" style={{
                padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
                borderLeftWidth: 3, borderLeftColor: isNew ? cfg.color : 'rgba(99,102,241,0.08)',
                animation: `fadeInUp 0.3s ease-out ${idx * 0.04}s both`,
              }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SvgIcon d={cfg.icon} size={18} color={cfg.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: isNew ? 600 : 400 }}>{n.message}</div>
                  <div className="qb-mono" style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginTop: 4 }}>{timeAgo(n.time)}</div>
                </div>
                {n.amount > 0 && <span className="qb-mono" style={{ fontSize: 12, color: '#34d399', fontWeight: 600, flexShrink: 0 }}>{fmtP(n.amount)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ========== Profile Tab ==========
function ProfileTab({ token, user, setUser, roleConfig, onLogout }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setForm({ display_name: user.display_name || '', phone: user.phone || '', email: user.email || '', company_name: user.company_name || '' });
  }, [user]);

  const saveProfile = async () => {
    setSaving(true);
    setMsg('');
    try {
      const result = await dealerPost({ action: 'update_profile', token, ...form });
      setUser(result.user);
      setMsg(result.message || '已更新');
      setEditing(false);
    } catch (err) { setMsg(err.message); }
    finally { setSaving(false); }
  };

  const changePw = async () => {
    setMsg('');
    try {
      const result = await dealerPost({ action: 'change_password', token, old_password: oldPw, new_password: newPw });
      setMsg(result.message || '密碼已更新');
      setOldPw('');
      setNewPw('');
    } catch (err) { setMsg(err.message); }
  };

  const roleColor = ROLE_COLORS[user?.role] || '#6366f1';
  const roleGrad = ROLE_GRADIENTS[user?.role] || 'linear-gradient(135deg, #6366f1, #8b5cf6)';

  return (
    <div className="qb-anim-in" style={{ maxWidth: 520 }}>
      {/* Profile Header */}
      <div className="qb-card-glow" style={{ padding: '28px 24px', marginBottom: 16, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, background: roleGrad, opacity: 0.15 }} />
        <div style={{
          width: 64, height: 64, borderRadius: 20, background: roleGrad,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 900, fontSize: 24, marginBottom: 12,
          boxShadow: `0 8px 24px ${roleColor}40`,
          fontFamily: "'Noto Sans TC', sans-serif", position: 'relative',
        }}>{(user?.display_name || 'U')[0]}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', position: 'relative' }}>{user?.display_name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, position: 'relative' }}>
          <span className="qb-tag" style={{ background: `${roleColor}20`, color: roleColor }}>{user?.role_label}</span>
          {user?.company_name && <span style={{ color: 'rgba(148,163,184,0.5)', fontSize: 12 }}>{user.company_name}</span>}
        </div>
        <div className="qb-mono" style={{ fontSize: 11, color: 'rgba(148,163,184,0.3)', marginTop: 8, position: 'relative' }}>
          @{user?.username}
        </div>
      </div>

      {/* Info Cards */}
      <div className="qb-card-glow" style={{ padding: '24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>個人資訊</span>
          <button className="qb-btn-ghost" onClick={() => setEditing(!editing)} style={{ fontSize: 11 }}>{editing ? '取消' : '編輯'}</button>
        </div>
        {msg && <div style={{ fontSize: 12, marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: msg.includes('失敗') || msg.includes('錯誤') ? 'rgba(239,68,68,0.08)' : 'rgba(52,211,153,0.08)', color: msg.includes('失敗') || msg.includes('錯誤') ? '#f87171' : '#34d399', animation: 'fadeIn 0.3s' }}>{msg}</div>}
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            { key: 'display_name', label: '姓名' },
            { key: 'company_name', label: '公司' },
            { key: 'phone', label: '電話' },
            { key: 'email', label: '信箱' },
          ].map(f => (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'rgba(148,163,184,0.5)', fontSize: 12, minWidth: 50 }}>{f.label}</span>
              {editing ? (
                <input className="qb-input" value={form[f.key] || ''} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={{ fontSize: 13 }} />
              ) : (
                <span style={{ color: '#e2e8f0', fontSize: 13 }}>{user?.[f.key] || '-'}</span>
              )}
            </div>
          ))}
        </div>
        {editing && (
          <button className="qb-btn" onClick={saveProfile} disabled={saving} style={{ width: '100%', marginTop: 16, opacity: saving ? 0.7 : 1 }}>
            {saving ? '儲存中...' : '儲存變更'}
          </button>
        )}
      </div>

      {/* Permission & Status */}
      <div className="qb-card-glow" style={{ padding: '24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>權限與狀態</div>
        <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
          {[
            { label: '價格等級', value: user?.price_level === 'cost' ? '成本價' : user?.price_level === 'reseller' ? '經銷價' : '零售價' },
            { label: '查看庫存', value: user?.can_see_stock ? '已開啟' : '未開啟', ok: user?.can_see_stock },
            { label: '下單權限', value: user?.can_place_order ? '已開啟' : '未開啟', ok: user?.can_place_order },
            { label: '到貨通知', value: user?.notify_on_arrival ? '已開啟' : '未開啟', ok: user?.notify_on_arrival },
            { label: 'LINE 綁定', value: user?.line_user_id ? '已綁定' : '未綁定', ok: !!user?.line_user_id },
            { label: '上次登入', value: user?.last_login_at ? fmtDate(user.last_login_at) : '-' },
            { label: '加入日期', value: user?.created_at ? fmtDate(user.created_at) : '-' },
          ].map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <span style={{ color: 'rgba(148,163,184,0.5)' }}>{item.label}</span>
              <span style={{ color: item.ok !== undefined ? (item.ok ? '#34d399' : 'rgba(148,163,184,0.4)') : '#e2e8f0', fontWeight: 500 }}>
                {item.ok !== undefined && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: item.ok ? '#34d399' : 'rgba(148,163,184,0.3)', marginRight: 6 }} />}
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Change Password */}
      <div className="qb-card-glow" style={{ padding: '24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>修改密碼</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <input className="qb-input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="舊密碼" />
          <input className="qb-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="新密碼（至少 4 碼）" />
          <button className="qb-btn" onClick={changePw}>更新密碼</button>
        </div>
      </div>

      {/* Logout */}
      <button className="qb-btn-ghost" onClick={onLogout} style={{ width: '100%', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)', padding: '14px' }}>
        登出
      </button>
    </div>
  );
}

// ========== Main Page ==========
export default function DealerPortal() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [roleConfig, setRoleConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('catalog');
  const [cart, setCart] = useState([]);
  const [notiCount, setNotiCount] = useState(0);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(DEALER_TOKEN_KEY) : null;
    if (saved) {
      dealerGet({ action: 'me', token: saved })
        .then(result => { setToken(saved); setUser(result.user); setRoleConfig(result.role_config); })
        .catch(() => { window.localStorage.removeItem(DEALER_TOKEN_KEY); });
    }
  }, []);

  // Fetch notification count
  useEffect(() => {
    if (!token) return;
    dealerGet({ action: 'my_notifications', token })
      .then(result => setNotiCount(result.new_count || 0))
      .catch(() => {});
  }, [token, activeTab]);

  const handleLogin = (t, u, rc) => {
    setToken(t); setUser(u); setRoleConfig(rc);
    window.localStorage.setItem(DEALER_TOKEN_KEY, t);
  };
  const handleLogout = () => {
    setToken(''); setUser(null); setRoleConfig(null); setCart([]);
    window.localStorage.removeItem(DEALER_TOKEN_KEY);
  };

  if (!token || !user) return <LoginScreen onLogin={handleLogin} />;

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const roleColor = ROLE_COLORS[user?.role] || '#6366f1';
  const roleGrad = ROLE_GRADIENTS[user?.role] || 'linear-gradient(135deg, #6366f1, #8b5cf6)';

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ minHeight: '100vh', background: '#050a18', color: '#e2e8f0', fontFamily: "'Noto Sans TC', 'Inter', sans-serif", position: 'relative' }}>
        <div className="qb-grid-bg" />
        <div className="qb-orb" style={{ width: 500, height: 500, background: roleColor, top: '-20%', right: '-15%', opacity: 0.06 }} />
        <div className="qb-orb" style={{ width: 300, height: 300, background: '#8b5cf6', bottom: '10%', left: '-10%', opacity: 0.04 }} />

        {/* Header */}
        <div style={{
          background: 'rgba(5,10,24,0.85)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(99,102,241,0.08)',
          padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: roleGrad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 900, fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              boxShadow: `0 4px 12px ${roleColor}30`,
            }}>QB</div>
            <div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{user.display_name}</div>
              <div style={{ fontSize: 10, color: roleColor, fontWeight: 600, letterSpacing: 0.5 }}>{user.role_label}{user.company_name ? ` \u00B7 ${user.company_name}` : ''}</div>
            </div>
          </div>
          <div className="qb-mono" style={{ fontSize: 10, color: 'rgba(148,163,184,0.3)', letterSpacing: 2 }}>QUICK BUY</div>
        </div>

        {/* Tab navigation */}
        <div style={{
          display: 'flex', background: 'rgba(5,10,24,0.9)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(99,102,241,0.06)',
          position: 'sticky', top: 64, zIndex: 99,
        }}>
          {TAB_LIST.map(t => {
            const isActive = activeTab === t.id;
            const showBadge = (t.id === 'cart' && cartCount > 0) || (t.id === 'notifications' && notiCount > 0);
            const badgeNum = t.id === 'cart' ? cartCount : notiCount;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                flex: 1, padding: '12px 0', background: 'transparent',
                border: 'none', borderBottom: `2px solid ${isActive ? roleColor : 'transparent'}`,
                color: isActive ? '#fff' : 'rgba(148,163,184,0.4)',
                cursor: 'pointer', fontSize: 11, fontWeight: isActive ? 700 : 400,
                fontFamily: "'Noto Sans TC', 'Inter', sans-serif",
                transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                position: 'relative',
              }}>
                <SvgIcon d={t.icon} size={16} color={isActive ? roleColor : 'rgba(148,163,184,0.4)'} />
                <span style={{ display: 'inline-block', marginTop: 1 }}>{t.label}</span>
                {showBadge && (
                  <span style={{
                    background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999,
                    minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    marginLeft: 2, boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
                  }}>{badgeNum}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          {activeTab === 'catalog' && <CatalogTab token={token} user={user} roleConfig={roleConfig} cart={cart} setCart={setCart} />}
          {activeTab === 'cart' && <CartTab token={token} user={user} cart={cart} setCart={setCart} setActiveTab={setActiveTab} />}
          {activeTab === 'orders' && <OrdersTab token={token} />}
          {activeTab === 'stats' && <StatsTab token={token} user={user} roleConfig={roleConfig} />}
          {activeTab === 'notifications' && <NotificationsTab token={token} />}
          {activeTab === 'profile' && <ProfileTab token={token} user={user} setUser={setUser} roleConfig={roleConfig} onLogout={handleLogout} />}
        </div>
      </div>
    </>
  );
}
