'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmtP, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

const fmtN = (n) => (n == null ? '-' : Number(n).toLocaleString('zh-TW'));

/* ─── Period presets ─── */
const PERIODS = [
  { label: '30天',  days: 30 },
  { label: '60天',  days: 60 },
  { label: '90天',  days: 90 },
  { label: '180天', days: 180 },
  { label: '365天', days: 365 },
];

/* ─── Turnover rate color ─── */
function turnoverColor(rate) {
  if (rate >= 4) return t.color.brand;      // green
  if (rate >= 2) return t.color.link;       // blue
  if (rate >= 1) return t.color.warning;    // yellow
  return t.color.error;                     // red
}

/* ─── Days of inventory color ─── */
function daysColor(days) {
  if (days === null || days === undefined) return t.color.textMuted;
  if (days <= 30) return t.color.brand;
  if (days <= 60) return t.color.warning;
  if (days <= 90) return '#f97316'; // orange
  return t.color.error;
}

/* ─── Safety ratio badge ─── */
function SafetyBadge({ ratio }) {
  if (ratio == null) return <span style={{ color: t.color.textDisabled }}>-</span>;
  if (ratio >= 3) return <span style={{ ...p.badge('#f97316') }}>積壓</span>;
  if (ratio >= 1) return <span style={{ ...p.badge(t.color.brand) }}>正常</span>;
  return <span style={{ ...p.badge(t.color.error) }}>不足</span>;
}

/* ─── Table header cell ─── */
function Th({ children, right }) {
  return (
    <th style={{
      ...p.tableHeader,
      padding: '9px 10px',
      textAlign: right ? 'right' : 'left',
      background: t.color.bgMuted,
      borderBottom: `1px solid ${t.color.borderLight}`,
      position: 'sticky',
      top: 0,
    }}>
      {children}
    </th>
  );
}

/* ─── Table body cell ─── */
function Td({ children, right, style: extra }) {
  return (
    <td style={{
      ...p.tableCell,
      padding: '8px 10px',
      textAlign: right ? 'right' : 'left',
      borderBottom: `1px solid ${t.color.borderLight}`,
      ...extra,
    }}>
      {children}
    </td>
  );
}

/* ─── Desktop table ─── */
function ItemTable({ items }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: t.color.textDisabled, fontSize: t.fontSize.body }}>
        此分類無品號資料
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.fontSize.body }}>
        <thead>
          <tr>
            <Th>品號</Th>
            <Th>品名</Th>
            <Th right>現庫存</Th>
            <Th right>期間出貨</Th>
            <Th right>年化周轉率</Th>
            <Th right>庫存天數</Th>
            <Th right>安全庫存比</Th>
            <Th right>庫存金額</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const rate = Number(item.turnover_rate || 0);
            const daysVal = item.days_of_inventory;
            const daysDisplay = daysVal == null ? '-' : daysVal >= 9999 ? '∞' : `${fmtN(Math.round(daysVal))}天`;
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : t.color.bgMuted }}>
                <Td>
                  <span style={{ ...S.mono, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, fontSize: t.fontSize.caption }}>
                    {item.item_number}
                  </span>
                </Td>
                <Td>
                  <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {item.description || '-'}
                  </span>
                </Td>
                <Td right><span style={{ ...S.mono }}>{fmtN(item.stock_qty)}</span></Td>
                <Td right><span style={{ ...S.mono }}>{fmtN(item.out_qty)}</span></Td>
                <Td right>
                  <span style={{ ...S.mono, fontWeight: t.fontWeight.bold, color: turnoverColor(rate) }}>
                    {rate > 0 ? `${rate.toFixed(1)}x/年` : '-'}
                  </span>
                </Td>
                <Td right>
                  <span style={{ ...S.mono, color: daysColor(daysVal) }}>{daysDisplay}</span>
                </Td>
                <Td right><SafetyBadge ratio={item.safety_ratio} /></Td>
                <Td right>
                  <span style={{ ...S.mono, color: t.color.textPrimary }}>{fmtP(item.stock_value)}</span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Mobile card list ─── */
