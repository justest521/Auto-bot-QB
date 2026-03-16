'use client';
import { useState, useEffect, useCallback } from 'react';

const API = '/api/admin';
const fmt = n => n?.toLocaleString('zh-TW') || '0';
const fmtMs = ms => !ms ? '-' : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
const fmtDate = d => d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

/* =========================================
   STYLES - HYM ERP Standard
   ========================================= */
const S = {
  page: { minHeight: '100vh', background: '#0f0f0f', color: '#e5e5e5', fontFamily: "'Noto Sans TC', 'SF Mono', monospace, sans-serif" },
  header: { height: 48, background: '#0a0a0a', borderBottom: '1px solid #1f1f1f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' },
  sidebar: { width: 160, minHeight: 'calc(100vh - 48px)', background: '#0a0a0a', borderRight: '1px solid #1f1f1f', paddingTop: 8 },
  content: { flex: 1, padding: '24px 28px', maxWidth: 1100, minHeight: 'calc(100vh - 48px)' },
  card: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: '20px 22px', marginBottom: 16 },
  cardHover: { background: '#181818', border: '1px solid #2a2a2a' },
  input: { background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 6, padding: '9px 14px', color: '#e5e5e5', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s' },
  btnPrimary: { background: '#EAB308', color: '#0a0a0a', border: 'none', borderRadius: 6, padding: '9px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: 0.5 },
  btnGhost: { background: 'transparent', color: '#888', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif" },
  label: { color: '#666', fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 5, letterSpacing: 0.8, textTransform: 'uppercase' },
  mono: { fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: 0.5 },
  tag: (color) => ({ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: color === 'yellow' ? '#EAB30815' : color === 'green' ? '#22c55e12' : color === 'red' ? '#ef444412' : '#ffffff08', color: color === 'yellow' ? '#EAB308' : color === 'green' ? '#4ade80' : color === 'red' ? '#f87171' : '#888', border: `1px solid ${color === 'yellow' ? '#EAB30830' : color === 'green' ? '#22c55e25' : color === 'red' ? '#ef444425' : '#ffffff12'}` }),
};

/* =========================================
   STAT CARD
   ========================================= */
function StatCard({ code, label, value, sub }) {
  return (
    <div style={{ ...S.card, flex: '1 1 180px', minWidth: 165, padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 10, color: '#333', ...S.mono }}>{code}</div>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 6, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#EAB308', ...S.mono, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>{sub}</div>}
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
          <div style={{ ...S.tag('yellow') }}>TOP 10</div>
        </div>
        {stats?.top_products?.length > 0 ? (
          <div>
            {stats.top_products.map((p, i) => (
              <div key={p.item_number} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: i > 0 ? '1px solid #1a1a1a' : 'none' }}>
                <div style={{ width: 32, fontSize: 12, color: i < 3 ? '#EAB308' : '#444', fontWeight: 700, ...S.mono }}>#{i + 1}</div>
                <div style={{ flex: 1, fontSize: 13, color: '#ccc', ...S.mono }}>{p.item_number}</div>
                <div style={{ fontSize: 13, color: '#EAB308', fontWeight: 600, ...S.mono }}>{p.count}次</div>
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
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>$ quickbuy messages --list</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(1, search)}
          placeholder="搜尋訊息內容、客戶名稱..."
          style={{ ...S.input, flex: 1 }}
          onFocus={e => e.target.style.borderColor = '#EAB308'}
          onBlur={e => e.target.style.borderColor = '#2a2a2a'}
        />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>

      <div style={{ fontSize: 11, color: '#555', marginBottom: 12, ...S.mono }}>共 {data.total} 筆紀錄</div>

      {loading ? <Loading /> : data.messages.map(msg => (
        <div
          key={msg.id}
          onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
          style={{ ...S.card, cursor: 'pointer', padding: '14px 18px', transition: 'border-color 0.2s', borderColor: expanded === msg.id ? '#EAB30840' : '#1f1f1f' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={S.tag('yellow')}>{msg.display_name || '客戶'}</span>
              <span style={{ color: '#444', fontSize: 11, ...S.mono }}>{fmtDate(msg.created_at)}</span>
            </div>
            <span style={{ color: '#444', fontSize: 11, ...S.mono }}>{fmtMs(msg.response_time_ms)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#ccc' }}>
            <span style={{ color: '#555' }}>Q: </span>{msg.user_message}
          </div>
          {expanded === msg.id && (
            <div style={{ background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: 6, padding: '14px 16px', marginTop: 10, fontSize: 12, color: '#999', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              <span style={{ color: '#EAB308', fontSize: 11, ...S.mono }}>AI_RESPONSE</span>
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
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>$ quickbuy promo --manage</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#555', ...S.mono }}>共 {promos.length} 個活動</div>
        <button onClick={() => setShowForm(!showForm)} style={S.btnPrimary}>
          {showForm ? '取消' : '+ 新增活動'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...S.card, borderColor: '#EAB30830', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#EAB308', marginBottom: 18 }}>NEW_PROMOTION</div>
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
              style={{ ...S.input, resize: 'vertical', ...S.mono, fontSize: 12, lineHeight: 1.6 }}
            />
          </div>
          <button onClick={submit} style={S.btnPrimary}>建立活動</button>
        </div>
      )}

      {loading ? <Loading /> : promos.map(p => (
        <div key={p.id} style={{ ...S.card, borderColor: p.is_active ? '#EAB30825' : '#1f1f1f' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>{p.name}</span>
              <span style={S.tag(p.is_active ? 'green' : 'red')}>{p.is_active ? 'ACTIVE' : 'CLOSED'}</span>
            </div>
            <button onClick={() => toggle(p.id, p.is_active)} style={{ ...S.btnGhost, color: p.is_active ? '#f87171' : '#4ade80', borderColor: p.is_active ? '#ef444425' : '#22c55e25', fontSize: 12 }}>
              {p.is_active ? '關閉' : '啟用'}
            </button>
          </div>
          <div style={{ color: '#555', fontSize: 12, marginTop: 6, ...S.mono }}>{p.start_date} → {p.end_date}{p.note ? ` · ${p.note}` : ''}</div>
          {p.quickbuy_promotion_items?.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #1a1a1a', paddingTop: 10 }}>
              {p.quickbuy_promotion_items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', fontSize: 12 }}>
                  <span style={{ color: '#EAB308', ...S.mono, width: 140 }}>{item.item_number}</span>
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
      <div style={{ color: '#333', fontSize: 11, marginBottom: 16, ...S.mono }}>$ quickbuy config --pricing</div>

      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#EAB308', marginBottom: 20, ...S.mono }}>PRICING_CONFIG</div>

        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>預設折扣比例</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="number" step="0.01" min="0" max="1" value={rules.default_discount} onChange={e => setRules({ ...rules, default_discount: parseFloat(e.target.value) })} style={{ ...S.input, width: 120, textAlign: 'center', ...S.mono }} />
            <span style={{ color: '#555', fontSize: 12 }}>= {Math.round(rules.default_discount * 100)} 折（內部參考，不對外顯示）</span>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>免運門檻 (NT$)</label>
          <input type="number" step="100" value={rules.free_shipping_threshold} onChange={e => setRules({ ...rules, free_shipping_threshold: parseInt(e.target.value) })} style={{ ...S.input, width: 160, ...S.mono }} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>優惠提示文字</label>
          <input value={rules.promo_hint_text || '✨ 私訊享優惠價'} onChange={e => setRules({ ...rules, promo_hint_text: e.target.value })} style={S.input} />
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <label style={{ color: '#888', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={rules.show_retail_price} onChange={e => setRules({ ...rules, show_retail_price: e.target.checked })} style={{ accentColor: '#EAB308' }} />
            顯示建議售價
          </label>
          <label style={{ color: '#888', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={rules.show_promo_hint} onChange={e => setRules({ ...rules, show_promo_hint: e.target.checked })} style={{ accentColor: '#EAB308' }} />
            顯示優惠提示
          </label>
        </div>

        <button onClick={save} style={{ ...S.btnPrimary, background: saved ? '#22c55e' : '#EAB308', transition: 'background 0.3s', width: '100%', padding: '11px 0', fontSize: 14 }}>
          {saved ? '✓ SAVED' : '儲存設定'}
        </button>
      </div>

      <div style={{ ...S.card, borderColor: '#1a1a1a' }}>
        <div style={{ color: '#444', fontSize: 11, lineHeight: 1.9, ...S.mono }}>
          <span style={{ color: '#555' }}>// 說明</span><br/>
          // 折扣比例僅供內部參考，AI 不會對外報出<br/>
          // AI 回覆時顯示「建議售價」+「優惠提示」<br/>
          // 免運門檻：查詢金額超過時自動提醒客戶<br/>
          // 修改後立即生效，無需重新部署
        </div>
      </div>
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
        <span style={{ color: '#EAB308' }}>●</span> loading...
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
  { id: 'promotions', label: '活動管理', code: 'PROMO' },
  { id: 'pricing', label: '報價規則', code: 'PRICE' },
];

const TAB_COMPONENTS = { dashboard: Dashboard, messages: Messages, promotions: Promotions, pricing: PricingRules };

export default function AdminPage() {
  const [tab, setTab] = useState('dashboard');
  const ActiveTab = TAB_COMPONENTS[tab] || Dashboard;

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />
      
      {/* Header - 48px */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#EAB308', fontWeight: 700, fontSize: 15, letterSpacing: 1.5, ...S.mono }}>QB</span>
          <span style={{ color: '#333', fontSize: 12 }}>|</span>
          <span style={{ color: '#555', fontSize: 12 }}>Quick Buy 管理後台</span>
        </div>
        <div style={{ fontSize: 11, color: '#333', ...S.mono }}>v1.0.0</div>
      </div>

      <div style={{ display: 'flex' }}>
        {/* Sidebar - 160px */}
        <div style={S.sidebar}>
          <div style={{ padding: '12px 16px 16px', borderBottom: '1px solid #1a1a1a' }}>
            <div style={{ fontSize: 10, color: '#333', ...S.mono, marginBottom: 8 }}>NAVIGATION</div>
          </div>
          {TABS.map(t => (
            <div
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '11px 16px',
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: tab === t.id ? '#EAB308' : '#666',
                background: tab === t.id ? '#EAB30808' : 'transparent',
                borderLeft: `2px solid ${tab === t.id ? '#EAB308' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 10, color: tab === t.id ? '#EAB30880' : '#333', ...S.mono, width: 40 }}>{t.code}</span>
              {t.label}
            </div>
          ))}
          
          <div style={{ padding: '16px 16px', borderTop: '1px solid #1a1a1a', marginTop: 16 }}>
            <div style={{ fontSize: 10, color: '#333', ...S.mono, marginBottom: 6 }}>SYSTEM</div>
            <div style={{ fontSize: 11, color: '#444' }}>
              <div style={{ padding: '4px 0' }}>產品：120,018</div>
              <div style={{ padding: '4px 0' }}>Webhook：<span style={{ color: '#4ade80' }}>ON</span></div>
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
