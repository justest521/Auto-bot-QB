'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

/* ─── Segment config ─── */
const SEGMENT_CONFIG = {
  'VIP':    { color: '#7c3aed', bg: '#f5f3ff', label: 'VIP' },
  '高價值': { color: '#2563eb', bg: '#eff6ff', label: '高價值' },
  '成長潛力': { color: '#059669', bg: '#ecfdf5', label: '成長潛力' },
  '一般活躍': { color: '#0891b2', bg: '#ecfeff', label: '一般活躍' },
  '流失風險': { color: '#d97706', bg: '#fffbeb', label: '流失風險' },
  '沉睡客戶': { color: '#dc2626', bg: '#fef2f2', label: '沉睡客戶' },
  '低頻客戶': { color: '#9ca3af', bg: '#f9fafb', label: '低頻客戶' },
};

function segmentColor(segment) {
  return SEGMENT_CONFIG[segment]?.color || t.color.textMuted;
}

function segmentBg(segment) {
  return SEGMENT_CONFIG[segment]?.bg || t.color.bgMuted;
}

/* ─── Segment badge ─── */
function SegmentBadge({ segment, size = 'normal' }) {
  const color = segmentColor(segment);
  const isSmall = size === 'small';
  return (
    <span style={{
      display: 'inline-block',
      padding: isSmall ? '1px 7px' : '2px 10px',
      borderRadius: t.radius.pill,
      fontSize: isSmall ? t.fontSize.tiny : t.fontSize.badge,
      fontWeight: t.fontWeight.semibold,
      whiteSpace: 'nowrap',
      background: color + '18',
      color,
      lineHeight: 1.6,
    }}>
      {segment || '-'}
    </span>
  );
}

/* ─── RFM score dots ─── */
function ScoreDots({ score, color, max = 5 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: i < score ? color : t.color.borderLight,
            display: 'inline-block',
          }}
        />
      ))}
      <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginLeft: 3, ...S.mono }}>{score}</span>
    </span>
  );
}

/* ─── Horizontal bar for segment distribution ─── */
function SegmentBar({ segment, count, totalAmount, maxCount }) {
  const cfg = SEGMENT_CONFIG[segment] || { color: '#9ca3af', bg: '#f9fafb' };
  const pct = maxCount > 0 ? Math.max((count / maxCount) * 100, 1) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: cfg.color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary }}>{segment}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, ...S.mono }}>{count} 位</span>
          <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, ...S.mono }}>{fmtP(totalAmount)}</span>
        </div>
      </div>
      <div style={{ height: 8, background: t.color.borderLight, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: cfg.color, borderRadius: 4, transition: 'width 0.5s ease', opacity: 0.85 }} />
      </div>
    </div>
  );
}

