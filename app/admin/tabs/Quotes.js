'use client';
import { useCallback, useEffect, useState } from 'react';
import { CsvImportButton, EmptyState, Loading, PageLead, Pager, QuoteCreateModal, S, StatCard, apiGet, apiPost, fmt, fmtP, useViewportWidth } from '../shared/common';;

export default function Quotes() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total_amount: 0, open_count: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [showCreate, setShowCreate] = useState(false);
  const [convertingId, setConvertingId] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'quotes', page: String(page), limit: String(limit), search: q });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize]);

  useEffect(() => { load(); }, []);

  const convertToOrder = async (quote) => {
    setConvertingId(quote.id);
    setActionMessage('');
    try {
      const result = await apiPost({ action: 'convert_quote_to_order', quote_id: quote.id });
      setActionMessage(`已轉成訂單 ${result.order?.order_no || ''}`.trim());
      await load(1, search, pageSize);
    } catch (error) {
      setActionMessage(error.message || '報價轉訂單失敗');
    } finally {
      setConvertingId('');
    }
  };

  return (
    <div>
      <PageLead eyebrow="Quotes" title="報價單" description="查看 ERP 報價單、客戶、有效期限與總金額，作為詢價轉單前的作業入口。" action={<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><CsvImportButton datasetId="erp_quotes" onImported={() => load(1, search, pageSize)} compact /><button onClick={() => data.table_ready && setShowCreate(true)} disabled={!data.table_ready} style={{ ...S.btnPrimary, opacity: data.table_ready ? 1 : 0.6, cursor: data.table_ready ? 'pointer' : 'not-allowed' }}>+ 建立報價單</button></div>} />
      {actionMessage ? (
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 14 }}>
          {actionMessage}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize)} placeholder="搜尋報價單號、狀態或備註..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(1, search, pageSize)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_quotes` 資料表，請先跑 [`docs/erp-schema-v1.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-schema-v1.sql)。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="QTOT" label="報價總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="OPEN" label="待處理" value={fmt(data.summary?.open_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有報價單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '140px minmax(0,1.2fr) 110px 130px 120px' : '160px minmax(0,1.3fr) 110px 130px 120px 140px 120px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>報價單號</div>
            <div>客戶</div>
            <div>日期</div>
            <div>狀態</div>
            {!isTablet && <div>有效期限</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            <div style={{ textAlign: isTablet ? 'left' : 'right' }}>操作</div>
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '140px minmax(0,1.2fr) 110px 130px 120px' : '160px minmax(0,1.3fr) 110px 130px 120px 140px 120px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.quote_no || '-'}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>{row.remark || row.customer?.phone || '-'}</div>
              </div>
              <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.quote_date || '-'}</div>
              <div><span style={S.tag(String(row.status || '').toLowerCase().includes('approved') ? 'green' : '')}>{row.status || 'draft'}</span></div>
              {!isTablet && <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.valid_until || '-'}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>}
              <div style={{ textAlign: isTablet ? 'left' : 'right' }}>
                {String(row.status || '').toLowerCase() === 'converted' ? (
                  <span style={S.tag('green')}>已轉單</span>
                ) : (
                  <button onClick={() => convertToOrder(row)} disabled={convertingId === row.id} style={{ ...S.btnGhost, padding: '7px 10px', fontSize: 12, opacity: convertingId === row.id ? 0.7 : 1 }}>
                    {convertingId === row.id ? '轉單中...' : '轉訂單'}
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
      <QuoteCreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => load(1, search, pageSize)} tableReady={data.table_ready} />
    </div>
  );
}

/* ========================================= ORDERS ========================================= */
