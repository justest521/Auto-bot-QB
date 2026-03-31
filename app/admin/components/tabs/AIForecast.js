'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

const fmtK = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(Math.round(n || 0));
};

/* ── Moving Average Forecast ── */
function forecast(data, key, periods = 3) {
  if (!data || data.length < 3) return [];
  const vals = data.map(d => d[key] || 0);
  const results = [];
  for (let i = 0; i < periods; i++) {
    const window = i === 0 ? vals.slice(-3) : [...vals.slice(-(3 - i)), ...results.slice(0, i).map(r => r.value)];
    const avg = window.reduce((s, v) => s + v, 0) / window.length;
    // Add slight trend factor
    const recent = vals.slice(-2);
    const trendFactor = recent.length === 2 && recent[0] > 0 ? (recent[1] / recent[0]) : 1;
    const adjusted = avg * (1 + (trendFactor - 1) * 0.3);
    const lastMonth = data[data.length - 1].month;
    const [y, m] = lastMonth.split('-').map(Number);
    const nextDate = new Date(y, m + i, 1);
    const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    results.push({ month: nextMonth, value: Math.max(adjusted, 0) });
  }
  return results;
}

/* ── Trend + Forecast Chart ── */
function ForecastChart({ data, forecasted, barKey, label, color, forecastColor, height = 200 }) {
  const { isMobile } = useResponsive();
  const allValues = [...data.map(d => d[barKey] || 0), ...forecasted.map(f => f.value)];
  const max = Math.max(...allValues, 1);
  const chartHeight = isMobile ? 140 : height;

  return (
    <div>
      <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 1, marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: chartHeight, padding: '0 2px' }}>
        {data.map((d, i) => {
          const h = max > 0 ? ((d[barKey] || 0) / max) * (chartHeight - 28) : 0;
          return (
            <div key={`a-${i}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '70%', height: Math.max(h, 2), background: color, borderRadius: '3px 3px 0 0', transition: 'height 0.4s ease', opacity: 0.8 }} title={`${d.month}: ${fmtP(d[barKey])}`} />
              <div style={{ fontSize: 8, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>{d.month?.slice(5) || ''}</div>
            </div>
          );
        })}
        {forecasted.map((f, i) => {
          const h = max > 0 ? (f.value / max) * (chartHeight - 28) : 0;
          return (
            <div key={`f-${i}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '70%', height: Math.max(h, 2),
                background: `repeating-linear-gradient(135deg, ${forecastColor}, ${forecastColor} 3px, transparent 3px, transparent 6px)`,
                borderRadius: '3px 3px 0 0', transition: 'height 0.4s ease', border: `1px dashed ${forecastColor}`, borderBottom: 'none',
              }} title={`${f.month} (預測): ${fmtP(f.value)}`} />
              <div style={{ fontSize: 8, color: forecastColor, fontWeight: 700, marginTop: 4, ...S.mono }}>{f.month?.slice(5) || ''}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
          <span style={{ fontSize: 10, color: t.color.textMuted }}>實際</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, border: `2px dashed ${forecastColor}`, background: 'transparent' }} />
          <span style={{ fontSize: 10, color: t.color.textMuted }}>AI 預測</span>
        </div>
      </div>
    </div>
  );
}

/* ── Insight Card ── */
function InsightCard({ icon, title, value, description, tone }) {
  const colors = {
    green: { bg: t.color.successBg, border: '#a7f3d0', text: t.color.brand },
    blue: { bg: t.color.infoBg, border: '#b8d4f5', text: t.color.link },
    yellow: { bg: t.color.warningBg, border: '#fde68a', text: t.color.warning },
    red: { bg: t.color.errorBg, border: '#fecaca', text: t.color.error },
  };
  const c = colors[tone] || colors.blue;
  return (
    <div style={{ ...S.card, background: c.bg, borderColor: c.border }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: c.text, letterSpacing: 0.8 }}>{title}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: t.fontWeight.bold, color: c.text, ...S.mono, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: t.color.textSecondary, lineHeight: 1.5 }}>{description}</div>
    </div>
  );
}

