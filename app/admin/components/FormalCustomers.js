'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { S } from '../shared/styles';
import { useViewportWidth, fmt, fmtP, fmtDate, fmtMs, getPresetDateRange, toDateInputValue, todayInTaipei } from '../shared/formatters';
import { apiGet, apiPost, SALES_DOCUMENT_FOCUS_KEY } from '../shared/api';
import { Loading, EmptyState, StatusBanner, PageLead, Pager, PanelHeader, CsvImportButton, ProductEditModal } from '../shared/ui';
import { SaleDetailDrawer } from '../components/SalesDocuments';
import { StatCard } from '../components/Dashboard';

export function FormalCustomers() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ customers: [], total: 0, page: 1, limit: 50, erp_ready: true, customer_stage_ready: false, latest_import: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'formal_customers', page: String(page), search: q, limit: String(limit) });
      setData(result);
      const existingSelection = (result.customers || []).find((customer) => customer.id === selectedCustomerId);
      if (!existingSelection && result.customers?.[0]?.id) {
        setSelectedCustomerId(result.customers[0].id);
      }
      if (!result.customers?.length) {
        setSelectedCustomerId('');
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, selectedCustomerId]);

  useEffect(() => { load(); }, []);

  const loadDetail = useCallback(async (erpCustomerId) => {
    if (!erpCustomerId) return;
    setDetailLoading(true);
    try {
      const result = await apiGet({ action: 'formal_customer_detail', erp_customer_id: erpCustomerId });
      setDetail(result);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      loadDetail(selectedCustomerId);
    }
  }, [selectedCustomerId, loadDetail]);

  const stageMeta = {
    lead: { label: '詢問名單', color: '' },
    prospect: { label: '潛在客戶', color: 'yellow' },
    customer: { label: '正式客戶', color: 'green' },
    vip: { label: 'VIP', color: 'red' },
  };
  const detailCustomer = detail?.customer;
  const summary = detail?.summary || {};

  const listPane = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={S.panelMuted}>
          <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>DB_CUSTOMERS</div>
          <div style={{ fontSize: 28, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmt(data.total)}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#617084' }}>目前 `erp_customers` 實際筆數</div>
        </div>
        <div style={S.panelMuted}>
          <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>LATEST_IMPORT</div>
          <div style={{ fontSize: 20, color: '#1976f3', fontWeight: 700, ...S.mono }}>{fmt(data.latest_import?.count || 0)}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#617084' }}>
            {data.latest_import ? `最近匯入 ${fmtDate(data.latest_import.imported_at)} · ${data.latest_import.file_name || '-'}` : '目前還沒有客戶匯入紀錄'}
          </div>
        </div>
        <div style={S.panelMuted}>
          <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>CHECKPOINT</div>
          <div style={{ fontSize: 14, color: data.latest_import?.count === data.total ? '#129c59' : '#f59e0b', fontWeight: 700 }}>
            {data.latest_import?.count === data.total ? '匯入筆數與資料庫一致' : '匯入筆數與目前資料庫不同步'}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#617084' }}>
            {data.latest_import ? `匯入 ${fmt(data.latest_import.count)} 筆 / 目前 ${fmt(data.total)} 筆` : '可用來快速確認客戶是否完整匯入'}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>共 {fmt(data.total)} 位正式客戶</div>
      {loading ? <Loading /> : data.customers.length === 0 ? <EmptyState text="目前沒有符合條件的正式客戶資料" /> : (
        isMobile ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                style={{ ...S.card, padding: '14px 16px', marginBottom: 0, textAlign: 'left', cursor: 'pointer', background: selectedCustomerId === customer.id ? '#f0f7ff' : '#fff', borderColor: selectedCustomerId === customer.id ? '#94c3ff' : '#dbe3ee' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: '#1c2740', fontWeight: 700 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#617084', lineHeight: 1.7 }}>
                      <div><span style={{ color: '#7b889b', ...S.mono }}>CODE</span> {customer.customer_code || '-'}</div>
                      <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {customer.name || '-'}</div>
                      <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {customer.phone || '-'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                    <span style={S.tag(stageMeta[customer.customer_stage]?.color || '')}>{stageMeta[customer.customer_stage]?.label || '詢問名單'}</span>
                    {customer.line_user_id ? <span style={S.tag('line')}>LINE 已連通</span> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '110px minmax(0,1.1fr) 120px 110px' : '130px minmax(0,1.3fr) 140px 180px 130px 120px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
              <div>客戶代號</div>
              <div>客戶資料</div>
              {!isTablet && <div>聯絡人</div>}
              <div>電話</div>
              <div>階段</div>
              <div>渠道</div>
            </div>
            {data.customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                style={{ display: 'grid', gridTemplateColumns: isTablet ? '110px minmax(0,1.1fr) 120px 110px' : '130px minmax(0,1.3fr) 140px 180px 130px 120px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: selectedCustomerId === customer.id ? '#f0f7ff' : '#fff', border: 0, textAlign: 'left', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{customer.customer_code || '-'}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                  <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {customer.email || customer.tax_id || customer.address || '-'}
                  </div>
                </div>
                {!isTablet && <div style={{ fontSize: 12, color: '#617084' }}>{customer.name || '-'}</div>}
                <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{customer.phone || '-'}</div>
                <div><span style={S.tag(stageMeta[customer.customer_stage]?.color || '')}>{stageMeta[customer.customer_stage]?.label || '詢問名單'}</span></div>
                <div>{customer.line_user_id ? <span style={S.tag('line')}>LINE</span> : <span style={S.tag('')}>ERP</span>}</div>
              </button>
            ))}
          </div>
        )
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => {
          setPageSize(nextLimit);
          load(1, search, nextLimit);
        }}
      />
    </>
  );

  return (
    <div>
      <PageLead
        eyebrow="Customers"
        title="客戶主檔"
        description="這裡顯示全部正式 ERP 客戶，不限是否來自 LINE。適合查看你匯入的一千多筆正式客戶資料。"
        action={<CsvImportButton datasetId="erp_customers" onImported={() => load(1, search, pageSize)} compact />}
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize)}
          placeholder="搜尋客戶代號、姓名、公司、電話或 Email..."
          style={{ ...S.input, flex: 1 }}
        />
        <button onClick={() => load(1, search, pageSize)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.erp_ready && (
        <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>
          目前還找不到 `erp_customers` 資料表，請先建立 ERP 客戶主檔。
        </div>
      )}
      {isMobile ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {listPane}
          <div style={S.card}>
            {detailLoading ? <Loading /> : !detailCustomer ? <EmptyState text="請先選擇一位正式客戶" /> : (
              <div style={{ display: 'grid', gap: 16 }}>
                <PanelHeader title={detailCustomer.company_name || detailCustomer.name || '客戶檔案'} meta={detailCustomer.customer_code || 'ERP customer'} badge={<div style={S.tag(stageMeta[detailCustomer.customer_stage]?.color || '')}>{stageMeta[detailCustomer.customer_stage]?.label || '詢問名單'}</div>} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <StatCard code="QUOTE" label="報價" value={fmt(summary.quote_count)} tone="blue" />
                  <StatCard code="ORDER" label="訂單" value={fmt(summary.order_count)} tone="yellow" />
                  <StatCard code="SALE" label="銷貨" value={fmt(summary.sale_count)} tone="green" />
                  <StatCard code="MSG" label="LINE 互動" value={fmt(summary.line_message_count)} tone="red" />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={S.twoCol}>
          <div>{listPane}</div>
          <div style={{ position: 'sticky', top: 84 }}>
            <div style={S.card}>
              {detailLoading ? <Loading /> : !detailCustomer ? <EmptyState text="請先選擇一位正式客戶" /> : (
                <div style={{ display: 'grid', gap: 16 }}>
                  <PanelHeader
                    title={detailCustomer.company_name || detailCustomer.name || '客戶檔案'}
                    meta={detailCustomer.customer_code || 'ERP customer'}
                    badge={<div style={S.tag(stageMeta[detailCustomer.customer_stage]?.color || '')}>{stageMeta[detailCustomer.customer_stage]?.label || '詢問名單'}</div>}
                  />
                  <div style={{ fontSize: 13, color: '#617084', lineHeight: 1.8 }}>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {detailCustomer.name || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {detailCustomer.phone || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>EMAIL</span> {detailCustomer.email || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>TAX_ID</span> {detailCustomer.tax_id || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>ADDRESS</span> {detailCustomer.address || '-'}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {detailCustomer.line_user_id ? <span style={S.tag('line')}>LINE 已連通</span> : <span style={S.tag('')}>ERP only</span>}
                      {detail?.line_profile ? <span style={S.tag('green')}>{detail.line_profile.display_name || 'LINE 客戶'}</span> : null}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <StatCard code="QUOTE" label="報價筆數" value={fmt(summary.quote_count)} sub={fmtP(summary.quote_total)} tone="blue" />
                    <StatCard code="ORDER" label="訂單筆數" value={fmt(summary.order_count)} sub={fmtP(summary.order_total)} tone="yellow" />
                    <StatCard code="SALE" label="銷貨筆數" value={fmt(summary.sale_count)} sub={fmtP(summary.sales_total)} tone="green" />
                    <StatCard code="GP" label="毛利" value={fmtP(summary.gross_profit_total)} sub={`訊息 ${fmt(summary.line_message_count)} 筆`} tone="red" />
                  </div>
                  <div style={S.panelMuted}>
                    <PanelHeader title="最近報價" meta="最近 5 張報價單" badge={<div style={S.tag('')}>{fmt(detail?.recent_quotes?.length || 0)} 筆</div>} />
                    {detail?.recent_quotes?.length ? detail.recent_quotes.map((row) => (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 10, padding: '8px 0', borderTop: '1px solid #e6edf5', alignItems: 'center' }}>
                        <div style={{ color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{row.quote_no || '-'}</div>
                        <div style={{ color: '#617084', fontSize: 12 }}>{row.quote_date || '-'} · {row.status || 'draft'}</div>
                        <div style={{ textAlign: 'right', color: '#1c2740', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
                      </div>
                    )) : <EmptyState text="目前沒有報價單資料" />}
                  </div>
                  <div style={S.panelMuted}>
                    <PanelHeader title="最近訂單" meta="最近 5 張訂單" badge={<div style={S.tag('')}>{fmt(detail?.recent_orders?.length || 0)} 筆</div>} />
                    {detail?.recent_orders?.length ? detail.recent_orders.map((row) => (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 10, padding: '8px 0', borderTop: '1px solid #e6edf5', alignItems: 'center' }}>
                        <div style={{ color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{row.order_no || '-'}</div>
                        <div style={{ color: '#617084', fontSize: 12 }}>{row.order_date || '-'} · {row.status || 'draft'}</div>
                        <div style={{ textAlign: 'right', color: '#1c2740', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
                      </div>
                    )) : <EmptyState text="目前沒有訂單資料" />}
                  </div>
                  <div style={S.panelMuted}>
                    <PanelHeader title="最近銷貨" meta="從 qb_sales_history 對應最近單據" badge={<div style={S.tag('green')}>{fmt(detail?.recent_sales?.length || 0)} 筆</div>} />
                    {detail?.recent_sales?.length ? detail.recent_sales.map((row) => (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px 90px', gap: 10, padding: '8px 0', borderTop: '1px solid #e6edf5', alignItems: 'center' }}>
                        <button onClick={() => setSelectedSlipNumber(row.slip_number)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: '#1976f3', fontSize: 12, fontWeight: 700, cursor: 'pointer', ...S.mono }}>{row.slip_number || '-'}</button>
                        <div style={{ color: '#617084', fontSize: 12 }}>{row.sale_date || '-'} · {row.sales_person || '-'}</div>
                        <div style={{ textAlign: 'right', color: '#129c59', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>
                        <div style={{ textAlign: 'right', color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.gross_profit)}</div>
                      </div>
                    )) : <EmptyState text="目前沒有銷貨資料" />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}

