'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet } from '@/lib/admin/api';
import { Loading, EmptyState, PageLead, ComingSoonBanner } from '../shared/ui';

function StatCard({ code, label, value, tone }) {
  const TONE_MAP = {
    red: { bg: '#fee2e2', color: '#dc2626' },
    yellow: { bg: '#fef3c7', color: '#d97706' },
    blue: { bg: '#dbeafe', color: '#2563eb' },
    green: { bg: '#dcfce7', color: '#16a34a' },
    gray: { bg: '#f3f4f6', color: '#6b7280' },
  };
  const t = TONE_MAP[tone] || TONE_MAP.gray;
  return (
    <div style={{ ...S.card, padding: '16px', textAlign: 'center', borderTop: `3px solid ${t.color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: t.color, ...S.mono }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function StockAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); try { const res = await apiGet({ action: 'stock_alerts' }); setAlerts(res.alerts || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const URGENCY = { critical: { label: '缺貨', color: '#dc2626', bg: '#fef2f2' }, high: { label: '偏低', color: '#f59e0b', bg: '#fffbeb' }, medium: { label: '注意', color: '#3b82f6', bg: '#dcfce7' } };

  return (
    <div>
      <PageLead eyebrow="STOCK ALERTS" title="庫存警示" description="低於安全庫存的商品一覽，參考 Odoo 自動補貨規則。" action={<button onClick={load} style={S.btnGhost}>重新整理</button>} />
      <ComingSoonBanner tabId="stock_alerts" />
      <div style={S.statGrid}>
        <StatCard code="CRIT" label="缺貨" value={alerts.filter(a => a.urgency === 'critical').length} tone="red" />
        <StatCard code="LOW" label="偏低" value={alerts.filter(a => a.urgency === 'high').length} tone="yellow" />
        <StatCard code="WARN" label="注意" value={alerts.filter(a => a.urgency === 'medium').length} tone="blue" />
      </div>
      {loading ? <Loading /> : alerts.length === 0 ? <EmptyState text="所有商品庫存正常" /> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f3f4f6' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>狀態</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>料號</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>品名</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>現有庫存</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>安全庫存</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>缺口</th>
          </tr></thead>
          <tbody>{alerts.map((a, i) => {
            const u = URGENCY[a.urgency] || URGENCY.medium;
            return (
              <tr key={i} style={{ borderTop: '1px solid #f0f0f0', background: u.bg }}>
                <td style={{ padding: '10px 12px' }}><span style={{ ...S.tag(''), background: u.color, color: '#fff', fontSize: 10 }}>{u.label}</span></td>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#3b82f6', ...S.mono }}>{a.item_number}</td>
                <td style={{ padding: '10px 12px' }}>{a.description || '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: a.stock_qty <= 0 ? '#dc2626' : '#f59e0b', ...S.mono }}>{a.stock_qty}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...S.mono }}>{a.safety_stock}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626', ...S.mono }}>-{a.deficit}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
    </div>
  );
}
