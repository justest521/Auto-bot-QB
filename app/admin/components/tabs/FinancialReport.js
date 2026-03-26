'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet } from '@/lib/admin/api';
import { fmtP } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

export default function FinancialReport() {
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
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...S.input, width: 160 }} />
        <span style={{ color: '#6b7280' }}>~</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...S.input, width: 160 }} />
        <button onClick={() => load(dateFrom, dateTo)} style={S.btnPrimary}>查詢</button>
        <button onClick={() => { setDateFrom(''); setDateTo(''); load('', ''); }} style={S.btnGhost}>全部</button>
      </div>
      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#16a34a', marginBottom: 8, fontWeight: 700 }}>銷貨收入</div><div style={{ fontSize: 22, fontWeight: 700 }}>{fmtP(d.revenue)}</div><div style={{ fontSize: 12, color: '#374151', marginTop: 8 }}>已收 {fmtP(d.received)}</div></div>
          <div style={{ ...S.card, background: d.receivable > 0 ? '#fff8eb' : '#f0fdf4' }}><div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8, fontWeight: 700 }}>應收帳款</div><div style={{ fontSize: 22, fontWeight: 700, color: d.receivable > 0 ? '#f59e0b' : '#16a34a' }}>{fmtP(d.receivable)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#3b82f6', marginBottom: 8, fontWeight: 700 }}>進貨支出</div><div style={{ fontSize: 22, fontWeight: 700 }}>{fmtP(d.purchase)}</div><div style={{ fontSize: 12, color: '#374151', marginTop: 8 }}>已付 {fmtP(d.paid)}</div></div>
          <div style={{ ...S.card, background: d.payable > 0 ? '#fff0f0' : '#f0fdf4' }}><div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, fontWeight: 700 }}>應付帳款</div><div style={{ fontSize: 22, fontWeight: 700, color: d.payable > 0 ? '#ef4444' : '#16a34a' }}>{fmtP(d.payable)}</div></div>
          <div style={{ ...S.card, gridColumn: '1 / -1', background: d.net_cash >= 0 ? '#f0f7ff' : '#fff0f0', borderColor: d.net_cash >= 0 ? '#b8d4f5' : '#f5b8b8' }}><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, fontWeight: 700 }}>淨現金流 (已收 - 已付)</div><div style={{ fontSize: 28, fontWeight: 700, color: d.net_cash >= 0 ? '#3b82f6' : '#ef4444' }}>{fmtP(d.net_cash)}</div></div>
        </div>
      )}
    </div>
  );
}
