'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmtP, exportCsv, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

// 序, 銷貨單號, 客戶, 業務, 發票號碼, 發票日期, 金額
const INVOICE_DEFAULT_WIDTHS = [50, 150, 160, 100, 150, 110, 120];

function StatCard({ label, value, tone }) {
  const TONE_MAP = {
    red:    { bg: t.color.errorBg,   color: t.color.error   },
    yellow: { bg: t.color.warningBg, color: t.color.warning },
    blue:   { bg: t.color.infoBg,    color: t.color.link    },
    green:  { bg: t.color.successBg, color: t.color.success },
    gray:   { bg: t.color.bgMuted,   color: t.color.textMuted },
  };
  const tc = TONE_MAP[tone] || TONE_MAP.gray;
  return (
    <div style={{ ...S.card, padding: '14px 16px', borderTop: `3px solid ${tc.color}` }}>
      <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 0.8, marginBottom: 8, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: t.fontWeight.bold, color: tc.color, ...S.mono }}>{value}</div>
    </div>
  );
}

export default function Invoices() {
  const { isMobile } = useResponsive();
  const [data, setData]         = useState({ rows: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo,   setDateTo]   = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [page, setPage]         = useState(1);
  const [limit, setLimit]       = useState(30);
  const { gridTemplate, ResizableHeader } = useResizableColumns('invoices_list', INVOICE_DEFAULT_WIDTHS);

  const load = async (q = search, df = dateFrom, dt = dateTo, pg = page, lm = limit) => {
    setLoading(true);
    try {
      const params = { action: 'invoices', search: q, page: String(pg), limit: String(lm) };
      if (df) params.date_from = df;
      if (dt) params.date_to   = dt;
      setData(await apiGet(params));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    setPage(1);
    if (preset === 'all') {
      setDateFrom(''); setDateTo('');
      load(search, '', '', 1, limit);
    } else {
      const range = getPresetDateRange(preset);
      setDateFrom(range.from); setDateTo(range.to);
      load(search, range.from, range.to, 1, limit);
    }
  };

  const doSearch = () => { setPage(1); load(search, dateFrom, dateTo, 1, limit); };

  const handleExport = async () => {
    try {
      const params = { action: 'invoices', limit: '9999', export: 'true', search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const all = await apiGet(params);
      exportCsv(all.rows || [], [
        { key: 'slip_number',   label: '銷貨單號' },
        { key: 'sale_date',     label: '銷貨日期' },
        { key: 'customer_name', label: '客戶'     },
        { key: 'sales_person',  label: '業務'     },
        { key: 'invoice_no',    label: '發票號碼' },
        { key: r => r.invoice_date?.slice(0, 10) || '', label: '發票日期' },
        { key: 'invoice_type',  label: '發票類別' },
        { key: 'total_amount',  label: '金額'     },
      ], `發票清單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  const s = data.summary || {};

  return (
    <div>
      <PageLead
        eyebrow="INVOICES"
        title="發票管理"
        description="依銷貨單列示發票號碼與開立情況。"
        action={<button onClick={handleExport} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnGhost) }}>匯出 CSV</button>}
      />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: isMobile ? 8 : 12, marginBottom: 14 }}>
        <StatCard label="本期銷售總額"  value={fmtP(s.total_amount)}      tone="blue"   />
        <StatCard label="已開發票"      value={s.invoiced_count     || 0}  tone="green"  />
        <StatCard label="未開發票"      value={s.not_invoiced_count || 0}  tone="yellow" />
      </div>

      {/* Filters */}
      <div style={{ ...S.card, marginBottom: 10, padding: isMobile ? '12px 14px' : '10px 16px' }}>
        <div style={{ display: 'flex', gap: isMobile ? 6 : 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)}
              style={{ ...S.btnGhost, padding: isMobile ? '6px 12px' : '6px 14px', fontSize: isMobile ? t.fontSize.caption : t.fontSize.body,
                background: datePreset === key ? t.color.link : t.color.bgCard,
                color: datePreset === key ? '#fff' : t.color.textSecondary,
                borderColor: datePreset === key ? t.color.link : t.color.borderLight }}>
              {label}
            </button>
          ))}
          <input type="date" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }}
            style={{ ...S.input, width: isMobile ? 'calc(50% - 4px)' : 150, fontSize: t.fontSize.body, padding: isMobile ? '8px 10px' : '6px 10px', ...S.mono }} />
          {!isMobile && <span style={{ color: t.color.textMuted, fontSize: t.fontSize.body }}>~</span>}
          <input type="date" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }}
            style={{ ...S.input, width: isMobile ? 'calc(50% - 4px)' : 150, fontSize: t.fontSize.body, padding: isMobile ? '8px 10px' : '6px 10px', ...S.mono }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="搜尋銷貨單號、客戶、發票號..."
            style={{ ...S.input, flex: isMobile ? '1 1 100%' : '1 1 auto', minWidth: isMobile ? 0 : 180, fontSize: t.fontSize.body, padding: isMobile ? '8px 10px' : '6px 10px' }} />
          <button onClick={doSearch}
            style={{ ...S.btnPrimary, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: t.fontSize.body }}>
            查詢
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有銷貨資料" /> : isMobile ? (
        /* ── Mobile cards ── */
        <div>
          {(data.rows || []).map(row => {
            const hasInv = Boolean(row.invoice_no);
            return (
              <div key={row.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{row.slip_number}</div>
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, marginTop: 2 }}>{row.customer_name}</div>
                  </div>
                  <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{fmtP(row.total_amount)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: t.fontSize.caption }}>
                  <div>
                    <span style={{ color: t.color.textMuted }}>業務</span>
                    <div style={{ color: t.color.textPrimary, marginTop: 2 }}>{row.sales_person || '-'}</div>
                  </div>
                  <div>
                    <span style={{ color: t.color.textMuted }}>發票號碼</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ color: hasInv ? t.color.success : t.color.textDisabled, fontWeight: hasInv ? t.fontWeight.semibold : t.fontWeight.normal, ...S.mono }}>
                        {row.invoice_no || '未開立'}
                      </span>
                      {hasInv && row.invoice_type && (
                        <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, background: row.invoice_type === 'B2B' ? '#dbeafe' : '#fef3c7', color: row.invoice_type === 'B2B' ? '#1d4ed8' : '#92400e', border: `1px solid ${row.invoice_type === 'B2B' ? '#bfdbfe' : '#fde68a'}` }}>
                          {row.invoice_type}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: t.color.textMuted }}>銷貨日期</span>
                    <div style={{ ...S.mono, marginTop: 2 }}>{row.sale_date?.slice(0, 10) || '-'}</div>
                  </div>
                  <div>
                    <span style={{ color: t.color.textMuted }}>發票日期</span>
                    <div style={{ ...S.mono, marginTop: 2 }}>{row.invoice_date?.slice(0, 10) || '-'}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Desktop table ── */
        <div style={{ ...S.card, padding: 0, overflow: 'auto', border: `1px solid ${t.color.border}`, marginBottom: 10 }}>
          <ResizableHeader headers={[
            { label: '序',      align: 'center' },
            { label: '銷貨單號', align: 'left'   },
            { label: '客戶',    align: 'left'   },
            { label: '業務',    align: 'left'   },
            { label: '發票號碼', align: 'left'   },
            { label: '發票日期', align: 'center' },
            { label: '金額',    align: 'right'  },
          ]} />
          {(data.rows || []).map((row, idx) => {
            const cell     = { padding: '8px 10px', borderRight: `1px solid ${t.color.borderLight}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' };
            const cCenter  = { ...cell, justifyContent: 'center' };
            const cRight   = { ...cell, justifyContent: 'flex-end', borderRight: 'none' };
            const hasInv   = Boolean(row.invoice_no);
            const rowBg    = idx % 2 === 0 ? t.color.bgCard : t.color.bgMuted;
            return (
              <div key={row.id}
                style={{ display: 'grid', gridTemplateColumns: gridTemplate, borderBottom: `1px solid ${t.color.borderLight}`, background: rowBg, transition: 'background 0.1s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = t.color.infoBg}
                onMouseLeave={(e) => e.currentTarget.style.background = rowBg}>
                {/* 序 */}
                <div style={{ ...cCenter, fontSize: t.fontSize.body, color: t.color.textMuted, ...S.mono }}>{idx + 1}</div>
                {/* 銷貨單號 */}
                <div style={{ ...cell, color: t.color.link, fontWeight: t.fontWeight.bold, ...S.mono, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {row.slip_number}
                </div>
                {/* 客戶 */}
                <div style={{ ...cell, fontWeight: t.fontWeight.semibold, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {row.customer_name}
                </div>
                {/* 業務 */}
                <div style={{ ...cell, color: t.color.textSecondary, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {row.sales_person || '-'}
                </div>
                {/* 發票號碼 */}
                <div style={{ ...cell, gap: 6, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  <span style={{ color: hasInv ? t.color.success : t.color.textDisabled, fontWeight: hasInv ? t.fontWeight.semibold : t.fontWeight.normal, ...S.mono }}>
                    {row.invoice_no || '未開立'}
                  </span>
                  {hasInv && row.invoice_type && (
                    <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, background: row.invoice_type === 'B2B' ? '#dbeafe' : '#fef3c7', color: row.invoice_type === 'B2B' ? '#1d4ed8' : '#92400e', border: `1px solid ${row.invoice_type === 'B2B' ? '#bfdbfe' : '#fde68a'}`, flexShrink: 0 }}>
                      {row.invoice_type}
                    </span>
                  )}
                </div>
                {/* 發票日期 */}
                <div style={{ ...cCenter, ...S.mono, color: row.invoice_date ? t.color.textPrimary : t.color.textDisabled }}>
                  {row.invoice_date?.slice(0, 10) || '-'}
                </div>
                {/* 金額 */}
                <div style={{ ...cRight, fontWeight: t.fontWeight.bold, ...S.mono }}>
                  {fmtP(row.total_amount)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pager
        page={data.page   || 1}
        limit={data.limit || 30}
        total={data.total || 0}
        onPageChange={(p) => { setPage(p); load(search, dateFrom, dateTo, p, limit); }}
        onLimitChange={(l) => { setLimit(l); setPage(1); load(search, dateFrom, dateTo, 1, l); }}
      />
    </div>
  );
}
