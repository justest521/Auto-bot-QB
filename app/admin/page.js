'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '/api/admin';
const SUPABASE_URL = 'https://izfxiaufbwrlmifrbdiv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6ZnhpYXVmYndybG1pZnJiZGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MjYzODYsImV4cCI6MjA4OTIwMjM4Nn0.3CirmkvYgGUfPIwRbYUdVJ0vcSfbJID2DCugJL2m7YM';

const fmt = n => n?.toLocaleString('zh-TW') || '0';
const fmtMs = ms => !ms ? '-' : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
const fmtDate = d => d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const fmtP = n => n ? `NT$${Number(n).toLocaleString()}` : '-';

// Supabase REST helper
async function sbQuery(table, params = {}) {
  const p = new URLSearchParams(params);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${p}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'count=exact' },
  });
  const total = parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10);
  const data = await res.json();
  return { data: Array.isArray(data) ? data : [], total };
}

/* ========================================= STYLES ========================================= */
const S = {
  page: { minHeight: '100vh', background: '#1a1a1a', color: '#e5e5e5', fontFamily: "'Noto Sans TC', 'SF Mono', monospace, sans-serif" },
  header: { height: 48, background: '#1e1e1e', borderBottom: '1px solid #2e2e2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' },
  sidebar: { width: 180, minHeight: 'calc(100vh - 48px)', background: '#1e1e1e', borderRight: '1px solid #2e2e2e', paddingTop: 8, position: 'sticky', top: 48, alignSelf: 'flex-start' },
  content: { flex: 1, padding: '24px 28px', maxWidth: 1100, minHeight: 'calc(100vh - 48px)' },
  card: { background: '#212121', border: '1px solid #2e2e2e', borderRadius: 8, padding: '20px 22px', marginBottom: 16 },
  input: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '9px 14px', color: '#e5e5e5', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s' },
  btnPrimary: { background: '#10b981', color: '#000', border: 'none', borderRadius: 6, padding: '9px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: 0.5 },
  btnGhost: { background: 'transparent', color: '#888', border: '1px solid #333', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif" },
  btnLine: { background: '#06c755', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  label: { color: '#666', fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 5, letterSpacing: 0.8, textTransform: 'uppercase' },
  mono: { fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: 0.5 },
  tag: (color) => ({ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: color === 'green' ? '#10b98115' : color === 'green' ? '#22c55e12' : color === 'red' ? '#ef444412' : color === 'line' ? '#06c75515' : '#ffffff08', color: color === 'green' ? '#10b981' : color === 'green' ? '#4ade80' : color === 'red' ? '#f87171' : color === 'line' ? '#06c755' : '#888', border: `1px solid ${color === 'green' ? '#10b98130' : color === 'green' ? '#22c55e25' : color === 'red' ? '#ef444425' : color === 'line' ? '#06c75530' : '#ffffff12'}` }),
};

/* ========================================= SHARED ========================================= */
function Loading() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div style={{ color: '#333', fontSize: 12, ...S.mono }}><span style={{ color: '#10b981' }}>●</span> loading...</div></div>;
}
function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', padding: '40px 0', color: '#333', fontSize: 12, ...S.mono }}>{text}</div>;
}
function StatCard({ code, label, value, sub, accent }) {
  return (
    <div style={{ ...S.card, flex: '1 1 180px', minWidth: 165, padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 10, color: '#333', ...S.mono }}>{code}</div>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 6, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || '#10b981', ...S.mono, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ========================================= DASHBOARD ========================================= */
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch(`${API}?action=stats`).then(r => r.json()).then(setStats).finally(() => setLoading(false)); }, []);
  if (loading) return <Loading />;
  return (
    <div>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>$ quickbuy stats --overview</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard code="MSG_TD" label="今日查詢" value={fmt(stats?.today_messages)} sub="today" />
        <StatCard code="MSG_WK" label="本週查詢" value={fmt(stats?.week_messages)} sub="last 7d" />
        <StatCard code="MSG_ALL" label="總查詢數" value={fmt(stats?.total_messages)} sub="cumulative" />
        <StatCard code="USR" label="客戶數" value={fmt(stats?.total_customers)} sub="unique users" />
        <StatCard code="PERF" label="平均回覆" value={fmtMs(stats?.avg_response_ms)} sub="response time" />
      </div>
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e5e5' }}>熱門查詢產品</div>
          <div style={{ ...S.tag('green') }}>TOP 10</div>
        </div>
        {stats?.top_products?.length > 0 ? stats.top_products.map((p, i) => (
          <div key={p.item_number} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: i > 0 ? '1px solid #1a1a1a' : 'none' }}>
            <div style={{ width: 32, fontSize: 12, color: i < 3 ? '#10b981' : '#444', fontWeight: 700, ...S.mono }}>#{i + 1}</div>
            <div style={{ flex: 1, fontSize: 13, color: '#ccc', ...S.mono }}>{p.item_number}</div>
            <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600, ...S.mono }}>{p.count}次</div>
          </div>
        )) : <EmptyState text="等待客戶使用 Line Bot 後將顯示數據" />}
      </div>
    </div>
  );
}

