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
  return String(n || 0);
};

/* ── Simple Bar Chart Component ── */
function BarChart({ data, barKey, label, color, secondKey, secondColor, height = 180 }) {
  const max = Math.max(...data.map(d => Math.max(d[barKey] || 0, d[secondKey] || 0)), 1);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 1 }}>{label}</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>{barKey === 'sales' ? '銷貨' : barKey}</span>
          </div>
          {secondKey && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: secondColor || '#94a3b8' }} />
              <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>{secondKey === 'purchases' ? '進貨' : secondKey === 'profit' ? '毛利' : secondKey}</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, padding: '0 2px' }}>
        {data.map((d, i) => {
          const h1 = max > 0 ? ((d[barKey] || 0) / max) * (height - 24) : 0;
          const h2 = secondKey && max > 0 ? ((d[secondKey] || 0) / max) * (height - 24) : 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                <div style={{ width: secondKey ? '45%' : '70%', height: Math.max(h1, 2), background: color, borderRadius: '3px 3px 0 0', transition: 'height 0.4s ease', opacity: i === data.length - 1 ? 1 : 0.75 }} title={`${d.month}: ${fmtP(d[barKey])}`} />
                {secondKey && <div style={{ width: '45%', height: Math.max(h2, 2), background: secondColor || '#94a3b8', borderRadius: '3px 3px 0 0', transition: 'height 0.4s ease', opacity: i === data.length - 1 ? 1 : 0.65 }} title={`${d.month}: ${fmtP(d[secondKey])}`} />}
              </div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>{d.month?.slice(5) || ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Top Products Ranking ── */
function TopProducts({ items }) {
  if (!items || items.length === 0) return null;
  const max = items[0]?.amount || 1;
  return (
    <div>
      <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 1, marginBottom: 12 }}>TOP PRODUCTS (12MO)</div>
      {items.slice(0, 8).map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < items.length - 1 ? `1px solid ${t.color.borderLight}` : 'none' }}>
          <span style={{ width: 20, height: 20, borderRadius: 6, background: i < 3 ? t.color.brand : t.color.bgMuted, color: i < 3 ? '#fff' : t.color.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, flexShrink: 0 }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.desc || item.item}</div>
            <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono, marginTop: 1 }}>{item.item}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{fmtK(item.amount)}</div>
            <div style={{ fontSize: t.fontSize.tiny, color: item.profit > 0 ? t.color.brand : t.color.error, ...S.mono }}>{fmtK(item.profit)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PSIReport() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (df = dateFrom, dt = dateTo) => {
    setLoading(true);
    try {
      const [psiRes, trendRes] = await Promise.all([
        apiGet({ action: 'psi_report', date_from: df, date_to: dt }),
        apiGet({ action: 'psi_monthly_trend' }),
      ]);
      setData(psiRes);
      setTrend(trendRes);
    } catch (e) { console.error('PSI load error:', e); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, []);

  const d = data || {};
  const netSales = (d.sales_total || 0) - (d.sales_return_total || 0);
  const netPurch = (d.purchase_total || 0) - (d.purchase_return_total || 0);
  const marginPct = d.sales_total > 0 ? ((d.sales_profit / d.sales_total) * 100).toFixed(1) : '0.0';

  return (
    <div>
      <PageLead eyebrow="PSI Report" title="進銷存報表" description="銷貨、進貨、退貨金額彙總，掌握進銷存整體狀況。" />
      {/* Date filter */}
      <div style={{ display: 'flex', gap: isMobile ? 8 : 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...S.input, width: isMobile ? '100%' : 160, ...(isMobile ? S.mobile.input : {}) }} />
        {!isMobile && <span style={{ color: t.color.textMuted }}>~</span>}
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...S.input, width: isMobile ? '100%' : 160, ...(isMobile ? S.mobile.input : {}) }} />
        <button onClick={() => load(dateFrom, dateTo)} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>查詢</button>
        <button onClick={() => { setDateFrom(''); setDateTo(''); load('', ''); }} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: t.color.bg, color: t.color.textMuted, border: `1px solid ${t.color.border}` } : S.btnGhost) }}>全部</button>
      </div>

      {loading ? <Loading /> : (
        <>
          {/* ── KPI Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 12, marginBottom: 16 }}>
            {[
              { label: '銷貨', value: d.sales_total, sub: `成本 ${fmtP(d.sales_cost)}`, color: t.color.brand },
              { label: '進貨', value: d.purchase_total, color: t.color.link },
              { label: '銷退', value: d.sales_return_total, color: t.color.error },
              { label: '進退', value: d.purchase_return_total, color: t.color.warning },
            ].map((c, i) => (
              <div key={i} style={{ ...S.card, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.color }} />
                <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 0.8, marginBottom: 8, marginTop: 2 }}>{c.label}</div>
                <div style={{ fontSize: isMobile ? t.fontSize.h2 : t.fontSize.h1, fontWeight: t.fontWeight.bold, color: c.color, ...S.mono }}>{fmtP(c.value)}</div>
                {c.sub && <div style={{ fontSize: t.fontSize.tiny, color: t.color.textSecondary, marginTop: 6 }}>{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* ── Net Summary Strip ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ ...S.card, background: t.color.infoBg, borderColor: '#b8d4f5' }}>
              <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.link, letterSpacing: 0.8, marginBottom: 6 }}>淨銷貨</div>
              <div style={{ fontSize: isMobile ? t.fontSize.h1 : 24, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{fmtP(netSales)}</div>
            </div>
            <div style={{ ...S.card, background: t.color.successBg, borderColor: '#b8e4d5' }}>
              <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.brand, letterSpacing: 0.8, marginBottom: 6 }}>毛利</div>
              <div style={{ fontSize: isMobile ? t.fontSize.h1 : 24, fontWeight: t.fontWeight.bold, color: t.color.brand, ...S.mono }}>{fmtP(d.sales_profit)}</div>
            </div>
            <div style={{ ...S.card }}>
              <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 0.8, marginBottom: 6 }}>毛利率</div>
              <div style={{ fontSize: isMobile ? t.fontSize.h1 : 24, fontWeight: t.fontWeight.bold, color: Number(marginPct) >= 20 ? t.color.brand : t.color.warning, ...S.mono }}>{marginPct}%</div>
            </div>
          </div>

          {/* ── Charts Row ── */}
          {trend && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 16 }}>
              {/* Monthly Trend */}
              <div style={{ ...S.card }}>
                <BarChart data={trend.trend || []} barKey="sales" secondKey="purchases" label="MONTHLY TREND" color={t.color.brand} secondColor={t.color.link} height={isMobile ? 140 : 180} />
              </div>
              {/* Top Products */}
              <div style={{ ...S.card }}>
                <TopProducts items={trend.top_products || []} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