export default function AIForecast() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet({ action: 'psi_monthly_trend' });
        setData(res);
      } catch (e) { console.error('AI Forecast load error:', e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <><PageLead eyebrow="AI Forecast" title="AI 預測" description="利用歷史趨勢預測未來 3 個月銷貨、進貨與毛利走向。" /><Loading /></>;

  const trend = data?.trend || [];
  const salesFc = forecast(trend, 'sales', 3);
  const purchFc = forecast(trend, 'purchases', 3);
  const profitFc = forecast(trend, 'profit', 3);

  // Insights
  const lastMonth = trend[trend.length - 1] || {};
  const prevMonth = trend[trend.length - 2] || {};
  const salesGrowth = prevMonth.sales > 0 ? ((lastMonth.sales - prevMonth.sales) / prevMonth.sales * 100).toFixed(1) : '0.0';
  const avgMargin = trend.reduce((s, d) => s + (d.sales > 0 ? d.profit / d.sales * 100 : 0), 0) / Math.max(trend.filter(d => d.sales > 0).length, 1);
  const nextMonthSales = salesFc[0]?.value || 0;
  const nextMonthProfit = profitFc[0]?.value || 0;
  const q3Sales = salesFc.reduce((s, f) => s + f.value, 0);

  return (
    <div>
      <PageLead eyebrow="AI Forecast" title="AI 預測" description="利用歷史趨勢預測未來 3 個月銷貨、進貨與毛利走向。" />

      {/* ── Insight Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 12, marginBottom: 20 }}>
        <InsightCard
          icon="📈"
          title="月成長率"
          value={`${salesGrowth}%`}
          description={`上月 vs 前月銷貨變化`}
          tone={Number(salesGrowth) >= 0 ? 'green' : 'red'}
        />
        <InsightCard
          icon="🎯"
          title="平均毛利率"
          value={`${avgMargin.toFixed(1)}%`}
          description="近 12 個月平均"
          tone={avgMargin >= 20 ? 'green' : 'yellow'}
        />
        <InsightCard
          icon="🔮"
          title="下月預測銷貨"
          value={fmtP(nextMonthSales)}
          description={`預測毛利 ${fmtP(nextMonthProfit)}`}
          tone="blue"
        />
        <InsightCard
          icon="📊"
          title="未來 3 月預測"
          value={fmtP(q3Sales)}
          description="預測銷貨加總"
          tone="blue"
        />
      </div>

      {/* ── Forecast Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ ...S.card }}>
          <ForecastChart data={trend} forecasted={salesFc} barKey="sales" label="SALES FORECAST" color={t.color.brand} forecastColor="#22c55e" />
        </div>
        <div style={{ ...S.card }}>
          <ForecastChart data={trend} forecasted={purchFc} barKey="purchases" label="PURCHASE FORECAST" color={t.color.link} forecastColor="#3b82f6" />
        </div>
      </div>

      <div style={{ ...S.card }}>
        <ForecastChart data={trend} forecasted={profitFc} barKey="profit" label="PROFIT FORECAST" color="#f59e0b" forecastColor="#f59e0b" height={160} />
      </div>

      {/* ── Forecast Table ── */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 1, marginBottom: 12 }}>FORECAST DETAIL</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
          {salesFc.map((f, i) => (
            <div key={i} style={{ background: t.color.bgMuted, borderRadius: t.radius.lg, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: t.fontWeight.bold, color: t.color.brand, letterSpacing: 0.8, marginBottom: 8 }}>{f.month}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: t.color.textMuted, marginBottom: 2 }}>銷貨</div>
                  <div style={{ fontSize: 13, fontWeight: t.fontWeight.bold, color: t.color.brand, ...S.mono }}>{fmtK(f.value)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: t.color.textMuted, marginBottom: 2 }}>進貨</div>
                  <div style={{ fontSize: 13, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{fmtK(purchFc[i]?.value)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: t.color.textMuted, marginBottom: 2 }}>毛利</div>
                  <div style={{ fontSize: 13, fontWeight: t.fontWeight.bold, color: '#f59e0b', ...S.mono }}>{fmtK(profitFc[i]?.value)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Method Note ── */}
      <div style={{ fontSize: 10, color: t.color.textDisabled, marginTop: 14, textAlign: 'center', lineHeight: 1.6 }}>
        預測模型：3 期移動平均 + 趨勢調整 · 資料來源：近 12 個月進銷存記錄
      </div>
    </div>
  );
}
