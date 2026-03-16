'use client';
import { useState, useEffect, useCallback } from 'react';

const API = '/api/admin';
const fmt = n => n?.toLocaleString('zh-TW') || '0';
const fmtMs = ms => !ms ? '-' : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
const fmtDate = d => d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

/* =========================================
   STYLES - Terminal Green Theme
   ========================================= */
const S = {
  page: { minHeight: '100vh', background: '#0a0a0a', color: '#d4d4d4', fontFamily: "'SF Mono', 'Fira Code', 'Noto Sans TC', monospace, sans-serif" },
  header: { height: 48, background: '#060606', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 100 },
  sidebar: { width: 170, minHeight: 'calc(100vh - 48px)', background: '#060606', borderRight: '1px solid #1a1a1a', paddingTop: 8 },
  content: { flex: 1, padding: '24px 28px', maxWidth: 1100, minHeight: 'calc(100vh - 48px)' },
  card: { background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: 6, padding: '20px 22px', marginBottom: 12 },
  input: { background: '#080808', border: '1px solid #1f1f1f', borderRadius: 4, padding: '9px 14px', color: '#d4d4d4', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'SF Mono', 'Fira Code', monospace", transition: 'border-color 0.2s' },
  btnPrimary: { background: '#10b981', color: '#000', border: 'none', borderRadius: 4, padding: '9px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'SF Mono', monospace", letterSpacing: 0.5 },
  btnGhost: { background: 'transparent', color: '#666', border: '1px solid #1f1f1f', borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: "'SF Mono', monospace" },
  label: { color: '#555', fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 5, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: "'SF Mono', monospace" },
  mono: { fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: 0.5 },
  tag: (color) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3, letterSpacing: 0.5,
    background: color === 'green' ? '#10b98115' : color === 'red' ? '#ef444410' : color === 'amber' ? '#f59e0b12' : '#ffffff06',
    color: color === 'green' ? '#10b981' : color === 'red' ? '#ef4444' : color === 'amber' ? '#f59e0b' : '#666',
    border: `1px solid ${color === 'green' ? '#10b98130' : color === 'red' ? '#ef444425' : color === 'amber' ? '#f59e0b25' : '#ffffff10'}`,
  }),
};

/* =========================================
   STAT CARD
   ========================================= */
function StatCard({ code, label, value, sub }) {
  return (
    <div style={{ ...S.card, flex: '1 1 180px', minWidth: 165, padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 10, right: 14, fontSize: 9, color: '#1f1f1f', ...S.mono }}>{code}</div>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#10b981', ...S.mono, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#333', marginTop: 4, ...S.mono }}>{sub}</div>}
    </div>
  );
}