/* ─── Desktop customer table ─── */
function CustomerTable({ customers }) {
  if (!customers || customers.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: t.color.textDisabled, fontSize: t.fontSize.body }}>
        此分層無客戶資料
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.fontSize.body }}>
        <thead>
          <tr style={{ background: t.color.bgMuted }}>
            {['客戶名稱', '分層', 'R/F/M 分數', 'RFM總分', '近12月訂單', '近12月消費', '最後購買', '總消費'].map((h, i) => (
              <th key={h} style={{
                ...p.tableHeader,
                padding: '9px 10px',
                textAlign: i >= 2 ? 'right' : 'left',
                borderBottom: `1px solid ${t.color.borderLight}`,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {customers.map((c, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : t.color.bgMuted }}>
              <td style={{ ...p.tableCell, padding: '8px 10px', fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.customer_name}
              </td>
              <td style={{ ...p.tableCell, padding: '8px 10px' }}>
                <SegmentBadge segment={c.segment} />
              </td>
              <td style={{ ...p.tableCell, padding: '8px 10px', textAlign: 'right' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                  <ScoreDots score={c.r_score} color='#2563eb' />
                  <ScoreDots score={c.f_score} color='#059669' />
                  <ScoreDots score={c.m_score} color='#d97706' />
                </div>
              </td>
              <td style={{ ...p.tableCell, padding: '8px 10px', textAlign: 'right' }}>
                <span style={{ ...S.mono, fontWeight: t.fontWeight.bold, fontSize: t.fontSize.h3, color: segmentColor(c.segment) }}>
                  {c.rfm_score ?? '-'}<span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>/15</span>
                </span>
              </td>
              <td style={{ ...p.tableCell, padding: '8px 10px', textAlign: 'right', ...S.mono }}>
                {c.order_count_12m ?? 0}
              </td>
              <td style={{ ...p.tableCell, padding: '8px 10px', textAlign: 'right', ...S.mono, fontWeight: t.fontWeight.semibold }}>
                {fmtP(c.total_amount_12m)}
              </td>
              <td style={{ ...p.tableCell, padding: '8px 10px', textAlign: 'right', ...S.mono }}>
                {c.days_since_last != null ? `${c.days_since_last}天前` : '-'}
              </td>
              <td style={{ ...p.tableCell, padding: '8px 10px', textAlign: 'right', ...S.mono }}>
                {fmtP(c.total_amount_all)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Mobile customer cards ─── */
function CustomerCards({ customers }) {
  if (!customers || customers.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: t.color.textDisabled, fontSize: t.fontSize.body }}>
        此分層無客戶資料
      </div>
    );
  }
  return (
    <div>
      {customers.map((c, i) => (
        <div key={i} style={{ ...S.mobileCard, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.customer_name}
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <SegmentBadge segment={c.segment} size="small" />
                <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>
                  RFM {c.rfm_score ?? '-'}/15
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
              <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{fmtP(c.total_amount_12m)}</div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginTop: 2 }}>近12月消費</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: t.fontSize.tiny, color: '#2563eb', fontWeight: t.fontWeight.bold }}>R</span>
              <ScoreDots score={c.r_score} color='#2563eb' max={5} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: t.fontSize.tiny, color: '#059669', fontWeight: t.fontWeight.bold }}>F</span>
              <ScoreDots score={c.f_score} color='#059669' max={5} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: t.fontSize.tiny, color: '#d97706', fontWeight: t.fontWeight.bold }}>M</span>
              <ScoreDots score={c.m_score} color='#d97706' max={5} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div style={S.mobileCardRow}>
              <span style={S.mobileCardLabel}>訂單數</span>
              <span style={{ ...S.mobileCardValue, ...S.mono }}>{c.order_count_12m ?? 0}</span>
            </div>
            <div style={S.mobileCardRow}>
              <span style={S.mobileCardLabel}>最後購買</span>
              <span style={{ ...S.mobileCardValue, ...S.mono }}>{c.days_since_last != null ? `${c.days_since_last}天前` : '-'}</span>
            </div>
            <div style={{ ...S.mobileCardRow, gridColumn: '1 / -1' }}>
              <span style={S.mobileCardLabel}>總消費</span>
              <span style={{ ...S.mobileCardValue, ...S.mono }}>{fmtP(c.total_amount_all)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── RFM explanation collapsible ─── */
function RFMExplanation() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ ...S.card, marginTop: 16 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>
          RFM 評分說明
        </span>
        <span style={{ fontSize: t.fontSize.body, color: t.color.textMuted }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            {
              letter: 'R',
              color: '#2563eb',
              title: 'Recency（最近購買）',
              desc: '距離最後一次購買的天數。分數越高代表越近期有購買。',
              scores: ['5：7天內', '4：30天內', '3：90天內', '2：180天內', '1：超過180天'],
            },
            {
              letter: 'F',
              color: '#059669',
              title: 'Frequency（購買頻率）',
              desc: '近12個月的訂單次數。分數越高代表購買越頻繁。',
              scores: ['5：10次以上', '4：6-9次', '3：3-5次', '2：2次', '1：1次'],
            },
            {
              letter: 'M',
              color: '#d97706',
              title: 'Monetary（消費金額）',
              desc: '近12個月的累計消費金額。分數越高代表消費越多。',
              scores: ['5：前20%', '4：20-40%', '3：40-60%', '2：60-80%', '1：後20%'],
            },
          ].map(item => (
            <div key={item.letter} style={{ background: item.color + '0d', border: `1px solid ${item.color}22`, borderRadius: t.radius.md, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 28, height: 28, borderRadius: t.radius.sm, background: item.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold }}>
                  {item.letter}
                </span>
                <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: item.color }}>{item.title}</span>
              </div>
              <p style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, lineHeight: 1.5, marginBottom: 8 }}>{item.desc}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {item.scores.map(s => (
                  <div key={s} style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>{s}</div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ background: t.color.bgMuted, border: `1px solid ${t.color.borderLight}`, borderRadius: t.radius.md, padding: '12px 14px', gridColumn: 'span 1' }}>
            <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 8 }}>分層定義 (RFM 總分 3-15)</div>
            {Object.entries(SEGMENT_CONFIG).map(([seg, cfg]) => (
              <div key={seg} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: cfg.color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: t.fontSize.tiny, color: t.color.textSecondary }}>{seg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─── */
export default function CustomerRFM() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [segmentFilter, setSegmentFilter] = useState('全部');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'customer_rfm' });
      setData(res);
    } catch (e) {
      console.error('CustomerRFM load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary || {};
  const segments = data?.segments || [];
  const allCustomers = data?.customers || [];

  const filteredCustomers = segmentFilter === '全部'
    ? allCustomers
    : allCustomers.filter(c => c.segment === segmentFilter);

  const maxSegmentCount = Math.max(...segments.map(s => s.count || 0), 1);

  const segmentKeys = Object.keys(SEGMENT_CONFIG);

  return (
    <div>
      <PageLead
        eyebrow="Customer RFM"
        title="客戶 RFM 分析"
        description="依最近購買(R)、購買頻率(F)、消費金額(M)三維度，將客戶分層管理，精準行銷。"
      />

      {loading ? <Loading /> : (
        <>
          {/* KPI Cards */}
          <div style={{ marginBottom: 20 }}>
            {/* Top row: 4 cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
              gap: isMobile ? 10 : 12,
              marginBottom: 12,
            }}>
              {/* VIP */}
              <div style={{ ...S.card, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#7c3aed' }} />
                <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: '#7c3aed', letterSpacing: 0.8, marginBottom: 6, marginTop: 2 }}>
                  VIP 客戶 ★
                </div>
                <div style={{ fontSize: isMobile ? 20 : 28, fontWeight: t.fontWeight.bold, color: '#7c3aed', ...S.mono }}>
                  {summary.vip_count ?? 0}
                </div>
                <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 4 }}>位 VIP</div>
              </div>

              {/* 高價值 */}
              <div style={{ ...S.card, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#2563eb' }} />
                <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: '#2563eb', letterSpacing: 0.8, marginBottom: 6, marginTop: 2 }}>
                  高價值
                </div>
                <div style={{ fontSize: isMobile ? 20 : 28, fontWeight: t.fontWeight.bold, color: '#2563eb', ...S.mono }}>
                  {summary.high_value_count ?? 0}
                </div>
                <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 4 }}>位客戶</div>
              </div>

              {/* 流失風險 */}
              <div style={{ ...S.card, position: 'relative', overflow: 'hidden', background: t.color.warningBg, borderColor: '#fde68a' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#d97706' }} />
                <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: '#92400e', letterSpacing: 0.8, marginBottom: 6, marginTop: 2 }}>
                  流失風險
                </div>
                <div style={{ fontSize: isMobile ? 20 : 28, fontWeight: t.fontWeight.bold, color: '#b45309', ...S.mono }}>
                  {summary.at_risk_count ?? 0}
                </div>
                <div style={{ fontSize: t.fontSize.caption, color: '#b45309', marginTop: 4 }}>位待挽回</div>
              </div>

              {/* 沉睡客戶 */}
              <div style={{ ...S.card, position: 'relative', overflow: 'hidden', background: t.color.errorBg, borderColor: '#fca5a5' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#dc2626' }} />
                <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: '#991b1b', letterSpacing: 0.8, marginBottom: 6, marginTop: 2 }}>
                  沉睡客戶
                </div>
                <div style={{ fontSize: isMobile ? 20 : 28, fontWeight: t.fontWeight.bold, color: '#dc2626', ...S.mono }}>
                  {summary.dormant_count ?? 0}
                </div>
                <div style={{ fontSize: t.fontSize.caption, color: '#b91c1c', marginTop: 4 }}>位流失中</div>
              </div>
            </div>

            {/* Wide card: 12-month revenue */}
            <div style={{ ...S.card, position: 'relative', overflow: 'hidden', background: t.color.successBg, borderColor: '#a7f3d0' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: t.color.brand }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: '#065f46', letterSpacing: 0.8, marginBottom: 4 }}>
                    近12個月營收
                  </div>
                  <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: t.fontWeight.bold, color: t.color.brand, ...S.mono }}>
                    {fmtP(summary.total_12m_revenue)}
                  </div>
                </div>
                <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                  <div style={{ fontSize: t.fontSize.caption, color: '#065f46' }}>共 <strong>{summary.total_customers ?? 0}</strong> 位客戶</div>
                </div>
              </div>
            </div>
          </div>

          {/* Segment distribution */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 16 }}>
              客戶分層分佈
            </div>
            {segmentKeys.map(seg => {
              const found = segments.find(s => s.segment === seg);
              if (!found && !(data?.customers || []).some(c => c.segment === seg)) return null;
              const count = found?.count ?? 0;
              const total = found?.total_amount ?? 0;
              return (
                <SegmentBar
                  key={seg}
                  segment={seg}
                  count={count}
                  totalAmount={total}
                  maxCount={maxSegmentCount}
                />
              );
            })}
          </div>

          {/* Segment filter */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginRight: 2 }}>篩選分層</span>
            {['全部', ...segmentKeys].map(seg => {
              const isActive = segmentFilter === seg;
              const color = seg === '全部' ? t.color.textSecondary : segmentColor(seg);
              return (
                <button
                  key={seg}
                  onClick={() => setSegmentFilter(seg)}
                  style={{
                    fontSize: t.fontSize.tiny,
                    padding: '4px 12px',
                    borderRadius: t.radius.pill,
                    border: `1px solid ${isActive ? color : t.color.border}`,
                    fontWeight: isActive ? t.fontWeight.bold : t.fontWeight.normal,
                    cursor: 'pointer',
                    background: isActive ? (seg === '全部' ? t.color.bgMuted : color + '18') : '#fff',
                    color: isActive ? (seg === '全部' ? t.color.textPrimary : color) : t.color.textMuted,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {seg}
                  {seg !== '全部' && (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>
                      ({(data?.customers || []).filter(c => c.segment === seg).length})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Customer table / cards */}
          <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.color.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>
                {segmentFilter === '全部' ? '所有客戶' : segmentFilter}
                <span style={{ marginLeft: 8, fontSize: t.fontSize.caption, color: t.color.textMuted, fontWeight: t.fontWeight.normal }}>
                  ({filteredCustomers.length} 位)
                </span>
              </div>
              {segmentFilter !== '全部' && (
                <span style={{ ...p.badge(segmentColor(segmentFilter)), cursor: 'default' }}>
                  {segmentFilter}
                </span>
              )}
            </div>
            <div style={{ padding: isMobile ? '12px 12px' : '4px 0' }}>
              {isMobile
                ? <CustomerCards customers={filteredCustomers} />
                : <CustomerTable customers={filteredCustomers} />
              }
            </div>
          </div>

          {/* RFM explanation */}
          <RFMExplanation />
        </>
      )}
    </div>
  );
}
