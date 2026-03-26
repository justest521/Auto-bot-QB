'use client';
import React, { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, StatCard, PanelHeader, Pager, CsvImportButton, SaleDetailDrawer } from '../shared/ui';

// 客戶名稱正規化：移除公司後綴、空白，取核心名稱做比對
function normalizeName(name) {
  if (!name) return '';
  return name.replace(/\s+/g, '').replace(/(股份)?有限公司|企業社|工作室|商行|行號/g, '').trim();
}

// 偵測疑似重複客戶：回傳 Map<customerId, { groupColor, groupSize, groupName }>
function detectDuplicates(customers) {
  const groups = {};
  customers.forEach(c => {
    const key = normalizeName(c.company_name || c.name || '');
    if (key.length < 2) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c.id);
  });
  const colors = ['#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
  const dupMap = {};
  let colorIdx = 0;
  Object.entries(groups).forEach(([key, ids]) => {
    if (ids.length < 2) return;
    const color = colors[colorIdx % colors.length];
    colorIdx++;
    ids.forEach(id => { dupMap[id] = { groupColor: color, groupSize: ids.length, groupName: key }; });
  });
  return dupMap;
}

function useViewportWidth() {
  const [width, setWidth] = useState(1400);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return width;
}

export default function FormalCustomers() {
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
  const [expandedPanels, setExpandedPanels] = useState({});
  const togglePanel = (key) => setExpandedPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const emptyForm = { company_name: '', full_name: '', name: '', phone: '', fax: '', mobile: '', email: '', tax_id: '', job_title: '', sales_person: '', billing_customer: '', discount_percent: '', stop_date: '', invoice_email: '', invoice_mobile: '', carrier_type: '', carrier_code: '', bank_account: '', payment_method: '', payment_days: '', monthly_closing_day: '', collection_method: '', collection_day: '', address: '', registered_address: '', invoice_address: '', shipping_address: '', business_address: '', notes: '' };
  const [createForm, setCreateForm] = useState({ ...emptyForm });
  const [createSaving, setCreateSaving] = useState(false);
  const [spFilter, setSpFilter] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize, sp = spFilter) => {
    setLoading(true);
    try {
      const params = { action: 'formal_customers', page: String(page), search: q, limit: String(limit) };
      if (sp) params.sales_person = sp;
      const result = await apiGet(params);
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
  }, [search, pageSize, selectedCustomerId, spFilter]);

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
      setEditing(false);
    }
  }, [selectedCustomerId, loadDetail]);

  const startEditing = () => {
    if (!detailCustomer) return;
    const c = detailCustomer;
    const f = {};
    Object.keys(emptyForm).forEach((k) => { f[k] = c[k] || ''; });
    setEditForm(f);
    setEditing(true);
  };

  const saveEdit = async () => {
    setEditSaving(true);
    try {
      await apiPost({ action: 'update_customer_profile', erp_customer_id: selectedCustomerId, profile: editForm });
      setEditing(false);
      await loadDetail(selectedCustomerId);
      await load(data.page, search, pageSize);
    } finally {
      setEditSaving(false);
    }
  };

  const saveCreate = async () => {
    if (!createForm.company_name.trim()) return;
    setCreateSaving(true);
    try {
      const result = await apiPost({ action: 'create_customer', profile: createForm });
      setCreating(false);
      setCreateForm({ ...emptyForm });
      await load(1, search, pageSize);
      if (result?.customer?.id) setSelectedCustomerId(result.customer.id);
    } finally {
      setCreateSaving(false);
    }
  };

  const detailCustomer = detail?.customer;
  const stageMeta = {
    lead: { label: '詢問名單', color: '' },
    prospect: { label: '潛在客戶', color: 'yellow' },
    customer: { label: '正式客戶', color: 'green' },
    vip: { label: 'VIP', color: 'red' },
  };
  const summary = detail?.summary || {};

  // Full-database duplicate detection from backend
  const [dupMap, setDupMap] = useState({});
  const [dupCount, setDupCount] = useState(0);
  useEffect(() => {
    apiGet({ action: 'customer_duplicates' }).then(res => {
      setDupMap(res.duplicates || {});
      setDupCount(res.total_flagged || 0);
    }).catch(() => {});
  }, []);

  const listPane = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        {(() => {
          const ys = data.year_stats || {};
          const gr = ys.growth_rate !== null && ys.growth_rate !== undefined ? Number(ys.growth_rate) : null;
          return (
            <>
              <div style={{ ...S.panelMuted, background: '#ffffff' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, ...S.mono }}>{ys.last_year || '去年'}年 交易客戶</div>
                <div style={{ fontSize: 28, color: '#111827', fontWeight: 700, ...S.mono }}>{fmt(ys.last_year_customers || 0)}</div>
              </div>
              <div style={{ ...S.panelMuted, background: '#ffffff' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, ...S.mono }}>{ys.this_year || '今年'}年 交易客戶</div>
                <div style={{ fontSize: 28, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{fmt(ys.this_year_customers || 0)}</div>
              </div>
              <div style={{ ...S.panelMuted, background: '#ffffff' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, ...S.mono }}>年增率</div>
                <div style={{ fontSize: 28, color: gr === null ? '#9ca3af' : gr >= 0 ? '#10b981' : '#ef4444', fontWeight: 700, ...S.mono }}>
                  {gr === null ? '-' : `${gr >= 0 ? '+' : ''}${gr}%`}
                </div>
              </div>
            </>
          );
        })()}
      </div>
      {dupCount > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>疑似重複</span>
          <span style={{ color: '#92400e' }}>全面偵測到 <strong>{dupCount}</strong> 筆可能重複的客戶（比對名稱、電話、統編），已用色條標記</span>
        </div>
      )}
      {loading ? <Loading /> : data.customers.length === 0 ? <EmptyState text="目前沒有符合條件的正式客戶資料" /> : (
        isMobile ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                style={{ ...S.card, padding: '14px 16px', marginBottom: 0, textAlign: 'left', cursor: 'pointer', background: selectedCustomerId === customer.id ? '#f0f7ff' : '#fff', borderColor: selectedCustomerId === customer.id ? '#93c5fd' : '#e5e7eb' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: '#111827', fontWeight: 700 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
                      <div><span style={{ color: '#6b7280', ...S.mono }}>CODE</span> {customer.customer_code || '-'}</div>
                      <div><span style={{ color: '#6b7280', ...S.mono }}>CONTACT -</span> {customer.name || '-'}</div>
                      <div><span style={{ color: '#6b7280', ...S.mono }}>PHONE -</span> {customer.phone || '-'}</div>
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
            <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1.3fr) 100px 120px' : 'minmax(0,1.5fr) 140px 160px minmax(0,1fr)', gap: 12, padding: '14px 18px', borderBottom: '1px solid #F2F2F2', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>
              <div>公司名稱</div>
              <div>聯絡人</div>
              <div>電話</div>
              {!isTablet && <div>負責業務</div>}
            </div>
            {data.customers.map((customer, idx) => {
              const dup = dupMap[customer.id];
              return (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1.3fr) 100px 120px' : 'minmax(0,1.5fr) 140px 160px minmax(0,1fr)', gap: 12, padding: '14px 18px', alignItems: 'center', background: selectedCustomerId === customer.id ? '#dcfce7' : idx % 2 === 1 ? '#f3f4f6' : '#fff', borderWidth: '1px 0 0 0', borderStyle: 'solid', borderColor: '#e5e7eb', textAlign: 'left', cursor: 'pointer', width: '100%', ...(dup ? { borderLeft: `4px solid ${dup.groupColor}` } : {}) }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.company_name || customer.name || '未命名客戶'}</span>
                    {dup && <span style={{ background: dup.groupColor, color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>重複 {(dup.matchTypes || []).map(t => t === 'name' ? '名稱' : t === 'phone' ? '電話' : '統編').join('+')}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, ...S.mono }}>{customer.customer_code || ''}</div>
                </div>
                <div style={{ fontSize: 14, color: '#374151' }}>{customer.name || '-'}</div>
                <div style={{ fontSize: 14, color: '#374151', ...S.mono }}>{customer.phone || '-'}</div>
                {!isTablet && <div style={{ fontSize: 14, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.sales_person || '-'}</div>}
              </button>
              );
            })}
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
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <CsvImportButton datasetId="erp_customers" onImported={() => load(1, search, pageSize)} compact />
          <button onClick={async () => {
            try {
              const all = await apiGet({ action: 'formal_customers', page: '1', search: '', limit: '9999', export: 'true' });
              const rows = all.customers || [];
              if (!rows.length) return;
              const headers = ['客戶代號','公司名稱','聯絡人','電話','手機','Email','負責業務','統編','地址'];
              const keys = ['customer_code','company_name','name','phone','mobile','email','sales_person','tax_id','address'];
              const csvContent = [headers.join(','), ...rows.map(r => keys.map(k => `"${(r[k] || '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
              const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `客戶主檔_${new Date().toISOString().slice(0,10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            } catch(e) { console.error('Export failed', e); }
          }} style={S.btnGhost}>匯出 CSV</button>
          <button onClick={() => { setCreating(true); setSelectedCustomerId(''); }} style={S.btnPrimary}>+ 新增客戶</button>
        </div>}
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row', alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize, spFilter)}
          placeholder="搜尋客戶代號、姓名、公司、電話、Email 或業務..."
          style={{ ...S.input, flex: 1 }}
        />
        <select
          value={spFilter}
          onChange={(e) => { setSpFilter(e.target.value); load(1, search, pageSize, e.target.value); }}
          style={{ ...S.input, width: isMobile ? '100%' : 160, flexShrink: 0 }}
        >
          <option value="">全部業務</option>
          {(data.sales_persons || []).map(sp => <option key={sp} value={sp}>{sp}</option>)}
        </select>
        <button onClick={() => load(1, search, pageSize, spFilter)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.erp_ready && (
        <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>
          目前還找不到 `erp_customers` 資料表，請先建立 ERP 客戶主檔。
        </div>
      )}
      {creating ? (
        <div style={{ ...S.card, maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <PanelHeader title="新增客戶" meta="手動建立一筆正式客戶" />
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginTop: 4, borderBottom: '1px solid #e6edf5', paddingBottom: 8 }}>基本資料</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1fr', gap: 12 }}>
              <div><label style={S.label}>客戶簡稱 *</label><input value={createForm.company_name} onChange={(e) => setCreateForm({ ...createForm, company_name: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>客戶全名</label><input value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>統一編號</label><input value={createForm.tax_id} onChange={(e) => setCreateForm({ ...createForm, tax_id: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>主聯絡人</label><input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>職稱</label><input value={createForm.job_title} onChange={(e) => setCreateForm({ ...createForm, job_title: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>業務</label><input value={createForm.sales_person} onChange={(e) => setCreateForm({ ...createForm, sales_person: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>電話</label><input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>傳真</label><input value={createForm.fax} onChange={(e) => setCreateForm({ ...createForm, fax: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>手機</label><input value={createForm.mobile} onChange={(e) => setCreateForm({ ...createForm, mobile: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>Email</label><input value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>請款客戶</label><input value={createForm.billing_customer} onChange={(e) => setCreateForm({ ...createForm, billing_customer: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>固定折扣 %</label><input type="number" value={createForm.discount_percent} onChange={(e) => setCreateForm({ ...createForm, discount_percent: e.target.value })} style={S.input} /></div>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginTop: 8, borderBottom: '1px solid #e6edf5', paddingBottom: 8 }}>發票與載具</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
              <div><label style={S.label}>發票通知手機</label><input value={createForm.invoice_mobile} onChange={(e) => setCreateForm({ ...createForm, invoice_mobile: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>發票通知 Email</label><input value={createForm.invoice_email} onChange={(e) => setCreateForm({ ...createForm, invoice_email: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>載具類別</label><input value={createForm.carrier_type} onChange={(e) => setCreateForm({ ...createForm, carrier_type: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>會員載具顯碼</label><input value={createForm.carrier_code} onChange={(e) => setCreateForm({ ...createForm, carrier_code: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>匯款帳號</label><input value={createForm.bank_account} onChange={(e) => setCreateForm({ ...createForm, bank_account: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>停止往來日</label><input type="date" value={createForm.stop_date} onChange={(e) => setCreateForm({ ...createForm, stop_date: e.target.value })} style={S.input} /></div>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginTop: 8, borderBottom: '1px solid #e6edf5', paddingBottom: 8 }}>結帳與收款</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1fr', gap: 12 }}>
              <div><label style={S.label}>結帳方式</label><select value={createForm.payment_method} onChange={(e) => setCreateForm({ ...createForm, payment_method: e.target.value })} style={S.input}><option value="">請選擇</option><option value="出貨後">出貨後</option><option value="月結">月結</option></select></div>
              <div><label style={S.label}>結帳天數</label><input type="number" value={createForm.payment_days} onChange={(e) => setCreateForm({ ...createForm, payment_days: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>收款方式</label><select value={createForm.collection_method} onChange={(e) => setCreateForm({ ...createForm, collection_method: e.target.value })} style={S.input}><option value="">請選擇</option><option value="結帳後">結帳後</option><option value="每月">每月</option></select></div>
              <div><label style={S.label}>收款日</label><input type="number" value={createForm.collection_day} onChange={(e) => setCreateForm({ ...createForm, collection_day: e.target.value })} style={S.input} /></div>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginTop: 8, borderBottom: '1px solid #e6edf5', paddingBottom: 8 }}>地址</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div><label style={S.label}>登記地址</label><input value={createForm.registered_address || createForm.address} onChange={(e) => setCreateForm({ ...createForm, registered_address: e.target.value, address: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>發票地址</label><input value={createForm.invoice_address} onChange={(e) => setCreateForm({ ...createForm, invoice_address: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>送貨地址</label><input value={createForm.shipping_address} onChange={(e) => setCreateForm({ ...createForm, shipping_address: e.target.value })} style={S.input} /></div>
              <div><label style={S.label}>營業地址</label><input value={createForm.business_address} onChange={(e) => setCreateForm({ ...createForm, business_address: e.target.value })} style={S.input} /></div>
            </div>
            <div><label style={S.label}>備註</label><textarea value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} rows={3} style={{ ...S.input, resize: 'vertical', lineHeight: 1.6 }} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={saveCreate} disabled={createSaving || !createForm.company_name.trim()} style={{ ...S.btnPrimary, padding: '10px 28px', fontSize: 14 }}>{createSaving ? '建立中...' : '建立客戶'}</button>
              <button onClick={() => setCreating(false)} style={{ ...S.btnGhost, padding: '10px 28px', fontSize: 14 }}>取消</button>
            </div>
          </div>
        </div>
      ) : isMobile ? (
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
          <div style={{ position: 'sticky', top: 80, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto', minWidth: 0 }}>
            <div style={{ ...S.card, padding: '14px 16px', overflow: 'hidden', wordBreak: 'break-word' }}>
              {detailLoading ? <Loading /> : !detailCustomer ? <EmptyState text="請先選擇一位正式客戶" /> : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{detailCustomer.company_name || detailCustomer.name || '客戶檔案'}</div>
                    <button onClick={() => editing ? setEditing(false) : startEditing()} style={{ ...S.btnGhost, fontSize: 11, padding: '3px 8px', flexShrink: 0 }}>
                      {editing ? '取消' : '編輯'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>{detailCustomer.customer_code || '-'}</span>
                    <span style={{ ...S.tag(stageMeta[detailCustomer.customer_stage]?.color || ''), fontSize: 9, padding: '1px 6px' }}>{stageMeta[detailCustomer.customer_stage]?.label || '詢問名單'}</span>
                    {detailCustomer.line_user_id ? <span style={{ ...S.tag('line'), fontSize: 9, padding: '1px 6px' }}>LINE</span> : <span style={{ ...S.tag(''), fontSize: 9, padding: '1px 6px' }}>ERP</span>}
                    {detail?.line_profile ? <span style={{ ...S.tag('green'), fontSize: 9, padding: '1px 6px' }}>{detail.line_profile.display_name || 'LINE'}</span> : null}
                  </div>
                  {editing ? (() => {
                    const sIn = { ...S.input, padding: '6px 10px', fontSize: 12, borderRadius: 8 };
                    const sLb = { fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 2, display: 'block', ...S.mono };
                    const sHd = { fontSize: 11, color: '#6b7280', fontWeight: 700, borderBottom: '1px solid #f0f0f0', paddingBottom: 3, marginTop: 6 };
                    const g3 = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 6 };
                    const fi = (label, key, opts) => <div key={key}><label style={sLb}>{label}</label>{opts ? <select value={editForm[key]} onChange={e => setEditForm({...editForm,[key]:e.target.value})} style={sIn}>{opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select> : <input type={key.includes('day') || key.includes('percent') ? 'number' : key === 'stop_date' ? 'date' : 'text'} value={editForm[key]} onChange={e => setEditForm({...editForm,[key]:e.target.value})} style={sIn} />}</div>;
                    return (
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={sHd}>基本資料</div>
                      <div style={g3}>
                        {fi('簡稱','company_name')}{fi('全名','full_name')}{fi('統編','tax_id')}
                        {fi('聯絡人','name')}{fi('職稱','job_title')}{fi('業務','sales_person')}
                        {fi('電話','phone')}{fi('傳真','fax')}{fi('手機','mobile')}
                        {fi('Email','email')}{fi('請款客戶','billing_customer')}{fi('折扣%','discount_percent')}
                      </div>
                      <div style={sHd}>發票載具</div>
                      <div style={g3}>
                        {fi('通知手機','invoice_mobile')}{fi('通知Email','invoice_email')}{fi('載具類別','carrier_type')}
                        {fi('載具顯碼','carrier_code')}{fi('匯款帳號','bank_account')}{fi('停止往來','stop_date')}
                      </div>
                      <div style={sHd}>結帳收款</div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1fr', gap: 6 }}>
                        {fi('結帳方式','payment_method',[{v:'',l:'選擇'},{v:'出貨後',l:'出貨後'},{v:'月結',l:'月結'}])}
                        {fi('天數','payment_days')}
                        {fi('收款方式','collection_method',[{v:'',l:'選擇'},{v:'結帳後',l:'結帳後'},{v:'每月',l:'每月'}])}
                        {fi('收款日','collection_day')}
                      </div>
                      <div style={sHd}>地址</div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        {fi('登記','registered_address')}{fi('送貨','shipping_address')}
                      </div>
                      <div><label style={sLb}>備註</label><textarea value={editForm.notes} onChange={e => setEditForm({...editForm,notes:e.target.value})} rows={2} style={{ ...sIn, resize: 'vertical', lineHeight: 1.4 }} /></div>
                      <button onClick={saveEdit} disabled={editSaving} style={{ ...S.btnPrimary, padding: '8px 0', fontSize: 13 }}>{editSaving ? '儲存中...' : '儲存'}</button>
                    </div>);
                  })() : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '54px 1fr', gap: '2px 6px', fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                        {[
                          ['聯絡人', (detailCustomer.name || '-') + (detailCustomer.job_title ? ` (${detailCustomer.job_title})` : '')],
                          ['電話', (detailCustomer.phone || '-') + (detailCustomer.fax ? ` / ${detailCustomer.fax}` : '')],
                          detailCustomer.mobile && detailCustomer.mobile !== '-' ? ['手機', detailCustomer.mobile] : null,
                          detailCustomer.email ? ['Email', detailCustomer.email] : null,
                          detailCustomer.tax_id ? ['統編', detailCustomer.tax_id] : null,
                          detailCustomer.sales_person ? ['業務', detailCustomer.sales_person] : null,
                          detailCustomer.discount_percent > 0 ? ['折扣', detailCustomer.discount_percent + '%'] : null,
                          ['地址', detailCustomer.registered_address || detailCustomer.address || '-'],
                          detailCustomer.shipping_address && detailCustomer.shipping_address !== (detailCustomer.registered_address || detailCustomer.address) ? ['送貨', detailCustomer.shipping_address] : null,
                        ].filter(Boolean).map(([k, v], i) => (
                          <React.Fragment key={i}>
                            <div style={{ color: '#9ca3af', fontSize: 10, ...S.mono, paddingTop: 1 }}>{k}</div>
                            <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
                          </React.Fragment>
                        ))}
                      </div>
                      {(detailCustomer.payment_method || detailCustomer.collection_method) && (
                        <div style={{ fontSize: 10, color: '#6b7280', padding: '4px 8px', background: '#f3f4f6', borderRadius: 6 }}>
                          {detailCustomer.payment_method && <span>結帳：{detailCustomer.payment_method} {detailCustomer.payment_days || 0}天</span>}
                          {detailCustomer.payment_method && detailCustomer.collection_method && <span style={{ margin: '0 4px', color: '#d1d5db' }}>|</span>}
                          {detailCustomer.collection_method && <span>收款：{detailCustomer.collection_method} {detailCustomer.collection_day || ''}日</span>}
                        </div>
                      )}
                      {detailCustomer.notes && <div style={{ fontSize: 10, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{detailCustomer.notes}</div>}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4 }}>
                    {[
                      { label: '報價', val: fmt(summary.quote_count), sub: fmtP(summary.quote_total), color: '#3b82f6' },
                      { label: '訂單', val: fmt(summary.order_count), sub: fmtP(summary.order_total), color: '#d97706' },
                      { label: '銷貨', val: fmt(summary.sale_count), sub: fmtP(summary.sales_total), color: '#10b981' },
                      { label: '毛利', val: fmtP(summary.gross_profit_total), sub: `${fmt(summary.line_message_count)} 訊息`, color: '#dc2626' },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #f0f0f0', background: '#fafafa', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#6b7280' }}>{s.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', ...S.mono }}>{s.val}</div>
                        <div style={{ fontSize: 9, color: '#9ca3af', ...S.mono }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                  {[
                    { key: 'quotes', title: '報價', data: detail?.recent_quotes, noField: 'quote_no', dateField: 'quote_date', amtField: 'total_amount', statusField: 'status', color: '#3b82f6', amtColor: '#111827' },
                    { key: 'orders', title: '訂單', data: detail?.recent_orders, noField: 'order_no', dateField: 'order_date', amtField: 'total_amount', statusField: 'status', color: '#3b82f6', amtColor: '#111827' },
                    { key: 'sales', title: '銷貨', data: detail?.recent_sales, noField: 'slip_number', dateField: 'sale_date', amtField: 'total', color: '#10b981', amtColor: '#10b981', clickable: true },
                  ].map(sec => {
                    const rows = sec.data || [];
                    if (!rows.length) return <div key={sec.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 11, color: '#9ca3af' }}><span>{sec.title}</span><span>0</span></div>;
                    const visible = rows.slice(0, expandedPanels[sec.key] ? 10 : 3);
                    return (
                      <div key={sec.key} style={{ ...S.panelMuted, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{sec.title}</span>
                          <span style={{ fontSize: 10, color: '#6b7280', ...S.mono }}>{rows.length} 筆</span>
                        </div>
                        {visible.map((row, i) => (
                          <div key={row.id || i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 4, padding: '4px 0', borderTop: '1px solid #f0f0f0', alignItems: 'center' }}>
                            {sec.clickable ? <button onClick={() => setSelectedSlipNumber(row[sec.noField])} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: sec.color, fontSize: 10, fontWeight: 700, cursor: 'pointer', ...S.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[sec.noField] || '-'}</button>
                              : <div style={{ color: sec.color, fontSize: 10, fontWeight: 700, ...S.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[sec.noField] || '-'}</div>}
                            <div style={{ color: '#6b7280', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[sec.dateField] || '-'}</div>
                            <div style={{ textAlign: 'right', color: sec.amtColor, fontSize: 10, fontWeight: 700, ...S.mono, whiteSpace: 'nowrap' }}>{fmtP(row[sec.amtField])}</div>
                          </div>
                        ))}
                        {rows.length > 3 && <button onClick={() => togglePanel(sec.key)} style={{ ...S.btnGhost, width: '100%', marginTop: 4, fontSize: 10, padding: '3px 0', textAlign: 'center' }}>{expandedPanels[sec.key] ? '收合' : `全部 ${rows.length} 筆`}</button>}
                      </div>
                    );
                  })}
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
