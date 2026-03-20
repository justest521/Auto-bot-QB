'use client';
import { useState, useEffect, useCallback } from 'react';
import { S } from '../shared/styles';
import { fmt, fmtP, getPresetDateRange, toDateInputValue, todayInTaipei, useViewportWidth } from '../shared/formatters';
import { apiGet, apiPost } from '../shared/api';
import { Loading, EmptyState, PageLead, Pager, PanelHeader, CsvImportButton } from '../shared/ui';
import { StatCard } from '../components/Dashboard';


export function QuoteCreateModal({ open, onClose, onCreated, tableReady = true }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [productLoading, setProductLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => {
    const today = getPresetDateRange('today').from;
    const validUntil = toDateInputValue(new Date(todayInTaipei().getTime() + 7 * 86400000));
    return {
      quote_date: today,
      valid_until: validUntil,
      status: 'draft',
      remark: '',
      discount_amount: 0,
      shipping_fee: 0,
      items: [],
    };
  });

  useEffect(() => {
    if (!open) return;
    setError('');
  }, [open]);

  const searchCustomers = async () => {
    if (!customerSearch.trim()) return;
    setCustomerLoading(true);
    try {
      const result = await apiGet({ action: 'formal_customers', page: '1', limit: '10', search: customerSearch.trim() });
      setCustomerResults(result.customers || []);
    } finally {
      setCustomerLoading(false);
    }
  };

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch('');
    setCustomerResults([]);
  };

  const searchProducts = async () => {
    if (!productSearch.trim()) return;
    setProductLoading(true);
    try {
      const result = await apiGet({ action: 'products', q: productSearch.trim(), category: 'all', page: '0', limit: '10' });
      setProductResults(result.products || []);
    } finally {
      setProductLoading(false);
    }
  };

  const addProduct = (product) => {
    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          product_id: null,
          item_number_snapshot: product.item_number || '',
          description_snapshot: product.description || '',
          qty: 1,
          unit_price: Number(product.tw_reseller_price || product.tw_retail_price || 0),
        },
      ],
    }));
    setProductSearch('');
    setProductResults([]);
  };

  const updateItem = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  };

  const removeItem = (index) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.unit_price || 0)), 0);
  const taxableBase = Math.max(0, subtotal - Number(form.discount_amount || 0) + Number(form.shipping_fee || 0));
  const taxAmount = Math.round(taxableBase * 0.05);
  const totalAmount = taxableBase + taxAmount;

  const submit = async () => {
    if (!tableReady) {
      setError('目前尚未建立 erp_quotes / erp_quote_items，請先執行 ERP schema。');
      return;
    }
    if (!selectedCustomer?.id) {
      setError('請先選擇正式客戶');
      return;
    }
    if (!form.items.length) {
      setError('請至少加入一筆商品');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiPost({
        action: 'create_quote',
        customer_id: selectedCustomer.id,
        quote_date: form.quote_date,
        valid_until: form.valid_until,
        status: form.status,
        remark: form.remark,
        discount_amount: Number(form.discount_amount || 0),
        shipping_fee: Number(form.shipping_fee || 0),
        items: form.items,
      });
      onCreated?.();
      onClose?.();
    } catch (err) {
      setError(err.message || '建立報價單失敗');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 'min(1100px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={S.eyebrow}>Create Quote</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1c2740' }}>建立報價單</div>
            <div style={{ fontSize: 12, color: '#7b889b', marginTop: 6 }}>先建立基本報價單，之後就能往訂單與銷貨流程接。</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {error ? <div style={{ ...S.card, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 14 }}>{error}</div> : null}
        {!tableReady ? (
          <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00', marginBottom: 14 }}>
            目前尚未建立 `erp_quotes` / `erp_quote_items`，請先跑 [`/Users/tungyiwu/Desktop/AI/Auto QB/Auto-bot-QB/docs/erp-schema-v1.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-schema-v1.sql)。
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={S.card}>
              <PanelHeader title="選擇客戶" meta="先綁正式客戶，再建立報價。" badge={selectedCustomer ? <div style={S.tag('green')}>已選客戶</div> : null} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCustomers()} placeholder="搜尋公司、聯絡人或電話..." style={{ ...S.input, flex: 1 }} />
                <button onClick={searchCustomers} style={S.btnPrimary}>搜尋</button>
              </div>
              {customerLoading ? <Loading /> : customerResults.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, maxHeight: 230, overflowY: 'auto', paddingRight: 4 }}>
                  {customerResults.map((customer) => (
                    <button key={customer.id} onClick={() => selectCustomer(customer)} style={{ ...S.panelMuted, width: '100%', textAlign: 'left', cursor: 'pointer', border: `1px solid ${selectedCustomer?.id === customer.id ? '#94c3ff' : '#dbe3ee'}`, background: selectedCustomer?.id === customer.id ? '#edf5ff' : '#fff' }}>
                      <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                      <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>{customer.customer_code || '-'} · {customer.phone || '-'}</div>
                    </button>
                  ))}
                </div>
              ) : selectedCustomer ? (
                <div style={{ ...S.panelMuted, borderColor: '#bde6c9', background: '#f4fbf6', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#129c59', fontWeight: 700, ...S.mono }}>SELECTED CUSTOMER</div>
                      <div style={{ fontSize: 16, color: '#1c2740', fontWeight: 700, marginTop: 6 }}>{selectedCustomer.company_name || selectedCustomer.name || '未命名客戶'}</div>
                    </div>
                    <button onClick={() => setSelectedCustomer(null)} style={{ ...S.btnGhost, padding: '6px 10px', fontSize: 12 }}>更換客戶</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#617084' }}>
                    {selectedCustomer.customer_code || '-'} · {selectedCustomer.phone || '-'}
                  </div>
                </div>
              ) : <div style={{ fontSize: 12, color: '#7b889b' }}>輸入關鍵字後搜尋正式客戶</div>}
            </div>

            <div style={S.card}>
              <PanelHeader title="報價明細" meta="用商品搜尋快速加入明細，或直接調整數量與單價。" badge={<div style={S.tag('')}>{fmt(form.items.length)} 項</div>} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchProducts()} placeholder="搜尋料號或品名..." style={{ ...S.input, flex: 1, ...S.mono }} />
                <button onClick={searchProducts} style={S.btnPrimary}>找商品</button>
              </div>
              {productLoading ? <Loading /> : productResults.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  {productResults.map((product) => (
                    <button key={product.item_number} onClick={() => addProduct(product)} style={{ ...S.panelMuted, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                      <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{product.item_number}</div>
                      <div style={{ fontSize: 13, color: '#1c2740', marginTop: 4 }}>{product.description || '-'}</div>
                      <div style={{ fontSize: 12, color: '#129c59', marginTop: 4, ...S.mono }}>{fmtP(product.tw_reseller_price || product.tw_retail_price)}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              {form.items.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {form.items.map((item, index) => (
                    <div key={`${item.item_number_snapshot}-${index}`} style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 120px 100px', gap: 10, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{item.item_number_snapshot || '-'}</div>
                        <div style={{ fontSize: 13, color: '#1c2740', marginTop: 4 }}>{item.description_snapshot || '-'}</div>
                      </div>
                      <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(index, 'qty', Number(e.target.value || 1))} style={{ ...S.input, textAlign: 'center', ...S.mono }} />
                      <input type="number" min="0" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', Number(e.target.value || 0))} style={{ ...S.input, textAlign: 'right', ...S.mono }} />
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{fmtP(Number(item.qty || 0) * Number(item.unit_price || 0))}</div>
                        <button onClick={() => removeItem(index)} style={{ ...S.btnGhost, color: '#e24d4d', borderColor: '#ffd5d5', padding: '6px 10px', fontSize: 12 }}>移除</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState text="目前還沒有商品明細，先搜尋商品加入。" />}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div style={S.card}>
              <PanelHeader title="報價抬頭" meta="設定日期、狀態與補充備註。" />
              <div style={{ display: 'grid', gap: 12 }}>
                <div><label style={S.label}>報價日期</label><input type="date" value={form.quote_date} onChange={(e) => setForm((current) => ({ ...current, quote_date: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>有效期限</label><input type="date" value={form.valid_until} onChange={(e) => setForm((current) => ({ ...current, valid_until: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>狀態</label><select value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))} style={S.input}><option value="draft">draft</option><option value="sent">sent</option><option value="approved">approved</option></select></div>
                <div><label style={S.label}>備註</label><textarea value={form.remark} onChange={(e) => setForm((current) => ({ ...current, remark: e.target.value }))} rows={4} style={{ ...S.input, resize: 'vertical' }} /></div>
              </div>
            </div>
            <div style={S.card}>
              <PanelHeader title="金額摘要" meta="系統會自動算小計、稅額與總額。" />
              <div style={{ display: 'grid', gap: 12 }}>
                <div><label style={S.label}>折扣金額</label><input type="number" min="0" value={form.discount_amount} onChange={(e) => setForm((current) => ({ ...current, discount_amount: Number(e.target.value || 0) }))} style={{ ...S.input, ...S.mono }} /></div>
                <div><label style={S.label}>運費</label><input type="number" min="0" value={form.shipping_fee} onChange={(e) => setForm((current) => ({ ...current, shipping_fee: Number(e.target.value || 0) }))} style={{ ...S.input, ...S.mono }} /></div>
                <div style={{ ...S.panelMuted, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>小計</span><strong style={S.mono}>{fmtP(subtotal)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>稅額 (5%)</span><strong style={S.mono}>{fmtP(taxAmount)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#129c59', fontWeight: 700 }}><span>總額</span><strong style={S.mono}>{fmtP(totalAmount)}</strong></div>
                </div>
                <button onClick={submit} disabled={saving || !tableReady} style={{ ...S.btnPrimary, width: '100%', opacity: saving || !tableReady ? 0.7 : 1 }}>{saving ? '建立中...' : '建立報價單'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


export function Quotes() {
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

