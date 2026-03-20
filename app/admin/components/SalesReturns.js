'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { S } from '../shared/styles';
import { fmt, fmtP, fmtDate, fmtMs, getPresetDateRange, toDateInputValue, todayInTaipei } from '../shared/formatters';
import { apiGet, apiPost, SALES_DOCUMENT_FOCUS_KEY } from '../shared/api';
import { Loading, EmptyState, StatusBanner, PageLead, Pager, PanelHeader, CsvImportButton, ProductEditModal } from '../shared/ui';

export function SalesReturns() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const initialRange = getPresetDateRange('today');
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { amount: 0, tax: 0, total: 0 } });
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
        action: 'sales_returns',
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

  return (
    <div>
      <PageLead
        eyebrow="Returns"
        title="銷退貨彙總"
        description="查看銷貨與退貨單據彙總，快速掌握單號、客戶與發票資訊。"
        action={<CsvImportButton datasetId="erp_sales_return_summary" onImported={() => load(1, search, dateFrom, dateTo, pageSize)} compact />}
      />
      <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, dateFrom, dateTo, pageSize)} placeholder="搜尋單號、客戶、業務或發票..." style={{ ...S.input, flex: 1 }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={S.btnPrimary}>搜尋</button>
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
                padding: '6px 12px',
                fontSize: 12,
                background: rangePreset === value ? '#edf5ff' : '#fff',
                borderColor: rangePreset === value ? '#94c3ff' : '#dbe3ee',
                color: rangePreset === value ? '#1976f3' : '#5b6779',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input type="date" value={dateFrom} onChange={(e) => { setRangePreset('custom'); setDateFrom(e.target.value); }} style={{ ...S.input, maxWidth: isMobile ? '100%' : 180 }} />
          <input type="date" value={dateTo} onChange={(e) => { setRangePreset('custom'); setDateTo(e.target.value); }} style={{ ...S.input, maxWidth: isMobile ? '100%' : 180 }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={S.btnGhost}>套用區間</button>
          <button onClick={() => applyPreset('today')} style={S.btnGhost}>回到今日</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_sales_return_summary` 資料表，請先跑 [`docs/erp-auxiliary-tables.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-auxiliary-tables.sql) 再匯入銷退貨 CSV。</div>}
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>
        共 {fmt(data.total)} 筆單據{dateFrom || dateTo ? ` · ${dateFrom || '...'} → ${dateTo || '...'}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="AMT" label="未稅金額" value={fmtP(data.summary?.amount)} tone="blue" />
        <StatCard code="TAX" label="稅額" value={fmtP(data.summary?.tax)} tone="yellow" />
        <StatCard code="TOTAL" label="總金額" value={fmtP(data.summary?.total)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有銷退貨資料" /> : isMobile ? data.rows.map((row) => (
        <div key={row.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'center' }}>
            <div>
              {row.doc_type === 'return' ? (
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.doc_no}</div>
              ) : (
                <button
                  onClick={() => setSelectedSlipNumber(row.doc_no)}
                  style={{ background: 'none', border: 0, padding: 0, fontSize: 12, color: '#1976f3', fontWeight: 700, cursor: 'pointer', ...S.mono }}
                >
                  {row.doc_no}
                </button>
              )}
              <div style={{ marginTop: 6 }}>{row.doc_type === 'return' ? <span style={S.tag('red')}>退貨</span> : <span style={S.tag('green')}>銷貨</span>}</div>
            </div>
            <div>
              <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{row.customer_name || '未命名客戶'}</div>
              <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.7 }}>
                <div><span style={{ color: '#7b889b', ...S.mono }}>DATE</span> {row.doc_date || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>SALES</span> {row.sales_name || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>INVOICE</span> {row.invoice_no || '-'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>AMOUNT</div>
                <div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{fmtP(row.amount)}</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>TOTAL</div>
                <div style={{ fontSize: 14, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
              </div>
            </div>
          </div>
        </div>
      )) : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '96px 150px minmax(0,1fr) 110px 120px' : '96px 160px minmax(0,1.2fr) 110px 150px 130px 130px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>單別</div>
            <div>單號</div>
            <div>客戶 / 發票</div>
            <div>日期</div>
            <div>業務</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>未稅金額</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總金額</div>}
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '96px 150px minmax(0,1fr) 110px 120px' : '96px 160px minmax(0,1.2fr) 110px 150px 130px 130px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <div>{row.doc_type === 'return' ? <span style={S.tag('red')}>退貨</span> : <span style={S.tag('green')}>銷貨</span>}</div>
              {row.doc_type === 'return' ? (
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.doc_no}</div>
              ) : (
                <button
                  onClick={() => setSelectedSlipNumber(row.doc_no)}
                  style={{ background: 'none', border: 0, padding: 0, fontSize: 12, color: '#1976f3', fontWeight: 700, textAlign: 'left', cursor: 'pointer', ...S.mono }}
                >
                  {row.doc_no}
                </button>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.6 }}>
                  <span style={{ color: '#7b889b', ...S.mono }}>INVOICE</span> {row.invoice_no || '-'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.doc_date || '-'}</div>
              <div style={{ fontSize: 12, color: '#617084' }}>{row.sales_name || '-'}</div>
              {!isTablet && <div style={{ fontSize: 13, color: '#1c2740', textAlign: 'right', ...S.mono }}>{fmtP(row.amount)}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{fmtP(row.total_amount)}</div>}
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

/* ========================================= PROFIT ANALYSIS ========================================= */
