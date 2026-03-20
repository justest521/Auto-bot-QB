'use client';
import { useState, useEffect } from 'react';
import { S } from '../shared/styles';
import { fmt, fmtP, fmtMs, useViewportWidth } from '../shared/formatters';
import { apiGet } from '../shared/api';
import { Loading, EmptyState, PageLead, PanelHeader } from '../shared/ui';


export function MiniDonut({ value, color }) {
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

export function TrendChart({ monthly }) {
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

export function TrendLineChart({ daily }) {
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

export function StatCard({ code, label, value, sub, accent, tone = 'blue' }) {
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

export function Dashboard() {
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

/* ========================================= ERP REPORT CENTER ========================================= */

export function RankingPanel({ title, rows, emptyText, valueLabel }) {
  return (
    <div style={S.card}>
      <PanelHeader title={title} meta="鼎新 A1 對照分析" />
      {rows?.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row, index) => (
            <div key={`${title}-${row.name}-${index}`} style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) 130px 120px', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: 999, background: index < 3 ? '#edf5ff' : '#f4f7fb', color: index < 3 ? '#1976f3' : '#7b889b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, ...S.mono }}>
                {index + 1}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>毛利 {fmtP(row.gross_profit)}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>
              <div style={{ textAlign: 'right', fontSize: 11, color: '#7b889b', ...S.mono }}>{valueLabel}</div>
            </div>
          ))}
        </div>
      ) : <EmptyState text={emptyText} />}
    </div>
  );
}


