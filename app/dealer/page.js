'use client';
import { useState, useEffect, useCallback } from 'react';

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

const ROLE_COLORS = { dealer: '#1976f3', sales: '#e67e22', technician: '#27ae60' };
const TAB_LIST = [
  { id: 'catalog', label: '商品目錄', icon: '\u{1F4E6}' },
  { id: 'cart', label: '下單', icon: '\u{1F6D2}' },
  { id: 'orders', label: '我的訂單', icon: '\u{1F4CB}' },
  { id: 'settings', label: '設定', icon: '\u2699' },
];

// ========== Styles ==========
const C = {
  bg: '#0b1120',
  card: '#111827',
  cardBorder: '#1e293b',
  accent: '#3b82f6',
  accentGlow: 'rgba(59,130,246,0.15)',
  text: '#e2e8f0',
  textMuted: '#64748b',
  input: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 14px', color: '#e2e8f0', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Sans TC', sans-serif" },
  btn: { background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", boxShadow: '0 4px 14px rgba(59,130,246,0.3)' },
  btnGhost: { background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontFamily: "'Noto Sans TC', sans-serif" },
  tag: (color) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: color === 'green' ? 'rgba(34,197,94,0.15)' : color === 'blue' ? 'rgba(59,130,246,0.15)' : color === 'yellow' ? 'rgba(234,179,8,0.15)' : color === 'red' ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)', color: color === 'green' ? '#22c55e' : color === 'blue' ? '#60a5fa' : color === 'yellow' ? '#eab308' : color === 'red' ? '#ef4444' : '#94a3b8' }),
  mono: { fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: 0.5 },
};

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
    <div style={{ minHeight: '100vh', background: `radial-gradient(ellipse at 50% 0%, #1e3a5f 0%, ${C.bg} 70%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 20, padding: '32px 28px', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18, ...C.mono, marginBottom: 16, boxShadow: '0 8px 24px rgba(59,130,246,0.3)' }}>QB</div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>Quick Buy 訂貨入口</div>
          <div style={{ color: C.textMuted, fontSize: 13, marginTop: 8 }}>經銷商 · 業務 · 維修技師</div>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 1 }}>帳號</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="輸入帳號" style={C.input} />
          </div>
          <div>
            <label style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 1 }}>密碼</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="輸入密碼" style={C.input} />
          </div>
          {error && <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>{error}</div>}
          <button onClick={submit} disabled={loading} style={{ ...C.btn, width: '100%', marginTop: 4, opacity: loading ? 0.7 : 1 }}>{loading ? '登入中...' : '登入'}</button>
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
    } finally {
      setLoading(false);
    }
  }, [token, page, search, stockOnly]);

  useEffect(() => { load(1, ''); }, []);

  const doSearch = () => { setPage(1); load(1, search); };

  const addToCart = (product, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item_number === product.item_number);
      if (existing) {
        return prev.map((c) => c.item_number === product.item_number ? { ...c, qty: c.qty + qty } : c);
      }
      return [...prev, { item_number: product.item_number, description: product.description, price: product.price, qty, stock_qty: product.stock_qty }];
    });
  };

  const cartQty = (itemNumber) => (cart.find((c) => c.item_number === itemNumber)?.qty || 0);

  const totalPages = Math.ceil(total / 30);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋料號、品名或品牌..." style={{ ...C.input, flex: 1, minWidth: 200 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textMuted, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={stockOnly} onChange={(e) => setStockOnly(e.target.checked)} />
          有庫存
        </label>
        <button onClick={doSearch} style={C.btn}>查詢</button>
      </div>

      <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 12 }}>
        共 {total} 項 · 價格顯示：<span style={{ color: '#60a5fa', fontWeight: 600 }}>{roleConfig?.price_label || '零售價'}</span>
      </div>

      {loading ? <div style={{ color: C.textMuted, padding: 40, textAlign: 'center' }}>載入中...</div> : products.length === 0 ? <div style={{ color: C.textMuted, padding: 40, textAlign: 'center' }}>沒有找到商品</div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {products.map((p) => {
            const inCart = cartQty(p.item_number);
            return (
              <div key={p.item_number} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, transition: 'border-color 0.2s', borderLeftWidth: 3, borderLeftColor: inCart > 0 ? '#3b82f6' : C.cardBorder }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 700, ...C.mono }}>{p.item_number}</span>
                    {p.brand && <span style={{ fontSize: 10, color: C.textMuted, ...C.mono }}>{p.brand}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description || '-'}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: '#22c55e', fontWeight: 700, ...C.mono }}>{fmtP(p.price)}</span>
                    {p.stock_qty !== null && (
                      <span style={{ fontSize: 11, color: p.stock_qty > 0 ? '#22c55e' : '#ef4444' }}>
                        庫存 {p.stock_qty}
                      </span>
                    )}
                    {roleConfig?.can_see_cost && <span style={{ fontSize: 11, color: C.textMuted, ...C.mono }}>成本 {fmtP(p.cost_price)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {inCart > 0 && <span style={{ ...C.tag('blue'), fontSize: 12, ...C.mono }}>{inCart}</span>}
                  <button onClick={() => addToCart(p)} style={{ ...C.btn, padding: '8px 14px', fontSize: 12 }}>+ 加入</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button onClick={() => { setPage(Math.max(1, page - 1)); load(Math.max(1, page - 1), search); }} disabled={page <= 1} style={{ ...C.btnGhost, opacity: page <= 1 ? 0.4 : 1 }}>上一頁</button>
          <span style={{ color: C.textMuted, fontSize: 12, ...C.mono }}>P{page} / {totalPages}</span>
          <button onClick={() => { setPage(Math.min(totalPages, page + 1)); load(Math.min(totalPages, page + 1), search); }} disabled={page >= totalPages} style={{ ...C.btnGhost, opacity: page >= totalPages ? 0.4 : 1 }}>下一頁</button>
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
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.item_number !== itemNumber));
    } else {
      setCart((prev) => prev.map((c) => c.item_number === itemNumber ? { ...c, qty } : c));
    }
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
      const result = await dealerPost({
        action: 'place_order',
        token,
        items: cart.map((c) => ({ item_number: c.item_number, qty: c.qty })),
        remark,
      });
      setMessage(result.message || '訂單建立成功');
      setCart([]);
      setRemark('');
      setTimeout(() => setActiveTab('orders'), 1500);
    } catch (err) {
      setMessage(err.message || '下單失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {message && (
        <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, background: message.includes('失敗') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: message.includes('失敗') ? '#ef4444' : '#22c55e', border: `1px solid ${message.includes('失敗') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
          {message}
        </div>
      )}

      {cart.length === 0 ? (
        <div style={{ color: C.textMuted, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>{'\u{1F6D2}'}</div>
          <div>購物車是空的，先去商品目錄加入商品吧</div>
          <button onClick={() => setActiveTab('catalog')} style={{ ...C.btn, marginTop: 16 }}>前往商品目錄</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
            {cart.map((item) => (
              <div key={item.item_number} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#60a5fa', fontWeight: 700, ...C.mono }}>{item.item_number}</div>
                  <div style={{ fontSize: 13, color: C.text, marginTop: 2 }}>{item.description || '-'}</div>
                  <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4, ...C.mono }}>{fmtP(item.price)} x {item.qty} = {fmtP(item.price * item.qty)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => updateQty(item.item_number, item.qty - 1)} style={{ ...C.btnGhost, padding: '4px 10px', fontSize: 14 }}>-</button>
                  <span style={{ color: C.text, fontSize: 14, fontWeight: 700, ...C.mono, minWidth: 24, textAlign: 'center' }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.item_number, item.qty + 1)} style={{ ...C.btnGhost, padding: '4px 10px', fontSize: 14 }}>+</button>
                  <button onClick={() => updateQty(item.item_number, 0)} style={{ ...C.btnGhost, padding: '4px 8px', fontSize: 12, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>刪除</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.text }}><span>小計 ({cart.reduce((s, c) => s + c.qty, 0)} 項)</span><span style={C.mono}>{fmtP(subtotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.textMuted }}><span>稅額 5%</span><span style={C.mono}>{fmtP(tax)}</span></div>
              <div style={{ height: 1, background: C.cardBorder }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#22c55e', fontWeight: 700 }}><span>總額</span><span style={C.mono}>{fmtP(total)}</span></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6 }}>備註</label>
              <textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="訂單備註（選填）" rows={2} style={{ ...C.input, resize: 'vertical' }} />
            </div>
            <button onClick={submit} disabled={submitting} style={{ ...C.btn, width: '100%', opacity: submitting ? 0.7 : 1 }}>{submitting ? '送出中...' : '確認送出訂單'}</button>
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

  const STATUS_TONE = { pending: 'yellow', confirmed: 'blue', purchasing: 'blue', partial_arrived: 'yellow', arrived: 'green', shipped: 'green', completed: 'green', cancelled: 'red' };

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const result = await dealerGet({ action: 'my_orders', token, page: String(p), limit: '20', status: statusFilter });
      setOrders(result.orders || []);
      setTotal(result.total || 0);
    } finally {
      setLoading(false);
    }
  }, [token, page, statusFilter]);

  useEffect(() => { load(1); }, [statusFilter]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['', '全部'], ['pending', '待處理'], ['confirmed', '已確認'], ['purchasing', '採購中'], ['arrived', '已到貨'], ['shipped', '已出貨']].map(([key, label]) => (
          <button key={key} onClick={() => { setStatusFilter(key); setPage(1); }} style={{ ...C.btnGhost, background: statusFilter === key ? 'rgba(59,130,246,0.15)' : 'transparent', color: statusFilter === key ? '#60a5fa' : C.textMuted, borderColor: statusFilter === key ? 'rgba(59,130,246,0.3)' : C.cardBorder, fontSize: 12, padding: '6px 14px' }}>{label}</button>
        ))}
      </div>

      <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 12 }}>共 {total} 筆訂單</div>

      {loading ? <div style={{ color: C.textMuted, padding: 40, textAlign: 'center' }}>載入中...</div> : orders.length === 0 ? <div style={{ color: C.textMuted, padding: 40, textAlign: 'center' }}>沒有訂單</div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {orders.map((order) => {
            const isExpanded = expandedId === order.id;
            return (
              <div key={order.id} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, overflow: 'hidden' }}>
                <div onClick={() => setExpandedId(isExpanded ? null : order.id)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 700, ...C.mono, minWidth: 130 }}>{order.order_no || '-'}</span>
                  <span style={C.tag(STATUS_TONE[order.status] || '')}>{order.status_label || order.status}</span>
                  <span style={{ fontSize: 12, color: C.textMuted, ...C.mono }}>{order.order_date || ''}</span>
                  <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 700, ...C.mono, marginLeft: 'auto' }}>{fmtP(order.total_amount)}</span>
                  <span style={{ color: C.textMuted, fontSize: 12 }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${C.cardBorder}` }}>
                    {order.remark && <div style={{ fontSize: 12, color: C.textMuted, padding: '10px 0 6px' }}>備註：{order.remark}</div>}
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 12 }}>
                          <span style={{ color: '#60a5fa', fontWeight: 600, ...C.mono, minWidth: 120 }}>{item.item_number_snapshot}</span>
                          <span style={{ color: C.text, flex: 1 }}>{item.description_snapshot || '-'}</span>
                          <span style={{ color: C.textMuted, ...C.mono }}>x{item.qty}</span>
                          <span style={{ color: '#22c55e', fontWeight: 600, ...C.mono }}>{fmtP(item.line_total)}</span>
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
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button onClick={() => { setPage(Math.max(1, page - 1)); load(Math.max(1, page - 1)); }} disabled={page <= 1} style={{ ...C.btnGhost, opacity: page <= 1 ? 0.4 : 1 }}>上一頁</button>
          <span style={{ color: C.textMuted, fontSize: 12, ...C.mono }}>P{page} / {totalPages}</span>
          <button onClick={() => { setPage(Math.min(totalPages, page + 1)); load(Math.min(totalPages, page + 1)); }} disabled={page >= totalPages} style={{ ...C.btnGhost, opacity: page >= totalPages ? 0.4 : 1 }}>下一頁</button>
        </div>
      )}
    </div>
  );
}

// ========== Settings Tab ==========
function SettingsTab({ token, user, onLogout }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState('');

  const changePw = async () => {
    setMsg('');
    try {
      const result = await dealerPost({ action: 'change_password', token, old_password: oldPw, new_password: newPw });
      setMsg(result.message || '密碼已更新');
      setOldPw('');
      setNewPw('');
    } catch (err) {
      setMsg(err.message || '更新失敗');
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '20px', marginBottom: 16 }}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 700, marginBottom: 14 }}>帳號資訊</div>
        <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.textMuted }}>帳號</span><span style={{ color: C.text, ...C.mono }}>{user?.username}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.textMuted }}>姓名</span><span style={{ color: C.text }}>{user?.display_name}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.textMuted }}>角色</span><span style={{ color: ROLE_COLORS[user?.role] || C.text, fontWeight: 600 }}>{user?.role_label}</span></div>
          {user?.company_name && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.textMuted }}>公司</span><span style={{ color: C.text }}>{user.company_name}</span></div>}
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '20px', marginBottom: 16 }}>
        <div style={{ fontSize: 15, color: C.text, fontWeight: 700, marginBottom: 14 }}>修改密碼</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="舊密碼" style={C.input} />
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="新密碼（至少 4 碼）" style={C.input} />
          {msg && <div style={{ fontSize: 12, color: msg.includes('失敗') || msg.includes('錯誤') ? '#ef4444' : '#22c55e' }}>{msg}</div>}
          <button onClick={changePw} style={C.btn}>更新密碼</button>
        </div>
      </div>

      <button onClick={onLogout} style={{ ...C.btnGhost, width: '100%', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>登出</button>
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

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(DEALER_TOKEN_KEY) : null;
    if (saved) {
      dealerGet({ action: 'me', token: saved })
        .then((result) => {
          setToken(saved);
          setUser(result.user);
          setRoleConfig(result.role_config);
        })
        .catch(() => {
          window.localStorage.removeItem(DEALER_TOKEN_KEY);
        });
    }
  }, []);

  const handleLogin = (t, u, rc) => {
    setToken(t);
    setUser(u);
    setRoleConfig(rc);
    window.localStorage.setItem(DEALER_TOKEN_KEY, t);
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setRoleConfig(null);
    setCart([]);
    window.localStorage.removeItem(DEALER_TOKEN_KEY);
  };

  if (!token || !user) {
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <LoginScreen onLogin={handleLogin} />
      </>
    );
  }

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  return (
    <>
      <style>{`html,body{margin:0;padding:0;background:${C.bg}!important}*{box-sizing:border-box}`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Noto Sans TC', sans-serif" }}>
        {/* Header */}
        <div style={{ background: C.card, borderBottom: `1px solid ${C.cardBorder}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11, ...C.mono }}>QB</div>
            <div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{user.display_name}</div>
              <div style={{ fontSize: 10, color: ROLE_COLORS[user.role] || C.textMuted, fontWeight: 600 }}>{user.role_label}{user.company_name ? ` · ${user.company_name}` : ''}</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, ...C.mono }}>Quick Buy</div>
        </div>

        {/* Tab navigation */}
        <div style={{ display: 'flex', background: C.card, borderBottom: `1px solid ${C.cardBorder}`, position: 'sticky', top: 56, zIndex: 99 }}>
          {TAB_LIST.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ flex: 1, padding: '12px 0', background: 'transparent', border: 'none', borderBottom: `2px solid ${activeTab === t.id ? '#3b82f6' : 'transparent'}`, color: activeTab === t.id ? '#fff' : C.textMuted, cursor: 'pointer', fontSize: 12, fontWeight: activeTab === t.id ? 700 : 400, fontFamily: "'Noto Sans TC', sans-serif", transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.id === 'cart' && cartCount > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>{cartCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '20px', maxWidth: 900, margin: '0 auto' }}>
          {activeTab === 'catalog' && <CatalogTab token={token} user={user} roleConfig={roleConfig} cart={cart} setCart={setCart} />}
          {activeTab === 'cart' && <CartTab token={token} user={user} cart={cart} setCart={setCart} setActiveTab={setActiveTab} />}
          {activeTab === 'orders' && <OrdersTab token={token} />}
          {activeTab === 'settings' && <SettingsTab token={token} user={user} onLogout={handleLogout} />}
        </div>
      </div>
    </>
  );
}
