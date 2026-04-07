'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

/* ── Progress Bar ── */
function ProgressBar({ value, max, color, label, subLabel }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{label}</span>
        <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>{subLabel || `${pct.toFixed(0)}%`}</span>
      </div>
      <div style={{ height: 6, background: t.color.borderLight, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

export default function FinancialReport() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (df = dateFrom, dt = dateTo) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'financial_report', date_from: df, date_to: dt })); }
    catch (e) { console.error('Financial report error:', e); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, []);

  const d = data || {};
  const collectionRate = d.revenue > 0 ? ((d.received || 0) / d.revenue * 100) : 0;
  const paymentRate = d.purchase > 0 ? ((d.paid || 0) / d.purchase * 100) : 0;

  return (
    <div>
      <PageLead eyebrow="Financial Report" title="財務報表" description="應收帳款、應付帳款與淨現金流概覽。" />
      <div style={{ display: 'flex', gap: isMobile ? 8 : 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...S.input, width: isMobile ? '100%' : 160, ...(isMobile ? S.mobile.input : {}) }} />
        {!isMobile && <span style={{ color: t.color.textMuted }}>~</span>}
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...S.input, width: isMobile ? '100%' : 160, ...(isMobile ? S.mobile.input : {}) }} />
        <button onClick={() => load(dateFrom, dateTo)} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>查詢</button>
        <button onClick={() => { setDateFrom(''); setDateTo(''); load('', ''); }} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: t.color.bg, color: t.color.textMuted, border: `1px solid ${t.color.border}` } : S.btnGhost) }}>全部</button>
      </div>

      {loading ? <Loading /> : (
        <>
          {/* ── Net Cash Flow Hero ── */}
          <div style={{ ...S.card, background: d.net_cash >= 0 ? t.color.infoBg : t.color.errorBg, borderColor: d.net_cash >= 0 ? '#b8d4f5' : '#f5b8b8', marginBottom: 16, textAlign: 'center', padding: isMobile ? 20 : 28 }}>
            <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 1, marginBottom: 8 }}>NET CASH FLOW</div>
            <div style={{ fontSize: isMobile ? 28 : 36, fontWeight: t.fontWeight.bold, color: d.net_cash >= 0 ? t.color.link : t.color.error, ...S.mono }}>{fmtP(d.net_cash)}</div>
            <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 6 }}>已收 {fmtP(d.received)} - 已付 {fmtP(d.paid)}</div>
          </div>

          {/* ── Two Column: Receivable vs Payable ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Receivable side */}
            <div style={{ ...S.card }}>
              <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.brand, letterSpacing: 1, marginBottom: 14 }}>RECEIVABLE</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 4 }}>銷貨收入</div>
                  <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(d.revenue)}</div>
                </div>
                <div>
                  <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 4 }}>已收款</div>
                  <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.brand, ...S.mono }}>{fmtP(d.received)}</div>
                </div>
              </div>
              <ProgressBar value={d.received || 0} max={d.revenue || 1} color={t.color.brand} label="收款率" subLabel={`${collectionRate.toFixed(1)}%`} />
              <div style={{ ...S.card, background: d.receivable > 0 ? t.color.warningBg : t.color.successBg, border: `1px solid ${d.receivable > 0 ? '#fde68a' : '#a7f3d0'}`, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: d.receivable > 0 ? t.color.warning : t.color.brand }}>應收帳款餘額</span>
                  <span style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: d.receivable > 0 ? t.color.warning : t.color.brand, ...S.mono }}>{fmtP(d.receivable)}</span>
                </div>
              </div>
            </div>

            {/* Payable side */}
            <div style={{ ...S.card }}>
              <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.link, letterSpacing: 1, marginBottom: 14 }}>PAYABLE</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 4 }}>進貨支出</div>
                  <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(d.purchase)}</div>
                </div>
                <div>
                  <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 4 }}>已付款</div>
                  <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{fmtP(d.paid)}</div>
                </div>
              </div>
              <ProgressBar value={d.paid || 0} max={d.purchase || 1} color={t.color.link} label="付款率" subLabel={`${paymentRate.toFixed(1)}%`} />
              <div style={{ ...S.card, background: d.payable > 0 ? t.color.errorBg : t.color.successBg, border: `1px solid ${d.payable > 0 ? '#fecaca' : '#a7f3d0'}`, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: d.payable > 0 ? t.color.error : t.color.brand }}>應付帳款餘額</span>
                  <span style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: d.payable > 0 ? t.color.error : t.color.brand, ...S.mono }}>{fmtP(d.payable)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
