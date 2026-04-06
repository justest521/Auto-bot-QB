'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t } = S;
import { apiGet } from '@/lib/admin/api';
import { fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

/* ── Aging Bucket Config ── */
const BUCKETS = [
  { key: 'current',  label: '未到期',       color: '#059669', bg: '#d1fae5' },
  { key: '1_30',     label: '逾期 1-30天',  color: '#d97706', bg: '#fef3c7' },
  { key: '31_60',    label: '逾期 31-60天', color: '#ea580c', bg: '#ffedd5' },
  { key: '61_90',    label: '逾期 61-90天', color: '#dc2626', bg: '#fee2e2' },
  { key: '91_120',   label: '逾期 91-120天',color: '#9f1239', bg: '#ffe4e6' },
  { key: '120_plus', label: '逾期 120天+',  color: '#450a0a', bg: '#fecaca' },
];

const BUCKET_COLOR = Object.fromEntries(BUCKETS.map(b => [b.key, b.color]));

/* Map summary keys to bucket keys */
const SUMMARY_BUCKET_MAP = {
  current:       'current',
  bucket_1_30:   '1_30',
  bucket_31_60:  '31_60',
  bucket_61_90:  '61_90',
  bucket_91_120: '91_120',
  bucket_120_plus: '120_plus',
};

/* Map bucket key from API invoice/sale bucket field */
function bucketColor(bucket) {
  return BUCKET_COLOR[bucket] || t.color.textMuted;
}

/* ── Stacked Horizontal Bar ── */
function AgingBar({ summary }) {
  const total = summary.total_ar || 1;
  const segments = BUCKETS.map(b => {
    const sumKey = Object.entries(SUMMARY_BUCKET_MAP).find(([, v]) => v === b.key)?.[0];
    const amount = sumKey ? (summary[sumKey] || 0) : 0;
    return { ...b, amount, pct: (amount / total) * 100 };
  }).filter(s => s.amount > 0);

  return (
    <div>
      <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
        {segments.map((s, i) => (
          <div
            key={s.key}
            title={`${s.label}: ${fmtP(s.amount)} (${s.pct.toFixed(1)}%)`}
            style={{ width: `${s.pct}%`, background: s.color, transition: 'width 0.5s ease' }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
        {BUCKETS.map(b => {
          const sumKey = Object.entries(SUMMARY_BUCKET_MAP).find(([, v]) => v === b.key)?.[0];
          const amount = sumKey ? (summary[sumKey] || 0) : 0;
          const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: b.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, color: t.color.textMuted }}>{b.label}</div>
                <div style={{ fontSize: 11, fontWeight: t.fontWeight.bold, color: b.color, ...S.mono }}>
                  {fmtP(amount)} <span style={{ color: t.color.textDisabled, fontWeight: 400 }}>({pct}%)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Bucket Amount Cell ── */
function BucketAmt({ value, bucketKey }) {
  if (!value) return <span style={{ color: t.color.textDisabled, ...S.mono }}>-</span>;
  const color = BUCKET_COLOR[bucketKey] || t.color.textPrimary;
  return <span style={{ color, fontWeight: t.fontWeight.semibold, ...S.mono }}>{fmtP(value)}</span>;
}

export default function ARAgingReport() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sourceTab, setSourceTab] = useState('erp'); // 'erp' | 'qb'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'ar_aging' });
      setData(res);
    } catch (e) {
      console.error('ARAgingReport load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary || {};
  const byCustomer = [...(data?.by_customer || [])].sort((a, b) => (b.total_ar || 0) - (a.total_ar || 0));
  const erpInvoices = data?.erp_invoices || [];
  const qbSales = data?.qb_sales || [];

  const overdueAmt = summary.overdue_amount || 0;
  const totalAr = summary.total_ar || 0;
  const overduePct = totalAr > 0 ? ((overdueAmt / totalAr) * 100).toFixed(1) : '0.0';

  const bucketCols = isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)';

  return (
    <div>
      <PageLead
        eyebrow="AR Aging"
        title="應收帳款老化表"
        description="追蹤未收款項的帳齡分布，辨識長期逾期客戶與收款風險。"
      />

      {/* Refresh button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={load}
          style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: `1px solid ${t.color.border}`, background: '#f8fafc', color: t.color.textSecondary, cursor: 'pointer', fontWeight: t.fontWeight.semibold }}
        >
          ↻ 重新載入
        </button>
      </div>

      {loading ? <Loading /> : (
        <>
          {/* ── Total AR Hero ── */}
          <div style={{ ...S.card, marginBottom: 16, background: t.color.infoBg, borderColor: '#b8d4f5' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: t.fontWeight.bold, color: t.color.link, letterSpacing: 0.8, marginBottom: 6 }}>
                  應收帳款總額
                  <span style={{ marginLeft: 8, fontSize: 9, color: t.color.textMuted, fontWeight: 400 }}>
                    ERP {summary.erp_count || 0} 筆 / QB {summary.qb_count || 0} 筆
                  </span>
                </div>
                <div style={{ fontSize: isMobile ? 28 : 36, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono, lineHeight: 1 }}>
                  {fmtP(totalAr)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontWeight: t.fontWeight.bold, color: '#dc2626', letterSpacing: 0.8, marginBottom: 4 }}>逾期金額</div>
                <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: t.fontWeight.bold, color: '#dc2626', ...S.mono }}>
                  {fmtP(overdueAmt)}
                </div>
                <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>逾期率 {overduePct}%</div>
              </div>
            </div>
            {/* Stacked bar */}
            <AgingBar summary={summary} />
          </div>

          {/* ── Bucket Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: bucketCols, gap: isMobile ? 10 : 12, marginBottom: 16 }}>
            {BUCKETS.map(b => {
              const sumKey = Object.entries(SUMMARY_BUCKET_MAP).find(([, v]) => v === b.key)?.[0];
              const amount = sumKey ? (summary[sumKey] || 0) : 0;
              return (
                <div key={b.key} style={{ ...S.card, position: 'relative', overflow: 'hidden', background: b.bg, borderColor: b.color + '44' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: b.color }} />
                  <div style={{ fontSize: 10, fontWeight: t.fontWeight.bold, color: b.color, letterSpacing: 0.5, marginBottom: 6, marginTop: 2 }}>
                    {b.label}
                  </div>
                  <div style={{ fontSize: isMobile ? 14 : 18, fontWeight: t.fontWeight.bold, color: b.color, ...S.mono }}>
                    {fmtP(amount)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Customer Aging Table ── */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 14 }}>
              客戶帳齡明細 ({byCustomer.length} 位客戶)
            </div>
            {byCustomer.length === 0 ? (
              <div style={{ fontSize: 12, color: t.color.textMuted, textAlign: 'center', padding: '16px 0' }}>暫無資料</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: t.color.bgMuted }}>
                      {['客戶名稱', '應收總額', '未到期', '1-30天', '31-60天', '61-90天', '91-120天', '120天+', '發票數'].map(h => (
                        <th key={h} style={{
                          padding: '8px 10px', textAlign: h === '客戶名稱' ? 'left' : 'right',
                          fontWeight: t.fontWeight.bold, color: t.color.textMuted,
                          borderBottom: `1px solid ${t.color.border}`, whiteSpace: 'nowrap', fontSize: 11,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byCustomer.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${t.color.borderLight}` }}>
                        <td style={{ padding: '8px 10px', fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.customer_name}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>
                          {fmtP(row.total_ar)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <BucketAmt value={row.current} bucketKey="current" />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <BucketAmt value={row['1_30']} bucketKey="1_30" />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <BucketAmt value={row['31_60']} bucketKey="31_60" />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <BucketAmt value={row['61_90']} bucketKey="61_90" />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <BucketAmt value={row['91_120']} bucketKey="91_120" />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <BucketAmt value={row['120_plus']} bucketKey="120_plus" />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: t.color.textSecondary, ...S.mono }}>
                          {row.invoice_count ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Source Tabs: ERP Invoices / QB Sales ── */}
          <div style={{ ...S.card }}>
            {/* Tab Bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${t.color.border}`, paddingBottom: 0 }}>
              {[
                { key: 'erp', label: `ERP 發票 (${erpInvoices.length})` },
                { key: 'qb',  label: `QB 銷貨 (${qbSales.length})` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSourceTab(tab.key)}
                  style={{
                    fontSize: 12, padding: '7px 16px', fontWeight: t.fontWeight.semibold, cursor: 'pointer',
                    border: 'none', borderBottom: sourceTab === tab.key ? `2px solid ${t.color.brand}` : '2px solid transparent',
                    background: 'transparent', color: sourceTab === tab.key ? t.color.brand : t.color.textMuted,
                    marginBottom: -1, outline: 'none',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ERP Invoices Table */}
            {sourceTab === 'erp' && (
              erpInvoices.length === 0 ? (
                <div style={{ fontSize: 12, color: t.color.textMuted, textAlign: 'center', padding: '16px 0' }}>暫無 ERP 發票資料</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: t.color.bgMuted }}>
                        {['發票號碼', '客戶', '發票日', '到期日', '餘額', '帳齡', '收款狀態'].map(h => (
                          <th key={h} style={{
                            padding: '8px 10px', textAlign: h === '餘額' ? 'right' : 'left',
                            fontWeight: t.fontWeight.bold, color: t.color.textMuted,
                            borderBottom: `1px solid ${t.color.border}`, whiteSpace: 'nowrap', fontSize: 11,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {erpInvoices.map((inv, i) => {
                        const bColor = bucketColor(inv.bucket);
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${t.color.borderLight}`, background: i % 2 === 0 ? 'transparent' : t.color.bgMuted }}>
                            <td style={{ padding: '7px 10px', ...S.mono, color: t.color.link, fontWeight: t.fontWeight.semibold }}>
                              {inv.invoice_no}
                            </td>
                            <td style={{ padding: '7px 10px', color: t.color.textPrimary, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {inv.customer_name}
                            </td>
                            <td style={{ padding: '7px 10px', ...S.mono, color: t.color.textSecondary }}>
                              {inv.invoice_date?.slice(0, 10) || '-'}
                            </td>
                            <td style={{ padding: '7px 10px', ...S.mono, color: t.color.textSecondary }}>
                              {inv.due_date?.slice(0, 10) || '-'}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', ...S.mono, fontWeight: t.fontWeight.bold, color: bColor }}>
                              {fmtP(inv.balance)}
                            </td>
                            <td style={{ padding: '7px 10px' }}>
                              {inv.bucket ? (
                                <span style={{
                                  display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                                  background: (BUCKETS.find(b => b.key === inv.bucket)?.bg) || t.color.bgMuted,
                                  color: bColor, fontSize: 10, fontWeight: t.fontWeight.bold,
                                }}>
                                  {BUCKETS.find(b => b.key === inv.bucket)?.label || inv.bucket}
                                </span>
                              ) : '-'}
                            </td>
                            <td style={{ padding: '7px 10px', color: t.color.textSecondary, fontSize: 11 }}>
                              {inv.payment_status || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* QB Sales Table */}
            {sourceTab === 'qb' && (
              qbSales.length === 0 ? (
                <div style={{ fontSize: 12, color: t.color.textMuted, textAlign: 'center', padding: '16px 0' }}>暫無 QB 銷貨資料</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: t.color.bgMuted }}>
                        {['銷貨編號', '客戶', '銷貨日', '金額', '帳齡', '收款狀態'].map(h => (
                          <th key={h} style={{
                            padding: '8px 10px', textAlign: h === '金額' ? 'right' : 'left',
                            fontWeight: t.fontWeight.bold, color: t.color.textMuted,
                            borderBottom: `1px solid ${t.color.border}`, whiteSpace: 'nowrap', fontSize: 11,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {qbSales.map((sale, i) => {
                        const bColor = bucketColor(sale.bucket);
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${t.color.borderLight}`, background: i % 2 === 0 ? 'transparent' : t.color.bgMuted }}>
                            <td style={{ padding: '7px 10px', ...S.mono, color: t.color.link, fontWeight: t.fontWeight.semibold }}>
                              {sale.ref_id}
                            </td>
                            <td style={{ padding: '7px 10px', color: t.color.textPrimary, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {sale.customer_name}
                            </td>
                            <td style={{ padding: '7px 10px', ...S.mono, color: t.color.textSecondary }}>
                              {sale.sale_date?.slice(0, 10) || '-'}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', ...S.mono, fontWeight: t.fontWeight.bold, color: bColor }}>
                              {fmtP(sale.amount)}
                            </td>
                            <td style={{ padding: '7px 10px' }}>
                              {sale.bucket ? (
                                <span style={{
                                  display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                                  background: (BUCKETS.find(b => b.key === sale.bucket)?.bg) || t.color.bgMuted,
                                  color: bColor, fontSize: 10, fontWeight: t.fontWeight.bold,
                                }}>
                                  {BUCKETS.find(b => b.key === sale.bucket)?.label || sale.bucket}
                                </span>
                              ) : '-'}
                            </td>
                            <td style={{ padding: '7px 10px', color: t.color.textSecondary, fontSize: 11 }}>
                              {sale.payment_status || '-'}
                            </td>
                          </tr>
                        );
                      })}
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
