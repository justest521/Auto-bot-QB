'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet } from '@/lib/admin/api';
import { useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, ComingSoonBanner } from '../shared/ui';

function StatCard({ code, label, value, tone }) {
  const { isMobile } = useResponsive();
  const TONE_MAP = {
    red: { bg: '#fee2e2', color: '#dc2626' },
    yellow: { bg: '#fef3c7', color: '#d97706' },
    blue: { bg: '#dbeafe', color: '#2563eb' },
    green: { bg: '#dcfce7', color: '#16a34a' },
    gray: { bg: '#f3f4f6', color: '#6b7280' },
  };
  const t = TONE_MAP[tone] || TONE_MAP.gray;
  return (
    <div style={{ ...S.card, padding: isMobile ? '12px' : '16px', textAlign: 'center', borderTop: `3px solid ${t.color}` }}>
      <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: t.color, ...S.mono }}>{value}</div>
      <div style={{ fontSize: isMobile ? 11 : 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function StockAlerts() {
  const { isMobile, isTablet } = useResponsive();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); try { const res = await apiGet({ action: 'stock_alerts' }); setAlerts(res.alerts || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const URGENCY = { critical: { label: '缺貨', color: '#dc2626', bg: '#fef2f2' }, high: { label: '偏低', color: '#f59e0b', bg: '#fffbeb' }, medium: { label: '注意', color: '#3b82f6', bg: '#dcfce7' } };

  return (
    <div>
      <PageLead eyebrow="STOCK ALERTS" title="庫存警示" description="低於安全庫存的商品一覽，參考 Odoo 自動補貨規則。" action={<button onClick={load} style={{ ...S.btnGhost, ...(isMobile ? { minHeight: 44, width: '100%' } : {}) }}>重新整理</button>} />
      <ComingSoonBanner tabId="stock_alerts" />
      <div style={{ ...(isMobile ? S.mobileCardGrid : S.statGrid) }}>
        <StatCard code="CRIT" label="缺貨" value={alerts.filter(a => a.urgency === 'critical').length} tone="red" />
        <StatCard code="LOW" label="偏低" value={alerts.filter(a => a.urgency === 'high').length} tone="yellow" />
        <StatCard code="WARN" label="注意" value={alerts.filter(a => a.urgency === 'medium').length} tone="blue" />
      </div>
      {loading ? <Loading /> : alerts.length === 0 ? <EmptyState text="所有商品庫存正常" /> : (
        <div style={S.tableScroll}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? 12 : 13 }}>
          <thead><tr style={{ background: '#f3f4f6' }}>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>狀態</th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>料號</th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>品名</th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>現有庫存</th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>安全庫存</th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>缺口</th>
          </tr></thead>
          <tbody>{alerts.map((a, i) => {
            const u = URGENCY[a.urgency] || URGENCY.medium;
            return (
              <tr key={i} style={{ borderTop: '1px solid #f0f0f0', background: u.bg }}>
                <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', fontSize: isMobile ? 11 : 13 }}><span style={{ ...S.tag(''), background: u.color, color: '#fff', fontSize: isMobile ? 9 : 10 }}>{u.label}</span></td>
                <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', fontWeight: 600, color: '#3b82f6', ...S.mono, fontSize: isMobile ? 11 : 13 }}>{a.item_number}</td>
                <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', fontSize: isMobile ? 11 : 13 }}>{isMobile ? (a.description || '-').slice(0, 6) : (a.description || '-')}</td>
                <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', fontWeight: 700, color: a.stock_qty <= 0 ? '#dc2626' : '#f59e0b', ...S.mono, fontSize: isMobile ? 11 : 13 }}>{a.stock_qty}</td>
                <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', ...S.mono, fontSize: isMobile ? 11 : 13 }}>{a.safety_stock}</td>
                <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626', ...S.mono, fontSize: isMobile ? 11 : 13 }}>-{a.deficit}</td>
              </tr>
            );
          })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
