'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

export default function PSIReport() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (df = dateFrom, dt = dateTo) => { setLoading(true); try { setData(await apiGet({ action: 'psi_report', date_from: df, date_to: dt })); } finally { setLoading(false); } }, [dateFrom, dateTo]);
  useEffect(() => { load(); }, []);

  const d = data || {};
  return (
    <div>
      <PageLead eyebrow="PSI Report" title="進銷存報表" description="銷貨、進貨、退貨金額彙總，掌握進銷存整體狀況。" />
      <div style={{ display: 'flex', gap: isMobile ? 8 : 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...S.input, width: isMobile ? '100%' : 160, ...(isMobile ? S.mobile.input : {}) }} />
        {!isMobile && <span style={{ color: t.color.textMuted }}>~</span>}
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...S.input, width: isMobile ? '100%' : 160, ...(isMobile ? S.mobile.input : {}) }} />
        <button onClick={() => load(dateFrom, dateTo)} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>查詢</button>
        <button onClick={() => { setDateFrom(''); setDateTo(''); load('', ''); }} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: t.color.bg, color: t.color.textMuted, border: `1px solid ${t.color.border}` } : S.btnGhost) }}>全部</button>
      </div>
      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: isMobile ? 12 : 16 }}>
          <div style={{ ...S.card }}><div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 8, fontWeight: t.fontWeight.bold }}>銷貨</div><div style={{ fontSize: isMobile ? 18 : 22, fontWeight: t.fontWeight.bold, color: t.color.brand }}>{fmtP(d.sales_total)}</div><div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, marginTop: 8 }}>成本 {fmtP(d.sales_cost)} | 毛利 {fmtP(d.sales_profit)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 8, fontWeight: t.fontWeight.bold }}>進貨</div><div style={{ fontSize: isMobile ? 18 : 22, fontWeight: t.fontWeight.bold, color: t.color.link }}>{fmtP(d.purchase_total)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 8, fontWeight: t.fontWeight.bold }}>銷貨退回</div><div style={{ fontSize: isMobile ? 18 : 22, fontWeight: t.fontWeight.bold, color: t.color.error }}>{fmtP(d.sales_return_total)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 8, fontWeight: t.fontWeight.bold }}>進貨退出</div><div style={{ fontSize: isMobile ? 18 : 22, fontWeight: t.fontWeight.bold, color: t.color.warning }}>{fmtP(d.purchase_return_total)}</div></div>
          <div style={{ ...S.card, gridColumn: '1 / -1', background: t.color.infoBg, borderColor: '#b8d4f5' }}><div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 8, fontWeight: t.fontWeight.bold }}>淨銷貨 (銷貨 - 銷退)</div><div style={{ fontSize: isMobile ? 22 : 26, fontWeight: t.fontWeight.bold, color: t.color.link }}>{fmtP((d.sales_total || 0) - (d.sales_return_total || 0))}</div><div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, marginTop: 6 }}>淨進貨 (進貨 - 進退) {fmtP((d.purchase_total || 0) - (d.purchase_return_total || 0))}</div></div>
        </div>
      )}
    </div>
  );
}
