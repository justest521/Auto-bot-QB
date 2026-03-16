'use client';
import { useState, useEffect, useCallback } from 'react';

const API = '/api/admin';

function formatNumber(n) {
  return n?.toLocaleString() || '0';
}
function formatMs(ms) {
  if (!ms) return '-';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ==========================================
// Stat Card
// ==========================================
function StatCard({ label, value, sub, icon }) {
  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: '20px 24px', flex: '1 1 200px', minWidth: 180 }}>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span> {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#EAB308', letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ==========================================
// Dashboard Tab
// ==========================================
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}?action=stats`).then(r => r.json()).then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#888', padding: 40, textAlign: 'center' }}>載入中...</div>;
  if (!stats) return <div style={{ color: '#f44', padding: 40 }}>無法載入數據</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <StatCard icon="💬" label="今日查詢" value={formatNumber(stats.today_messages)} sub="本日訊息數" />
        <StatCard icon="📊" label="本週查詢" value={formatNumber(stats.week_messages)} sub="近 7 天" />
        <StatCard icon="📨" label="總查詢數" value={formatNumber(stats.total_messages)} sub="累計訊息" />
        <StatCard icon="👥" label="客戶數" value={formatNumber(stats.total_customers)} sub="獨立客戶" />
        <StatCard icon="⚡" label="平均回覆" value={formatMs(stats.avg_response_ms)} sub="回覆速度" />
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24 }}>
        <h3 style={{ margin: '0 0 16px', color: '#EAB308', fontSize: 16, fontWeight: 600 }}>🔥 熱門查詢產品</h3>
        {stats.top_products?.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#888', fontSize: 13, fontWeight: 500 }}>排名</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#888', fontSize: 13, fontWeight: 500 }}>型號</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#888', fontSize: 13, fontWeight: 500 }}>查詢次數</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_products.map((p, i) => (
                <tr key={p.item_number} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '10px 12px', color: i < 3 ? '#EAB308' : '#ccc', fontWeight: i < 3 ? 700 : 400 }}>#{i + 1}</td>
                  <td style={{ padding: '10px 12px', color: '#fff', fontFamily: 'monospace' }}>{p.item_number}</td>
                  <td style={{ padding: '10px 12px', color: '#EAB308', textAlign: 'right', fontWeight: 600 }}>{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>尚無查詢數據，等客戶使用 Line Bot 後就會有了</div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Messages Tab
// ==========================================
function Messages() {
  const [data, setData] = useState({ messages: [], total: 0, page: 1 });
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
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(1, search)}
          placeholder="搜尋訊息、客戶名稱..."
          style={{ flex: 1, background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 16px', color: '#fff', fontSize: 14, outline: 'none' }}
        />
        <button onClick={() => load(1, search)} style={{ background: '#EAB308', color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
          搜尋
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>載入中...</div>
      ) : (
        <>
          <div style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>共 {data.total} 筆對話</div>
          {data.messages.map(msg => (
            <div key={msg.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 16, marginBottom: 12, cursor: 'pointer' }} onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ background: '#EAB308', color: '#000', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{msg.display_name || '客戶'}</span>
                  <span style={{ color: '#666', fontSize: 12 }}>{formatDate(msg.created_at)}</span>
                </div>
                <span style={{ color: '#666', fontSize: 12 }}>{formatMs(msg.response_time_ms)}</span>
              </div>
              <div style={{ color: '#fff', fontSize: 14, marginBottom: 6 }}>
                <span style={{ color: '#888' }}>客戶：</span>{msg.user_message}
              </div>
              {expanded === msg.id && (
                <div style={{ background: '#111', borderRadius: 8, padding: 12, marginTop: 8, fontSize: 13, color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  <span style={{ color: '#EAB308' }}>AI 回覆：</span>
                  <br />{msg.ai_response}
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
            {data.page > 1 && <button onClick={() => load(data.page - 1)} style={{ background: '#222', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>← 上一頁</button>}
            <span style={{ color: '#888', padding: '8px 0', fontSize: 13 }}>第 {data.page} 頁</span>
            {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={{ background: '#222', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>下一頁 →</button>}
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================
// Promotions Tab
// ==========================================
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

  const inputStyle = { background: '#111', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ color: '#888', fontSize: 13 }}>共 {promos.length} 個活動</div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: '#EAB308', color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}>
          {showForm ? '取消' : '＋ 新增活動'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#1a1a1a', border: '1px solid #EAB308', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h3 style={{ color: '#EAB308', margin: '0 0 16px', fontSize: 16 }}>新增活動</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>活動名稱</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：四月工具月" style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>備註</label>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="例：滿 10,000 免運" style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>開始日期</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>結束日期</label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>活動商品（每行一個，格式：型號 → 價格（備註））</label>
            <textarea
              value={form.items}
              onChange={e => setForm({ ...form, items: e.target.value })}
              placeholder={`ATECH3FR250B → 28000\nTPGDL2000 → 8500（買一送充氣嘴組）\nCTM3000 → 120000`}
              rows={5}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
            />
          </div>
          <button onClick={submit} style={{ background: '#EAB308', color: '#000', border: 'none', borderRadius: 8, padding: '12px 32px', fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
            建立活動
          </button>
        </div>
      )}

      {promos.map(p => (
        <div key={p.id} style={{ background: '#1a1a1a', border: `1px solid ${p.is_active ? '#EAB308' : '#333'}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{p.name}</span>
              <span style={{ color: p.is_active ? '#4ade80' : '#f44', fontSize: 12, marginLeft: 10, background: p.is_active ? '#052e16' : '#2a0a0a', padding: '2px 8px', borderRadius: 4 }}>
                {p.is_active ? '進行中' : '已關閉'}
              </span>
            </div>
            <button onClick={() => toggle(p.id, p.is_active)} style={{ background: p.is_active ? '#2a0a0a' : '#052e16', color: p.is_active ? '#f44' : '#4ade80', border: '1px solid #333', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
              {p.is_active ? '關閉' : '啟用'}
            </button>
          </div>
          <div style={{ color: '#888', fontSize: 13, marginTop: 6 }}>
            {p.start_date} ~ {p.end_date} {p.note && `| ${p.note}`}
          </div>
          {p.quickbuy_promotion_items?.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              {p.quickbuy_promotion_items.map(item => (
                <div key={item.id} style={{ color: '#ccc', padding: '4px 0', borderTop: '1px solid #222' }}>
                  <span style={{ color: '#EAB308', fontFamily: 'monospace' }}>{item.item_number}</span>
                  <span style={{ color: '#4ade80', marginLeft: 12 }}>NT${formatNumber(item.promo_price)}</span>
                  {item.promo_note && <span style={{ color: '#888', marginLeft: 8 }}>({item.promo_note})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {!loading && promos.length === 0 && (
        <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>尚無活動，點上方「新增活動」建立第一個</div>
      )}
    </div>
  );
}

// ==========================================
// Pricing Rules Tab
// ==========================================
function PricingRules() {
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API}?action=pricing`).then(r => r.json()).then(d => setRules(d.rules)).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_pricing', rules }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading || !rules) return <div style={{ color: '#888', padding: 40, textAlign: 'center' }}>載入中...</div>;

  const inputStyle = { background: '#111', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24 }}>
        <h3 style={{ color: '#EAB308', margin: '0 0 20px', fontSize: 16 }}>💰 報價規則</h3>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#888', fontSize: 13, display: 'block', marginBottom: 6 }}>預設折扣（0.85 = 85 折）</label>
          <input type="number" step="0.01" min="0" max="1" value={rules.default_discount} onChange={e => setRules({ ...rules, default_discount: parseFloat(e.target.value) })} style={inputStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#888', fontSize: 13, display: 'block', marginBottom: 6 }}>免運門檻（NT$）</label>
          <input type="number" step="100" value={rules.free_shipping_threshold} onChange={e => setRules({ ...rules, free_shipping_threshold: parseInt(e.target.value) })} style={inputStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#888', fontSize: 13, display: 'block', marginBottom: 6 }}>優惠提示文字</label>
          <input value={rules.promo_hint_text || '✨ 私訊享優惠價'} onChange={e => setRules({ ...rules, promo_hint_text: e.target.value })} style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <label style={{ color: '#888', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={rules.show_retail_price} onChange={e => setRules({ ...rules, show_retail_price: e.target.checked })} />
            顯示建議售價
          </label>
          <label style={{ color: '#888', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={rules.show_promo_hint} onChange={e => setRules({ ...rules, show_promo_hint: e.target.checked })} />
            顯示優惠提示
          </label>
        </div>

        <button onClick={save} style={{ background: saved ? '#4ade80' : '#EAB308', color: '#000', border: 'none', borderRadius: 8, padding: '12px 32px', fontWeight: 700, cursor: 'pointer', fontSize: 15, transition: 'background 0.3s' }}>
          {saved ? '✓ 已儲存' : '儲存規則'}
        </button>
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24, marginTop: 16 }}>
        <h3 style={{ color: '#888', margin: '0 0 12px', fontSize: 14 }}>ℹ️ 說明</h3>
        <div style={{ color: '#666', fontSize: 13, lineHeight: 1.8 }}>
          • 折扣比例不會直接顯示給客戶，僅供內部參考<br />
          • AI 回覆時只顯示「建議售價」+「私訊享優惠價」<br />
          • 免運門檻會在客戶查詢金額超過時自動提醒<br />
          • 修改後立即生效，不需要重新部署
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Main Admin Page
// ==========================================
const TABS = [
  { id: 'dashboard', label: '📊 儀表板', component: Dashboard },
  { id: 'messages', label: '💬 對話紀錄', component: Messages },
  { id: 'promotions', label: '🔥 活動管理', component: Promotions },
  { id: 'pricing', label: '💰 報價規則', component: PricingRules },
];

export default function AdminPage() {
  const [tab, setTab] = useState('dashboard');
  const ActiveTab = TABS.find(t => t.id === tab)?.component || Dashboard;

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#fff', fontFamily: "'Noto Sans TC', sans-serif" }}>
      {/* Header */}
      <div style={{ height: 48, background: '#0f0f0f', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', padding: '0 24px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ color: '#EAB308', fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>Quick Buy</div>
        <div style={{ color: '#555', fontSize: 13, marginLeft: 12 }}>管理後台</div>
      </div>

      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <div style={{ width: 160, minHeight: 'calc(100vh - 48px)', background: '#0f0f0f', borderRight: '1px solid #1a1a1a', padding: '16px 0' }}>
          {TABS.map(t => (
            <div
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '12px 20px',
                cursor: 'pointer',
                fontSize: 14,
                color: tab === t.id ? '#EAB308' : '#888',
                background: tab === t.id ? '#1a1a1a' : 'transparent',
                borderLeft: tab === t.id ? '3px solid #EAB308' : '3px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              {t.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '24px 32px', maxWidth: 1000 }}>
          <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 600, color: '#fff' }}>
            {TABS.find(t => t.id === tab)?.label}
          </h2>
          <ActiveTab />
        </div>
      </div>

      {/* Noto Sans TC */}
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