function ItemCards({ items }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: t.color.textDisabled, fontSize: t.fontSize.body }}>
        此分類無品號資料
      </div>
    );
  }
  return (
    <div>
      {items.map((item, i) => {
        const rate = Number(item.turnover_rate || 0);
        const daysVal = item.days_of_inventory;
        const daysDisplay = daysVal == null ? '-' : daysVal >= 9999 ? '∞' : `${fmtN(Math.round(daysVal))}天`;
        return (
          <div key={i} style={{ ...S.mobileCard, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{item.item_number}</div>
                <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '-'}</div>
              </div>
              <SafetyBadge ratio={item.safety_ratio} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div style={S.mobileCardRow}>
                <span style={S.mobileCardLabel}>現庫存</span>
                <span style={{ ...S.mobileCardValue, ...S.mono }}>{fmtN(item.stock_qty)}</span>
              </div>
              <div style={S.mobileCardRow}>
                <span style={S.mobileCardLabel}>期間出貨</span>
                <span style={{ ...S.mobileCardValue, ...S.mono }}>{fmtN(item.out_qty)}</span>
              </div>
              <div style={S.mobileCardRow}>
                <span style={S.mobileCardLabel}>周轉率</span>
                <span style={{ ...S.mobileCardValue, ...S.mono, color: turnoverColor(rate) }}>
                  {rate > 0 ? `${rate.toFixed(1)}x/年` : '-'}
                </span>
              </div>
              <div style={S.mobileCardRow}>
                <span style={S.mobileCardLabel}>庫存天數</span>
                <span style={{ ...S.mobileCardValue, ...S.mono, color: daysColor(daysVal) }}>{daysDisplay}</span>
              </div>
              <div style={{ ...S.mobileCardRow, gridColumn: '1 / -1' }}>
                <span style={S.mobileCardLabel}>庫存金額</span>
                <span style={{ ...S.mobileCardValue, ...S.mono }}>{fmtP(item.stock_value)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Tab bar ─── */
const TABS = [
  { key: 'high_turnover', label: '高周轉品號' },
  { key: 'slow_moving',   label: '滯銷品' },
  { key: 'over_stock',    label: '庫存積壓' },
  { key: 'all_items',     label: '全部品號' },
];

export default function InventoryTurnover() {
  const { isMobile } = useResponsive();
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('high_turnover');

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'inventory_turnover', days: d });
      setData(res);
    } catch (e) {
      console.error('InventoryTurnover load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, []);

  const handlePeriod = (d) => {
    setDays(d);
    load(d);
  };

  const summary = data?.summary || {};
  const currentItems = data?.[activeTab] || [];

  const doExport = () => {
    const rows = data?.all_items || [];
    if (!rows.length) return;
    exportCsv(rows, [
      { label: '品號',       key: 'item_number' },
      { label: '品名',       key: 'description' },
      { label: '分類',       key: 'category' },
      { label: '現庫存',     key: 'stock_qty' },
      { label: '期間出貨',   key: 'out_qty' },
      { label: '期間進貨',   key: 'in_qty' },
      { label: '年化周轉率', key: 'turnover_rate' },
      { label: '庫存天數',   key: 'days_of_inventory' },
      { label: '安全庫存比', key: 'safety_ratio' },
      { label: '庫存金額',   key: 'stock_value' },
      { label: '成本',       key: 'cost_price' },
      { label: '安全庫存',   key: 'safety_stock' },
    ], `庫存周轉率_${days}天`);
  };

  return (
    <div>
      <PageLead
        eyebrow="Inventory Turnover"
        title="庫存周轉率分析"
        description="分析各品號周轉速率、滯銷品與庫存積壓狀況，找出資金積壓風險。"
      />

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginRight: 4 }}>統計期間</span>
        {PERIODS.map(pr => (
          <button
            key={pr.days}
            onClick={() => handlePeriod(pr.days)}
            style={{
              fontSize: t.fontSize.caption,
              padding: '5px 14px',
              borderRadius: t.radius.md,
              border: '1px solid',
              fontWeight: t.fontWeight.semibold,
              cursor: 'pointer',
              background: days === pr.days ? t.color.brand : t.color.bgCard,
              color: days === pr.days ? '#fff' : t.color.textSecondary,
              borderColor: days === pr.days ? t.color.brand : t.color.border,
              transition: 'all 0.15s',
            }}
          >
            {pr.label}
          </button>
        ))}
        <button
          onClick={doExport}
          style={{
            ...S.btnGhost,
            fontSize: t.fontSize.caption,
            padding: '5px 14px',
            marginLeft: 'auto',
          }}
        >
          ↓ 匯出 CSV
        </button>
      </div>

      {loading ? <Loading /> : (
        <>
          {/* KPI Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: isMobile ? 10 : 12,
            marginBottom: 20,
          }}>
            {/* 活躍品號 */}
            <div style={{ ...S.card, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: t.color.brand }} />
              <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 0.8, marginBottom: 6, marginTop: 2 }}>
                活躍品號
              </div>
              <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: t.fontWeight.bold, color: t.color.brand, ...S.mono }}>
                {fmtN(summary.active_count)}
              </div>
              <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 4 }}>
                共 {fmtN(summary.total_skus)} 個 SKU
              </div>
            </div>

            {/* 庫存總值 */}
            <div style={{ ...S.card, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: t.color.link }} />
              <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 0.8, marginBottom: 6, marginTop: 2 }}>
                庫存總值
              </div>
              <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>
                {fmtP(summary.total_stock_value)}
              </div>
              <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 4 }}>
                統計 {fmtN(summary.days)} 天
              </div>
            </div>

            {/* 滯銷品 */}
            <div style={{ ...S.card, position: 'relative', overflow: 'hidden', background: t.color.warningBg, borderColor: '#fde68a' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: t.color.warning }} />
              <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: '#92400e', letterSpacing: 0.8, marginBottom: 6, marginTop: 2 }}>
                滯銷品
              </div>
              <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: t.fontWeight.bold, color: '#92400e', ...S.mono }}>
                {fmtN(summary.slow_moving_count)}
              </div>
              <div style={{ fontSize: t.fontSize.caption, color: '#b45309', marginTop: 4 }}>
                有庫存但無出貨
              </div>
            </div>

            {/* 庫存積壓 */}
            <div style={{ ...S.card, position: 'relative', overflow: 'hidden', background: '#fff7ed', borderColor: '#fed7aa' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#f97316' }} />
              <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: '#9a3412', letterSpacing: 0.8, marginBottom: 6, marginTop: 2 }}>
                庫存積壓
              </div>
              <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: t.fontWeight.bold, color: '#ea580c', ...S.mono }}>
                {fmtN(summary.over_stock_count)}
              </div>
              <div style={{ fontSize: t.fontSize.caption, color: '#c2410c', marginTop: 4 }}>
                安全庫存比 &gt; 3x
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
            {/* Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: `1px solid ${t.color.border}`,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}>
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: isMobile ? '10px 14px' : '12px 20px',
                    fontSize: isMobile ? t.fontSize.caption : t.fontSize.body,
                    fontWeight: activeTab === tab.key ? t.fontWeight.bold : t.fontWeight.normal,
                    color: activeTab === tab.key ? t.color.brand : t.color.textMuted,
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab.key ? `2px solid ${t.color.brand}` : '2px solid transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                  <span style={{
                    marginLeft: 6,
                    fontSize: t.fontSize.tiny,
                    background: activeTab === tab.key ? t.color.brandLight : t.color.bgMuted,
                    color: activeTab === tab.key ? t.color.brand : t.color.textDisabled,
                    padding: '1px 6px',
                    borderRadius: t.radius.pill,
                    fontWeight: t.fontWeight.bold,
                  }}>
                    {fmtN((data?.[tab.key] || []).length)}
                  </span>
                </button>
              ))}
            </div>

            {/* Table / Card list */}
            <div style={{ padding: isMobile ? '12px 0' : '4px 0' }}>
              {isMobile
                ? <div style={{ padding: '0 12px' }}><ItemCards items={currentItems} /></div>
                : <ItemTable items={currentItems} />
              }
            </div>
          </div>
        </>
      )}
    </div>
  );
}
