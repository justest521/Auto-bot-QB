'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, getPresetDateRange, useResponsive, exportCsv } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, StatCard } from '../shared/ui';

const fmtK = (n) => {
  if (!n) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
};

/* ─── Horizontal Bar Row ─── */
function HBar({ label, sub, value, maxVal, color, rank }) {
  const pct = maxVal > 0 ? Math.max((value / maxVal) * 100, 1) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: rank <= 3 ? '#1d4ed8' : t.color.textPrimary, marginRight: 6 }}>
            {rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : `${rank}.`}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: t.color.textPrimary, ...S.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          {sub && <span style={{ fontSize: 10, color: t.color.textMuted, marginLeft: 6 }}>{sub}</span>}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.color.textPrimary, ...S.mono, marginLeft: 8, flexShrink: 0 }}>{fmt(value)} 件</span>
      </div>
      <div style={{ height: 6, background: t.color.borderLight, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

/* ─── Month Bar Chart ─── */
function MonthChart({ data }) {
  if (!data || !data.length) return <div style={{ fontSize: 12, color: t.color.textMuted, textAlign: 'center', padding: '20px 0' }}>暫無資料</div>;
  const maxQty = Math.max(...data.map(d => d.total_qty || 0), 1);
  const H = 120;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: H + 24, padding: '0 4px' }}>
      {data.map((d, i) => {
        const barH = maxQty > 0 ? ((d.total_qty || 0) / maxQty) * (H - 20) : 0;
        const isLatest = i === data.length - 1;
        return (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: isLatest ? '#2563eb' : t.color.textMuted, marginBottom: 3, ...S.mono }}>{fmt(d.total_qty)}</div>
            <div style={{ width: '80%', height: Math.max(barH, 3), background: isLatest ? '#2563eb' : '#93c5fd', borderRadius: '3px 3px 0 0', transition: 'height 0.5s ease' }}
                 title={`${d.month}: ${d.total_qty}件 / ${d.shipment_count}次出貨`} />
            <div style={{ fontSize: 8, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>{d.month.slice(5)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Date Preset Buttons ─── */
const PRESETS = [
  { label: '近7天',  days: 7 },
  { label: '近30天', days: 30 },
  { label: '近90天', days: 90 },
  { label: '近180天', days: 180 },
  { label: '近1年',  days: 365 },
];

export default function ShipmentAnalysis() {
  const { isMobile } = useResponsive();
  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0,10));
  const [dateTo,   setDateTo]   = useState(() => new Date().toISOString().slice(0,10));
  const [itemFilter, setItemFilter] = useState('');
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState(90);
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'shipment_analysis', date_from: dateFrom, date_to: dateTo, item_number: itemFilter });
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, itemFilter]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (days) => {
    const to = new Date();
    const from = new Date(Date.now() - days*24*60*60*1000);
    setDateFrom(from.toISOString().slice(0,10));
    setDateTo(to.toISOString().slice(0,10));
    setActivePreset(days);
  };

  const doExport = () => {
    if (!data?.recent?.length) return;
    exportCsv(data.recent.map(r => ({
      出貨單號: r.shipment_no, 日期: r.created_at?.slice(0,10), 客戶: r.customer_name, 品號: r.item_number, 出貨數量: r.qty_shipped,
    })), `出貨分析_${dateFrom}_${dateTo}`);
  };

  const summary = data?.summary || {};
  const byItem  = data?.by_item || [];
  const byCust  = data?.by_customer || [];
  const byMonth = data?.by_month || [];
  const recent  = data?.recent || [];
  const maxItem = byItem[0]?.total_qty || 1;
  const maxCust = byCust[0]?.total_qty || 1;

  return (
    <div>
      <PageLead eyebrow="Analytics" title="出貨分析報表" description="按品號、客戶、月份統計出貨量，掌握熱銷商品與主要客戶。" />

      {/* Filter Bar */}
      <div style={{ ...S.card, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {/* Preset buttons */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PRESETS.map(pr => (
            <button key={pr.days} onClick={() => applyPreset(pr.days)}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid', fontWeight: 600, cursor: 'pointer',
                background: activePreset === pr.days ? '#2563eb' : '#f8fafc',
                color: activePreset === pr.days ? '#fff' : t.color.textSecondary,
                borderColor: activePreset === pr.days ? '#2563eb' : t.color.border }}>
              {pr.label}
            </button>
          ))}
        </div>
        {/* Date inputs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset(null); }}
            style={{ fontSize: 12, padding: '4px 8px', border: `1px solid ${t.color.border}`, borderRadius: 6, outline: 'none' }} />
          <span style={{ fontSize: 12, color: t.color.textMuted }}>至</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset(null); }}
            style={{ fontSize: 12, padding: '4px 8px', border: `1px solid ${t.color.border}`, borderRadius: 6, outline: 'none' }} />
        </div>
        {/* Item filter */}
        <input placeholder="篩選品號…" value={itemFilter} onChange={e => setItemFilter(e.target.value)}
          style={{ fontSize: 12, padding: '4px 10px', border: `1px solid ${t.color.border}`, borderRadius: 6, outline: 'none', width: 140 }} />
        {/* Export */}
        <button onClick={doExport} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: `1px solid ${t.color.border}`, background: '#f8fafc', color: t.color.textSecondary, cursor: 'pointer', fontWeight: 600, marginLeft: 'auto' }}>
          ↓ 匯出 CSV
        </button>
      </div>

      {loading ? <Loading /> : (
        <>
          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
            <StatCard code="SHIP" label="出貨次數" value={fmt(summary.total_shipments)} tone="blue" />
            <StatCard code="QTY"  label="出貨件數" value={fmt(summary.total_qty)}      tone="green" />
            <StatCard code="SKU"  label="出貨品號數" value={fmt(summary.unique_items)}  tone="yellow" />
            <StatCard code="CUST" label="涉及客戶數" value={fmt(summary.unique_customers)} tone="red" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* By Item */}
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: t.color.textPrimary, marginBottom: 14 }}>品號出貨排行 TOP {Math.min(byItem.length, 15)}</div>
              {byItem.length === 0 ? <EmptyState title="無資料" desc="此區間無出貨記錄" /> : (
                byItem.slice(0, 15).map((r, i) => (
                  <HBar key={r.item_number} rank={i+1} label={r.item_number} sub={r.description ? r.description.slice(0, 24) : undefined}
                    value={r.total_qty} maxVal={maxItem}
                    color={i === 0 ? '#2563eb' : i < 3 ? '#60a5fa' : '#93c5fd'} />
                ))
              )}
            </div>

            {/* By Customer */}
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: t.color.textPrimary, marginBottom: 14 }}>客戶出貨排行 TOP {Math.min(byCust.length, 10)}</div>
              {byCust.length === 0 ? <EmptyState title="無資料" desc="此區間無出貨記錄" /> : (
                byCust.slice(0, 10).map((r, i) => (
                  <HBar key={r.customer_name} rank={i+1} label={r.customer_name}
                    sub={`${r.shipment_count} 次出貨`}
                    value={r.total_qty} maxVal={maxCust}
                    color={i === 0 ? '#059669' : i < 3 ? '#34d399' : '#6ee7b7'} />
                ))
              )}
            </div>
          </div>

          {/* Monthly trend */}
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.color.textPrimary, marginBottom: 14 }}>月別出貨趨勢</div>
            <MonthChart data={byMonth} />
          </div>

          {/* Detail table toggle */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showDetail ? 14 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: t.color.textPrimary }}>出貨明細 ({fmt(recent.length)} 筆)</div>
              <button onClick={() => setShowDetail(v => !v)}
                style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: `1px solid ${t.color.border}`, background: '#f8fafc', color: t.color.textSecondary, cursor: 'pointer', fontWeight: 600 }}>
                {showDetail ? '收起' : '展開明細'}
              </button>
            </div>
            {showDetail && (
              recent.length === 0 ? <EmptyState title="無出貨明細" desc="此區間無記錄" /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['出貨單號','日期','客戶','品號','出貨數量'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: t.color.textMuted, borderBottom: `1px solid ${t.color.borderLight}`, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${t.color.borderLight}` }}>
                          <td style={{ padding: '7px 10px', ...S.mono, color: '#2563eb', fontWeight: 600 }}>{r.shipment_no}</td>
                          <td style={{ padding: '7px 10px', ...S.mono, color: t.color.textSecondary }}>{r.created_at?.slice(0,10)}</td>
                          <td style={{ padding: '7px 10px', color: t.color.textPrimary, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer_name}</td>
                          <td style={{ padding: '7px 10px', ...S.mono, fontWeight: 600, color: t.color.textPrimary }}>{r.item_number}</td>
                          <td style={{ padding: '7px 10px', ...S.mono, textAlign: 'right', fontWeight: 700, color: '#059669' }}>{r.qty_shipped}</td>
                        </tr>
                      ))}
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
