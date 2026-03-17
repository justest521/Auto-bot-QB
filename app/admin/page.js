'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '/api/admin';
const ADMIN_TOKEN_KEY = 'qb_admin_token';

const fmt = n => n?.toLocaleString('zh-TW') || '0';
const fmtMs = ms => !ms ? '-' : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
const fmtDate = d => d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const fmtP = n => n ? `NT$${Number(n).toLocaleString()}` : '-';

function useViewportWidth() {
  const [width, setWidth] = useState(1400);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return width;
}

async function authFetch(url, options = {}) {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ADMIN_TOKEN_KEY) : '';

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token || '',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    throw new Error('Token 錯誤或已失效，請重新登入');
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;

    try {
      const data = await res.json();
      message = data?.error || message;
    } catch {
      try {
        message = await res.text();
      } catch {
        // Ignore response parse errors and use fallback message.
      }
    }

    throw new Error(message);
  }

  return res;
}

async function apiGet(params = {}) {
  const p = new URLSearchParams(params);
  const res = await authFetch(`${API}?${p.toString()}`);
  return res.json();
}

async function apiPost(body) {
  const res = await authFetch(API, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

/* ========================================= STYLES ========================================= */
const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg, #e9eef5 0%, #f5f7fb 220px)', color: '#192434', fontFamily: "'Noto Sans TC', 'SF Mono', monospace, sans-serif" },
  shell: { display: 'flex', minHeight: '100vh' },
  sidebar: { width: 248, background: 'linear-gradient(180deg, #1d2636 0%, #101723 100%)', color: '#c6d0df', padding: '18px 0 20px', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04)', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  header: { height: 64, background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid #d8e0ea', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' },
  content: { flex: 1, padding: '26px 28px 40px', minHeight: 'calc(100vh - 64px)' },
  card: { background: '#ffffff', border: '1px solid #dbe3ee', borderRadius: 14, padding: '18px 20px', marginBottom: 18, boxShadow: '0 10px 28px rgba(20, 35, 60, 0.06)' },
  panelMuted: { background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 12, padding: '14px 16px' },
  input: { background: '#fff', border: '1px solid #ccd6e3', borderRadius: 10, padding: '10px 14px', color: '#152033', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s, box-shadow 0.2s', boxShadow: 'inset 0 1px 2px rgba(17,24,39,0.04)' },
  btnPrimary: { background: 'linear-gradient(180deg, #2d8cff 0%, #1976f3 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: 0.2, boxShadow: '0 8px 18px rgba(25,118,243,0.22)' },
  btnGhost: { background: '#fff', color: '#5b6779', border: '1px solid #ccd6e3', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif" },
  btnLine: { background: 'linear-gradient(180deg, #19c767 0%, #06b755 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13, boxShadow: '0 8px 18px rgba(6,183,85,0.2)' },
  label: { color: '#6d7a8b', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.9, textTransform: 'uppercase' },
  mono: { fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: 0.5 },
  pageLead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 18 },
  pageTitle: { fontSize: 28, fontWeight: 700, color: '#172337', letterSpacing: -0.6, marginBottom: 6 },
  pageDesc: { fontSize: 13, color: '#718096', lineHeight: 1.7, maxWidth: 760 },
  eyebrow: { fontSize: 11, color: '#1976f3', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, ...{ fontFamily: "'SF Mono', 'Fira Code', monospace" } },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 },
  twoCol: { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' },
  tag: (color) => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: color === 'green' ? '#ddf7ea' : color === 'red' ? '#ffe3e6' : color === 'line' ? '#def8ea' : '#edf2f7', color: color === 'green' ? '#129c59' : color === 'red' ? '#d1435b' : color === 'line' ? '#06a14d' : '#63758a', border: `1px solid ${color === 'green' ? '#bdeccb' : color === 'red' ? '#ffc7cf' : color === 'line' ? '#bcefd2' : '#d9e2ec'}` }),
};

/* ========================================= SHARED ========================================= */
function Loading() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div style={{ color: '#7e8a9b', fontSize: 12, ...S.mono }}><span style={{ color: '#1976f3' }}>●</span> loading...</div></div>;
}
function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', padding: '40px 0', color: '#8a96a8', fontSize: 12, ...S.mono }}>{text}</div>;
}
function PageLead({ eyebrow, title, description, action }) {
  return (
    <div style={S.pageLead}>
      <div>
        {eyebrow && <div style={S.eyebrow}>{eyebrow}</div>}
        <div style={S.pageTitle}>{title}</div>
        {description && <div style={S.pageDesc}>{description}</div>}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
function PanelHeader({ title, meta, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1c2740' }}>{title}</div>
        {meta ? <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b' }}>{meta}</div> : null}
      </div>
      {badge}
    </div>
  );
}
function MiniDonut({ value, color }) {
  const safeValue = Math.max(0, Math.min(100, value || 0));
  const degrees = Math.round((safeValue / 100) * 360);
  return (
    <div
      style={{
        width: 66,
        height: 66,
        borderRadius: '50%',
        background: `conic-gradient(${color} ${degrees}deg, #e8eef6 ${degrees}deg 360deg)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1c2740', fontSize: 12, fontWeight: 700, ...S.mono }}>
        {safeValue}%
      </div>
    </div>
  );
}
function buildLinePath(values, width, height) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const step = safeValues.length > 1 ? width / (safeValues.length - 1) : width;

  return safeValues
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 10) - 5;
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
}

function TrendChart({ monthly }) {
  const messageSeries = monthly?.map((item) => item.count) || [];
  const customerSeries = monthly?.map((item) => item.customers) || [];
  const messagePath = buildLinePath(messageSeries, 640, 180);
  const customerPath = buildLinePath(customerSeries, 640, 180);
  const messageArea = `${messagePath} L640 220 L0 220 Z`;
  const customerArea = `${customerPath} L640 220 L0 220 Z`;

  return (
    <div style={{ height: 240, borderRadius: 14, background: 'linear-gradient(180deg, #f9fbff 0%, #f0f5fb 100%)', border: '1px solid #dbe6f3', padding: 16, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: '16px 16px 38px', backgroundImage: 'linear-gradient(#edf2f8 1px, transparent 1px), linear-gradient(90deg, #edf2f8 1px, transparent 1px)', backgroundSize: '100% 46px, 72px 100%', borderRadius: 10 }} />
      <svg viewBox="0 0 640 220" style={{ position: 'relative', width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id="areaBlue" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#38a8ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38a8ff" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="areaGray" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#93a4bb" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#93a4bb" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={messageArea} fill="url(#areaBlue)" />
        <path d={customerArea} fill="url(#areaGray)" />
        <path d={messagePath} fill="none" stroke="#1696f3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={customerPath} fill="none" stroke="#c2ccd8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ position: 'absolute', left: 22, right: 20, bottom: 12, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', color: '#8090a5', fontSize: 11, ...S.mono }}>
        {(monthly || []).map((item) => (
          <div key={item.label}>{item.label}</div>
        ))}
      </div>
    </div>
  );
}
function TrendLineChart({ daily }) {
  const counts = daily?.map((item) => item.count) || [];
  const path = buildLinePath(counts, 560, 150);
  const max = Math.max(...(counts.length ? counts : [0]), 1);
  const step = counts.length > 1 ? 560 / (counts.length - 1) : 560;

  return (
    <div style={{ height: 240, borderRadius: 14, background: 'linear-gradient(180deg, #1db5d9 0%, #1798cf 100%)', padding: 18, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 18, borderRadius: 12, backgroundImage: 'linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)', backgroundSize: '100% 44px' }} />
      <svg viewBox="0 0 560 180" style={{ position: 'relative', width: '100%', height: '100%' }}>
        <path d={path} fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {counts.map((value, idx) => {
          const x = idx * step;
          const y = 150 - (value / max) * 140 - 5;
          return <circle key={idx} cx={x} cy={y} r="4.5" fill="#fff" />;
        })}
      </svg>
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 12, display: 'grid', gridTemplateColumns: `repeat(${Math.max((daily || []).length, 1)}, 1fr)`, color: 'rgba(255,255,255,0.78)', fontSize: 10, ...S.mono }}>
        {(daily || []).map((item) => (
          <div key={item.label}>{item.label}</div>
        ))}
      </div>
    </div>
  );
}
function StatCard({ code, label, value, sub, accent, tone = 'blue' }) {
  const palette = {
    blue: ['#16a7d8', '#0c8bc2'],
    green: ['#31c764', '#18a74d'],
    yellow: ['#f1be19', '#dea000'],
    red: ['#ef4764', '#d52f54'],
    navy: ['#4d6fff', '#2f4dde'],
  };
  const [start, end] = palette[tone] || palette.blue;
  return (
    <div style={{ minWidth: 165, padding: '18px 18px 16px', position: 'relative', overflow: 'hidden', borderRadius: 14, background: `linear-gradient(135deg, ${start} 0%, ${end} 100%)`, color: '#fff', boxShadow: '0 16px 34px rgba(20,35,60,0.12)' }}>
      <div style={{ position: 'absolute', top: 14, right: 16, fontSize: 10, color: 'rgba(255,255,255,0.55)', ...S.mono }}>{code}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.76)', marginBottom: 10, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent || '#fff', ...S.mono, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.86)', marginTop: 8 }}>{sub}</div>}
      <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.16)', fontSize: 11, color: 'rgba(255,255,255,0.88)', fontWeight: 600 }}>More info</div>
    </div>
  );
}

/* ========================================= DASHBOARD ========================================= */
function Dashboard() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet({ action: 'stats' }).then(setStats).finally(() => setLoading(false)); }, []);
  if (loading) return <Loading />;
  const interaction = stats?.interaction_breakdown || {};
  const summaryItems = [
    [
      'AI 回覆效率',
      `最近樣本平均回覆時間約 ${fmtMs(stats?.avg_response_ms)}，${(interaction.fast_reply_rate || 0) >= 70 ? '整體反應偏快' : '仍有再優化空間'}`,
    ],
    [
      '產品命中情況',
      `近期查詢中有 ${interaction.matched_rate || 0}% 能直接命中產品資料，熱門料號集中在前十名排行。`,
    ],
    [
      '客戶回流比例',
      `最近互動客戶中約 ${interaction.repeat_customer_rate || 0}% 有重複詢價，適合追蹤高意圖名單。`,
    ],
  ];
  const actionItems = [
    {
      title: '確認今日查詢流量',
      desc: `今日累積 ${fmt(stats?.today_messages)} 筆查詢，檢查是否與預期流量一致。`,
      color: '#1976f3',
    },
    {
      title: '追蹤本週互動節奏',
      desc: `本週已有 ${fmt(stats?.week_messages)} 筆訊息，留意是否出現異常尖峰或回落。`,
      color: '#25c66f',
    },
    {
      title: '檢視熱門詢價產品',
      desc: stats?.top_products?.[0]
        ? `目前查詢最多的是 ${stats.top_products[0].item_number}，可優先準備對應銷售話術。`
        : '目前尚未累積足夠熱門產品資料，可待更多互動後再觀察。',
      color: '#ef4764',
    },
    {
      title: '確認後台與 webhook 狀態',
      desc: '部署後建議持續抽查 admin 登入與 LINE webhook 是否皆可正常使用。',
      color: '#f1be19',
    },
  ];
  return (
    <div>
      <PageLead
        eyebrow="Dashboard"
        title="營運儀表板"
        description="集中查看 Quick Buy Bot 的查詢量、客戶互動與熱門產品，整體結構參考經典 admin dashboard 的高資訊密度佈局。"
      />
      <div style={{ ...S.statGrid, gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : S.statGrid.gridTemplateColumns }}>
        <StatCard code="MSG_TD" label="今日查詢" value={fmt(stats?.today_messages)} sub="New orders" tone="blue" />
        <StatCard code="MSG_WK" label="本週查詢" value={fmt(stats?.week_messages)} sub="7-day volume" tone="green" />
        <StatCard code="USR" label="客戶數" value={fmt(stats?.total_customers)} sub="Unique contacts" tone="yellow" />
        <StatCard code="PERF" label="平均回覆" value={fmtMs(stats?.avg_response_ms)} sub="Response time" tone="red" />
      </div>
      <div style={{ ...S.twoCol, gridTemplateColumns: isTablet ? '1fr' : S.twoCol.gridTemplateColumns }}>
        <div style={S.card}>
          <PanelHeader title="熱門查詢產品" meta="最近互動中最常被詢問的產品料號" badge={<div style={{ ...S.tag('green') }}>TOP 10</div>} />
          {stats?.top_products?.length > 0 ? stats.top_products.map((p, i) => (
            <div key={p.item_number} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 100px', alignItems: 'center', padding: '11px 0', borderTop: i > 0 ? '1px solid #e6edf5' : 'none' }}>
              <div style={{ fontSize: 12, color: i < 3 ? '#1976f3' : '#95a2b3', fontWeight: 700, ...S.mono }}>#{i + 1}</div>
              <div style={{ fontSize: 13, color: '#203047', ...S.mono }}>{p.item_number}</div>
              <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{p.count}次</div>
            </div>
          )) : <EmptyState text="等待客戶使用 Line Bot 後將顯示數據" />}
        </div>
        <div style={S.card}>
          <PanelHeader title="系統概況" meta="目前部署與營運摘要" badge={<div style={{ ...S.tag('line') }}>LIVE</div>} />
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>TOTAL_MESSAGES</div>
              <div style={{ fontSize: 28, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmt(stats?.total_messages)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>WEBHOOK</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#129c59' }}>Operational</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>ADMIN</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1976f3' }}>Protected</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ ...S.twoCol, marginTop: 18, gridTemplateColumns: isTablet ? '1fr' : S.twoCol.gridTemplateColumns }}>
        <div style={S.card}>
          <PanelHeader title="查詢趨勢" meta="模擬營運視圖，呈現近期查詢量與客戶互動波動" badge={<div style={{ ...S.tag('') }}>TREND</div>} />
          <TrendChart monthly={stats?.trend_monthly} />
        </div>
        <div style={S.card}>
          <PanelHeader title="互動概況" meta="以 dashboard 模組方式呈現主要互動指標" badge={<div style={{ ...S.tag('green') }}>LIVE</div>} />
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
              <div>
                <MiniDonut value={interaction.matched_rate} color="#25c66f" />
                <div style={{ marginTop: 8, fontSize: 11, color: '#7b889b', ...S.mono }}>MATCHED</div>
              </div>
              <div>
                <MiniDonut value={interaction.repeat_customer_rate} color="#f1be19" />
                <div style={{ marginTop: 8, fontSize: 11, color: '#7b889b', ...S.mono }}>REPEAT</div>
              </div>
              <div>
                <MiniDonut value={interaction.fast_reply_rate} color="#ef4764" />
                <div style={{ marginTop: 8, fontSize: 11, color: '#7b889b', ...S.mono }}>FAST</div>
              </div>
            </div>
            <div style={{ ...S.panelMuted, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #dbe6f3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1c2740' }}>最近摘要</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b' }}>快速檢視目前營運狀態</div>
                </div>
                <div style={{ ...S.tag('line') }}>STATUS</div>
              </div>
              <div style={{ padding: '8px 16px' }}>
                {summaryItems.map(([title, desc], idx) => (
                  <div key={title} style={{ padding: '10px 0', borderTop: idx > 0 ? '1px solid #e6edf5' : 'none' }}>
                    <div style={{ fontSize: 13, color: '#1f2b41', fontWeight: 700 }}>{title}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b', lineHeight: 1.7 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ ...S.twoCol, marginTop: 18, gridTemplateColumns: isTablet ? '1fr' : S.twoCol.gridTemplateColumns }}>
        <div style={S.card}>
          <PanelHeader title="成長曲線" meta="以高密度圖表模塊補齊參考圖的 dashboard 視覺語言" badge={<div style={{ ...S.tag('') }}>REPORT</div>} />
          <TrendLineChart daily={stats?.trend_daily} />
        </div>
        <div style={S.card}>
          <PanelHeader title="待辦與提醒" meta="用於追蹤上線後的營運維護工作" badge={<div style={{ ...S.tag('red') }}>ACTION</div>} />
          <div style={{ display: 'grid', gap: 10 }}>
            {actionItems.map(({ title, desc, color }) => (
              <div key={title} style={{ ...S.panelMuted, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: color, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 700 }}>{title}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b', lineHeight: 1.7 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================= MESSAGES (AI Bot) ========================================= */
function Messages() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ messages: [], total: 0, page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const load = useCallback((page = 1, q = search) => {
    setLoading(true);
    apiGet({ action: 'messages', page: String(page), search: q }).then(setData).finally(() => setLoading(false));
  }, [search]);
  useEffect(() => { load(); }, []);
  return (
    <div>
      <PageLead eyebrow="Messages" title="AI 對話紀錄" description="集中檢視客戶提問、AI 回覆內容與回覆速度，適合追蹤 bot 的實際對話表現。" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, search)} placeholder="搜尋訊息內容、客戶名稱..." style={{ ...S.input, flex: 1 }} onFocus={e => e.target.style.borderColor = '#1976f3'} onBlur={e => e.target.style.borderColor = '#ccd6e3'} />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>共 {data.total} 筆紀錄</div>
      {loading ? <Loading /> : data.messages.map(msg => (
        <div key={msg.id} onClick={() => setExpanded(expanded === msg.id ? null : msg.id)} style={{ ...S.card, cursor: 'pointer', padding: '14px 18px', transition: 'border-color 0.2s, transform 0.2s', borderColor: expanded === msg.id ? '#94c3ff' : '#dbe3ee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={S.tag('green')}>{msg.display_name || '客戶'}</span>
              <span style={{ color: '#7b889b', fontSize: 11, ...S.mono }}>{fmtDate(msg.created_at)}</span>
            </div>
            <span style={{ color: '#7b889b', fontSize: 11, ...S.mono }}>{fmtMs(msg.response_time_ms)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#203047' }}><span style={{ color: '#7b889b' }}>Q: </span>{msg.user_message}</div>
          {expanded === msg.id && (
            <div style={{ background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 10, padding: '14px 16px', marginTop: 10, fontSize: 12, color: '#617084', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              <span style={{ color: '#1976f3', fontSize: 11, ...S.mono }}>AI_RESPONSE</span>
              <div style={{ marginTop: 6, color: '#263246' }}>{msg.ai_response}</div>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
        {data.page > 1 && <button onClick={() => load(data.page - 1)} style={S.btnGhost}>← 上一頁</button>}
        <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{data.page}</span>
        {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={S.btnGhost}>下一頁 →</button>}
      </div>
    </div>
  );
}

/* ========================================= PRODUCT SEARCH ========================================= */
function ProductSearch() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
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
    const data = await apiGet({
      action: 'products',
      q: q || '',
      category: cat || 'all',
      page: String(pg),
      limit: String(PAGE_SIZE),
    });
    setProducts(data.products || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, []);

  useEffect(() => { const timer = setTimeout(() => { setPage(0); doSearch(search, category, 0); }, 300); return () => clearTimeout(timer); }, [search, category, doSearch]);
  const goPage = (pg) => { setPage(pg); doSearch(search, category, pg); };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageLead eyebrow="Catalog" title="產品查價" description="快速搜尋 Snap-on / Blue Point 產品資料，支援分類瀏覽與展開查看更多欄位。" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋料號或關鍵字... (例: FDX71, wrench)" style={{ ...S.input, flex: 1, ...S.mono }} onFocus={e => e.target.style.borderColor = '#1976f3'} onBlur={e => e.target.style.borderColor = '#ccd6e3'} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {Object.entries(CATS).map(([key, label]) => (
          <button key={key} onClick={() => setCategory(key)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, color: category === key ? '#1976f3' : '#66768a', borderColor: category === key ? '#94c3ff' : '#d6deea', background: category === key ? '#edf5ff' : '#fff' }}>{label}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>共 {fmt(total)} 筆產品 {totalPages > 1 && `· P${page + 1}/${totalPages}`}</div>
      {loading ? <Loading /> : products.length === 0 ? <EmptyState text={search ? '找不到符合的產品' : '輸入料號或關鍵字開始搜尋'} /> : (
        <>
          {!isMobile && <div style={{ display: 'flex', padding: '8px 16px', fontSize: 10, color: '#7b889b', ...S.mono, borderBottom: '1px solid #dbe3ee', marginBottom: 4 }}>
            <div style={{ width: 150 }}>ITEM_NO</div><div style={{ flex: 1 }}>DESCRIPTION</div><div style={{ width: 90, textAlign: 'right' }}>分類</div><div style={{ width: 100, textAlign: 'right' }}>牌價</div><div style={{ width: 100, textAlign: 'right' }}>經銷價</div>
          </div>}
          {products.map(p => (
            <div key={p.item_number}>
              <div onClick={() => setExpanded(expanded === p.item_number ? null : p.item_number)} style={{ ...S.card, cursor: 'pointer', padding: '10px 16px', marginBottom: 2, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0, borderColor: expanded === p.item_number ? '#94c3ff' : '#dbe3ee' }}>
                <div style={{ width: isMobile ? '100%' : 150, fontWeight: 700, color: '#1976f3', fontSize: 13, ...S.mono }}>{p.item_number}</div>
                <div style={{ flex: 1, width: isMobile ? '100%' : 'auto', fontSize: 12, color: '#5f6f83', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>{p.description}</div>
                <div style={{ width: isMobile ? '100%' : 90, textAlign: isMobile ? 'left' : 'right' }}>{p.category && p.category !== 'other' && <span style={{ ...S.tag(''), fontSize: 10 }}>{CATS[p.category] || p.category}</span>}</div>
                <div style={{ width: isMobile ? '100%' : 100, textAlign: isMobile ? 'left' : 'right', fontSize: 13, color: '#273346', ...S.mono }}>{isMobile ? `牌價 ${fmtP(p.tw_retail_price)}` : fmtP(p.tw_retail_price)}</div>
                <div style={{ width: isMobile ? '100%' : 100, textAlign: isMobile ? 'left' : 'right', fontSize: 13, color: '#129c59', fontWeight: 700, ...S.mono }}>{isMobile ? `經銷價 ${fmtP(p.tw_reseller_price)}` : fmtP(p.tw_reseller_price)}</div>
              </div>
              {expanded === p.item_number && (
                <div style={{ background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 10, padding: '14px 20px', marginBottom: 8, marginTop: -2, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  <div><div style={S.label}>US PRICE</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.us_price ? `$${Number(p.us_price).toFixed(2)}` : '-'}</div></div>
                  <div><div style={S.label}>牌價</div><div style={{ color: '#273346', fontSize: 13, ...S.mono }}>{fmtP(p.tw_retail_price)}</div></div>
                  <div><div style={S.label}>經銷價</div><div style={{ color: '#129c59', fontSize: 13, fontWeight: 700, ...S.mono }}>{fmtP(p.tw_reseller_price)}</div></div>
                  <div><div style={S.label}>重量</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.weight_kg ? `${p.weight_kg} kg` : '-'}</div></div>
                  <div><div style={S.label}>產地</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.origin_country || '-'}</div></div>
                  <div><div style={S.label}>替代型號</div><div style={{ color: p.replacement_model ? '#1976f3' : '#8a96a8', fontSize: 13, ...S.mono }}>{p.replacement_model || '-'}</div></div>
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
            {page > 0 && <button onClick={() => goPage(page - 1)} style={S.btnGhost}>← 上一頁</button>}
            <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page + 1}/{totalPages}</span>
            {page < totalPages - 1 && <button onClick={() => goPage(page + 1)} style={S.btnGhost}>下一頁 →</button>}
          </div>
        </>
      )}
    </div>
  );
}

/* ========================================= PROMOTIONS ========================================= */
function Promotions() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', note: '', items: '' });
  const load = () => { apiGet({ action: 'promotions' }).then(d => setPromos(d.promotions || [])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const submit = async () => {
    const items = form.items.split('\n').filter(Boolean).map(line => {
      const match = line.match(/^([A-Za-z0-9-]+)\s*[→=:]\s*(?:NT\$?)([\d,]+)(?:\s*[（(](.+)[)）])?/);
      if (!match) return null;
      return { item_number: match[1].toUpperCase(), promo_price: parseInt(match[2].replace(/,/g, '')), promo_note: match[3] || null };
    }).filter(Boolean);
    const res = await apiPost({ action: 'create_promotion', ...form, items });
    if (!res.error) { setShowForm(false); setForm({ name: '', start_date: '', end_date: '', note: '', items: '' }); load(); }
  };
  const toggle = async (id, active) => { await apiPost({ action: 'toggle_promotion', id, is_active: !active }); load(); };
  return (
    <div>
      <PageLead eyebrow="Campaigns" title="活動管理" description="建立與切換促銷活動，集中管理優惠商品與檔期資訊。" action={<button onClick={() => setShowForm(!showForm)} style={S.btnPrimary}>{showForm ? '取消' : '+ 新增活動'}</button>} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>共 {promos.length} 個活動</div>
      </div>
      {showForm && (
        <div style={{ ...S.card, borderColor: '#10b98130', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', marginBottom: 18 }}>NEW_PROMOTION</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
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
        <div key={p.id} style={{ ...S.card, borderColor: p.is_active ? '#bdeccb' : '#dbe3ee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1c2740' }}>{p.name}</span>
              <span style={S.tag(p.is_active ? 'green' : 'red')}>{p.is_active ? 'ACTIVE' : 'CLOSED'}</span>
            </div>
            <button onClick={() => toggle(p.id, p.is_active)} style={{ ...S.btnGhost, color: p.is_active ? '#f87171' : '#4ade80', borderColor: p.is_active ? '#ef444425' : '#22c55e25', fontSize: 12 }}>{p.is_active ? '關閉' : '啟用'}</button>
          </div>
          <div style={{ color: '#6f7d90', fontSize: 12, marginTop: 6, ...S.mono }}>{p.start_date} → {p.end_date}{p.note ? ` · ${p.note}` : ''}</div>
          {p.quickbuy_promotion_items?.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #e6edf5', paddingTop: 10 }}>
              {p.quickbuy_promotion_items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', fontSize: 12 }}>
                  <span style={{ color: '#1976f3', ...S.mono, width: 140 }}>{item.item_number}</span>
                  <span style={{ color: '#129c59', ...S.mono }}>NT${fmt(item.promo_price)}</span>
                  {item.promo_note && <span style={{ color: '#77859a' }}>({item.promo_note})</span>}
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
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => { apiGet({ action: 'pricing' }).then(d => setRules(d.rules)).finally(() => setLoading(false)); }, []);
  const save = async () => { await apiPost({ action: 'update_pricing', rules }); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  if (loading || !rules) return <Loading />;
  return (
    <div style={{ maxWidth: 560, width: '100%' }}>
      <PageLead eyebrow="Pricing" title="報價規則" description="維護後台內部報價參數，快速調整折扣、免運門檻與提示文字。" />
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', marginBottom: 20, ...S.mono }}>PRICING_CONFIG</div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>預設折扣比例</label><div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}><input type="number" step="0.01" min="0" max="1" value={rules.default_discount} onChange={e => setRules({ ...rules, default_discount: parseFloat(e.target.value) })} style={{ ...S.input, width: isMobile ? '100%' : 120, textAlign: 'center', ...S.mono }} /><span style={{ color: '#6f7d90', fontSize: 12 }}>= {Math.round(rules.default_discount * 100)} 折（內部參考）</span></div></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>免運門檻 (NT$)</label><input type="number" step="100" value={rules.free_shipping_threshold} onChange={e => setRules({ ...rules, free_shipping_threshold: parseInt(e.target.value) })} style={{ ...S.input, width: 160, ...S.mono }} /></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>優惠提示文字</label><input value={rules.promo_hint_text || '✨ 私訊享優惠價'} onChange={e => setRules({ ...rules, promo_hint_text: e.target.value })} style={S.input} /></div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
          <label style={{ color: '#617084', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={rules.show_retail_price} onChange={e => setRules({ ...rules, show_retail_price: e.target.checked })} style={{ accentColor: '#1976f3' }} />顯示建議售價</label>
          <label style={{ color: '#617084', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={rules.show_promo_hint} onChange={e => setRules({ ...rules, show_promo_hint: e.target.checked })} style={{ accentColor: '#1976f3' }} />顯示優惠提示</label>
        </div>
        <button onClick={save} style={{ ...S.btnPrimary, background: saved ? '#129c59' : 'linear-gradient(180deg, #2d8cff 0%, #1976f3 100%)', transition: 'background 0.3s', width: '100%', padding: '11px 0', fontSize: 14 }}>{saved ? '✓ SAVED' : '儲存設定'}</button>
      </div>
    </div>
  );
}

/* ========================================= AI PROMPT 設定 ========================================= */
function AIPrompt() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiGet({ action: 'ai_prompt' })
      .then((data) => { setPrompt(data.prompt || ''); })
      .finally(() => setLoading(false));
    Promise.all([
      apiGet({ action: 'chat_history_stats' }),
      apiGet({ action: 'stats' }),
    ]).then(([history, dashboard]) => {
      setStats({
        chatHistory: history.total || 0,
        aiMessages: dashboard.total_messages || 0,
      });
    });
  }, []);

  const save = async () => {
    await apiPost({ action: 'update_ai_prompt', prompt });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <Loading />;
  return (
    <div>
      <PageLead eyebrow="Prompt" title="AI Prompt 設定" description="調整 Bot 的回覆風格與客服 SOP，這裡的內容會直接影響下一次對話生成。" />

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard code="HIST" label="歷史對話" value={fmt(stats.chatHistory)} sub="匯入的 Line 對話" accent="#06c755" />
          <StatCard code="AI" label="AI 回覆" value={fmt(stats.aiMessages)} sub="Bot 自動回覆" accent="#10b981" />
        </div>
      )}

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>AI_SYSTEM_PROMPT</div>
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
        <div style={{ display: 'flex', gap: 10, alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row' }}>
          <button onClick={save} style={{ ...S.btnPrimary, flex: 1, background: saved ? '#22c55e' : '#10b981', transition: 'background 0.3s', padding: '11px 0', fontSize: 14 }}>{saved ? '✓ SAVED' : '儲存 Prompt'}</button>
          <div style={{ fontSize: 11, color: '#6f7d90', ...S.mono }}>{prompt.length} 字</div>
        </div>
      </div>

      <div style={{ ...S.card, borderColor: '#dbe3ee' }}>
        <div style={{ color: '#6f7d90', fontSize: 11, lineHeight: 1.9, ...S.mono }}>
          <span style={{ color: '#4f6178' }}>// 使用說明</span><br/>
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
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState(null);
  const PAGE_SIZE = 30;

  const load = useCallback(async (q = search, pg = 0) => {
    setLoading(true);
    const data = await apiGet({
      action: 'chat_history',
      search: q,
      page: String(pg),
      limit: String(PAGE_SIZE),
    });
    setMessages(data.messages || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    load();
    apiGet({ action: 'chat_history_stats' }).then(setStats);
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const goPage = (pg) => { setPage(pg); load(search, pg); };

  return (
    <div>
      <PageLead eyebrow="LINE Archive" title="歷史對話" description="檢視匯入的 LINE 對話資料，方便回顧真人客服風格與客戶常見需求。" />

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard code="TOTAL" label="總訊息數" value={fmt(stats.total)} sub="all messages" accent="#06c755" />
          <StatCard code="USER" label="客戶訊息" value={fmt(stats.user)} sub="from customers" accent="#06c755" />
          <StatCard code="ACCT" label="官方回覆" value={fmt(stats.account)} sub="from staff" accent="#06c755" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(0); load(search, 0); } }} placeholder="搜尋對話內容、客戶名稱、客服名稱..." style={{ ...S.input, flex: 1 }} onFocus={e => e.target.style.borderColor = '#06c755'} onBlur={e => e.target.style.borderColor = '#ccd6e3'} />
        <button onClick={() => { setPage(0); load(search, 0); }} style={S.btnLine}>搜尋</button>
      </div>

      <div style={{ fontSize: 11, color: '#6f7d90', marginBottom: 12, ...S.mono }}>共 {fmt(total)} 筆 {totalPages > 1 && `· P${page + 1}/${totalPages}`}</div>

      {loading ? <Loading /> : messages.length === 0 ? <EmptyState text="沒有找到對話記錄" /> : messages.map(msg => (
        <div key={msg.id} style={{ ...S.card, padding: '12px 18px', marginBottom: 6, borderLeftColor: msg.sender_type === 'User' ? '#3b82f6' : '#06c755', borderLeftWidth: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 6, flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={S.tag(msg.sender_type === 'User' ? '' : 'line')}>{msg.sender_type === 'User' ? '客戶' : '客服'}</span>
              <span style={{ fontSize: 12, color: '#2b3750' }}>{msg.display_name}</span>
              {msg.sender_name && msg.sender_type === 'Account' && <span style={{ fontSize: 11, color: '#7c899b' }}>({msg.sender_name})</span>}
            </div>
            <span style={{ color: '#7b889b', fontSize: 11, ...S.mono }}>{msg.message_date} {msg.message_time}</span>
          </div>
          <div style={{ fontSize: 13, color: msg.sender_type === 'User' ? '#2b3750' : '#129c59', lineHeight: 1.6 }}>{msg.content}</div>
        </div>
      ))}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
          {page > 0 && <button onClick={() => goPage(page - 1)} style={S.btnGhost}>← 上一頁</button>}
          <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page + 1}/{totalPages}</span>
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
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [token, setToken] = useState('');
  const [isAuthed, setIsAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState('dashboard');
  const ActiveTab = TAB_COMPONENTS[tab] || Dashboard;

  useEffect(() => {
    const saved = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (saved) {
      setToken(saved);
      setAuthLoading(true);
      apiGet({ action: 'stats' })
        .then(() => {
          setIsAuthed(true);
          setAuthError('');
        })
        .catch((error) => {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          setAuthError(error.message || '登入失敗，請重新輸入 Token');
        })
        .finally(() => setAuthLoading(false));
    }
  }, []);

  const login = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setAuthLoading(true);
    setAuthError('');
    window.localStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
    try {
      await apiGet({ action: 'stats' });
      setIsAuthed(true);
    } catch (error) {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
      setAuthError(error.message || '登入失敗，請確認 Token');
      setIsAuthed(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAuthed(false);
    setToken('');
    setAuthError('');
  };

  if (!isAuthed) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f1729 0%, #18253a 52%, #243b5a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: '26px 28px', color: '#fff', boxShadow: '0 28px 60px rgba(4,10,20,0.34)' }}>
          <div style={{ color: '#27d3a2', fontWeight: 700, fontSize: 15, letterSpacing: 1.5, ...S.mono, marginBottom: 10 }}>QB ADMIN</div>
          <div style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>管理後台登入</div>
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, marginBottom: 18, lineHeight: 1.7 }}>請輸入管理後台 Token，進入查價、活動管理與對話監控介面。</div>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            placeholder="ADMIN_TOKEN"
            style={{ ...S.input, background: 'rgba(9,15,26,0.45)', borderColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
          />
          {authError && <div style={{ color: '#f87171', fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>{authError}</div>}
          <button onClick={login} disabled={authLoading} style={{ ...S.btnPrimary, width: '100%', marginTop: 14, opacity: authLoading ? 0.7 : 1, cursor: authLoading ? 'wait' : 'pointer' }}>
            {authLoading ? '驗證中...' : '進入後台'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`
        html,body{background:#f5f7fb!important;margin:0;padding:0}
        *{box-sizing:border-box}
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ ...S.shell, flexDirection: isTablet ? 'column' : 'row' }}>
        <div style={{ ...S.sidebar, width: isTablet ? '100%' : S.sidebar.width, height: isTablet ? 'auto' : S.sidebar.height, position: isTablet ? 'relative' : S.sidebar.position }}>
          <div style={{ padding: '0 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #2da5ff 0%, #1f7cff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, ...S.mono }}>QB</div>
              <div>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Quick Buy</div>
                <div style={{ color: '#8fa2bd', fontSize: 11, ...S.mono }}>Admin Console v2.0</div>
              </div>
            </div>
          </div>
          {SECTIONS.map((section, si) => (
            <div key={section.title}>
              <div style={{ padding: '14px 20px 8px', borderTop: si > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', marginTop: si > 0 ? 8 : 0 }}>
                <div style={{ fontSize: 10, color: section.accent || '#70829c', ...S.mono, letterSpacing: 1.2 }}>{section.title}</div>
              </div>
              <div style={{ display: isTablet ? 'grid' : 'block', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {section.tabs.map(t => (
                <div
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '11px 20px',
                    cursor: 'pointer',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: tab === t.id ? '#ffffff' : '#9eb0c9',
                    background: tab === t.id ? 'linear-gradient(90deg, rgba(45,140,255,0.28) 0%, rgba(45,140,255,0.08) 100%)' : 'transparent',
                    borderLeft: `3px solid ${tab === t.id ? (section.accent || '#2d8cff') : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 10, color: tab === t.id ? '#8fd1ff' : '#61748f', ...S.mono, width: 40 }}>{t.code}</span>
                  {t.label}
                </div>
              ))}
              </div>
            </div>
          ))}

          <div style={{ padding: '18px 20px 0', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 14 }}>
            <div style={{ fontSize: 10, color: '#70829c', ...S.mono, marginBottom: 10 }}>SYSTEM</div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, fontSize: 11, color: '#b7c4d8' }}>
              <div style={{ padding: '4px 0' }}>產品：120,956</div>
              <div style={{ padding: '4px 0' }}>歷史對話：86,261</div>
              <div style={{ padding: '4px 0' }}>Webhook：<span style={{ color: '#62df97' }}>ON</span></div>
              <div style={{ padding: '4px 0' }}>LIFF：<span style={{ color: '#62df97' }}>ON</span></div>
            </div>
          </div>
        </div>

        <div style={S.main}>
          <div style={S.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{ width: 12, height: 12, borderRadius: 999, background: '#2d8cff' }} />
              <div>
                <div style={{ color: '#172337', fontWeight: 700, fontSize: 15 }}>Quick Buy 管理後台</div>
                {!isMobile && <div style={{ color: '#7b889b', fontSize: 11 }}>Sales, inquiry monitoring and knowledge operations</div>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!isMobile && <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>main / {tab}</div>}
              <button onClick={logout} style={{ ...S.btnGhost, padding: '7px 12px', fontSize: 11 }}>登出</button>
            </div>
          </div>

          <div style={{ ...S.content, padding: isMobile ? '18px 14px 30px' : isTablet ? '22px 18px 34px' : S.content.padding }}>
            <ActiveTab />
          </div>
        </div>
      </div>
    </div>
  );
}