/* =========================================
   DASHBOARD
   ========================================= */
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}?action=stats`).then(r => r.json()).then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  return (
    <div>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>
        <span style={{ color: '#10b981' }}>$</span> quickbuy stats --overview
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard code="MSG_TD" label="今日查詢" value={fmt(stats?.today_messages)} sub="today" />
        <StatCard code="MSG_WK" label="本週查詢" value={fmt(stats?.week_messages)} sub="last 7d" />
        <StatCard code="MSG_ALL" label="總查詢數" value={fmt(stats?.total_messages)} sub="cumulative" />
        <StatCard code="USR" label="客戶數" value={fmt(stats?.total_customers)} sub="unique users" />
        <StatCard code="PERF" label="平均回覆" value={fmtMs(stats?.avg_response_ms)} sub="response time" />
      </div>

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#d4d4d4' }}>熱門查詢產品</div>
          <div style={{ ...S.tag('green') }}>TOP 10</div>
        </div>
        {stats?.top_products?.length > 0 ? (
          <div>
            {stats.top_products.map((p, i) => (
              <div key={p.item_number} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: i > 0 ? '1px solid #141414' : 'none' }}>
                <div style={{ width: 32, fontSize: 12, color: i < 3 ? '#10b981' : '#333', fontWeight: 700, ...S.mono }}>#{i + 1}</div>
                <div style={{ flex: 1, fontSize: 13, color: '#aaa', ...S.mono }}>{p.item_number}</div>
                <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600, ...S.mono }}>{p.count}次</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="等待客戶使用 Line Bot 後將顯示數據" />
        )}
      </div>
    </div>
  );
}

/* =========================================
   MESSAGES
   ========================================= */
function Messages() {
  const [data, setData] = useState({ messages: [], total: 0, page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback((page = 1, q = search) => {
    setLoading(true);
    fetch(`${API}?action=messages&page=${page}&search=${encodeURIComponent(q)}`)
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>
        <span style={{ color: '#10b981' }}>$</span> quickbuy messages --list
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(1, search)}
          placeholder="搜尋訊息內容、客戶名稱..."
          style={{ ...S.input, flex: 1 }}
          onFocus={e => e.target.style.borderColor = '#10b981'}
          onBlur={e => e.target.style.borderColor = '#1f1f1f'}
        />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>

      <div style={{ fontSize: 11, color: '#444', marginBottom: 12, ...S.mono }}>共 {data.total} 筆紀錄</div>

      {loading ? <Loading /> : data.messages.map(msg => (
        <div
          key={msg.id}
          onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
          style={{ ...S.card, cursor: 'pointer', padding: '14px 18px', transition: 'border-color 0.2s', borderColor: expanded === msg.id ? '#10b98130' : '#1a1a1a' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={S.tag('green')}>{msg.display_name || '客戶'}</span>
              <span style={{ color: '#333', fontSize: 11, ...S.mono }}>{fmtDate(msg.created_at)}</span>
            </div>
            <span style={{ color: '#333', fontSize: 11, ...S.mono }}>{fmtMs(msg.response_time_ms)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#aaa' }}>
            <span style={{ color: '#10b981', ...S.mono }}>→ </span>{msg.user_message}
          </div>
          {expanded === msg.id && (
            <div style={{ background: '#080808', border: '1px solid #141414', borderRadius: 4, padding: '14px 16px', marginTop: 10, fontSize: 12, color: '#888', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              <span style={{ color: '#10b981', fontSize: 10, ...S.mono }}>AI_RESPONSE</span>
              <div style={{ marginTop: 6, color: '#aaa' }}>{msg.ai_response}</div>
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
        {data.page > 1 && <button onClick={() => load(data.page - 1)} style={S.btnGhost}>← prev</button>}
        <span style={{ color: '#333', padding: '8px 0', fontSize: 12, ...S.mono }}>P{data.page}</span>
        {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={S.btnGhost}>next →</button>}
      </div>
    </div>
  );
}

/* =========================================
   PROMOTIONS
   ========================================= */
function Promotions() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', note: '', items: '' });

  const load = () => {
    fetch(`${API}?action=promotions`).then(r => r.json()).then(d => setPromos(d.promotions || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    const items = form.items.split('\n').filter(Boolean).map(line => {
      const match = line.match(/^([A-Za-z0-9-]+)\s*[→=:]\s*(?:NT\$?)?([\d,]+)(?:\s*[（(](.+)[)）])?/);
      if (!match) return null;
      return { item_number: match[1].toUpperCase(), promo_price: parseInt(match[2].replace(/,/g, '')), promo_note: match[3] || null };
    }).filter(Boolean);

    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_promotion', ...form, items }),
    });
    if (res.ok) { setShowForm(false); setForm({ name: '', start_date: '', end_date: '', note: '', items: '' }); load(); }
  };

  const toggle = async (id, active) => {
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_promotion', id, is_active: !active }),
    });
    load();
  };

  return (
    <div>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>
        <span style={{ color: '#10b981' }}>$</span> quickbuy promo --manage
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#444', ...S.mono }}>共 {promos.length} 個活動</div>
        <button onClick={() => setShowForm(!showForm)} style={S.btnPrimary}>
          {showForm ? '取消' : '+ 新增活動'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...S.card, borderColor: '#10b98125', marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 18, ...S.mono }}>NEW_PROMOTION</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={S.label}>活動名稱</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="四月工具月" style={S.input} />
            </div>
            <div>
              <label style={S.label}>備註</label>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="滿 10,000 免運" style={S.input} />
            </div>
            <div>
              <label style={S.label}>開始日期</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={S.input} />
            </div>
            <div>
              <label style={S.label}>結束日期</label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={S.input} />
            </div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={S.label}>活動商品（每行格式：型號 → 價格（備註））</label>
            <textarea
              value={form.items}
              onChange={e => setForm({ ...form, items: e.target.value })}
              placeholder={`ATECH3FR250B → 28000\nTPGDL2000 → 8500（買一送充氣嘴組）\nCTM3000 → 120000`}
              rows={5}
              style={{ ...S.input, resize: 'vertical', fontSize: 12, lineHeight: 1.6 }}
            />
          </div>
          <button onClick={submit} style={S.btnPrimary}>建立活動</button>
        </div>
      )}

      {loading ? <Loading /> : promos.map(p => (
        <div key={p.id} style={{ ...S.card, borderColor: p.is_active ? '#10b98120' : '#1a1a1a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#d4d4d4' }}>{p.name}</span>
              <span style={S.tag(p.is_active ? 'green' : 'red')}>{p.is_active ? 'ACTIVE' : 'CLOSED'}</span>
            </div>
            <button onClick={() => toggle(p.id, p.is_active)} style={{ ...S.btnGhost, color: p.is_active ? '#ef4444' : '#10b981', borderColor: p.is_active ? '#ef444420' : '#10b98120', fontSize: 12 }}>
              {p.is_active ? '關閉' : '啟用'}
            </button>
          </div>
          <div style={{ color: '#444', fontSize: 12, marginTop: 6, ...S.mono }}>{p.start_date} → {p.end_date}{p.note ? ` · ${p.note}` : ''}</div>
          {p.quickbuy_promotion_items?.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #141414', paddingTop: 10 }}>
              {p.quickbuy_promotion_items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', fontSize: 12 }}>
                  <span style={{ color: '#10b981', ...S.mono, width: 140 }}>{item.item_number}</span>
                  <span style={{ color: '#34d399', ...S.mono }}>NT${fmt(item.promo_price)}</span>
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

/* =========================================
   PRICING RULES
   ========================================= */
function PricingRules() {
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API}?action=pricing`).then(r => r.json()).then(d => setRules(d.rules)).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_pricing', rules }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading || !rules) return <Loading />;

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>
        <span style={{ color: '#10b981' }}>$</span> quickbuy config --pricing
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 20, ...S.mono }}>PRICING_CONFIG</div>

        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>預設折扣比例</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="number" step="0.01" min="0" max="1" value={rules.default_discount} onChange={e => setRules({ ...rules, default_discount: parseFloat(e.target.value) })} style={{ ...S.input, width: 120, textAlign: 'center' }} />
            <span style={{ color: '#555', fontSize: 12 }}>= {Math.round(rules.default_discount * 100)} 折（內部參考，不對外顯示）</span>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>免運門檻 (NT$)</label>
          <input type="number" step="100" value={rules.free_shipping_threshold} onChange={e => setRules({ ...rules, free_shipping_threshold: parseInt(e.target.value) })} style={{ ...S.input, width: 160 }} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>優惠提示文字</label>
          <input value={rules.promo_hint_text || '✨ 私訊享優惠價'} onChange={e => setRules({ ...rules, promo_hint_text: e.target.value })} style={S.input} />
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <label style={{ color: '#888', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={rules.show_retail_price} onChange={e => setRules({ ...rules, show_retail_price: e.target.checked })} style={{ accentColor: '#10b981' }} />
            顯示建議售價
          </label>
          <label style={{ color: '#888', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={rules.show_promo_hint} onChange={e => setRules({ ...rules, show_promo_hint: e.target.checked })} style={{ accentColor: '#10b981' }} />
            顯示優惠提示
          </label>
        </div>

        <button onClick={save} style={{ ...S.btnPrimary, background: saved ? '#34d399' : '#10b981', transition: 'background 0.3s', width: '100%', padding: '11px 0', fontSize: 14 }}>
          {saved ? '✓ SAVED' : '儲存設定'}
        </button>
      </div>

      <div style={{ ...S.card, borderColor: '#141414' }}>
        <div style={{ color: '#333', fontSize: 11, lineHeight: 1.9, ...S.mono }}>
          <span style={{ color: '#10b981' }}>//</span> 說明<br/>
          <span style={{ color: '#10b981' }}>//</span> 折扣比例僅供內部參考，AI 不會對外報出<br/>
          <span style={{ color: '#10b981' }}>//</span> AI 回覆時顯示「建議售價」+「優惠提示」<br/>
          <span style={{ color: '#10b981' }}>//</span> 免運門檻：查詢金額超過時自動提醒客戶<br/>
          <span style={{ color: '#10b981' }}>//</span> 修改後立即生效，無需重新部署
        </div>
      </div>
    </div>
  );
}

/* =========================================
   PRODUCT SEARCH
   ========================================= */
function ProductSearch() {
  const SUPABASE_URL = 'https://izfxiaufbwrlmifrbdiv.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6ZnhpYXVmYndybG1pZnJiZGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MjYzODYsImV4cCI6MjA4OTIwMjM4Nn0.3CirmkvYgGUfPIwRbYUdVJ0vcSfbJID2DCugJL2m7YM';

  const CATS = {
    all: '全部', wrench: '扳手', socket: '套筒', ratchet: '棘輪', screwdriver: '起子',
    plier: '鉗子', power_tool: '電動', torque_wrench: '扭力', storage: '收納',
    light: '照明', diagnostic: '診斷', battery: '電池', tester: '測試', borescope: '內視鏡',
    jack_lift: '千斤頂', torque_multiplier: '倍增器', tire_inflator: '打氣機', other: '其他',
  };

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
    try {
      const params = new URLSearchParams();
      params.set('select', 'item_number,description,us_price,tw_retail_price,tw_reseller_price,product_status,category,replacement_model,weight_kg,origin_country');
      params.set('product_status', 'eq.Current');
      params.set('order', 'item_number.asc');
      params.set('offset', String(pg * PAGE_SIZE));
      params.set('limit', String(PAGE_SIZE));
      if (cat && cat !== 'all') params.set('category', `eq.${cat}`);
      const trimmed = (q || '').trim();
      if (trimmed) {
        const escaped = trimmed.replace(/['"]/g, '');
        const tsQuery = escaped.split(/\s+/).filter(Boolean).join(' & ');
        params.set('or', `(item_number.ilike.*${escaped}*,search_text.fts.${tsQuery})`);
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/quickbuy_products?${params}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'count=exact' },
      });
      const t = parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
      setTotal(t);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setPage(0); doSearch(search, category, 0); }, 300);
    return () => clearTimeout(timer);
  }, [search, category, doSearch]);

  const goPage = (pg) => { setPage(pg); doSearch(search, category, pg); };
  const fmtP = n => n ? `NT$${Number(n).toLocaleString()}` : '-';
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>
        <span style={{ color: '#10b981' }}>$</span> quickbuy products --search
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜尋料號或關鍵字... (例: FDX71, wrench, socket)"
          style={S.input}
          onFocus={e => e.target.style.borderColor = '#10b981'}
          onBlur={e => e.target.style.borderColor = '#1f1f1f'}
        />
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 18 }}>
        {Object.entries(CATS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            style={{
              background: category === key ? '#10b98118' : 'transparent',
              color: category === key ? '#10b981' : '#555',
              border: `1px solid ${category === key ? '#10b98140' : '#1a1a1a'}`,
              borderRadius: 3, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              fontFamily: "'SF Mono', monospace", transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#444', ...S.mono }}>共 {fmt(total)} 筆</div>
        {totalPages > 1 && <div style={{ fontSize: 11, color: '#333', ...S.mono }}>P{page + 1}/{totalPages}</div>}
      </div>

      {loading ? <Loading /> : products.length === 0 ? (
        <EmptyState text={search ? '找不到符合的產品' : '輸入料號或關鍵字開始搜尋'} />
      ) : (
        <>
          <div style={{ display: 'flex', padding: '6px 14px', fontSize: 9, color: '#444', ...S.mono, borderBottom: '1px solid #141414', marginBottom: 2, letterSpacing: 1 }}>
            <div style={{ width: 140 }}>ITEM_NO</div>
            <div style={{ flex: 1 }}>DESCRIPTION</div>
            <div style={{ width: 70, textAlign: 'right' }}>CAT</div>
            <div style={{ width: 95, textAlign: 'right' }}>牌價</div>
            <div style={{ width: 95, textAlign: 'right' }}>經銷價</div>
          </div>

          {products.map(p => (
            <div key={p.item_number}>
              <div
                onClick={() => setExpanded(expanded === p.item_number ? null : p.item_number)}
                style={{
                  background: expanded === p.item_number ? '#0f0f0f' : '#0a0a0a',
                  border: `1px solid ${expanded === p.item_number ? '#10b98120' : '#111'}`,
                  borderRadius: 4, padding: '9px 14px', marginBottom: 1, display: 'flex', alignItems: 'center',
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <div style={{ width: 140, fontWeight: 700, color: '#10b981', fontSize: 12, ...S.mono }}>{p.item_number}</div>
                <div style={{ flex: 1, fontSize: 12, color: '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>
                <div style={{ width: 70, textAlign: 'right' }}>
                  {p.category && p.category !== 'other' && <span style={{ fontSize: 9, color: '#444', ...S.mono }}>{CATS[p.category] || p.category}</span>}
                </div>
                <div style={{ width: 95, textAlign: 'right', fontSize: 12, color: '#888', ...S.mono }}>{fmtP(p.tw_retail_price)}</div>
                <div style={{ width: 95, textAlign: 'right', fontSize: 12, color: '#34d399', fontWeight: 700, ...S.mono }}>{fmtP(p.tw_reseller_price)}</div>
              </div>

              {expanded === p.item_number && (
                <div style={{ background: '#080808', border: '1px solid #141414', borderRadius: 4, padding: '14px 18px', marginBottom: 6, marginTop: 2 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                    <div>
                      <div style={S.label}>US PRICE</div>
                      <div style={{ color: '#666', fontSize: 13, ...S.mono }}>{p.us_price ? `$${Number(p.us_price).toFixed(2)}` : '-'}</div>
                    </div>
                    <div>
                      <div style={S.label}>牌價</div>
                      <div style={{ color: '#999', fontSize: 13, ...S.mono }}>{fmtP(p.tw_retail_price)}</div>
                    </div>
                    <div>
                      <div style={S.label}>經銷價</div>
                      <div style={{ color: '#34d399', fontSize: 13, fontWeight: 700, ...S.mono }}>{fmtP(p.tw_reseller_price)}</div>
                    </div>
                    <div>
                      <div style={S.label}>重量</div>
                      <div style={{ color: '#666', fontSize: 13, ...S.mono }}>{p.weight_kg ? `${p.weight_kg} kg` : '-'}</div>
                    </div>
                    <div>
                      <div style={S.label}>產地</div>
                      <div style={{ color: '#666', fontSize: 13, ...S.mono }}>{p.origin_country || '-'}</div>
                    </div>
                    <div>
                      <div style={S.label}>替代型號</div>
                      <div style={{ color: p.replacement_model ? '#10b981' : '#666', fontSize: 13, ...S.mono }}>{p.replacement_model || '-'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
            {page > 0 && <button onClick={() => goPage(page - 1)} style={S.btnGhost}>← prev</button>}
            <span style={{ color: '#333', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page + 1}/{totalPages}</span>
            {page < totalPages - 1 && <button onClick={() => goPage(page + 1)} style={S.btnGhost}>next →</button>}
          </div>
        </>
      )}
    </div>
  );
}

/* =========================================
   SHARED COMPONENTS
   ========================================= */
function Loading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{ color: '#333', fontSize: 12, ...S.mono }}>
        <span style={{ color: '#10b981' }}>●</span> loading...
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: '#333', fontSize: 12, ...S.mono }}>
      {text}
    </div>
  );
}

/* =========================================
   MAIN LAYOUT
   ========================================= */
const TABS = [
  { id: 'dashboard', label: '儀表板', code: 'DASH' },
  { id: 'messages', label: '對話紀錄', code: 'MSG' },
  { id: 'products', label: '產品查價', code: 'SEARCH' },
  { id: 'promotions', label: '活動管理', code: 'PROMO' },
  { id: 'pricing', label: '報價規則', code: 'PRICE' },
];

const TAB_COMPONENTS = { dashboard: Dashboard, messages: Messages, products: ProductSearch, promotions: Promotions, pricing: PricingRules };

export default function AdminPage() {
  const [tab, setTab] = useState('dashboard');
  const ActiveTab = TAB_COMPONENTS[tab] || Dashboard;

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />
      
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#10b981', fontWeight: 700, fontSize: 15, letterSpacing: 1.5, ...S.mono }}>QB</span>
          <span style={{ color: '#1f1f1f', fontSize: 12 }}>│</span>
          <span style={{ color: '#444', fontSize: 12 }}>Quick Buy 管理後台</span>
        </div>
        <div style={{ fontSize: 10, color: '#1f1f1f', ...S.mono }}>v1.1.0</div>
      </div>

      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          <div style={{ padding: '12px 16px 14px', borderBottom: '1px solid #111' }}>
            <div style={{ fontSize: 9, color: '#333', ...S.mono, letterSpacing: 1.5 }}>NAVIGATION</div>
          </div>
          {TABS.map(t => (
            <div
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: tab === t.id ? '#10b981' : '#555',
                background: tab === t.id ? '#10b98108' : 'transparent',
                borderLeft: `2px solid ${tab === t.id ? '#10b981' : 'transparent'}`,
                transition: 'all 0.12s',
              }}
            >
              <span style={{ fontSize: 9, color: tab === t.id ? '#10b98160' : '#222', ...S.mono, width: 44 }}>{t.code}</span>
              {t.label}
            </div>
          ))}
          
          <div style={{ padding: '14px 16px', borderTop: '1px solid #111', marginTop: 16 }}>
            <div style={{ fontSize: 9, color: '#222', ...S.mono, marginBottom: 6, letterSpacing: 1.5 }}>SYSTEM</div>
            <div style={{ fontSize: 11, color: '#333', ...S.mono }}>
              <div style={{ padding: '3px 0' }}>產品：120,956</div>
              <div style={{ padding: '3px 0' }}>Webhook：<span style={{ color: '#10b981' }}>ON</span></div>
              <div style={{ padding: '3px 0' }}>LIFF：<span style={{ color: '#10b981' }}>ON</span></div>
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
