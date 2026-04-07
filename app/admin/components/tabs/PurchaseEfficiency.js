'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t } = S;
import { apiGet } from '@/lib/admin/api';
import { fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

/* ── Helpers ── */
const fmtRate = (n) => (n == null ? '-' : `${Number(n).toFixed(1)}%`);
const fmtDays = (n) => (n == null ? '-' : `${Number(n).toFixed(1)} 天`);

function rateColor(rate) {
  if (rate == null) return t.color.textMuted;
  if (rate >= 80) return '#16a34a';
  if (rate >= 60) return '#d97706';
  return '#dc2626';
}

function leadColor(days) {
  if (days == null) return t.color.textMuted;
  if (days <= 7) return '#16a34a';
  if (days <= 14) return '#d97706';
  return '#dc2626';
}

function getPreset(days) {
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/* ── Rate Progress Bar ── */
function RateBar({ value, color }) {
  const pct = value == null ? 0 : Math.min(Math.max(value, 0), 100);
  return (
    <div>
      <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color, ...S.mono }}>
        {fmtRate(value)}
      </div>
      <div style={{ height: 5, background: t.color.borderLight, borderRadius: 3, marginTop: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

/* ── Monthly Bar Chart ── */
function MonthlyChart({ data, height = 160 }) {
  if (!data || !data.length) {
    return <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, textAlign: 'center', padding: '20px 0' }}>暫無資料</div>;
  }
  const slice = data.slice(-12);
  const maxAmt = Math.max(...slice.map(d => d.total_amount || 0), 1);
  const maxCnt = Math.max(...slice.map(d => d.po_count || 0), 1);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: t.color.brand }} />
          <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>採購金額</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: t.color.link }} />
          <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>採購單數</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: height + 20, padding: '0 2px' }}>
        {slice.map((d, i) => {
          const hAmt = ((d.total_amount || 0) / maxAmt) * (height - 20);
          const hCnt = ((d.po_count || 0) / maxCnt) * (height - 20);
          const isLast = i === slice.length - 1;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                <div
                  style={{ width: '44%', height: Math.max(hAmt, 2), background: t.color.brand, borderRadius: '3px 3px 0 0', opacity: isLast ? 1 : 0.7, transition: 'height 0.4s ease' }}
                  title={`${d.month}: ${fmtP(d.total_amount)}`}
                />
                <div
                  style={{ width: '44%', height: Math.max(hCnt, 2), background: t.color.link, borderRadius: '3px 3px 0 0', opacity: isLast ? 1 : 0.65, transition: 'height 0.4s ease' }}
                  title={`${d.month}: ${d.po_count} 筆`}
                />
              </div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>{d.month?.slice(5) || ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── KPI Card ── */
function KpiCard({ label, value, color, isMobile }) {
  return (
    <div style={{ ...S.card, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 0.8, marginBottom: 8, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: isMobile ? t.fontSize.h2 : t.fontSize.h1, fontWeight: t.fontWeight.bold, color, ...S.mono }}>{value}</div>
    </div>
  );
}

const PRESETS = [
  { label: '近90天', days: 90 },
  { label: '近半年', days: 180 },
  { label: '近一年', days: 365 },
];

export default function PurchaseEfficiency() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showPOs, setShowPOs] = useState(false);

  const load = useCallback(async (df = dateFrom, dt = dateTo) => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'purchase_efficiency', date_from: df, date_to: dt });
      setData(res);
    } catch (e) {
      console.error('PurchaseEfficiency load error:', e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, []);

  const applyPreset = (days) => {
    const { from, to } = getPreset(days);
    setDateFrom(from);
    setDateTo(to);
    load(from, to);
  };

  const summary = data?.summary || {};
  const byVendor = data?.by_vendor || [];
  const byMonth = data?.by_month || [];
  const recentPos = data?.recent_pos || [];

  const cols = isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)';

  return (
    <div>
      <PageLead
        eyebrow="Purchase Efficiency"
        title="採購效率分析"
        description="廠商交期、履約率、準時率與採購金額趨勢，找出供應鏈效能瓶頸。"
      />

      {/* ── Date Filter ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Preset buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PRESETS.map(pr => (
            <button
              key={pr.days}
              onClick={() => applyPreset(pr.days)}
              style={{
                fontSize: t.fontSize.tiny, padding: '4px 10px', borderRadius: 6, border: '1px solid',
                fontWeight: t.fontWeight.semibold, cursor: 'pointer',
                background: '#f8fafc', color: t.color.textSecondary, borderColor: t.color.border,
              }}
            >
              {pr.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{ ...S.input, width: isMobile ? '100%' : 160, ...(isMobile ? S.mobile.input : {}) }}
        />
        {!isMobile && <span style={{ color: t.color.textMuted }}>~</span>}
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{ ...S.input, width: isMobile ? '100%' : 160, ...(isMobile ? S.mobile.input : {}) }}
        />
        <button onClick={() => load(dateFrom, dateTo)} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>查詢</button>
        <button
          onClick={() => { setDateFrom(''); setDateTo(''); load('', ''); }}
          style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: t.color.bg, color: t.color.textMuted, border: `1px solid ${t.color.border}` } : S.btnGhost) }}
        >
          重置
        </button>
      </div>

      {loading ? <Loading /> : (
        <>
          {/* ── KPI Summary Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: isMobile ? 10 : 12, marginBottom: 16 }}>
            <KpiCard label="採購單數" value={summary.total_pos ?? '-'} color={t.color.link} isMobile={isMobile} />
            <KpiCard label="採購總金額" value={fmtP(summary.total_amount)} color={t.color.brand} isMobile={isMobile} />
            <KpiCard
              label="履約率"
              value={fmtRate(summary.fulfillment_rate)}
              color={rateColor(summary.fulfillment_rate)}
              isMobile={isMobile}
            />
            <KpiCard
              label="準時率"
              value={summary.on_time_rate == null ? '-' : fmtRate(summary.on_time_rate)}
              color={rateColor(summary.on_time_rate)}
              isMobile={isMobile}
            />
            <KpiCard
              label="平均交期"
              value={fmtDays(summary.avg_lead_days)}
              color={leadColor(summary.avg_lead_days)}
              isMobile={isMobile}
            />
            <KpiCard label="供應商數" value={summary.unique_vendors ?? '-'} color={t.color.textSecondary} isMobile={isMobile} />
          </div>

          {/* ── Vendor Performance Table ── */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 14 }}>
              廠商績效表 ({byVendor.length} 家)
            </div>
            {byVendor.length === 0 ? (
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, textAlign: 'center', padding: '16px 0' }}>暫無資料</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.fontSize.tiny }}>
                  <thead>
                    <tr style={{ background: t.color.bgMuted }}>
                      {['廠商名稱', '採購單數', '採購金額', '履約率', '準時率', '平均交期'].map(h => (
                        <th key={h} style={{
                          padding: '8px 12px', textAlign: 'left', fontWeight: t.fontWeight.bold,
                          color: t.color.textMuted, borderBottom: `1px solid ${t.color.border}`,
                          whiteSpace: 'nowrap', fontSize: t.fontSize.tiny, letterSpacing: 0.5,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byVendor.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${t.color.borderLight}` }}>
                        <td style={{ padding: '10px 12px', fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.vendor_name}
                        </td>
                        <td style={{ padding: '10px 12px', ...S.mono, color: t.color.textSecondary, textAlign: 'right' }}>
                          {row.po_count}
                        </td>
                        <td style={{ padding: '10px 12px', ...S.mono, color: t.color.textPrimary, textAlign: 'right' }}>
                          {fmtP(row.total_amount)}
                        </td>
                        <td style={{ padding: '10px 12px', minWidth: 110 }}>
                          <RateBar value={row.fulfillment_rate} color={rateColor(row.fulfillment_rate)} />
                        </td>
                        <td style={{ padding: '10px 12px', minWidth: 110 }}>
                          {row.on_time_eligible ? (
                            <RateBar value={row.on_time_rate} color={rateColor(row.on_time_rate)} />
                          ) : (
                            <span style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', ...S.mono, color: leadColor(row.avg_lead_days), fontWeight: t.fontWeight.semibold }}>
                          {fmtDays(row.avg_lead_days)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Monthly Trend ── */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 14 }}>
              月別採購趨勢
            </div>
            <MonthlyChart data={byMonth} height={isMobile ? 120 : 160} />
          </div>

          {/* ── Recent POs (Collapsible) ── */}
          <div style={{ ...S.card }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPOs ? 14 : 0 }}>
              <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>
                近期採購單 ({recentPos.length} 筆)
              </div>
              <button
                onClick={() => setShowPOs(v => !v)}
                style={{ fontSize: t.fontSize.tiny, padding: '4px 12px', borderRadius: 6, border: `1px solid ${t.color.border}`, background: '#f8fafc', color: t.color.textSecondary, cursor: 'pointer', fontWeight: t.fontWeight.semibold }}
              >
                {showPOs ? '收起' : '展開明細'}
              </button>
            </div>
            {showPOs && (
              recentPos.length === 0 ? (
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, textAlign: 'center', padding: '16px 0' }}>暫無資料</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.fontSize.tiny }}>
                    <thead>
                      <tr style={{ background: t.color.bgMuted }}>
                        {['採購單號', '廠商', '下單日', '預計到貨', '實際到貨', '交期(天)', '準時', '金額'].map(h => (
                          <th key={h} style={{
                            padding: '8px 10px', textAlign: 'left', fontWeight: t.fontWeight.bold,
                            color: t.color.textMuted, borderBottom: `1px solid ${t.color.border}`,
                            whiteSpace: 'nowrap', fontSize: t.fontSize.tiny,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentPos.map((po, i) => {
                        const onTimeDisplay = po.on_time == null ? '-' : po.on_time ? '✓' : '✗';
                        const onTimeColor = po.on_time == null ? t.color.textDisabled : po.on_time ? '#16a34a' : '#dc2626';
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${t.color.borderLight}` }}>
                            <td style={{ padding: '7px 10px', ...S.mono, color: t.color.link, fontWeight: t.fontWeight.semibold }}>
                              {po.po_no}
                            </td>
                            <td style={{ padding: '7px 10px', color: t.color.textPrimary, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {po.vendor_name}
                            </td>
                            <td style={{ padding: '7px 10px', ...S.mono, color: t.color.textSecondary }}>
                              {po.po_date?.slice(0, 10) || '-'}
                            </td>
                            <td style={{ padding: '7px 10px', ...S.mono, color: t.color.textSecondary }}>
                              {po.expected_date?.slice(0, 10) || '-'}
                            </td>
                            <td style={{ padding: '7px 10px', ...S.mono, color: t.color.textSecondary }}>
                              {po.stock_in_date?.slice(0, 10) || '-'}
                            </td>
                            <td style={{ padding: '7px 10px', ...S.mono, fontWeight: t.fontWeight.bold, color: leadColor(po.lead_days), textAlign: 'right' }}>
                              {po.lead_days == null ? '-' : po.lead_days}
                            </td>
                            <td style={{ padding: '7px 10px', fontWeight: t.fontWeight.bold, color: onTimeColor, textAlign: 'center', fontSize: t.fontSize.body }}>
                              {onTimeDisplay}
                            </td>
                            <td style={{ padding: '7px 10px', ...S.mono, textAlign: 'right', color: t.color.textPrimary }}>
                              {fmtP(po.total_amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