/* ========================================= MESSAGES (AI Bot) ========================================= */
function Messages() {
  const [data, setData] = useState({ messages: [], total: 0, page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const load = useCallback((page = 1, q = search) => {
    setLoading(true);
    fetch(`${API}?action=messages&page=${page}&search=${encodeURIComponent(q)}`).then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [search]);
  useEffect(() => { load(); }, []);
  return (
    <div>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>$ quickbuy messages --list</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, search)} placeholder="搜尋訊息內容、客戶名稱..." style={{ ...S.input, flex: 1 }} onFocus={e => e.target.style.borderColor = '#10b981'} onBlur={e => e.target.style.borderColor = '#2a2a2a'} />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 12, ...S.mono }}>共 {data.total} 筆紀錄</div>
      {loading ? <Loading /> : data.messages.map(msg => (
        <div key={msg.id} onClick={() => setExpanded(expanded === msg.id ? null : msg.id)} style={{ ...S.card, cursor: 'pointer', padding: '14px 18px', transition: 'border-color 0.2s', borderColor: expanded === msg.id ? '#10b98140' : '#1f1f1f' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={S.tag('green')}>{msg.display_name || '客戶'}</span>
              <span style={{ color: '#444', fontSize: 11, ...S.mono }}>{fmtDate(msg.created_at)}</span>
            </div>
            <span style={{ color: '#444', fontSize: 11, ...S.mono }}>{fmtMs(msg.response_time_ms)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#ccc' }}><span style={{ color: '#555' }}>Q: </span>{msg.user_message}</div>
          {expanded === msg.id && (
            <div style={{ background: '#1a1a1a', border: '1px solid #1a1a1a', borderRadius: 6, padding: '14px 16px', marginTop: 10, fontSize: 12, color: '#999', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              <span style={{ color: '#10b981', fontSize: 11, ...S.mono }}>AI_RESPONSE</span>
              <div style={{ marginTop: 6, color: '#bbb' }}>{msg.ai_response}</div>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
        {data.page > 1 && <button onClick={() => load(data.page - 1)} style={S.btnGhost}>← 上一頁</button>}
        <span style={{ color: '#444', padding: '8px 0', fontSize: 12, ...S.mono }}>P{data.page}</span>
        {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={S.btnGhost}>下一頁 →</button>}
      </div>
    </div>
  );
}

/* ========================================= PRODUCT SEARCH ========================================= */
function ProductSearch() {
  const CATS = { all: '全部', wrench: '扳手', socket: '套筒', ratchet: '棘輪', screwdriver: '螺絲起子', plier: '鉗子', power_tool: '電動工具', torque_wrench: '扭力扳手', storage: '工具車/收納', light: '照明', diagnostic: '診斷', battery: '電池', tester: '測試儀', borescope: '內視鏡', jack_lift: '千斤頂', torque_multiplier: '扭力倍增器', tire_inflator: '打氣機', other: '其他' };
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const PAGE_SIZE = 25;

  const doSearch = useCallback(async (q, cat, pg = 0) => {
    setLoading(true);
    const params = { select: 'item_number,description,us_price,tw_retail_price,tw_reseller_price,product_status,category,replacement_model,weight_kg,origin_country', product_status: 'eq.Current', order: 'item_number.asc', offset: String(pg * PAGE_SIZE), limit: String(PAGE_SIZE) };
    if (cat && cat !== 'all') params.category = `eq.${cat}`;
    const trimmed = (q || '').trim();
    if (trimmed) { const escaped = trimmed.replace(/['"]/g, ''); const tsQ = escaped.split(/\s+/).filter(Boolean).join(' & '); params.or = `(item_number.ilike.*${escaped}*,search_text.fts.${tsQ})`; }
    const { data, total: t } = await sbQuery('quickbuy_products', params);
    setProducts(data); setTotal(t); setLoading(false);
  }, []);

  useEffect(() => { const timer = setTimeout(() => { setPage(0); doSearch(search, category, 0); }, 300); return () => clearTimeout(timer); }, [search, category, doSearch]);
  const goPage = (pg) => { setPage(pg); doSearch(search, category, pg); };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>$ quickbuy products --search</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋料號或關鍵字... (例: FDX71, wrench)" style={{ ...S.input, flex: 1, ...S.mono }} onFocus={e => e.target.style.borderColor = '#10b981'} onBlur={e => e.target.style.borderColor = '#2a2a2a'} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {Object.entries(CATS).map(([key, label]) => (
          <button key={key} onClick={() => setCategory(key)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, color: category === key ? '#10b981' : '#666', borderColor: category === key ? '#10b98160' : '#2a2a2a', background: category === key ? '#10b98110' : 'transparent' }}>{label}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 12, ...S.mono }}>共 {fmt(total)} 筆產品 {totalPages > 1 && `· P${page + 1}/${totalPages}`}</div>
      {loading ? <Loading /> : products.length === 0 ? <EmptyState text={search ? '找不到符合的產品' : '輸入料號或關鍵字開始搜尋'} /> : (
        <>
          <div style={{ display: 'flex', padding: '8px 16px', fontSize: 10, color: '#555', ...S.mono, borderBottom: '1px solid #2e2e2e', marginBottom: 4 }}>
            <div style={{ width: 150 }}>ITEM_NO</div><div style={{ flex: 1 }}>DESCRIPTION</div><div style={{ width: 90, textAlign: 'right' }}>分類</div><div style={{ width: 100, textAlign: 'right' }}>牌價</div><div style={{ width: 100, textAlign: 'right' }}>經銷價</div>
          </div>
          {products.map(p => (
            <div key={p.item_number}>
              <div onClick={() => setExpanded(expanded === p.item_number ? null : p.item_number)} style={{ ...S.card, cursor: 'pointer', padding: '10px 16px', marginBottom: 2, display: 'flex', alignItems: 'center', borderColor: expanded === p.item_number ? '#10b98130' : '#1f1f1f' }}>
                <div style={{ width: 150, fontWeight: 600, color: '#10b981', fontSize: 13, ...S.mono }}>{p.item_number}</div>
                <div style={{ flex: 1, fontSize: 12, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>
                <div style={{ width: 90, textAlign: 'right' }}>{p.category && p.category !== 'other' && <span style={{ ...S.tag(''), fontSize: 10 }}>{CATS[p.category] || p.category}</span>}</div>
                <div style={{ width: 100, textAlign: 'right', fontSize: 13, color: '#ccc', ...S.mono }}>{fmtP(p.tw_retail_price)}</div>
                <div style={{ width: 100, textAlign: 'right', fontSize: 13, color: '#4ade80', fontWeight: 600, ...S.mono }}>{fmtP(p.tw_reseller_price)}</div>
              </div>
              {expanded === p.item_number && (
                <div style={{ background: '#1a1a1a', border: '1px solid #1a1a1a', borderRadius: 6, padding: '14px 20px', marginBottom: 8, marginTop: -2, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  <div><div style={S.label}>US PRICE</div><div style={{ color: '#888', fontSize: 13, ...S.mono }}>{p.us_price ? `$${Number(p.us_price).toFixed(2)}` : '-'}</div></div>
                  <div><div style={S.label}>牌價</div><div style={{ color: '#ccc', fontSize: 13, ...S.mono }}>{fmtP(p.tw_retail_price)}</div></div>
                  <div><div style={S.label}>經銷價</div><div style={{ color: '#4ade80', fontSize: 13, fontWeight: 600, ...S.mono }}>{fmtP(p.tw_reseller_price)}</div></div>
                  <div><div style={S.label}>重量</div><div style={{ color: '#888', fontSize: 13, ...S.mono }}>{p.weight_kg ? `${p.weight_kg} kg` : '-'}</div></div>
                  <div><div style={S.label}>產地</div><div style={{ color: '#888', fontSize: 13, ...S.mono }}>{p.origin_country || '-'}</div></div>
                  <div><div style={S.label}>替代型號</div><div style={{ color: p.replacement_model ? '#10b981' : '#888', fontSize: 13, ...S.mono }}>{p.replacement_model || '-'}</div></div>
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
            {page > 0 && <button onClick={() => goPage(page - 1)} style={S.btnGhost}>← 上一頁</button>}
            <span style={{ color: '#444', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page + 1}/{totalPages}</span>
            {page < totalPages - 1 && <button onClick={() => goPage(page + 1)} style={S.btnGhost}>下一頁 →</button>}
          </div>
        </>
      )}
    </div>
  );
}

/* ========================================= PROMOTIONS ========================================= */
function Promotions() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', note: '', items: '' });
  const load = () => { fetch(`${API}?action=promotions`).then(r => r.json()).then(d => setPromos(d.promotions || [])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const submit = async () => {
    const items = form.items.split('\n').filter(Boolean).map(line => {
      const match = line.match(/^([A-Za-z0-9-]+)\s*[→=:]\s*(?:NT\$?)([\d,]+)(?:\s*[（(](.+)[)）])?/);
      if (!match) return null;
      return { item_number: match[1].toUpperCase(), promo_price: parseInt(match[2].replace(/,/g, '')), promo_note: match[3] || null };
    }).filter(Boolean);
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_promotion', ...form, items }) });
    if (res.ok) { setShowForm(false); setForm({ name: '', start_date: '', end_date: '', note: '', items: '' }); load(); }
  };
  const toggle = async (id, active) => { await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_promotion', id, is_active: !active }) }); load(); };
  return (
    <div>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>$ quickbuy promo --manage</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#555', ...S.mono }}>共 {promos.length} 個活動</div>
        <button onClick={() => setShowForm(!showForm)} style={S.btnPrimary}>{showForm ? '取消' : '+ 新增活動'}</button>
      </div>
      {showForm && (
        <div style={{ ...S.card, borderColor: '#10b98130', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#10b981', marginBottom: 18 }}>NEW_PROMOTION</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label style={S.label}>活動名稱</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="四月工具月" style={S.input} /></div>
            <div><label style={S.label}>備註</label><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="滿 10,000 免運" style={S.input} /></div>
            <div><label style={S.label}>開始日期</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={S.input} /></div>
            <div><label style={S.label}>結束日期</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={S.input} /></div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={S.label}>活動商品（每行格式：型號 → 價格（備註））</label>
            <textarea value={form.items} onChange={e => setForm({ ...form, items: e.target.value })} placeholder={`ATECH3FR250B → 28000\nTPGDL2000 → 8500（買一送充氣嘴組）`} rows={5} style={{ ...S.input, resize: 'vertical', ...S.mono, fontSize: 12, lineHeight: 1.6 }} />
          </div>
          <button onClick={submit} style={S.btnPrimary}>建立活動</button>
        </div>
      )}
      {loading ? <Loading /> : promos.map(p => (
        <div key={p.id} style={{ ...S.card, borderColor: p.is_active ? '#10b98125' : '#1f1f1f' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>{p.name}</span>
              <span style={S.tag(p.is_active ? 'green' : 'red')}>{p.is_active ? 'ACTIVE' : 'CLOSED'}</span>
            </div>
            <button onClick={() => toggle(p.id, p.is_active)} style={{ ...S.btnGhost, color: p.is_active ? '#f87171' : '#4ade80', borderColor: p.is_active ? '#ef444425' : '#22c55e25', fontSize: 12 }}>{p.is_active ? '關閉' : '啟用'}</button>
          </div>
          <div style={{ color: '#555', fontSize: 12, marginTop: 6, ...S.mono }}>{p.start_date} → {p.end_date}{p.note ? ` · ${p.note}` : ''}</div>
          {p.quickbuy_promotion_items?.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #2e2e2e', paddingTop: 10 }}>
              {p.quickbuy_promotion_items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', fontSize: 12 }}>
                  <span style={{ color: '#10b981', ...S.mono, width: 140 }}>{item.item_number}</span>
                  <span style={{ color: '#4ade80', ...S.mono }}>NT${fmt(item.promo_price)}</span>
                  {item.promo_note && <span style={{ color: '#555' }}>({item.promo_note})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {!loading && promos.length === 0 && !showForm && <EmptyState text="尚無活動，點「+ 新增活動」建立" />}
    </div>
  );
}

/* ========================================= PRICING RULES ========================================= */
function PricingRules() {
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch(`${API}?action=pricing`).then(r => r.json()).then(d => setRules(d.rules)).finally(() => setLoading(false)); }, []);
  const save = async () => { await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_pricing', rules }) }); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  if (loading || !rules) return <Loading />;
  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>$ quickbuy config --pricing</div>
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#10b981', marginBottom: 20, ...S.mono }}>PRICING_CONFIG</div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>預設折扣比例</label><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><input type="number" step="0.01" min="0" max="1" value={rules.default_discount} onChange={e => setRules({ ...rules, default_discount: parseFloat(e.target.value) })} style={{ ...S.input, width: 120, textAlign: 'center', ...S.mono }} /><span style={{ color: '#555', fontSize: 12 }}>= {Math.round(rules.default_discount * 100)} 折（內部參考）</span></div></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>免運門檻 (NT$)</label><input type="number" step="100" value={rules.free_shipping_threshold} onChange={e => setRules({ ...rules, free_shipping_threshold: parseInt(e.target.value) })} style={{ ...S.input, width: 160, ...S.mono }} /></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>優惠提示文字</label><input value={rules.promo_hint_text || '✨ 私訊享優惠價'} onChange={e => setRules({ ...rules, promo_hint_text: e.target.value })} style={S.input} /></div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <label style={{ color: '#888', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={rules.show_retail_price} onChange={e => setRules({ ...rules, show_retail_price: e.target.checked })} style={{ accentColor: '#10b981' }} />顯示建議售價</label>
          <label style={{ color: '#888', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={rules.show_promo_hint} onChange={e => setRules({ ...rules, show_promo_hint: e.target.checked })} style={{ accentColor: '#10b981' }} />顯示優惠提示</label>
        </div>
        <button onClick={save} style={{ ...S.btnPrimary, background: saved ? '#22c55e' : '#10b981', transition: 'background 0.3s', width: '100%', padding: '11px 0', fontSize: 14 }}>{saved ? '✓ SAVED' : '儲存設定'}</button>
      </div>
    </div>
  );
}

/* ========================================= AI PROMPT 設定 ========================================= */
function AIPrompt() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // 從 quickbuy_config 讀取 AI prompt
    sbQuery('quickbuy_config', { select: 'config_value', config_key: 'eq.ai_system_prompt', limit: '1' })
      .then(({ data }) => { if (data[0]) setPrompt(data[0].config_value || ''); })
      .finally(() => setLoading(false));
    // 讀取歷史對話統計
    sbQuery('quickbuy_chat_history', { select: 'id', limit: '1' }).then(({ total }) => setStats(prev => ({ ...prev, chatHistory: total })));
    sbQuery('quickbuy_line_messages', { select: 'id', limit: '1' }).then(({ total }) => setStats(prev => ({ ...prev, aiMessages: total })));
  }, []);

  const save = async () => {
    await fetch(`${SUPABASE_URL}/rest/v1/quickbuy_config`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ config_key: 'ai_system_prompt', config_value: prompt }),
    });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <Loading />;
  return (
    <div>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>$ quickbuy ai --config</div>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard code="HIST" label="歷史對話" value={fmt(stats.chatHistory)} sub="匯入的 Line 對話" accent="#06c755" />
          <StatCard code="AI" label="AI 回覆" value={fmt(stats.aiMessages)} sub="Bot 自動回覆" accent="#10b981" />
        </div>
      )}

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#10b981', ...S.mono }}>AI_SYSTEM_PROMPT</div>
          <div style={{ ...S.tag('green') }}>Claude Sonnet</div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={S.label}>AI 回覆的 System Prompt — 控制 Bot 的回覆風格和行為</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={20}
            style={{ ...S.input, resize: 'vertical', ...S.mono, fontSize: 12, lineHeight: 1.8 }}
            placeholder="輸入 AI 的 system prompt..."
          />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={save} style={{ ...S.btnPrimary, flex: 1, background: saved ? '#22c55e' : '#10b981', transition: 'background 0.3s', padding: '11px 0', fontSize: 14 }}>{saved ? '✓ SAVED' : '儲存 Prompt'}</button>
          <div style={{ fontSize: 11, color: '#555', ...S.mono }}>{prompt.length} 字</div>
        </div>
      </div>

      <div style={{ ...S.card, borderColor: '#1a1a1a' }}>
        <div style={{ color: '#444', fontSize: 11, lineHeight: 1.9, ...S.mono }}>
          <span style={{ color: '#555' }}>// 使用說明</span><br/>
          // 修改後立即生效，AI 下次回覆就會套用新 prompt<br/>
          // 建議包含：角色設定、回覆風格、報價格式、SOP 流程<br/>
          // 可從「歷史對話」分頁參考真人客服的回覆方式<br/>
          // prompt 越精確，AI 回覆品質越好
        </div>
      </div>
    </div>
  );
}

/* ========================================= LINE 歷史對話 ========================================= */
function ChatHistory() {
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState(null);
  const PAGE_SIZE = 30;

  const load = useCallback(async (q = search, pg = 0) => {
    setLoading(true);
    const params = { select: 'id,sender_type,sender_name,display_name,content,message_date,message_time', order: 'message_timestamp.desc.nullslast', offset: String(pg * PAGE_SIZE), limit: String(PAGE_SIZE) };
    if (q.trim()) params.or = `(content.ilike.*${q.trim()}*,display_name.ilike.*${q.trim()}*,sender_name.ilike.*${q.trim()}*)`;
    const { data, total: t } = await sbQuery('quickbuy_chat_history', params);
    setMessages(data); setTotal(t); setLoading(false);
  }, [search]);

  useEffect(() => {
    load();
    // 統計
    Promise.all([
      sbQuery('quickbuy_chat_history', { select: 'id', sender_type: 'eq.User', limit: '1' }),
      sbQuery('quickbuy_chat_history', { select: 'id', sender_type: 'eq.Account', limit: '1' }),
      sbQuery('quickbuy_chat_history', { select: 'display_name', limit: '1' }),
    ]).then(([u, a, all]) => setStats({ user: u.total, account: a.total, total: all.total }));
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const goPage = (pg) => { setPage(pg); load(search, pg); };

  return (
    <div>
      <div style={{ color: '#06c755', fontSize: 11, marginBottom: 16, ...S.mono }}>$ line chat-history --browse</div>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard code="TOTAL" label="總訊息數" value={fmt(stats.total)} sub="all messages" accent="#06c755" />
          <StatCard code="USER" label="客戶訊息" value={fmt(stats.user)} sub="from customers" accent="#06c755" />
          <StatCard code="ACCT" label="官方回覆" value={fmt(stats.account)} sub="from staff" accent="#06c755" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(0); load(search, 0); } }} placeholder="搜尋對話內容、客戶名稱、客服名稱..." style={{ ...S.input, flex: 1 }} onFocus={e => e.target.style.borderColor = '#06c755'} onBlur={e => e.target.style.borderColor = '#2a2a2a'} />
        <button onClick={() => { setPage(0); load(search, 0); }} style={S.btnLine}>搜尋</button>
      </div>

      <div style={{ fontSize: 11, color: '#555', marginBottom: 12, ...S.mono }}>共 {fmt(total)} 筆 {totalPages > 1 && `· P${page + 1}/${totalPages}`}</div>

      {loading ? <Loading /> : messages.length === 0 ? <EmptyState text="沒有找到對話記錄" /> : messages.map(msg => (
        <div key={msg.id} style={{ ...S.card, padding: '12px 18px', marginBottom: 6, borderLeftColor: msg.sender_type === 'User' ? '#3b82f6' : '#06c755', borderLeftWidth: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={S.tag(msg.sender_type === 'User' ? '' : 'line')}>{msg.sender_type === 'User' ? '客戶' : '客服'}</span>
              <span style={{ fontSize: 12, color: '#aaa' }}>{msg.display_name}</span>
              {msg.sender_name && msg.sender_type === 'Account' && <span style={{ fontSize: 11, color: '#555' }}>({msg.sender_name})</span>}
            </div>
            <span style={{ color: '#444', fontSize: 11, ...S.mono }}>{msg.message_date} {msg.message_time}</span>
          </div>
          <div style={{ fontSize: 13, color: msg.sender_type === 'User' ? '#ccc' : '#9ae6b4', lineHeight: 1.6 }}>{msg.content}</div>
        </div>
      ))}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
          {page > 0 && <button onClick={() => goPage(page - 1)} style={S.btnGhost}>← 上一頁</button>}
          <span style={{ color: '#444', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page + 1}/{totalPages}</span>
          {page < totalPages - 1 && <button onClick={() => goPage(page + 1)} style={S.btnGhost}>下一頁 →</button>}
        </div>
      )}
    </div>
  );
}

/* ========================================= SIDEBAR & LAYOUT ========================================= */
const SECTIONS = [
  {
    title: 'QUICK BUY',
    tabs: [
      { id: 'dashboard', label: '儀表板', code: 'DASH' },
      { id: 'messages', label: 'AI 對話紀錄', code: 'MSG' },
      { id: 'products', label: '產品查價', code: 'SRCH' },
      { id: 'promotions', label: '活動管理', code: 'PRMO' },
      { id: 'pricing', label: '報價規則', code: 'PRCE' },
    ],
  },
  {
    title: 'LINE 官方帳號',
    accent: '#06c755',
    tabs: [
      { id: 'ai_prompt', label: 'AI Prompt 設定', code: 'AI' },
      { id: 'chat_history', label: '歷史對話', code: 'HIST' },
    ],
  },
];

const TAB_COMPONENTS = {
  dashboard: Dashboard,
  messages: Messages,
  products: ProductSearch,
  promotions: Promotions,
  pricing: PricingRules,
  ai_prompt: AIPrompt,
  chat_history: ChatHistory,
};

export default function AdminPage() {
  const [tab, setTab] = useState('dashboard');
  const ActiveTab = TAB_COMPONENTS[tab] || Dashboard;

  return (
    <div style={S.page}>
      <style>{'html,body{background:#1a1a1a!important;margin:0;padding:0}'}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />
      
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#10b981', fontWeight: 700, fontSize: 15, letterSpacing: 1.5, ...S.mono }}>QB</span>
          <span style={{ color: '#333', fontSize: 12 }}>|</span>
          <span style={{ color: '#555', fontSize: 12 }}>Quick Buy 管理後台</span>
        </div>
        <div style={{ fontSize: 11, color: '#333', ...S.mono }}>v2.0.0</div>
      </div>

      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          {SECTIONS.map((section, si) => (
            <div key={section.title}>
              <div style={{ padding: '14px 16px 8px', borderTop: si > 0 ? '1px solid #1a1a1a' : 'none', marginTop: si > 0 ? 8 : 0 }}>
                <div style={{ fontSize: 10, color: section.accent || '#333', ...S.mono, letterSpacing: 1 }}>{section.title}</div>
              </div>
              {section.tabs.map(t => (
                <div
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: tab === t.id ? (section.accent || '#10b981') : '#666',
                    background: tab === t.id ? (section.accent ? section.accent + '08' : '#10b98108') : 'transparent',
                    borderLeft: `2px solid ${tab === t.id ? (section.accent || '#10b981') : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 10, color: tab === t.id ? (section.accent ? section.accent + '80' : '#10b98180') : '#333', ...S.mono, width: 36 }}>{t.code}</span>
                  {t.label}
                </div>
              ))}
            </div>
          ))}

          <div style={{ padding: '16px', borderTop: '1px solid #2e2e2e', marginTop: 12 }}>
            <div style={{ fontSize: 10, color: '#333', ...S.mono, marginBottom: 6 }}>SYSTEM</div>
            <div style={{ fontSize: 11, color: '#444' }}>
              <div style={{ padding: '3px 0' }}>產品：120,956</div>
              <div style={{ padding: '3px 0' }}>歷史對話：86,261</div>
              <div style={{ padding: '3px 0' }}>Webhook：<span style={{ color: '#4ade80' }}>ON</span></div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={S.content}>
          <ActiveTab />
        </div>
      </div>
    </div>
  );
}
