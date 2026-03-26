'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const DEALER_TOKEN_KEY = 'qb_dealer_token';
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '';

// ========== Google Maps Loader ==========
let gmapsPromise = null;
function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!GMAPS_KEY) return Promise.resolve(null);
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places,geometry&language=zh-TW`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => { gmapsPromise = null; reject(new Error('Google Maps failed to load')); };
    document.head.appendChild(script);
  });
  return gmapsPromise;
}

// Geocode address to lat/lng
async function geocodeAddress(address) {
  const maps = await loadGoogleMaps();
  if (!maps) return null;
  return new Promise((resolve) => {
    const geocoder = new maps.Geocoder();
    geocoder.geocode({ address, region: 'TW' }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng(), formatted: results[0].formatted_address });
      } else {
        resolve(null);
      }
    });
  });
}

// ========== RouteMap Component ==========
function RouteMap({ items, height }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maps = await loadGoogleMaps();
      if (!maps || cancelled || !mapRef.current) return;
      if (!mapInstance.current) {
        mapInstance.current = new maps.Map(mapRef.current, {
          center: { lat: 23.5, lng: 121 },
          zoom: 7,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
          ],
        });
      }
      const map = mapInstance.current;

      // Clear old markers
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];

      // Filter items with valid coordinates
      const withCoords = (items || []).filter(s => s.latitude && s.longitude);

      // If no coords, try geocoding the first few addresses
      const toGeocode = (items || []).filter(s => !s.latitude && !s.longitude && s.address).slice(0, 10);
      const geocoded = [];
      for (const s of toGeocode) {
        const geo = await geocodeAddress(s.address);
        if (geo) {
          geocoded.push({ ...s, latitude: geo.lat, longitude: geo.lng });
        }
      }

      const allItems = [...withCoords, ...geocoded];
      if (allItems.length === 0) return;

      const bounds = new maps.LatLngBounds();
      const PRIORITY_MARKER_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };

      allItems.forEach((s, idx) => {
        const pos = { lat: Number(s.latitude), lng: Number(s.longitude) };
        const pColor = s.priority >= 70 ? 'high' : s.priority >= 40 ? 'medium' : 'low';
        const isCustomer = s.type === 'customer';
        const label = String(idx + 1);

        const marker = new maps.Marker({
          position: pos,
          map,
          label: { text: label, color: '#fff', fontSize: '11px', fontWeight: '700' },
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: PRIORITY_MARKER_COLORS[pColor],
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
          title: s.shop_name,
          zIndex: 100 - idx,
        });

        const info = new maps.InfoWindow({
          content: `<div style="font-family:'Noto Sans TC',sans-serif;padding:4px 0">
            <div style="font-weight:700;font-size:13px">${isCustomer ? '🏢' : '🏪'} ${s.shop_name}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">${s.address || ''}</div>
            ${s.reasons?.length ? `<div style="font-size:11px;margin-top:4px">${s.reasons.join(' · ')}</div>` : ''}
            ${isCustomer && s.total_amount ? `<div style="font-size:11px;color:#059669;margin-top:2px">累計 NT$${Number(s.total_amount).toLocaleString()}</div>` : ''}
          </div>`,
        });
        marker.addListener('click', () => info.open(map, marker));
        markersRef.current.push(marker);
        bounds.extend(pos);
      });

      // Draw route line between markers
      if (allItems.length > 1) {
        const path = allItems.map(s => ({ lat: Number(s.latitude), lng: Number(s.longitude) }));
        const line = new maps.Polyline({
          path,
          geodesic: true,
          strokeColor: '#f59e0b',
          strokeOpacity: 0.6,
          strokeWeight: 3,
          icons: [{ icon: { path: maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: '#f59e0b' }, offset: '50%' }],
        });
        line.setMap(map);
        markersRef.current.push(line); // store to clean up
      }

      map.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 });
      if (allItems.length === 1) map.setZoom(15);
    })();
    return () => { cancelled = true; };
  }, [items]);

  if (!GMAPS_KEY) return null;
  return <div ref={mapRef} style={{ width: '100%', height: height || 250, borderRadius: 12, overflow: 'hidden', background: '#f3f4f6' }} />;
}

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

const ROLE_COLORS = { dealer: '#16a34a', sales: '#f59e0b', technician: '#10b981' };
const ROLE_GRADIENTS = {
  dealer: '#16a34a',
  sales: 'linear-gradient(135deg, #f59e0b, #f97316)',
  technician: 'linear-gradient(135deg, #10b981, #06b6d4)',
};

const TAB_LIST_BASE = [
  { id: 'catalog', label: '商品目錄', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'cart', label: '下單', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z' },
  { id: 'orders', label: '訂單', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { id: 'stats', label: '業績', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'notifications', label: '通知', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'profile', label: '個人', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
];
const PROSPECT_TAB = { id: 'prospects', label: '開發', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z' };

function getTabList() {
  const tabs = [...TAB_LIST_BASE];
  tabs.splice(4, 0, PROSPECT_TAB); // insert before notifications
  return tabs;
}

// ========== Global CSS ==========
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Noto+Sans+TC:wght@300;400;500;600;700;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#f5f6f7;overflow-x:hidden}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.15);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,0.2)}

@keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
@keyframes slideDown { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
@keyframes glow { 0%,100%{box-shadow:0 0 5px rgba(22,163,74,0.3)} 50%{box-shadow:0 0 20px rgba(22,163,74,0.3)} }
@keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
@keyframes gridPulse { 0%,100%{opacity:0.03} 50%{opacity:0.06} }
@keyframes countUp { from{opacity:0;transform:scale(0.5)} to{opacity:1;transform:scale(1)} }
@keyframes borderGlow { 0%{border-color:rgba(22,163,74,0.2)} 50%{border-color:rgba(22,163,74,0.2)} 100%{border-color:rgba(22,163,74,0.2)} }
@keyframes ripple { to{transform:scale(4);opacity:0} }

.qb-card{
  background:#ffffff;
  backdrop-filter:blur(20px);
  border:1px solid #e5e7eb;
  border-radius:16px;
  transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
}
.qb-card:hover{
  border-color:#d1d5db;
  box-shadow:0 4px 12px rgba(0,0,0,0.08);
  transform:translateY(-1px);
}
.qb-card-glow{
  background:#ffffff;
  backdrop-filter:blur(20px);
  border:1px solid #e5e7eb;
  border-radius:16px;
  box-shadow:0 1px 3px rgba(0,0,0,0.06);
}
.qb-glass{
  background:#f9fafb;
  backdrop-filter:blur(10px);
  border:1px solid #e5e7eb;
  border-radius:12px;
}
.qb-input{
  background:#ffffff;
  border:1px solid #e5e7eb;
  border-radius:12px;
  padding:12px 16px;
  color:#111827;
  font-size:13px;
  outline:none;
  width:100%;
  font-family:'Noto Sans TC','Inter',sans-serif;
  transition:all 0.3s;
}
.qb-input:focus{
  border-color:#16a34a;
  box-shadow:0 0 0 3px rgba(22,163,74,0.1);
}
.qb-input::placeholder{color:#9ca3af}
.qb-btn{
  background:#16a34a;
  color:#fff;border:none;border-radius:12px;
  padding:10px 20px;font-weight:600;cursor:pointer;
  font-size:13px;font-family:'Noto Sans TC','Inter',sans-serif;
  box-shadow:0 1px 3px rgba(22,163,74,0.3);
  transition:all 0.3s;position:relative;overflow:hidden;
}
.qb-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(22,163,74,0.3)}
.qb-btn:active{transform:translateY(0)}
.qb-btn-ghost{
  background:#fff;color:#374151;
  border:1px solid #e5e7eb;border-radius:10px;
  padding:8px 16px;cursor:pointer;font-size:12px;
  font-family:'Noto Sans TC','Inter',sans-serif;transition:all 0.3s;
}
.qb-btn-ghost:hover{background:#f9fafb;border-color:#d1d5db}
.qb-tag{
  display:inline-flex;align-items:center;padding:4px 12px;
  border-radius:8px;font-size:11px;font-weight:600;
  letter-spacing:0.5px;
}
.qb-mono{font-family:'JetBrains Mono',monospace;letter-spacing:0.5px}
.qb-anim-in{animation:fadeInUp 0.5s ease-out both}
.qb-grid-bg{
  position:fixed;top:0;left:0;right:0;bottom:0;
  background-image:none;opacity:0;
  background-size:60px 60px;
  animation:gridPulse 8s ease-in-out infinite;
  pointer-events:none;z-index:0;
}
.qb-orb{
  position:fixed;border-radius:50%;filter:blur(80px);opacity:0.15;pointer-events:none;z-index:0;
}
.qb-stat-num{
  font-size:28px;font-weight:800;letter-spacing:-0.5px;
  background:none;
  -webkit-background-clip:text;-webkit-text-fill-color:#111827;
  animation:countUp 0.6s ease-out both;
}
.qb-bar{height:6px;border-radius:3px;background:#e5e7eb;overflow:hidden}
.qb-bar-fill{height:100%;border-radius:3px;background:#16a34a;transition:width 0.8s cubic-bezier(0.4,0,0.2,1)}
.qb-noti-dot{
  position:absolute;top:-2px;right:-2px;width:8px;height:8px;
  background:#ef4444;border-radius:50%;
  animation:pulse 2s infinite;
}
.qb-shimmer{
  background:linear-gradient(90deg,transparent 0%,rgba(0,0,0,0.04) 50%,transparent 100%);
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
    <div style={{ minHeight: '100vh', background: '#f5f6f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', overflow: 'hidden' }}>
      <style>{GLOBAL_CSS}</style>
      <div className="qb-grid-bg" />
      <div className="qb-orb" style={{ width: 400, height: 400, background: '#16a34a', top: '-10%', left: '-10%' }} />
      <div className="qb-orb" style={{ width: 300, height: 300, background: 'rgba(22,163,74,0.3)', bottom: '-5%', right: '-5%' }} />

      <div className="qb-anim-in" style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
        <div className="qb-card-glow" style={{ padding: '40px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              background: 'linear-gradient(135deg, #16a34a, #22c55e)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#111827', fontWeight: 900, fontSize: 22, letterSpacing: 1,
              boxShadow: '0 12px 40px rgba(22,163,74,0.3)',
              marginBottom: 20, animation: 'float 3s ease-in-out infinite',
              fontFamily: "'JetBrains Mono', monospace",
            }}>QB</div>
            <div style={{ color: '#111827', fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>Quick Buy</div>
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 8, letterSpacing: 2 }}>DEALER PORTAL</div>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' }}>帳號</label>
              <input className="qb-input" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="輸入帳號" />
            </div>
            <div>
              <label style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' }}>密碼</label>
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
  const [error, setError] = useState('');

  const load = useCallback(async (p = page, q = search) => {
    setLoading(true);
    setError('');
    try {
      const result = await dealerGet({ action: 'products', token, page: String(p), limit: '30', q, stock_only: stockOnly ? '1' : '0' });
      setProducts(result.products || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('[CatalogTab load error]', err);
      setError(err.message || '載入失敗');
      setProducts([]);
      setTotal(0);
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: '8px 12px', borderRadius: 10, background: stockOnly ? 'rgba(22,163,74,0.1)' : 'transparent', border: `1px solid ${stockOnly ? '#f3f4f6' : 'rgba(22,163,74,0.1)'}`, transition: 'all 0.3s' }}>
          <input type="checkbox" checked={stockOnly} onChange={(e) => setStockOnly(e.target.checked)} style={{ accentColor: '#16a34a' }} />
          有庫存
        </label>
        <button className="qb-btn" onClick={doSearch}>查詢</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          共 <span style={{ color: '#16a34a', fontWeight: 700 }} className="qb-mono">{total}</span> 項
        </span>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          價格：<span style={{ color: '#16a34a', fontWeight: 600 }}>{roleConfig?.price_label || '零售價'}</span>
        </span>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', borderRadius: 12, marginBottom: 16, fontSize: 13, background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
          載入錯誤：{error}
          <button className="qb-btn-ghost" onClick={() => load(page, search)} style={{ marginLeft: 12, fontSize: 11, padding: '4px 12px' }}>重試</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div className="qb-shimmer" style={{ width: 200, height: 4, borderRadius: 2, margin: '0 auto 12px' }} />
          <span style={{ color: '#6b7280', fontSize: 12 }}>載入中...</span>
        </div>
      ) : products.length === 0 && !error ? (
        <div style={{ color: '#6b7280', padding: 60, textAlign: 'center', fontSize: 13 }}>沒有找到商品</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {products.map((p, idx) => {
            const inCart = cartQty(p.item_number);
            return (
              <div key={p.item_number} className="qb-card" style={{
                padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
                borderLeftWidth: 3, borderLeftColor: inCart > 0 ? '#16a34a' : '#e5e7eb',
                animationDelay: `${idx * 0.03}s`, animation: 'fadeInUp 0.4s ease-out both',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="qb-mono" style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>{p.item_number}</span>
                    {p.category && <span style={{ fontSize: 10, color: '#6b7280', padding: '2px 6px', background: '#f3f4f6', borderRadius: 4 }}>{p.category}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description || '-'}</div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 6, alignItems: 'center' }}>
                    <span className="qb-mono" style={{ fontSize: 15, color: '#16a34a', fontWeight: 700 }}>{fmtP(p.price)}</span>
                    {p.stock_qty !== null && (
                      <span style={{ fontSize: 11, color: p.stock_qty > 0 ? 'rgba(52,211,153,0.8)' : 'rgba(248,113,113,0.8)' }}>
                        庫存 {p.stock_qty}
                      </span>
                    )}
                    {roleConfig?.can_see_cost && <span className="qb-mono" style={{ fontSize: 11, color: '#6b7280' }}>美金成本 {fmtP(p.us_price)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {inCart > 0 && <span className="qb-tag qb-mono" style={{ background: '#dcfce7', color: '#16a34a', fontSize: 13 }}>{inCart}</span>}
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
          <span className="qb-mono" style={{ color: '#6b7280', fontSize: 12 }}>{page} / {totalPages}</span>
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
        <div style={{ padding: '14px 18px', borderRadius: 12, marginBottom: 20, fontSize: 13, background: message.includes('失敗') ? 'rgba(239,68,68,0.08)' : 'rgba(52,211,153,0.08)', color: message.includes('失敗') ? '#f87171' : '#16a34a', border: `1px solid ${message.includes('失敗') ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.15)'}`, animation: 'slideDown 0.3s' }}>
          {message}
        </div>
      )}

      {cart.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
            <SvgIcon d={TAB_LIST_BASE[1].icon} size={64} color="#f3f4f6" />
          </div>
          <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>購物車是空的</div>
          <button className="qb-btn" onClick={() => setActiveTab('catalog')}>前往商品目錄</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
            {cart.map((item, idx) => (
              <div key={item.item_number} className="qb-card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s both` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="qb-mono" style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>{item.item_number}</div>
                  <div style={{ fontSize: 13, color: '#111827', marginTop: 2 }}>{item.description || '-'}</div>
                  <div className="qb-mono" style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>{fmtP(item.price)} x {item.qty} = {fmtP(item.price * item.qty)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button className="qb-btn-ghost" onClick={() => updateQty(item.item_number, item.qty - 1)} style={{ padding: '6px 12px', fontSize: 14, fontWeight: 700 }}>-</button>
                  <span className="qb-mono" style={{ color: '#111827', fontSize: 15, fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{item.qty}</span>
                  <button className="qb-btn-ghost" onClick={() => updateQty(item.item_number, item.qty + 1)} style={{ padding: '6px 12px', fontSize: 14, fontWeight: 700 }}>+</button>
                  <button className="qb-btn-ghost" onClick={() => updateQty(item.item_number, 0)} style={{ padding: '6px 10px', fontSize: 11, color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}>刪除</button>
                </div>
              </div>
            ))}
          </div>

          <div className="qb-card-glow" style={{ padding: '24px' }}>
            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#111827' }}>
                <span>小計 ({cart.reduce((s, c) => s + c.qty, 0)} 項)</span>
                <span className="qb-mono">{fmtP(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280' }}>
                <span>稅額 5%</span>
                <span className="qb-mono">{fmtP(tax)}</span>
              </div>
              <div style={{ height: 1, background: '#f3f4f6' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800 }}>
                <span style={{ color: '#111827' }}>總額</span>
                <span className="qb-mono" style={{ color: '#16a34a' }}>{fmtP(total)}</span>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 8, letterSpacing: 1 }}>備註</label>
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

  const STATUS_TONE = { pending: '#eab308', confirmed: '#16a34a', purchasing: '#3b82f6', partial_arrived: '#f59e0b', arrived: '#16a34a', shipped: '#22d3ee', completed: '#10b981', cancelled: '#ef4444' };

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
            background: statusFilter === key ? '#dcfce7' : 'transparent',
            color: statusFilter === key ? '#16a34a' : '#9ca3af',
            borderColor: statusFilter === key ? '#f3f4f6' : 'rgba(22,163,74,0.1)',
            fontSize: 12, padding: '6px 14px',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 14 }}>
        共 <span className="qb-mono" style={{ color: '#16a34a' }}>{total}</span> 筆訂單
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div className="qb-shimmer" style={{ width: 200, height: 4, borderRadius: 2, margin: '0 auto' }} />
        </div>
      ) : orders.length === 0 ? (
        <div style={{ color: '#6b7280', padding: 60, textAlign: 'center', fontSize: 13 }}>沒有訂單</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {orders.map((order, idx) => {
            const isExpanded = expandedId === order.id;
            const statusColor = STATUS_TONE[order.status] || '#94a3b8';
            return (
              <div key={order.id} className="qb-card" style={{ overflow: 'hidden', animation: `fadeInUp 0.3s ease-out ${idx * 0.04}s both` }}>
                <div onClick={() => setExpandedId(isExpanded ? null : order.id)} style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="qb-mono" style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, minWidth: 130 }}>{order.order_no || '-'}</span>
                  <span className="qb-tag" style={{ background: `${statusColor}15`, color: statusColor }}>{order.status_label || order.status}</span>
                  <span className="qb-mono" style={{ fontSize: 12, color: '#6b7280' }}>{order.order_date || ''}</span>
                  <span className="qb-mono" style={{ fontSize: 14, color: '#16a34a', fontWeight: 700, marginLeft: 'auto' }}>{fmtP(order.total_amount)}</span>
                  <span style={{ color: '#6b7280', fontSize: 10, transition: 'transform 0.3s', transform: isExpanded ? 'rotate(180deg)' : '' }}>&#x25BC;</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 18px 16px', borderTop: '1px solid #f3f4f6', animation: 'slideDown 0.3s' }}>
                    {order.remark && <div style={{ fontSize: 12, color: '#6b7280', padding: '12px 0 8px' }}>備註：{order.remark}</div>}
                    <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                      {(order.items || []).map((item, i) => (
                        <div key={i} className="qb-glass" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', fontSize: 12 }}>
                          <span className="qb-mono" style={{ color: '#16a34a', fontWeight: 600, minWidth: 110 }}>{item.item_number_snapshot}</span>
                          <span style={{ color: '#111827', flex: 1 }}>{item.description_snapshot || '-'}</span>
                          <span className="qb-mono" style={{ color: '#6b7280' }}>x{item.qty}</span>
                          <span className="qb-mono" style={{ color: '#16a34a', fontWeight: 600 }}>{fmtP(item.line_total)}</span>
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
          <span className="qb-mono" style={{ color: '#6b7280', fontSize: 12 }}>{page} / {totalPages}</span>
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
            background: range === k ? '#dcfce7' : 'transparent',
            color: range === k ? '#16a34a' : '#9ca3af',
            borderColor: range === k ? '#f3f4f6' : 'rgba(22,163,74,0.1)',
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
              { label: '訂單金額', value: fmtP(data.total_amount), color: '#16a34a' },
              { label: '訂單數', value: data.total_orders, color: '#16a34a' },
              { label: '平均單價', value: fmtP(data.avg_order_amount), color: '#f59e0b' },
            ].map((kpi, idx) => (
              <div key={idx} className="qb-card-glow" style={{ padding: '20px', textAlign: 'center', animation: `fadeInUp 0.5s ease-out ${idx * 0.1}s both` }}>
                <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>{kpi.label}</div>
                <div className="qb-stat-num qb-mono" style={{ background: `linear-gradient(135deg, ${kpi.color}, #111827)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Monthly Trend */}
          <div className="qb-card-glow" style={{ padding: '24px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>月度趨勢</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
              {(data.monthly_trend || []).map((m, idx) => (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span className="qb-mono" style={{ fontSize: 10, color: '#6b7280' }}>{fmtP(m.amount)}</span>
                  <div style={{
                    width: '100%', maxWidth: 50, borderRadius: '6px 6px 0 0',
                    background: 'linear-gradient(180deg, #16a34a, #f3f4f6)',
                    height: `${Math.max(4, (m.amount / maxTrend) * 100)}%`,
                    transition: 'height 0.8s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: m.amount > 0 ? '0 -4px 12px #f3f4f6' : 'none',
                    animation: `fadeInUp 0.5s ease-out ${idx * 0.1}s both`,
                  }} />
                  <span className="qb-mono" style={{ fontSize: 10, color: '#6b7280' }}>{m.month.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Breakdown */}
          {(data.status_breakdown || []).length > 0 && (
            <div className="qb-card-glow" style={{ padding: '24px', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>訂單狀態</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {(data.status_breakdown || []).map((s, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: '#16a34a', minWidth: 70 }}>{s.label}</span>
                    <div className="qb-bar" style={{ flex: 1 }}>
                      <div className="qb-bar-fill" style={{ width: `${Math.max(3, (s.count / Math.max(data.total_orders, 1)) * 100)}%` }} />
                    </div>
                    <span className="qb-mono" style={{ fontSize: 12, color: '#6b7280', minWidth: 30, textAlign: 'right' }}>{s.count}</span>
                    <span className="qb-mono" style={{ fontSize: 11, color: '#6b7280', minWidth: 80, textAlign: 'right' }}>{fmtP(s.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Products */}
          {(data.top_products || []).length > 0 && (
            <div className="qb-card-glow" style={{ padding: '24px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>熱銷商品 TOP 10</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.top_products.map((p, idx) => (
                  <div key={idx} className="qb-glass" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800,
                      background: idx < 3 ? '#16a34a' : 'rgba(22,163,74,0.1)',
                      color: idx < 3 ? '#fff' : '#9ca3af',
                    }}>{idx + 1}</span>
                    <span className="qb-mono" style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, minWidth: 100 }}>{p.item_number}</span>
                    <span style={{ fontSize: 12, color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>
                    <span className="qb-mono" style={{ fontSize: 11, color: '#6b7280' }}>x{p.total_qty}</span>
                    <span className="qb-mono" style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{fmtP(p.total_amount)}</span>
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
    arrival: { color: '#16a34a', bg: 'rgba(52,211,153,0.1)', icon: 'M5 8l4 4 6-6' },
    shipped: { color: '#22d3ee', bg: 'rgba(34,211,238,0.1)', icon: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0' },
    confirmed: { color: '#16a34a', bg: 'rgba(22,163,74,0.1)', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    purchasing: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    completed: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
    cancelled: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' },
    info: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  };

  return (
    <div className="qb-anim-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>通知中心</span>
        {newCount > 0 && (
          <span className="qb-tag" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', animation: 'pulse 2s infinite' }}>{newCount} 則新通知</span>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div className="qb-shimmer" style={{ width: 200, height: 4, borderRadius: 2, margin: '0 auto' }} />
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>沒有通知</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {notifications.map((n, idx) => {
            const cfg = TYPE_ICON[n.type] || TYPE_ICON.info;
            const isNew = n.time > new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
            return (
              <div key={n.id} className="qb-card" style={{
                padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
                borderLeftWidth: 3, borderLeftColor: isNew ? cfg.color : '#f3f4f6',
                animation: `fadeInUp 0.3s ease-out ${idx * 0.04}s both`,
              }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SvgIcon d={cfg.icon} size={18} color={cfg.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#111827', fontWeight: isNew ? 600 : 400 }}>{n.message}</div>
                  <div className="qb-mono" style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{timeAgo(n.time)}</div>
                </div>
                {n.amount > 0 && <span className="qb-mono" style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, flexShrink: 0 }}>{fmtP(n.amount)}</span>}
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

  const roleColor = ROLE_COLORS[user?.role] || '#16a34a';
  const roleGrad = ROLE_GRADIENTS[user?.role] || '#16a34a';

  return (
    <div className="qb-anim-in" style={{ maxWidth: 520 }}>
      {/* Profile Header */}
      <div className="qb-card-glow" style={{ padding: '28px 24px', marginBottom: 16, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, background: roleGrad, opacity: 0.15 }} />
        <div style={{
          width: 64, height: 64, borderRadius: 20, background: roleGrad,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#111827', fontWeight: 900, fontSize: 24, marginBottom: 12,
          boxShadow: `0 8px 24px ${roleColor}40`,
          fontFamily: "'Noto Sans TC', sans-serif", position: 'relative',
        }}>{(user?.display_name || 'U')[0]}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', position: 'relative' }}>{user?.display_name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, position: 'relative' }}>
          <span className="qb-tag" style={{ background: `${roleColor}20`, color: roleColor }}>{user?.role_label}</span>
          {user?.company_name && <span style={{ color: '#6b7280', fontSize: 12 }}>{user.company_name}</span>}
        </div>
        <div className="qb-mono" style={{ fontSize: 11, color: '#6b7280', marginTop: 8, position: 'relative' }}>
          @{user?.username}
        </div>
      </div>

      {/* Info Cards */}
      <div className="qb-card-glow" style={{ padding: '24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>個人資訊</span>
          <button className="qb-btn-ghost" onClick={() => setEditing(!editing)} style={{ fontSize: 11 }}>{editing ? '取消' : '編輯'}</button>
        </div>
        {msg && <div style={{ fontSize: 12, marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: msg.includes('失敗') || msg.includes('錯誤') ? 'rgba(239,68,68,0.08)' : 'rgba(52,211,153,0.08)', color: msg.includes('失敗') || msg.includes('錯誤') ? '#f87171' : '#16a34a', animation: 'fadeIn 0.3s' }}>{msg}</div>}
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            { key: 'display_name', label: '姓名' },
            { key: 'company_name', label: '公司' },
            { key: 'phone', label: '電話' },
            { key: 'email', label: '信箱' },
          ].map(f => (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#6b7280', fontSize: 12, minWidth: 50 }}>{f.label}</span>
              {editing ? (
                <input className="qb-input" value={form[f.key] || ''} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={{ fontSize: 13 }} />
              ) : (
                <span style={{ color: '#111827', fontSize: 13 }}>{user?.[f.key] || '-'}</span>
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
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>權限與狀態</div>
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
              <span style={{ color: '#6b7280' }}>{item.label}</span>
              <span style={{ color: item.ok !== undefined ? (item.ok ? '#16a34a' : '#9ca3af') : '#111827', fontWeight: 500 }}>
                {item.ok !== undefined && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: item.ok ? '#16a34a' : '#d1d5db', marginRight: 6 }} />}
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Change Password */}
      <div className="qb-card-glow" style={{ padding: '24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>修改密碼</div>
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

// ========== Prospects Tab (Sales only) ==========
const PROSPECT_STATUS = [
  { value: '', label: '全部狀態' },
  { value: 'new', label: '新名單', color: '#6b7280' },
  { value: 'contacted', label: '已聯繫', color: '#3b82f6' },
  { value: 'visited', label: '已拜訪', color: '#8b5cf6' },
  { value: 'interested', label: '有意願', color: '#f59e0b' },
  { value: 'rejected', label: '無意願', color: '#ef4444' },
  { value: 'converted', label: '已轉客戶', color: '#16a34a' },
];
const PROSPECT_CATEGORY = [
  { value: '', label: '全部類型' },
  { value: 'motorcycle', label: '機車' },
  { value: 'car', label: '汽車' },
  { value: 'electric', label: '電動車' },
  { value: 'scooter', label: '速克達' },
  { value: 'other', label: '其他' },
];
const CATEGORY_EMOJI = { motorcycle: '🏍️', car: '🚗', electric: '⚡', scooter: '🛵', other: '📦' };
const VISIT_RESULT = [
  { value: 'not_home', label: '不在' },
  { value: 'talked', label: '已交談' },
  { value: 'interested', label: '有興趣' },
  { value: 'sample_given', label: '已給樣品' },
  { value: 'order_placed', label: '下單' },
  { value: 'rejected', label: '拒絕' },
];

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const PRIORITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };

function ProspectsTab({ token, user }) {
  const [prospects, setProspects] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusF, setStatusF] = useState('');
  const [categoryF, setCategoryF] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState('');
  const [showVisitForm, setShowVisitForm] = useState(false);
  const tableRef = useRef(null);

  // Smart route states
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [routeView, setRouteView] = useState('today'); // today | week
  const [showRoute, setShowRoute] = useState(true);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('motorcycle');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formDistrict, setFormDistrict] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formLat, setFormLat] = useState(null);
  const [formLng, setFormLng] = useState(null);
  const addressInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  // Visit form states
  const [visitResult, setVisitResult] = useState('talked');
  const [visitNotes, setVisitNotes] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));

  // Click outside to collapse
  useEffect(() => {
    const handler = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        setExpandedId(null);
        setDetail(null);
        setShowVisitForm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Google Places Autocomplete for address
  useEffect(() => {
    if (!showAdd || !GMAPS_KEY) return;
    let ac = null;
    const init = async () => {
      const maps = await loadGoogleMaps();
      if (!maps || !addressInputRef.current) return;
      ac = new maps.places.Autocomplete(addressInputRef.current, {
        componentRestrictions: { country: 'tw' },
        fields: ['formatted_address', 'geometry', 'address_components', 'name'],
        types: ['establishment', 'geocode'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (place.formatted_address) setFormAddress(place.formatted_address);
        if (place.geometry?.location) {
          setFormLat(place.geometry.location.lat());
          setFormLng(place.geometry.location.lng());
        }
        // Auto-fill city/district from address_components
        if (place.address_components) {
          for (const comp of place.address_components) {
            if (comp.types.includes('administrative_area_level_1')) setFormCity(comp.long_name);
            if (comp.types.includes('administrative_area_level_3') || comp.types.includes('locality')) setFormDistrict(comp.long_name);
          }
        }
        // Auto-fill shop name if empty
        if (!formName && place.name) setFormName(place.name);
      });
      autocompleteRef.current = ac;
    };
    init();
    return () => { if (ac) { /* cleanup handled by Maps API */ } };
  }, [showAdd]);

  const loadProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params = { action: 'prospects', token, page, limit: 50 };
      if (statusF) params.status = statusF;
      if (categoryF) params.category = categoryF;
      if (search) params.q = search;
      const res = await dealerGet(params);
      setProspects(res.prospects || []);
      setTotal(res.total || 0);
    } catch (e) { setMsg(e.message); }
    setLoading(false);
  }, [token, page, statusF, categoryF, search]);

  const loadStats = useCallback(async () => {
    try {
      const res = await dealerGet({ action: 'prospect_stats', token });
      setStats(res.stats);
    } catch {}
  }, [token]);

  const loadRoute = useCallback(async () => {
    setRouteLoading(true);
    try {
      const res = await dealerGet({ action: 'smart_route', token });
      setRoute(res);
    } catch {}
    setRouteLoading(false);
  }, [token]);

  useEffect(() => { loadProspects(); loadStats(); loadRoute(); }, [loadProspects, loadStats, loadRoute]);

  const loadDetail = async (id) => {
    try {
      const res = await dealerGet({ action: 'prospect_detail', token, id });
      setDetail(res);
    } catch (e) { setMsg(e.message); }
  };

  const handleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null); setDetail(null); setShowVisitForm(false);
    } else {
      setExpandedId(id); setShowVisitForm(false); loadDetail(id);
    }
  };

  const handleAdd = async () => {
    if (!formName.trim()) { setMsg('請輸入店家名稱'); return; }
    // If no lat/lng but has address, try geocoding
    let lat = formLat, lng = formLng;
    if (!lat && formAddress && GMAPS_KEY) {
      const geo = await geocodeAddress(formAddress);
      if (geo) { lat = geo.lat; lng = geo.lng; }
    }
    try {
      const res = await dealerPost({
        action: 'create_prospect', token,
        shop_name: formName, category: formCategory,
        address: formAddress, city: formCity, district: formDistrict,
        phone: formPhone, contact_person: formContact, notes: formNotes,
        latitude: lat, longitude: lng,
      });
      setMsg(res.message + (res.warning ? ` ⚠️ ${res.warning}` : ''));
      setShowAdd(false);
      setFormName(''); setFormAddress(''); setFormCity(''); setFormDistrict('');
      setFormPhone(''); setFormContact(''); setFormNotes('');
      setFormLat(null); setFormLng(null);
      loadProspects(); loadStats(); loadRoute();
    } catch (e) { setMsg(e.message); }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await dealerPost({ action: 'update_prospect', token, id, status: newStatus });
      loadProspects(); loadStats();
      if (expandedId === id) loadDetail(id);
    } catch (e) { setMsg(e.message); }
  };

  const handleAddVisit = async () => {
    if (!expandedId) return;
    try {
      const res = await dealerPost({
        action: 'add_visit', token,
        prospect_id: expandedId,
        visit_date: visitDate, result: visitResult, notes: visitNotes,
      });
      setMsg(res.message);
      setShowVisitForm(false);
      setVisitNotes('');
      loadDetail(expandedId);
      loadProspects();
    } catch (e) { setMsg(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('確定刪除此店家？')) return;
    try {
      await dealerPost({ action: 'delete_prospect', token, id });
      setExpandedId(null); setDetail(null);
      loadProspects(); loadStats();
    } catch (e) { setMsg(e.message); }
  };

  const statusInfo = (s) => PROSPECT_STATUS.find(x => x.value === s) || { label: s, color: '#6b7280' };

  const inputStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontFamily: "'Noto Sans TC', 'Inter', sans-serif", outline: 'none', width: '100%' };
  const pillBtn = (active) => ({
    padding: '6px 14px', borderRadius: 20, border: '1px solid ' + (active ? '#f59e0b' : '#e5e7eb'),
    background: active ? '#fef3c7' : '#fff', color: active ? '#92400e' : '#6b7280',
    fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: "'Noto Sans TC', 'Inter', sans-serif",
  });

  return (
    <div>
      {msg && (
        <div style={{ background: msg.includes('⚠️') ? '#fef3c7' : '#ecfdf5', border: `1px solid ${msg.includes('⚠️') ? '#fcd34d' : '#a7f3d0'}`, borderRadius: 12, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: msg.includes('⚠️') ? '#92400e' : '#065f46', animation: 'slideDown 0.3s' }}>
          {msg}
          <span onClick={() => setMsg('')} style={{ float: 'right', cursor: 'pointer', opacity: 0.6 }}>✕</span>
        </div>
      )}

      {/* Smart Route Dashboard - auto popup */}
      {showRoute && (
        <div style={{ marginBottom: 16, animation: 'slideDown 0.3s' }}>
          <div className="qb-card-glow" style={{ overflow: 'hidden', border: '1px solid #e0e7ff' }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #f59e0b, #f97316)', padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🧭</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>智慧行程建議</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginLeft: 4 }}>
                  {new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setRouteView('today')} style={{
                  padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: routeView === 'today' ? '#fff' : 'rgba(255,255,255,0.25)',
                  color: routeView === 'today' ? '#f59e0b' : '#fff',
                  fontFamily: "'Noto Sans TC', 'Inter', sans-serif",
                }}>今日</button>
                <button onClick={() => setRouteView('week')} style={{
                  padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: routeView === 'week' ? '#fff' : 'rgba(255,255,255,0.25)',
                  color: routeView === 'week' ? '#f59e0b' : '#fff',
                  fontFamily: "'Noto Sans TC', 'Inter', sans-serif",
                }}>本週</button>
                <span onClick={() => setShowRoute(false)} style={{ color: 'rgba(255,255,255,0.7)', cursor: 'pointer', marginLeft: 4, fontSize: 16 }}>✕</span>
              </div>
            </div>

            {routeLoading ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>分析行程中...</div>
            ) : route ? (
              <div style={{ padding: '12px 16px' }}>
                {/* Summary pills */}
                {route.summary && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {route.summary.churn_risk > 0 && (
                      <span style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                        🔴 {route.summary.churn_risk} 家流失風險
                      </span>
                    )}
                    {route.summary.churn_critical > 0 && (
                      <span style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                        ⚫ {route.summary.churn_critical} 家高流失
                      </span>
                    )}
                    {route.summary.watch > 0 && (
                      <span style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                        🟡 {route.summary.watch} 家需回訪
                      </span>
                    )}
                    {route.summary.active_big > 0 && (
                      <span style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#065f46', fontWeight: 600 }}>
                        🟢 {route.summary.active_big} 家活躍大戶
                      </span>
                    )}
                    {route.summary.customers_total > 0 && (
                      <span style={{ background: '#f0f9ff', border: '1px solid #93c5fd', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>
                        👥 {route.summary.customers_total} 正式客戶
                      </span>
                    )}
                    {route.summary.overdue > 0 && (
                      <span style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                        ⚠️ {route.summary.overdue} 筆逾期
                      </span>
                    )}
                    {route.summary.new_unvisited > 0 && (
                      <span style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#a16207', fontWeight: 600 }}>
                        🆕 {route.summary.new_unvisited} 筆新開發
                      </span>
                    )}
                    <span style={{ background: '#f3f4f6', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#6b7280' }}>
                      共 {route.summary.total_suggestions} 筆建議
                    </span>
                  </div>
                )}

                {/* Area clusters */}
                {route.area_clusters?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af', lineHeight: '22px' }}>區域集中：</span>
                    {route.area_clusters.slice(0, 5).map((a, i) => (
                      <span key={i} style={{ background: '#f3f4f6', borderRadius: 12, padding: '2px 8px', fontSize: 11, color: '#4b5563' }}>
                        {a.area} ({a.count})
                      </span>
                    ))}
                  </div>
                )}

                {/* Route list */}
                {(() => {
                  const list = routeView === 'today' ? (route.today || []) : (route.week || []);
                  if (list.length === 0) return (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: 13 }}>
                      {routeView === 'today' ? '今日無建議行程，可查看本週' : '本週無額外建議'}
                    </div>
                  );
                  return (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {list.map((s, idx) => {
                        const isCustomer = s.type === 'customer';
                        const typeIcon = isCustomer ? '🏢' : (CATEGORY_EMOJI[s.category] || '📦');
                        const statusLabels = {
                          churn_risk: { label: '流失風險', color: '#dc2626' },
                          churn: { label: '高流失', color: '#6b7280' },
                          watch: { label: '需回訪', color: '#f59e0b' },
                          active: { label: '活躍', color: '#16a34a' },
                        };
                        const si = isCustomer
                          ? (statusLabels[s.status] || { label: s.status, color: '#6b7280' })
                          : (PROSPECT_STATUS.find(x => x.value === s.status) || { label: s.status, color: '#6b7280' });
                        const pColor = s.priority >= 70 ? PRIORITY_COLORS.high : s.priority >= 40 ? PRIORITY_COLORS.medium : PRIORITY_COLORS.low;
                        return (
                          <div key={s.id + (s.type || '')} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                            background: isCustomer ? (s.status === 'churn_risk' ? '#fef2f2' : '#f0f9ff') : (idx === 0 && routeView === 'today' ? '#fffbeb' : '#f9fafb'),
                            borderRadius: 10, borderLeft: `3px solid ${pColor}`,
                            cursor: s.type === 'prospect' ? 'pointer' : 'default', transition: 'background 0.15s',
                          }} onClick={() => { if (s.type === 'prospect') { setShowRoute(false); handleExpand(s.id); } }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: 12, background: pColor + '20',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 700, color: pColor, flexShrink: 0,
                            }}>{idx + 1}</div>
                            <span style={{ fontSize: 16, flexShrink: 0 }}>{typeIcon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {s.shop_name}
                                </span>
                                {isCustomer && (
                                  <span style={{ padding: '0 5px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: '#dbeafe', color: '#1e40af', flexShrink: 0 }}>客戶</span>
                                )}
                              </div>
                              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
                                {s.city}{s.district ? ` ${s.district}` : ''} {s.contact_person ? `· ${s.contact_person}` : ''}
                                {isCustomer && s.total_amount > 0 && (
                                  <span style={{ marginLeft: 4, color: '#6b7280' }}>· 累計 {fmtP(s.total_amount)}({s.tx_count}筆)</span>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {s.reasons?.map((r, ri) => (
                                  <span key={ri} style={{
                                    padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 500,
                                    background: r.includes('🔴') || r.includes('逾期') ? '#fef2f2' : r.includes('🟡') || r.includes('意願') ? '#fefce8' : r.includes('⚫') ? '#f3f4f6' : '#f0f9ff',
                                    color: r.includes('🔴') || r.includes('逾期') ? '#dc2626' : r.includes('🟡') || r.includes('意願') ? '#a16207' : r.includes('⚫') ? '#6b7280' : '#1d4ed8',
                                  }}>{r}</span>
                                ))}
                              </div>
                              <span style={{
                                padding: '1px 6px', borderRadius: 10, fontSize: 9, fontWeight: 500,
                                background: si.color + '18', color: si.color,
                              }}>{si.label}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Map view */}
                {GMAPS_KEY && (
                  <div style={{ marginTop: 12 }}>
                    <RouteMap items={routeView === 'today' ? route.today : route.week} height={220} />
                  </div>
                )}

                {/* Quick action */}
                {routeView === 'today' && route.today?.length > 0 && (
                  <div style={{ marginTop: 10, textAlign: 'center' }}>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>點擊店家展開詳情 → 記錄拜訪 {GMAPS_KEY ? '· 地圖標記可點擊' : ''}</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>尚無行程建議，請先新增店家</div>
            )}
          </div>

          {/* Collapsed toggle when hidden */}
        </div>
      )}
      {!showRoute && (
        <div style={{ marginBottom: 12, textAlign: 'center' }}>
          <button onClick={() => setShowRoute(true)} style={{
            padding: '6px 16px', borderRadius: 20, border: '1px solid #fcd34d', background: '#fffbeb',
            color: '#92400e', fontSize: 12, cursor: 'pointer', fontWeight: 500,
            fontFamily: "'Noto Sans TC', 'Inter', sans-serif",
          }}>🧭 顯示智慧行程建議</button>
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8, marginBottom: 16 }}>
          <div className="qb-card-glow" style={{ padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{stats.total}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>總店家</div>
          </div>
          {PROSPECT_STATUS.filter(s => s.value).map(s => (
            <div key={s.value} className="qb-card-glow" style={{ padding: '12px', textAlign: 'center', borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{stats.by_status[s.value] || 0}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar + Add button */}
      <div className="qb-card-glow" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }} style={{ ...inputStyle, width: 110, padding: '6px 10px' }}>
          {PROSPECT_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={categoryF} onChange={e => { setCategoryF(e.target.value); setPage(1); }} style={{ ...inputStyle, width: 110, padding: '6px 10px' }}>
          {PROSPECT_CATEGORY.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadProspects()} placeholder="搜尋店名/聯絡人/地址" style={{ ...inputStyle, flex: 1, minWidth: 140, padding: '6px 10px' }} />
        <button className="qb-btn" onClick={() => { setPage(1); loadProspects(); }} style={{ padding: '6px 16px', fontSize: 13 }}>查詢</button>
        <button onClick={() => setShowAdd(!showAdd)} style={{
          padding: '6px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          background: showAdd ? '#fee2e2' : 'linear-gradient(135deg, #f59e0b, #f97316)', color: showAdd ? '#dc2626' : '#fff',
          fontFamily: "'Noto Sans TC', 'Inter', sans-serif",
        }}>
          {showAdd ? '取消' : '＋ 新增店家'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="qb-card-glow" style={{ padding: '20px', marginBottom: 16, animation: 'slideDown 0.3s' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 12 }}>新增開發店家</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="店家名稱 *" style={inputStyle} />
            </div>
            <select value={formCategory} onChange={e => setFormCategory(e.target.value)} style={inputStyle}>
              {PROSPECT_CATEGORY.filter(c => c.value).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="電話" style={inputStyle} />
            <input value={formContact} onChange={e => setFormContact(e.target.value)} placeholder="聯絡人" style={inputStyle} />
            <input value={formCity} onChange={e => setFormCity(e.target.value)} placeholder="縣市" style={inputStyle} />
            <input value={formDistrict} onChange={e => setFormDistrict(e.target.value)} placeholder="區域" style={inputStyle} />
            <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
              <input ref={addressInputRef} value={formAddress} onChange={e => { setFormAddress(e.target.value); setFormLat(null); setFormLng(null); }} placeholder={GMAPS_KEY ? '🔍 輸入地址自動搜尋...' : '完整地址'} style={inputStyle} />
              {formLat && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#16a34a' }}>📍 已定位</span>}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="備註" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}>
              <button className="qb-btn" onClick={handleAdd} style={{ padding: '8px 24px', fontSize: 13 }}>新增</button>
            </div>
          </div>
        </div>
      )}

      {/* Prospect list */}
      <div ref={tableRef}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>載入中...</div>
        ) : prospects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🏪</div>
            <div style={{ fontSize: 14 }}>尚無開發名單</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>點擊「＋ 新增店家」開始建立</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {prospects.map(p => {
              const si = statusInfo(p.status);
              const isExpanded = expandedId === p.id;
              return (
                <div key={p.id} className="qb-card-glow" style={{
                  overflow: 'hidden', borderLeft: `4px solid ${si.color}`,
                  transition: 'all 0.2s',
                }}>
                  {/* Row header */}
                  <div onClick={() => handleExpand(p.id)} style={{
                    padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    background: isExpanded ? '#fefce8' : 'transparent', transition: 'background 0.2s',
                  }}>
                    <span style={{ fontSize: 18 }}>{CATEGORY_EMOJI[p.category] || '📦'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.shop_name}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        {p.city && `${p.city} `}{p.district && `${p.district} `}
                        {p.contact_person && `· ${p.contact_person} `}
                        {p.visit_count > 0 && `· 拜訪 ${p.visit_count} 次`}
                      </div>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: si.color + '18', color: si.color, whiteSpace: 'nowrap',
                    }}>{si.label}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                      {p.last_visit_date ? fmtDate(p.last_visit_date) : '未拜訪'}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '0 16px 16px', animation: 'slideDown 0.2s' }}>
                      {/* Info pills */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {p.phone && <span style={{ background: '#f3f4f6', borderRadius: 20, padding: '4px 10px', fontSize: 11 }}>📞 {p.phone}</span>}
                        {p.address && <span style={{ background: '#f3f4f6', borderRadius: 20, padding: '4px 10px', fontSize: 11 }}>📍 {p.address}</span>}
                        {p.contact_person && <span style={{ background: '#f3f4f6', borderRadius: 20, padding: '4px 10px', fontSize: 11 }}>👤 {p.contact_person}</span>}
                        {p.next_visit_date && <span style={{ background: '#fef3c7', borderRadius: 20, padding: '4px 10px', fontSize: 11 }}>📅 下次：{fmtDate(p.next_visit_date)}</span>}
                      </div>
                      {p.notes && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12, padding: '8px 12px', background: '#f9fafb', borderRadius: 8 }}>{p.notes}</div>}

                      {/* Status change buttons */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        <span style={{ fontSize: 11, color: '#9ca3af', lineHeight: '28px' }}>狀態：</span>
                        {PROSPECT_STATUS.filter(s => s.value).map(s => (
                          <button key={s.value} onClick={() => handleStatusChange(p.id, s.value)}
                            style={pillBtn(p.status === s.value)}>
                            {s.label}
                          </button>
                        ))}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <button className="qb-btn" onClick={() => { setShowVisitForm(!showVisitForm); setVisitDate(new Date().toISOString().slice(0, 10)); }}
                          style={{ padding: '6px 16px', fontSize: 12, flex: 1 }}>
                          {showVisitForm ? '取消' : '＋ 新增拜訪記錄'}
                        </button>
                        <button onClick={() => handleDelete(p.id)}
                          style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', cursor: 'pointer', fontFamily: "'Noto Sans TC', 'Inter', sans-serif" }}>
                          刪除
                        </button>
                      </div>

                      {/* Visit form */}
                      {showVisitForm && (
                        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: 14, marginBottom: 12, animation: 'slideDown 0.2s' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 10 }}>新增拜訪記錄</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} style={inputStyle} />
                            <select value={visitResult} onChange={e => setVisitResult(e.target.value)} style={inputStyle}>
                              {VISIT_RESULT.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                            </select>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <textarea value={visitNotes} onChange={e => setVisitNotes(e.target.value)} placeholder="拜訪記錄..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                            </div>
                            <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}>
                              <button className="qb-btn" onClick={handleAddVisit} style={{ padding: '6px 20px', fontSize: 12 }}>儲存</button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Visit history */}
                      {detail?.visits?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>拜訪記錄</div>
                          <div style={{ display: 'grid', gap: 6 }}>
                            {detail.visits.map(v => {
                              const vr = VISIT_RESULT.find(x => x.value === v.result) || { label: v.result };
                              return (
                                <div key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 12 }}>
                                  <span style={{ color: '#9ca3af', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{fmtDate(v.visit_date)}</span>
                                  <span style={{ padding: '1px 8px', borderRadius: 12, background: '#e0e7ff', color: '#3730a3', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>{vr.label}</span>
                                  <span style={{ color: '#4b5563', flex: 1 }}>{v.notes || '-'}</span>
                                  {v.visitor?.display_name && <span style={{ color: '#9ca3af', fontSize: 10 }}>{v.visitor.display_name}</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {total > 50 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button className="qb-btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 14px', fontSize: 12 }}>上一頁</button>
            <span style={{ fontSize: 12, color: '#6b7280', lineHeight: '32px' }}>第 {page} 頁 / 共 {Math.ceil(total / 50)} 頁（{total} 筆）</span>
            <button className="qb-btn-ghost" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 14px', fontSize: 12 }}>下一頁</button>
          </div>
        )}
      </div>
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
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(DEALER_TOKEN_KEY) : null;
    if (saved) {
      dealerGet({ action: 'me', token: saved })
        .then(result => {
          setToken(saved); setUser(result.user); setRoleConfig(result.role_config);
          setAnnouncements(result.announcements || []);
        })
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
  const roleColor = ROLE_COLORS[user?.role] || '#16a34a';
  const roleGrad = ROLE_GRADIENTS[user?.role] || '#16a34a';

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ minHeight: '100vh', background: '#f5f6f7', color: '#111827', fontFamily: "'Noto Sans TC', 'Inter', sans-serif", position: 'relative' }}>
        <div className="qb-grid-bg" />
        <div className="qb-orb" style={{ width: 500, height: 500, background: roleColor, top: '-20%', right: '-15%', opacity: 0.06 }} />
        <div className="qb-orb" style={{ width: 300, height: 300, background: 'rgba(22,163,74,0.3)', bottom: '10%', left: '-10%', opacity: 0.04 }} />

        {/* Header */}
        <div style={{
          background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid #e5e7eb',
          padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: roleGrad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#111827', fontWeight: 900, fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              boxShadow: `0 4px 12px ${roleColor}30`,
            }}>QB</div>
            <div>
              <div style={{ color: '#111827', fontSize: 14, fontWeight: 700 }}>{user.display_name}</div>
              <div style={{ fontSize: 10, color: roleColor, fontWeight: 600, letterSpacing: 0.5 }}>{user.role_label}{user.company_name ? ` \u00B7 ${user.company_name}` : ''}</div>
            </div>
          </div>
          <div className="qb-mono" style={{ fontSize: 10, color: '#6b7280', letterSpacing: 2 }}>QUICK BUY</div>
        </div>

        {/* Tab navigation */}
        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid #e5e7eb',
          position: 'sticky', top: 64, zIndex: 99,
        }}>
          {getTabList().map(t => {
            const isActive = activeTab === t.id;
            const showBadge = (t.id === 'cart' && cartCount > 0) || (t.id === 'notifications' && notiCount > 0);
            const badgeNum = t.id === 'cart' ? cartCount : notiCount;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                flex: 1, padding: '12px 0', background: 'transparent',
                border: 'none', borderBottom: `2px solid ${isActive ? roleColor : 'transparent'}`,
                color: isActive ? '#111827' : '#9ca3af',
                cursor: 'pointer', fontSize: 11, fontWeight: isActive ? 700 : 400,
                fontFamily: "'Noto Sans TC', 'Inter', sans-serif",
                transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                position: 'relative',
              }}>
                <SvgIcon d={t.icon} size={16} color={isActive ? roleColor : '#9ca3af'} />
                <span style={{ display: 'inline-block', marginTop: 1 }}>{t.label}</span>
                {showBadge && (
                  <span style={{
                    background: '#ef4444', color: '#111827', fontSize: 9, fontWeight: 700, borderRadius: 999,
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
          {/* Announcements Banner */}
          {announcements.length > 0 && (
            <div style={{ marginBottom: 16, display: 'grid', gap: 8 }}>
              {announcements.map(ann => {
                const colors = { info: { bg: '#f3f4f6', border: '#e5e7eb', text: '#16a34a', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' }, warning: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)', text: '#eab308', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' }, urgent: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', text: '#f87171', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' }, success: { bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)', text: '#16a34a', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' } };
                const c = colors[ann.type] || colors.info;
                return (
                  <div key={ann.id} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10, animation: 'slideDown 0.3s' }}>
                    <SvgIcon d={c.icon} size={18} color={c.text} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{ann.title}</div>
                      {ann.content && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{ann.content}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {activeTab === 'catalog' && <CatalogTab token={token} user={user} roleConfig={roleConfig} cart={cart} setCart={setCart} />}
          {activeTab === 'cart' && <CartTab token={token} user={user} cart={cart} setCart={setCart} setActiveTab={setActiveTab} />}
          {activeTab === 'orders' && <OrdersTab token={token} />}
          {activeTab === 'stats' && <StatsTab token={token} user={user} roleConfig={roleConfig} />}
          {activeTab === 'prospects' && <ProspectsTab token={token} user={user} />}
          {activeTab === 'notifications' && <NotificationsTab token={token} />}
          {activeTab === 'profile' && <ProfileTab token={token} user={user} setUser={setUser} roleConfig={roleConfig} onLogout={handleLogout} />}
        </div>
      </div>
    </>
  );
}
