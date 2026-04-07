'use client';
import { useState, useEffect, useRef } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmt, fmtMs, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, StatCard, PanelHeader, MiniDonut, TrendChart, TrendLineChart } from '../shared/ui';

export default function Dashboard() {
  const { isMobile, isTablet } = useResponsive();
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
      color: t.color.link,
    },
    {
      title: '追蹤本週互動節奏',
      desc: `本週已有 ${fmt(stats?.week_messages)} 筆訊息，留意是否出現異常尖峰或回落。`,
      color: t.color.success,
    },
    {
      title: '檢視熱門詢價產品',
      desc: stats?.top_products?.[0]
        ? `目前查詢最多的是 ${stats.top_products[0].item_number}，可優先準備對應銷售話術。`
        : '目前尚未累積足夠熱門產品資料，可待更多互動後再觀察。',
      color: t.color.error,
    },
    {
      title: '確認後台與 webhook 狀態',
      desc: '部署後建議持續抽查 admin 登入與 LINE webhook 是否皆可正常使用。',
      color: t.color.warning,
    },
  ];
  return (
    <div>
      <PageLead
        eyebrow="Dashboard"
        title="營運儀表板"
        description="集中查看 Quick Buy Bot 的查詢量、客戶互動與熱門產品，整體結構參考經典 admin dashboard 的高資訊密度佈局。"
      />
      <div style={{ ...S.statGrid, gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : S.statGrid.gridTemplateColumns, gap: isMobile ? 8 : 10, marginBottom: 10 }}>
        <StatCard code="MSG_TD" label="今日查詢" value={fmt(stats?.today_messages)} sub="New orders" tone="blue" />
        <StatCard code="MSG_WK" label="本週查詢" value={fmt(stats?.week_messages)} sub="7-day volume" tone="green" />
        <StatCard code="USR" label="客戶數" value={fmt(stats?.total_customers)} sub="Unique contacts" tone="yellow" />
        <StatCard code="PERF" label="平均回覆" value={fmtMs(stats?.avg_response_ms)} sub="Response time" tone="red" />
      </div>
      <div style={{ ...S.twoCol, gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : S.twoCol.gridTemplateColumns, gap: isMobile ? 8 : 10 }}>
        <div style={{ ...S.card, marginBottom: 10 }}>
          <PanelHeader title="熱門查詢產品" meta="最近互動中最常被詢問的產品料號" badge={<div style={{ ...S.tag('green') }}>TOP 10</div>} />
          {stats?.top_products?.length > 0 ? stats.top_products.map((p, i) => (
            <div key={p.item_number} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '48px 1fr 100px', alignItems: 'center', padding: isMobile ? '12px 0' : '11px 0', borderTop: i > 0 ? `1px solid ${t.color.borderLight}` : 'none' }}>
              <div style={{ fontSize: t.fontSize.caption, color: i < 3 ? t.color.link : t.color.textMuted, fontWeight: t.fontWeight.bold, ...S.mono }}>#{i + 1}</div>
              <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, ...S.mono }}>{p.item_number}</div>
              <div style={{ fontSize: t.fontSize.h3, color: t.color.success, fontWeight: t.fontWeight.bold, textAlign: 'right', ...S.mono }}>{p.count}次</div>
            </div>
          )) : <EmptyState text="等待客戶使用 Line Bot 後將顯示數據" />}
        </div>
        <div style={{ ...S.card, marginBottom: 10 }}>
          <PanelHeader title="系統概況" meta="目前部署與營運摘要" badge={<div style={{ ...S.tag('line') }}>LIVE</div>} />
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={S.panelMuted}>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6, ...S.mono }}>TOTAL_MESSAGES</div>
              <div style={{ fontSize: isMobile ? t.fontSize.h1 : 28, color: t.color.textPrimary, fontWeight: t.fontWeight.bold, ...S.mono }}>{fmt(stats?.total_messages)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6, ...S.mono }}>WEBHOOK</div>
                <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.success }}>Operational</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6, ...S.mono }}>ADMIN</div>
                <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.link }}>Protected</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ ...S.twoCol, marginTop: 10, gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : S.twoCol.gridTemplateColumns, gap: isMobile ? 8 : 10 }}>
        <div style={{ ...S.card, marginBottom: 10 }}>
          <PanelHeader title="查詢趨勢" meta="模擬營運視圖，呈現近期查詢量與客戶互動波動" badge={<div style={{ ...S.tag('') }}>TREND</div>} />
          <TrendChart monthly={stats?.trend_monthly} />
        </div>
        <div style={{ ...S.card, marginBottom: 10 }}>
          <PanelHeader title="互動概況" meta="以 dashboard 模組方式呈現主要互動指標" badge={<div style={{ ...S.tag('green') }}>LIVE</div>} />
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 8 : 10, textAlign: 'center' }}>
              <div>
                <MiniDonut value={interaction.matched_rate} color={t.color.success} />
                <div style={{ marginTop: 8, fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>MATCHED</div>
              </div>
              <div>
                <MiniDonut value={interaction.repeat_customer_rate} color={t.color.warning} />
                <div style={{ marginTop: 8, fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>REPEAT</div>
              </div>
              <div>
                <MiniDonut value={interaction.fast_reply_rate} color={t.color.error} />
                <div style={{ marginTop: 8, fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>FAST</div>
              </div>
            </div>
            <div style={{ ...S.panelMuted, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${t.color.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>最近摘要</div>
                  <div style={{ marginTop: 4, fontSize: t.fontSize.caption, color: t.color.textMuted }}>快速檢視目前營運狀態</div>
                </div>
                <div style={{ ...S.tag('line') }}>STATUS</div>
              </div>
              <div style={{ padding: '8px 16px' }}>
                {summaryItems.map(([title, desc], idx) => (
                  <div key={title} style={{ padding: '10px 0', borderTop: idx > 0 ? `1px solid ${t.color.borderLight}` : 'none' }}>
                    <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, fontWeight: t.fontWeight.bold }}>{title}</div>
                    <div style={{ marginTop: 4, fontSize: t.fontSize.caption, color: t.color.textMuted, lineHeight: 1.7 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ ...S.twoCol, marginTop: 10, gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : S.twoCol.gridTemplateColumns, gap: isMobile ? 8 : 10 }}>
        <div style={{ ...S.card, marginBottom: 10 }}>
          <PanelHeader title="成長曲線" meta="以高密度圖表模塊補齊參考圖的 dashboard 視覺語言" badge={<div style={{ ...S.tag('') }}>REPORT</div>} />
          <TrendLineChart daily={stats?.trend_daily} />
        </div>
        <div style={{ ...S.card, marginBottom: 10 }}>
          <PanelHeader title="待辦與提醒" meta="用於追蹤上線後的營運維護工作" badge={<div style={{ ...S.tag('red') }}>ACTION</div>} />
          <div style={{ display: 'grid', gap: isMobile ? 8 : 10 }}>
            {actionItems.map(({ title, desc, color }) => (
              <div key={title} style={{ ...S.panelMuted, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: color, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, fontWeight: t.fontWeight.bold }}>{title}</div>
                  <div style={{ marginTop: 4, fontSize: t.fontSize.tiny, color: t.color.textMuted, lineHeight: 1.7 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
