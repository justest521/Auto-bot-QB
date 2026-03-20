'use client';
import { useCallback, useEffect, useState } from 'react';
import { CsvImportButton, EmptyState, Loading, PageLead, Pager, S, SALES_DOCUMENT_FOCUS_KEY, StatCard, apiGet, apiPost, fmt, fmtP, useViewportWidth } from '../shared/common';;

export default function Orders({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total_amount: 0, pending_count: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [convertingId, setConvertingId] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'orders', page: String(page), limit: String(limit), search: q });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize]);

  useEffect(() => { load(); }, []);

  const convertToSale = async (order) => {
    setConvertingId(order.id);
    setActionMessage('');
    try {
      const result = await apiPost({ action: 'convert_order_to_sale', order_id: order.id });
      setActionMessage(`已轉成銷貨單 ${result.sale?.slip_number || ''}`.trim());
      if (typeof window !== 'undefined' && result.sale?.slip_number) {
        window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, result.sale.slip_number);
      }
      await load(1, search, pageSize);
      setTab?.('sales_documents');
    } catch (error) {
      setActionMessage(error.message || '訂單轉銷貨失敗');
    } finally {
      setConvertingId('');
    }
  };

  return (
    <div>
      <PageLead eyebrow="Orders" title="訂單" description="查看 ERP 訂單、付款與出貨狀態，作為報價轉單後的作業中心。" action={<CsvImportButton datasetId="erp_orders" onImported={() => load(1, search, pageSize)} compact />} />
      {actionMessage ? (
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 14 }}>
          {actionMessage}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize)} placeholder="搜尋訂單號、狀態、付款或出貨..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(1, search, pageSize)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_orders` 資料表，請先跑 [`docs/erp-schema-v1.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-schema-v1.sql)。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="OTOT" label="訂單總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="PEND" label="未完成" value={fmt(data.summary?.pending_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有訂單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '140px minmax(0,1.2fr) 110px 130px 120px' : '160px minmax(0,1.3fr) 110px 120px 120px 140px 120px 140px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>訂單號</div>
            <div>客戶</div>
            <div>日期</div>
            <div>訂單狀態</div>
            {!isTablet && <div>付款</div>}
            {!isTablet && <div>出貨</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            <div style={{ textAlign: isTablet ? 'left' : 'right' }}>操作</div>
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '140px minmax(0,1.2fr) 110px 130px 120px' : '160px minmax(0,1.3fr) 110px 120px 120px 140px 120px 140px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.order_no || '-'}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>{row.remark || '-'}</div>
              </div>
              <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.order_date || '-'}</div>
              <div><span style={S.tag('')}>{row.status || 'draft'}</span></div>
              {!isTablet && <div><span style={S.tag(String(row.payment_status || '').toLowerCase().includes('paid') ? 'green' : '')}>{row.payment_status || '-'}</span></div>}
              {!isTablet && <div><span style={S.tag(String(row.shipping_status || '').toLowerCase().includes('shipped') ? 'green' : '')}>{row.shipping_status || '-'}</span></div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>}
              <div style={{ textAlign: isTablet ? 'left' : 'right' }}>
                {String(row.shipping_status || '').toLowerCase().includes('shipped') ? (
                  <span style={S.tag('green')}>已轉銷貨</span>
                ) : (
                  <button onClick={() => convertToSale(row)} disabled={convertingId === row.id} style={{ ...S.btnGhost, padding: '7px 10px', fontSize: 12, opacity: convertingId === row.id ? 0.7 : 1 }}>
                    {convertingId === row.id ? '轉銷中...' : '轉銷貨'}
                  </button>
                )}
              </div>
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
    </div>
  );
}

/* ========================================= SALES DOCUMENTS ========================================= */
