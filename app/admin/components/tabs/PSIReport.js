'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet } from '@/lib/admin/api';
import { fmtP } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

export default function PSIReport() {
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
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...S.input, width: 160 }} />
        <span style={{ color: '#6b7280' }}>~</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...S.input, width: 160 }} />
        <button onClick={() => load(dateFrom, dateTo)} style={S.btnPrimary}>查詢</button>
        <button onClick={() => { setDateFrom(''); setDateTo(''); load('', ''); }} style={S.btnGhost}>全部</button>
      </div>
      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, fontWeight: 700 }}>銷貨</div><div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{fmtP(d.sales_total)}</div><div style={{ fontSize: 12, color: '#374151', marginTop: 8 }}>成本 {fmtP(d.sales_cost)} | 毛利 {fmtP(d.sales_profit)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, fontWeight: 700 }}>進貨</div><div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{fmtP(d.purchase_total)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, fontWeight: 700 }}>銷貨退回</div><div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{fmtP(d.sales_return_total)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, fontWeight: 700 }}>進貨退出</div><div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{fmtP(d.purchase_return_total)}</div></div>
          <div style={{ ...S.card, gridColumn: '1 / -1', background: '#f0f7ff', borderColor: '#b8d4f5' }}><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, fontWeight: 700 }}>淨銷貨 (銷貨 - 銷退)</div><div style={{ fontSize: 26, fontWeight: 700, color: '#3b82f6' }}>{fmtP((d.sales_total || 0) - (d.sales_return_total || 0))}</div><div style={{ fontSize: 13, color: '#374151', marginTop: 6 }}>淨進貨 (進貨 - 進退) {fmtP((d.purchase_total || 0) - (d.purchase_return_total || 0))}</div></div>
        </div>
      )}
    </div>
  );
}
