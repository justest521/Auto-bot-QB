'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmt, fmtP, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard, CsvImportButton, SaleDetailDrawer, ComingSoonBanner } from '../shared/ui';

export default function ProfitAnalysis() {
  const { isMobile, isTablet } = useResponsive();
  const initialRange = getPresetDateRange('today');
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { amount: 0, cost: 0, gross_profit: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [rangePreset, setRangePreset] = useState('today');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, from = dateFrom, to = dateTo, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({
        action: 'profit_analysis',
        page: String(page),
        limit: String(limit),
        search: q,
        date_from: from,
        date_to: to,
      });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, pageSize]);

  useEffect(() => { load(); }, []);
  const applyPreset = (preset) => {
    if (preset === 'custom') {
      setRangePreset('custom');
      return;
    }
    const range = getPresetDateRange(preset);
    setRangePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    load(1, search, range.from, range.to, pageSize);
  };

  const marginPct = data.summary?.amount ? `${((data.summary.gross_profit / data.summary.amount) * 100).toFixed(1)}%` : '-';

  return (
    <div>
      <PageLead
        eyebrow="Profit"
        title="利潤分析"
        description="查看銷貨利潤彙總、成本與毛利，方便先做營運分析與排行基礎。"
        action={<CsvImportButton datasetId="erp_profit_analysis" onImported={() => load(1, search, dateFrom, dateTo, pageSize)} compact />}
      />
      <ComingSoonBanner tabId="profit_analysis" />
      <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: isMobile ? 8 : 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, dateFrom, dateTo, pageSize)} placeholder="搜尋客戶、單號或業務..." style={{ ...S.input, flex: 1, ...(isMobile ? S.mobile.input : {}) }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>搜尋</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['today', '今日'],
            ['week', '週'],
            ['month', '月'],
            ['quarter', '季'],
            ['year', '年'],
            ['custom', '自選'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => applyPreset(value)}
              style={{
                ...S.btnGhost,
                padding: isMobile ? '8px 12px' : '6px 12px',
                fontSize: isMobile ? t.fontSize.body : t.fontSize.caption,
                background: rangePreset === value ? t.color.infoBg : t.color.bgCard,
                borderColor: rangePreset === value ? '#93c5fd' : t.color.border,
                color: rangePreset === value ? t.color.link : '#5b6779',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: isMobile ? 8 : 10, flexDirection: isMobile ? 'column' : 'row', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <input type="date" value={dateFrom} onChange={(e) => { setRangePreset('custom'); setDateFrom(e.target.value); }} style={{ ...S.input, flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto', maxWidth: isMobile ? '100%' : 180, ...(isMobile ? S.mobile.input : {}) }} />
          <input type="date" value={dateTo} onChange={(e) => { setRangePreset('custom'); setDateTo(e.target.value); }} style={{ ...S.input, flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto', maxWidth: isMobile ? '100%' : 180, ...(isMobile ? S.mobile.input : {}) }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, flex: '1 1 calc(50% - 4px)' } : S.btnGhost) }}>套用區間</button>
          <button onClick={() => applyPreset('today')} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, flex: '1 1 calc(50% - 4px)' } : S.btnGhost) }}>回到今日</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: t.color.warningBg, borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_profit_analysis` 資料表，請先跑 [`docs/erp-auxiliary-tables.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-auxiliary-tables.sql) 再匯入利潤分析 CSV。</div>}
      <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 12, ...S.mono }}>
        共 {fmt(data.total)} 筆分析資料{dateFrom || dateTo ? ` · ${dateFrom || '...'} → ${dateTo || '...'}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, minmax(0, 1fr))', gap: isMobile ? 8 : 12, marginBottom: 18 }}>
        <StatCard code="SALES" label="銷貨金額" value={fmtP(data.summary?.amount)} tone="blue" />
        <StatCard code="COST" label="成本" value={fmtP(data.summary?.cost)} tone="yellow" />
        <StatCard code="GP" label="毛利" value={fmtP(data.summary?.gross_profit)} tone="green" />
        <StatCard code="GM" label="毛利率" value={marginPct} tone="red" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有利潤分析資料" /> : isMobile ? data.rows.map((row) => (
        <div key={row.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, fontWeight: t.fontWeight.bold }}>{row.customer_name || '未命名客戶'}</div>
              <div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, marginTop: 4, lineHeight: 1.7 }}>
                <div>
                  <span style={{ color: t.color.textMuted, ...S.mono }}>DOC</span>{' '}
                  {row.doc_no ? (
                    <button
                      onClick={() => setSelectedSlipNumber(row.doc_no)}
                      style={{ background: 'none', border: 0, padding: 0, color: t.color.link, fontWeight: t.fontWeight.bold, cursor: 'pointer', ...S.mono }}
                    >
                      {row.doc_no}
                    </button>
                  ) : '-'}
                </div>
                <div><span style={{ color: t.color.textMuted, ...S.mono }}>DATE</span> {row.doc_date || '-'}</div>
                <div><span style={{ color: t.color.textMuted, ...S.mono }}>SALES</span> {row.sales_name || '-'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6, ...S.mono }}>AMOUNT</div>
                <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, ...S.mono }}>{fmtP(row.amount)}</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6, ...S.mono }}>COST</div>
                <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, ...S.mono }}>{fmtP(row.cost)}</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6, ...S.mono }}>GROSS</div>
                <div style={{ fontSize: t.fontSize.h3, color: t.color.success, fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(row.gross_profit)}</div>
              </div>
            </div>
          </div>
        </div>
      )) : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden', overflowX: isMobile ? 'auto' : 'visible' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1.2fr) 120px 120px 120px' : 'minmax(0,1.4fr) 110px 140px 140px 140px 120px', gap: 12, padding: '14px 18px', borderBottom: `1px solid #e6edf5`, color: t.color.textMuted, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, ...S.mono, minWidth: isTablet ? 'auto' : 900 }}>
            <div>客戶 / 單號</div>
            {!isTablet && <div>日期</div>}
            {!isTablet && <div>業務</div>}
            <div style={{ textAlign: 'right' }}>銷貨金額</div>
            <div style={{ textAlign: 'right' }}>成本</div>
            <div style={{ textAlign: 'right' }}>毛利</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>毛利率</div>}
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1.2fr) 120px 120px 120px' : 'minmax(0,1.4fr) 110px 140px 140px 140px 120px', gap: 12, padding: '14px 18px', borderTop: `1px solid #eef3f8`, alignItems: 'center', minWidth: isTablet ? 'auto' : 900 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, fontWeight: t.fontWeight.bold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, marginTop: 4, lineHeight: 1.6 }}>
                  <span style={{ color: t.color.textMuted, ...S.mono }}>DOC</span>{' '}
                  {row.doc_no ? (
                    <button
                      onClick={() => setSelectedSlipNumber(row.doc_no)}
                      style={{ background: 'none', border: 0, padding: 0, color: t.color.link, fontWeight: t.fontWeight.bold, cursor: 'pointer', ...S.mono }}
                    >
                      {row.doc_no}
                    </button>
                  ) : '-'}
                  {isTablet ? ` · ${row.doc_date || '-'}` : ''}
                </div>
              </div>
              {!isTablet && <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, ...S.mono }}>{row.doc_date || '-'}</div>}
              {!isTablet && <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary }}>{row.sales_name || '-'}</div>}
              <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, textAlign: 'right', ...S.mono }}>{fmtP(row.amount)}</div>
              <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, textAlign: 'right', ...S.mono }}>{fmtP(row.cost)}</div>
              <div style={{ fontSize: t.fontSize.h3, color: t.color.success, fontWeight: t.fontWeight.bold, textAlign: 'right', ...S.mono }}>{fmtP(row.gross_profit)}</div>
              {!isTablet && <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, textAlign: 'right', ...S.mono }}>{row.gross_margin || '-'}</div>}
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, dateFrom, dateTo, pageSize)}
        onLimitChange={(nextLimit) => {
          setPageSize(nextLimit);
          load(1, search, dateFrom, dateTo, nextLimit);
        }}
      />
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}
