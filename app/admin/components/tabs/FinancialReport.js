'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

export default function FinancialReport() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (df = dateFrom, dt = dateTo) => { setLoading(true); try { setData(await apiGet({ action: 'financial_report', date_from: df, date_to: dt })); } finally { setLoading(false); } }, [dateFrom, dateTo]);
  useEffect(() => { load(); }, []);

  const d = data || {};
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: isMobile ? 12 : 16 }}>
          <div style={{ ...S.card }}><div style={{ fontSize: t.fontSize.tiny, color: t.color.brand, marginBottom: 8, fontWeight: t.fontWeight.bold }}>銷貨收入</div><div style={{ fontSize: isMobile ? 18 : 22, fontWeight: t.fontWeight.bold }}>{fmtP(d.revenue)}</div><div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, marginTop: 8 }}>已收 {fmtP(d.received)}</div></div>
          <div style={{ ...S.card, background: d.receivable > 0 ? t.color.warningBg : t.color.successBg }}><div style={{ fontSize: t.fontSize.tiny, color: t.color.warning, marginBottom: 8, fontWeight: t.fontWeight.bold }}>應收帳款</div><div style={{ fontSize: isMobile ? 18 : 22, fontWeight: t.fontWeight.bold, color: d.receivable > 0 ? t.color.warning : t.color.brand }}>{fmtP(d.receivable)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: t.fontSize.tiny, color: t.color.link, marginBottom: 8, fontWeight: t.fontWeight.bold }}>進貨支出</div><div style={{ fontSize: isMobile ? 18 : 22, fontWeight: t.fontWeight.bold }}>{fmtP(d.purchase)}</div><div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, marginTop: 8 }}>已付 {fmtP(d.paid)}</div></div>
          <div style={{ ...S.card, background: d.payable > 0 ? t.color.errorBg : t.color.successBg }}><div style={{ fontSize: t.fontSize.tiny, color: t.color.error, marginBottom: 8, fontWeight: t.fontWeight.bold }}>應付帳款</div><div style={{ fontSize: isMobile ? 18 : 22, fontWeight: t.fontWeight.bold, color: d.payable > 0 ? t.color.error : t.color.brand }}>{fmtP(d.payable)}</div></div>
          <div style={{ ...S.card, gridColumn: '1 / -1', background: d.net_cash >= 0 ? t.color.infoBg : t.color.errorBg, borderColor: d.net_cash >= 0 ? '#b8d4f5' : '#f5b8b8' }}><div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 8, fontWeight: t.fontWeight.bold }}>淨現金流 (已收 - 已付)</div><div style={{ fontSize: isMobile ? 24 : 28, fontWeight: t.fontWeight.bold, color: d.net_cash >= 0 ? t.color.link : t.color.error }}>{fmtP(d.net_cash)}</div></div>
        </div>
      )}
    </div>
  );
}
