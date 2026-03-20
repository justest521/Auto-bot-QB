'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { S } from '../shared/styles';
import { useViewportWidth, fmt, fmtP, fmtDate, fmtMs, getPresetDateRange, toDateInputValue, todayInTaipei } from '../shared/formatters';
import { apiGet, apiPost, SALES_DOCUMENT_FOCUS_KEY } from '../shared/api';
import { Loading, EmptyState, StatusBanner, PageLead, Pager, PanelHeader, CsvImportButton, ProductEditModal } from '../shared/ui';

export function SaleDetailDrawer({ slipNumber, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !slipNumber) return;
    setLoading(true);
    setError('');
    apiGet({ action: 'sale_detail', slip_number: slipNumber })
      .then(setDetail)
      .catch((err) => setError(err.message || '讀取銷貨單失敗'))
      .finally(() => setLoading(false));
  }, [open, slipNumber]);

  if (!open) return null;

  const sale = detail?.sale;
  const invoice = detail?.invoice;
  const items = detail?.items || [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 'min(720px, 100vw)', height: '100vh', background: '#f6f9fc', boxShadow: '-18px 0 50px rgba(18,26,42,0.2)', padding: '24px 22px 28px', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={S.eyebrow}>Sales Detail</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1c2740' }}>{slipNumber}</div>
            <div style={{ fontSize: 12, color: '#7b889b', marginTop: 6 }}>完整銷貨單檢視</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {loading ? <Loading /> : error ? <ImportStatus status={error} /> : sale ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={S.panelMuted}><div style={S.label}>客戶</div><div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{sale.customer_name || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>銷貨日期</div><div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{sale.sale_date || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>業務</div><div style={{ fontSize: 14, color: '#1c2740' }}>{sale.sales_person || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>發票號碼</div><div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{sale.invoice_number || '-'}</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div style={S.panelMuted}><div style={S.label}>未稅</div><div style={{ fontSize: 18, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmtP(sale.subtotal)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>稅額</div><div style={{ fontSize: 18, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmtP(sale.tax)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>總額</div><div style={{ fontSize: 18, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(sale.total)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>毛利</div><div style={{ fontSize: 18, color: '#1976f3', fontWeight: 700, ...S.mono }}>{fmtP(sale.gross_profit)}</div></div>
            </div>
            {invoice ? (
              <div style={S.card}>
                <PanelHeader title="發票資訊" meta="來自 qb_invoices" badge={<div style={S.tag('green')}>INVOICE</div>} />
                <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.8 }}>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>NUMBER</span> {invoice.invoice_number || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>TYPE</span> {invoice.invoice_type || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>COMPANY</span> {invoice.company_name || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>TAX_ID</span> {invoice.tax_id || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>AMOUNT</span> {fmtP(invoice.amount)}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>ISSUED</span> {fmtDate(invoice.issued_at)}</div>
                </div>
              </div>
            ) : null}
            <div style={S.card}>
              <PanelHeader title="商品明細" meta="若訂單明細已進 qb_order_items，這裡會直接列出。" badge={<div style={S.tag(items.length ? 'green' : 'red')}>{items.length ? `${fmt(items.length)} 筆` : '目前無明細'}</div>} />
              {items.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0,1fr) 80px 100px 110px', gap: 12, color: '#7b889b', fontSize: 10, ...S.mono, borderBottom: '1px solid #e6edf5', paddingBottom: 8 }}>
                    <div>品號</div><div>品名</div><div style={{ textAlign: 'right' }}>數量</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'right' }}>小計</div>
                  </div>
                  {items.map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0,1fr) 80px 100px 110px', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #eef3f8' }}>
                      <div style={{ color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{item.item_number || '-'}</div>
                      <div style={{ color: '#1c2740', fontSize: 13 }}>{item.description || '-'}</div>
                      <div style={{ color: '#617084', textAlign: 'right', ...S.mono }}>{fmt(item.quantity)}</div>
                      <div style={{ color: '#617084', textAlign: 'right', ...S.mono }}>{fmtP(item.unit_price)}</div>
                      <div style={{ color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(item.subtotal)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="目前這張銷貨單還沒有對應的商品明細資料。若後續把 qb_order_items 補齊，這裡會直接顯示。" />
              )}
            </div>
          </div>
        ) : <EmptyState text="找不到這張銷貨單" />}
      </div>
    </div>
  );
}

export function SalesDocuments() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total: 0, gross_profit: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'sales_documents', page: String(page), limit: String(limit), search: q });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const focusedSlip = window.localStorage.getItem(SALES_DOCUMENT_FOCUS_KEY);
    if (!focusedSlip) return;
    setSearch(focusedSlip);
    load(1, focusedSlip, pageSize);
    window.localStorage.removeItem(SALES_DOCUMENT_FOCUS_KEY);
  }, [load, pageSize]);

  return (
    <div>
      <PageLead eyebrow="Sales" title="銷貨單" description="查看實際銷貨單、發票號碼與毛利，並可點單號查看完整銷貨單內容。" action={<CsvImportButton datasetId="qb_sales_history" onImported={() => load(1, search, pageSize)} compact />} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize)} placeholder="搜尋銷貨單號、客戶、業務或發票..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(1, search, pageSize)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `qb_sales_history` 或目前資料不可讀。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="STOT" label="銷貨筆數" value={fmt(data.total)} tone="blue" />
        <StatCard code="REV" label="本頁營收" value={fmtP(data.summary?.total)} tone="green" />
        <StatCard code="GP" label="本頁毛利" value={fmtP(data.summary?.gross_profit)} tone="yellow" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有銷貨單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '160px minmax(0,1.2fr) 110px 110px' : '170px minmax(0,1.3fr) 120px 120px 120px 120px 120px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>銷貨單號</div>
            <div>客戶 / 發票</div>
            <div>日期</div>
            <div>業務</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>未稅</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>毛利</div>}
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '160px minmax(0,1.2fr) 110px 110px' : '170px minmax(0,1.3fr) 120px 120px 120px 120px 120px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <button onClick={() => setSelectedSlipNumber(row.slip_number)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', fontSize: 12, color: '#1976f3', fontWeight: 700, cursor: 'pointer', ...S.mono }}>
                {row.slip_number || '-'}
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.6 }}>
                  <span style={{ color: '#7b889b', ...S.mono }}>INV</span> {row.invoice_number || '-'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.sale_date || '-'}</div>
              <div style={{ fontSize: 12, color: '#617084' }}>{row.sales_person || '-'}</div>
              {!isTablet && <div style={{ fontSize: 13, color: '#1c2740', textAlign: 'right', ...S.mono }}>{fmtP(row.subtotal)}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#1976f3', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.gross_profit)}</div>}
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => { setPageSize(nextLimit); load(1, search, nextLimit); }}
      />
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}

/* ========================================= PROMOTIONS ========================================= */

