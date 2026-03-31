'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmt, fmtP, getPresetDateRange, useResponsive, exportCsv } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard, CsvImportButton, SaleDetailDrawer } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

export default function SalesReturns() {
  const { isMobile, isTablet } = useResponsive();
  const { colWidths, gridTemplate, ResizableHeader } = useResizableColumns(
    isTablet ? 'sales_returns_list_tablet' : 'sales_returns_list',
    isTablet ? [96, 150, 220, 110, 120] : [96, 160, 220, 110, 150, 130, 130]
  );
  const initialRange = getPresetDateRange('today');
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { amount: 0, tax: 0, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [rangePreset, setRangePreset] = useState('today');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async (page = 1, q = search, from = dateFrom, to = dateTo, limit = pageSize, status = statusFilter) => {
    setLoading(true);
    try {
      const result = await apiGet({
        action: 'sales_returns',
        page: String(page),
        limit: String(limit),
        search: q,
        date_from: from,
        date_to: to,
        status: status,
      });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, pageSize, statusFilter]);

  useEffect(() => { load(); }, []);

  const applyDatePreset = (preset) => {
    setRangePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(1, search, dateFrom, dateTo, pageSize, statusFilter);

  const handleExport = async () => {
    try {
      const all = await apiGet({ action: 'sales_returns', page: '1', limit: '9999', export: 'true', search, date_from: dateFrom, date_to: dateTo, status: statusFilter });
      exportCsv(all.rows || [], [
        { key: 'slip_number', label: '單號' },
        { key: 'customer_name', label: '客戶' },
        { key: 'invoice_number', label: '發票號' },
        { key: 'sale_date', label: '日期' },
        { key: 'sales_person', label: '業務' },
        { key: 'total', label: '金額' },
      ], `銷退貨彙總_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  return (
    <div>
      <PageLead
        eyebrow="Returns"
        title="銷退貨彙總"
        description="查看銷貨與退貨單據彙總，快速掌握單號、客戶與發票資訊。"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <CsvImportButton datasetId="erp_sales_return_summary" onImported={() => load(1, search, dateFrom, dateTo, pageSize)} compact />
            <button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>
          </div>
        }
      />
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', ...(isMobile && { flexDirection: 'column' }), ...(isMobile && { alignItems: 'stretch' }) }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...(isMobile && { width: '100%' }) }}>
            {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
              <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: t.fontSize.body, background: rangePreset === key ? t.color.link : t.color.bgCard, color: rangePreset === key ? '#fff' : '#4b5563', borderColor: rangePreset === key ? t.color.link : t.color.border, flex: isMobile ? 1 : 'auto', minWidth: 60 }}>{label}</button>
            ))}
          </div>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setRangePreset(''); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 150, fontSize: t.fontSize.body, padding: isMobile ? '10px 12px' : '6px 10px', ...S.mono }} />
          <span style={{ color: t.color.textMuted, fontSize: t.fontSize.body, display: isMobile ? 'none' : 'block' }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setRangePreset(''); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 150, fontSize: t.fontSize.body, padding: isMobile ? '10px 12px' : '6px 10px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), fontSize: t.fontSize.body, padding: isMobile ? '10px 12px' : '6px 10px', width: isMobile ? '100%' : 'auto' }}>
            <option value="">全部狀態</option>
            <option value="pending">待處理</option>
            <option value="approved">已核准</option>
            <option value="completed">已完成</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋單號、客戶、業務或發票..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), flex: isMobile ? 1 : 1, minWidth: 160, fontSize: t.fontSize.body, padding: isMobile ? '10px 12px' : '6px 10px', width: isMobile ? '100%' : 'auto' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, ...(isMobile ? { width: '100%', minHeight: 44, padding: '12px 16px' } : { padding: '6px 16px' }), fontSize: t.fontSize.body }}>查詢</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: t.color.warningBg, borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_sales_return_summary` 資料表，請先跑 [`docs/erp-auxiliary-tables.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-auxiliary-tables.sql) 再匯入銷退貨 CSV。</div>}
      <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 12, ...S.mono }}>
        共 {fmt(data.total)} 筆單據{dateFrom || dateTo ? ` · ${dateFrom || '...'} → ${dateTo || '...'}` : ''}{statusFilter ? ` · ${statusFilter}` : ''}
      </div>
      <div style={{ ...S.statGrid, ...(isMobile && { gridTemplateColumns: 'repeat(2, 1fr)' }), marginBottom: 10 }}>
        <StatCard code="AMT" label="未稅金額" value={fmtP(data.summary?.amount)} tone="blue" />
        <StatCard code="TAX" label="稅額" value={fmtP(data.summary?.tax)} tone="yellow" />
        <StatCard code="TOTAL" label="總金額" value={fmtP(data.summary?.total)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有銷退貨資料" /> : isMobile ? data.rows.map((row) => (
        <div key={row.id} style={{ ...S.card, padding: '10px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, alignItems: 'center' }}>
            <div>
              {row.doc_type === 'return' ? (
                <div style={{ fontSize: t.fontSize.caption, color: t.color.link, fontWeight: t.fontWeight.bold, ...S.mono }}>{row.doc_no}</div>
              ) : (
                <button
                  onClick={() => setSelectedSlipNumber(row.doc_no)}
                  style={{ background: 'none', border: 0, padding: 0, fontSize: t.fontSize.caption, color: t.color.link, fontWeight: t.fontWeight.bold, cursor: 'pointer', ...S.mono }}
                >
                  {row.doc_no}
                </button>
              )}
              <div style={{ marginTop: 6 }}>{row.doc_type === 'return' ? <span style={S.tag('red')}>退貨</span> : <span style={S.tag('green')}>銷貨</span>}</div>
            </div>
            <div>
              <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, fontWeight: t.fontWeight.bold }}>{row.customer_name || '未命名客戶'}</div>
              <div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, marginTop: 4, lineHeight: 1.7 }}>
                <div><span style={{ color: t.color.textMuted, ...S.mono }}>DATE</span> {row.doc_date || '-'}</div>
                <div><span style={{ color: t.color.textMuted, ...S.mono }}>SALES</span> {row.sales_name || '-'}</div>
                <div><span style={{ color: t.color.textMuted, ...S.mono }}>INVOICE</span> {row.invoice_no || '-'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6, ...S.mono }}>AMOUNT</div>
                <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, ...S.mono }}>{fmtP(row.amount)}</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6, ...S.mono }}>TOTAL</div>
                <div style={{ fontSize: t.fontSize.h3, color: t.color.success, fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(row.total_amount)}</div>
              </div>
            </div>
          </div>
        </div>
      )) : (
        <div style={{ ...S.card, padding: 0, overflowX: 'auto', border: `1px solid ${t.color.border}` }}>
          <ResizableHeader headers={[
            { label: '單別', align: 'center' },
            { label: '單號', align: 'center' },
            { label: '客戶 / 發票', align: 'center' },
            { label: '日期', align: 'center' },
            { label: '業務', align: 'center' },
            ...(!isTablet ? [
              { label: '未稅金額', align: 'center' },
              { label: '總金額', align: 'center' },
            ] : []),
          ]} />
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 0, padding: 0, borderBottom: `1px solid #eef3f8`, alignItems: 'center' }}>
              <div style={{ padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center' }}>{row.doc_type === 'return' ? <span style={S.tag('red')}>退貨</span> : <span style={S.tag('green')}>銷貨</span>}</div>
              {row.doc_type === 'return' ? (
                <div style={{ fontSize: t.fontSize.body, color: t.color.link, fontWeight: t.fontWeight.bold, padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center', ...S.mono }}>{row.doc_no}</div>
              ) : (
                <button
                  onClick={() => setSelectedSlipNumber(row.doc_no)}
                  style={{ background: 'none', border: 0, padding: '8px 10px', fontSize: t.fontSize.body, color: t.color.link, fontWeight: t.fontWeight.bold, textAlign: 'center', cursor: 'pointer', marginRight: '1px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', ...S.mono, width: '100%', justifyContent: 'center' }}
                >
                  {row.doc_no}
                </button>
              )}
              <div style={{ minWidth: 0, textAlign: 'left', padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, fontWeight: t.fontWeight.bold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, marginTop: 4, lineHeight: 1.6 }}>
                    <span style={{ color: t.color.textMuted, ...S.mono }}>INVOICE</span> {row.invoice_no || '-'}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center', ...S.mono }}>{row.doc_date || '-'}</div>
              <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center' }}>{row.sales_name || '-'}</div>
              {!isTablet && <div style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'right', ...S.mono }}>{fmtP(row.amount)}</div>}
              {!isTablet && <div style={{ fontSize: t.fontSize.h3, color: t.color.success, fontWeight: t.fontWeight.bold, padding: '8px 10px', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'right', ...S.mono }}>{fmtP(row.total_amount)}</div>}
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, dateFrom, dateTo, pageSize, statusFilter)}
        onLimitChange={(nextLimit) => {
          setPageSize(nextLimit);
          load(1, search, dateFrom, dateTo, nextLimit, statusFilter);
        }}
      />
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}
