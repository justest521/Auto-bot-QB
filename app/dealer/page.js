'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import D from './components/DealerStyles';
import Overview from './components/Overview';
import OrderList from './components/OrderList';
import OrderDetail from './components/OrderDetail';
import Procurement from './components/Procurement';
import ArrivalsNotify from './components/ArrivalsNotify';
import DealerInventory from './components/DealerInventory';
import MoreMenu from './components/MoreMenu';

const TOKEN_KEY = 'qb_dealer_token';

// ── API helpers ──
async function dealerGet(params) {
  // Extract token and send it via header to avoid exposing in URL/logs
  const { token, ...rest } = params;
  const qs = new URLSearchParams(rest).toString();
  const headers = {};
  if (token) headers['x-dealer-token'] = token;
  const res = await fetch(`/api/dealer?${qs}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
async function dealerPost(body) {
  // Extract token and send it via header to avoid exposing in request body logs
  const { token, ...rest } = body;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-dealer-token'] = token;
  const res = await fetch('/api/dealer', { method: 'POST', headers, body: JSON.stringify(rest) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── SVG Icon helper ──
function Icon({ d, size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// ── Tab definitions ──
const TABS = [
  { id: 'overview', label: '總覽', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { id: 'orders', label: '訂單', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { id: 'procurement', label: '商品', icon: 'M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16M10 11h4' },
  { id: 'arrivals', label: '到貨', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'more', label: '更多', icon: 'M4 6h16M4 12h16M4 18h16' },
];

// ── Login Screen ──
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
    <div style={{ minHeight: '100vh', background: D.color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{D.globalCSS}</style>
      <div style={{ width: '100%', maxWidth: 420, animation: 'fadeUp 0.4s ease forwards' }}>
        <div style={{ ...D.card, padding: '40px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: `linear-gradient(135deg, ${D.color.brand}, #22c55e)`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: 1,
              boxShadow: `0 12px 40px rgba(22,163,74,0.25)`,
              marginBottom: 18, fontFamily: D.font.mono,
            }}>QB</div>
            <div style={{ color: D.color.text, fontSize: D.size.h1, fontWeight: D.weight.black, letterSpacing: -0.5 }}>Quick Buy</div>
            <div style={{ color: D.color.text3, fontSize: D.size.caption, marginTop: 6, letterSpacing: 2, textTransform: 'uppercase', fontFamily: D.font.mono }}>Dealer Portal</div>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={{ ...D.label, display: 'block', marginBottom: 6 }}>帳號</label>
              <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="輸入帳號" style={D.input} />
            </div>
            <div>
              <label style={{ ...D.label, display: 'block', marginBottom: 6 }}>密碼</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="輸入密碼" style={D.input} />
            </div>
            {error && <div style={{ color: D.color.error, fontSize: D.size.caption, padding: '10px 14px', background: D.color.errorDim, borderRadius: D.radius.md, border: `1px solid rgba(239,68,68,0.15)` }}>{error}</div>}
            <button onClick={submit} disabled={loading} style={{ ...D.btnPrimary, width: '100%', marginTop: 4, padding: '14px 20px', fontSize: 15, opacity: loading ? 0.7 : 1 }}>
              {loading ? '登入中...' : '登入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function DealerPortal() {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [roleConfig, setRoleConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [cart, setCart] = useState([]);
  const [booting, setBooting] = useState(true);

  // Orders state (lifted for dual-column)
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Responsive detection
  const [isWide, setIsWide] = useState(false);

  // ── Client-only mount (prevents hydration mismatch #425) ──
  useEffect(() => {
    setMounted(true);
    const check = () => setIsWide(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Auth: boot from stored token ──
  useEffect(() => {
    if (!mounted) return;
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) { setBooting(false); return; }
    dealerGet({ action: 'me', token: stored })
      .then(res => {
        setToken(stored);
        setUser(res.user);
        setRoleConfig(res.role_config);
      })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); })
      .finally(() => setBooting(false));
  }, [mounted]);

  const handleLogin = (tk, usr, rc) => {
    localStorage.setItem(TOKEN_KEY, tk);
    setToken(tk);
    setUser(usr);
    setRoleConfig(rc);
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setRoleConfig(null);
    setActiveTab('overview');
    setCart([]);
    setOrders([]);
    setSelectedOrder(null);
    setSelectedOrderId(null);
  };

  // ── Orders: load list ──
  const loadOrders = useCallback(async () => {
    if (!token) return;
    setOrdersLoading(true);
    try {
      const res = await dealerGet({ action: 'my_orders', token, page: '1', limit: '50' });
      setOrders(res.orders || []);
    } catch (e) {
      console.error('loadOrders error:', e);
    } finally {
      setOrdersLoading(false);
    }
  }, [token]);

  // Load orders when entering orders tab
  useEffect(() => {
    if (activeTab === 'orders' && token && orders.length === 0) {
      loadOrders();
    }
  }, [activeTab, token]);

  // ── Orders: load detail ──
  const loadOrderDetail = useCallback(async (orderId) => {
    if (!token || !orderId) return;
    setSelectedOrderId(orderId);
    setDetailLoading(true);
    try {
      const res = await dealerGet({ action: 'order_detail', token, order_id: orderId });
      setSelectedOrder(res.order || null);
    } catch (e) {
      console.error('loadOrderDetail error:', e);
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  // ── SSR or Booting: show minimal loading shell ──
  if (!mounted || booting) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f6f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{D.globalCSS}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #16a34a, #22c55e)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 18, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 12 }}>QB</div>
          <div style={{ color: '#6b7280', fontSize: 12 }}>載入中...</div>
        </div>
      </div>
    );
  }

  // ── Not logged in ──
  if (!token) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // ── Tab content renderer ──
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div style={{ maxWidth: 900, margin: '0 auto', padding: isWide ? '0 24px' : '0 16px' }}>
            <Overview
              token={token}
              user={user}
              roleConfig={roleConfig}
              dealerGet={dealerGet}
              onNavigateToOrder={(orderId) => { setActiveTab('orders'); setTimeout(() => loadOrderDetail(orderId), 100); }}
            />
          </div>
        );

      case 'orders':
        if (isWide) {
          // iPad dual-column layout
          return (
            <div style={{ display: 'flex', height: 'calc(100vh - 110px)', overflow: 'hidden' }}>
              <div style={{ width: 400, minWidth: 360, borderRight: `1px solid ${D.color.border}`, overflowY: 'auto', background: D.color.bg }}>
                <OrderList
                  token={token}
                  orders={orders}
                  loading={ordersLoading}
                  selectedOrderId={selectedOrderId}
                  onSelectOrder={loadOrderDetail}
                  onRefresh={loadOrders}
                  onNewOrder={() => setActiveTab('procurement')}
                />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', background: D.color.muted }}>
                {selectedOrder ? (
                  <OrderDetail
                    order={selectedOrder}
                    token={token}
                    onBack={null}
                    onRefresh={() => { loadOrders(); loadOrderDetail(selectedOrderId); }}
                  />
                ) : detailLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: D.color.text3, fontSize: D.size.body }}>載入中...</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8 }}>
                    <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" size={32} color={D.color.textDisabled} />
                    <div style={{ color: D.color.textDisabled, fontSize: D.size.body }}>選取一筆訂單查看詳情</div>
                  </div>
                )}
              </div>
            </div>
          );
        }
        // Mobile: show detail or list
        if (selectedOrder) {
          return (
            <OrderDetail
              order={selectedOrder}
              token={token}
              onBack={() => { setSelectedOrder(null); setSelectedOrderId(null); }}
              onRefresh={() => { loadOrders(); loadOrderDetail(selectedOrderId); }}
            />
          );
        }
        return (
          <OrderList
            token={token}
            orders={orders}
            loading={ordersLoading}
            selectedOrderId={selectedOrderId}
            onSelectOrder={loadOrderDetail}
            onRefresh={loadOrders}
            onNewOrder={() => setActiveTab('procurement')}
          />
        );

      case 'procurement':
        return (
          <div style={{ maxWidth: 900, margin: '0 auto', padding: isWide ? '0 24px' : '0 16px' }}>
            <Procurement
              token={token}
              user={user}
              roleConfig={roleConfig}
              dealerGet={dealerGet}
              dealerPost={dealerPost}
              cart={cart}
              setCart={setCart}
              isWide={isWide}
              onOrderPlaced={(orderId) => {
                setActiveTab('orders');
                loadOrders();
                if (orderId) setTimeout(() => loadOrderDetail(orderId), 400);
              }}
            />
          </div>
        );

      case 'arrivals':
        return (
          <div style={{ maxWidth: 900, margin: '0 auto', padding: isWide ? '0 24px' : '0 16px' }}>
            <ArrivalsNotify token={token} dealerGet={dealerGet} dealerPost={dealerPost} />
          </div>
        );

      case 'more':
        return (
          <div style={{ maxWidth: 600, margin: '0 auto', padding: isWide ? '0 24px' : '0 16px' }}>
            <MoreMenu
              token={token}
              user={user}
              roleConfig={roleConfig}
              dealerGet={dealerGet}
              dealerPost={dealerPost}
              onLogout={handleLogout}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: D.color.bg, fontFamily: D.font.base, color: D.color.text, paddingBottom: 70 }}>
      <style>{D.globalCSS}</style>

      {/* ── Header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${D.color.border}`,
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${D.color.brand}, #22c55e)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: 12, fontFamily: D.font.mono,
          }}>QB</div>
          <div>
            <div style={{ fontSize: D.size.h3, fontWeight: D.weight.bold, color: D.color.text }}>
              {TABS.find(tb => tb.id === activeTab)?.label || ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {cart.length > 0 && activeTab !== 'procurement' && (
            <button onClick={() => setActiveTab('procurement')} style={{
              ...D.btnGhost, padding: '6px 12px', fontSize: D.size.caption,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Icon d="M3 3h2l.4 2M7 13h10l4-8H5.4" size={14} />
              <span style={{ ...D.mono, fontWeight: D.weight.bold, color: D.color.brand }}>{cart.length}</span>
            </button>
          )}
          <div style={{
            width: 32, height: 32, borderRadius: D.radius.full,
            background: D.color.brandLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: D.color.brand, fontWeight: D.weight.bold, fontSize: D.size.caption,
          }}>
            {(user?.display_name || user?.username || 'U').charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ paddingTop: 8, paddingBottom: activeTab === 'orders' && isWide ? 0 : 8 }}>
        {renderTabContent()}
      </div>

      {/* ── Bottom Tab Bar ── */}
      {!(activeTab === 'orders' && !isWide && selectedOrder) && (
        <div style={D.tabBar}>
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => {
                setActiveTab(tb.id);
                if (tb.id !== 'orders') { setSelectedOrder(null); setSelectedOrderId(null); }
              }}
              style={D.tabItem(activeTab === tb.id)}
            >
              <Icon d={tb.icon} size={20} />
              <span>{tb.label}</span>
              {tb.id === 'procurement' && cart.length > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: '50%', marginRight: -16,
                  width: 16, height: 16, borderRadius: D.radius.full,
                  background: D.color.error, color: '#fff',
                  fontSize: 9, fontWeight: D.weight.bold,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{cart.length}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
