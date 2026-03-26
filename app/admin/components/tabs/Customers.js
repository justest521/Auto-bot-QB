'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, StatCard, PanelHeader } from '../shared/ui';

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

export default function Customers() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [data, setData] = useState({ customers: [], total: 0, page: 1, limit: 20, erp_ready: true, customer_stage_ready: false });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedLineId, setSelectedLineId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bindingLineId, setBindingLineId] = useState('');
  const [lookupKeyword, setLookupKeyword] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupError, setLookupError] = useState('');
  const [bindLoadingId, setBindLoadingId] = useState('');
  const [bindMessage, setBindMessage] = useState('');
  const [stageSaving, setStageSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    company_name: '',
    phone: '',
    email: '',
    tax_id: '',
    address: '',
    notes: '',
  });

  const load = useCallback(async (page = 1, q = search) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'customers', page: String(page), search: q });
      setData(result);

      const existingSelection = (result.customers || []).find((customer) => customer.line_user_id === selectedLineId);
      if (!existingSelection && result.customers?.[0]?.line_user_id) {
        setSelectedLineId(result.customers[0].line_user_id);
      }
      if (!result.customers?.length) {
        setSelectedLineId('');
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [search, selectedLineId]);

  useEffect(() => { load(); }, []);

  const loadDetail = useCallback(async (lineUserId) => {
    if (!lineUserId) return;
    setDetailLoading(true);
    try {
      const result = await apiGet({ action: 'customer_detail', line_user_id: lineUserId });
      setDetail(result);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLineId) {
      loadDetail(selectedLineId);
    }
  }, [selectedLineId, loadDetail]);

  useEffect(() => {
    const linked = detail?.customer?.linked_customer;
    setProfileForm({
      name: linked?.name || '',
      company_name: linked?.company_name || '',
      phone: linked?.phone || '',
      email: linked?.email || '',
      tax_id: linked?.tax_id || '',
      address: linked?.address || '',
      notes: linked?.notes || '',
    });
    setEditingProfile(false);
  }, [detail]);

  useEffect(() => {
    if (!bindMessage) return undefined;
    const timer = setTimeout(() => setBindMessage(''), 2400);
    return () => clearTimeout(timer);
  }, [bindMessage]);

  const openBinder = (customer) => {
    setBindingLineId(customer.line_user_id || '');
    setLookupKeyword(customer.display_name || '');
    setLookupResults([]);
    setLookupError('');
    setBindMessage('');
  };

  const closeBinder = () => {
    setBindingLineId('');
    setLookupKeyword('');
    setLookupResults([]);
    setLookupError('');
  };

  const lookupErpCustomers = async () => {
    const keyword = lookupKeyword.trim();
    if (!keyword) {
      setLookupError('請先輸入正式客戶姓名、公司或電話');
      setLookupResults([]);
      return;
    }

    setLookupLoading(true);
    setLookupError('');
    setBindMessage('');

    try {
      const result = await apiGet({ action: 'erp_customer_lookup', search: keyword });
      if (!result.erp_ready) {
        setLookupResults([]);
        setLookupError('尚未建立 erp_customers 資料表，請先執行 ERP schema。');
        return;
      }

      setLookupResults(result.customers || []);
      if (!result.customers?.length) {
        setLookupError('找不到符合的正式客戶，請換姓名、公司名或電話再試一次。');
      }
    } catch (error) {
      setLookupResults([]);
      setLookupError(error.message || '正式客戶查詢失敗');
    } finally {
      setLookupLoading(false);
    }
  };

  const bindCustomer = async (customer, erpCustomer) => {
    setBindLoadingId(customer.line_user_id || '');
    setLookupError('');
    setBindMessage('');

    try {
      await apiPost({
        action: 'link_line_customer',
        line_user_id: customer.line_user_id,
        display_name: customer.display_name,
        erp_customer_id: erpCustomer.id,
      });
      setBindMessage(`已綁定到正式客戶：${erpCustomer.company_name || erpCustomer.name || '未命名客戶'}`);
      closeBinder();
      await load(data.page, search);
      await loadDetail(customer.line_user_id);
    } catch (error) {
      setLookupError(error.message || '綁定失敗');
    } finally {
      setBindLoadingId('');
    }
  };

  const hasErpProfile = (customer) => Boolean(customer?.linked_customer);
  const getCustomerStage = (customer) => customer?.linked_customer?.customer_stage || 'lead';
  const stageMeta = {
    lead: { label: '詢問名單', color: 'red' },
    prospect: { label: '潛在客戶', color: '' },
    customer: { label: '正式客戶', color: 'green' },
    vip: { label: 'VIP 客戶', color: 'line' },
  };
  const isFormalCustomerBound = (customer) => {
    const linked = customer?.linked_customer;
    if (!linked) return false;

    if (linked.customer_stage) {
      return linked.customer_stage === 'customer' || linked.customer_stage === 'vip';
    }

    const hasBusinessData = Boolean(
      linked.company_name ||
      linked.phone ||
      linked.email ||
      linked.tax_id
    );

    return hasBusinessData || (linked.source && linked.source !== 'line');
  };

  const updateCustomerStage = async (customerStage) => {
    const erpCustomerId = detailCustomer?.linked_customer?.id;
    if (!erpCustomerId) return;

    setStageSaving(true);
    try {
      await apiPost({
        action: 'update_customer_stage',
        erp_customer_id: erpCustomerId,
        customer_stage: customerStage,
      });
      await load(data.page, search);
      await loadDetail(detailCustomer.line_user_id);
      setBindMessage(`已更新客戶階段：${stageMeta[customerStage]?.label || customerStage}`);
    } catch (error) {
      setLookupError(error.message || '更新客戶階段失敗');
    } finally {
      setStageSaving(false);
    }
  };

  const saveCustomerProfile = async () => {
    const erpCustomerId = detailCustomer?.linked_customer?.id;
    if (!erpCustomerId) return;

    setProfileSaving(true);
    setEditingProfile(false);
    setBindMessage('已更新正式客戶資料');
    setDetail((prev) => prev ? {
      ...prev,
      customer: {
        ...prev.customer,
        linked_customer: {
          ...prev.customer.linked_customer,
          ...profileForm,
        },
      },
    } : prev);
    try {
      await apiPost({
        action: 'update_customer_profile',
        erp_customer_id: erpCustomerId,
        profile: profileForm,
      });
      await load(data.page, search);
      await loadDetail(detailCustomer.line_user_id);
    } catch (error) {
      setLookupError(error.message || '更新客戶資料失敗');
      setEditingProfile(true);
    } finally {
      setProfileSaving(false);
    }
  };

  const selectedCustomer = data.customers.find((customer) => customer.line_user_id === selectedLineId) || data.customers[0] || null;
  const detailCustomer = detail?.customer || selectedCustomer;
  const detailSummary = detail?.summary || { message_count: 0, quote_count: 0, order_count: 0, sale_count: 0, sales_total: 0 };
  const formalProfileComplete = detail?.formal_profile_complete ?? (detailCustomer ? isFormalCustomerBound(detailCustomer) : false);
  const currentStage = getCustomerStage(detailCustomer);
  const detailPanel = (
    <div style={{ ...S.card, padding: '16px 18px', overflow: 'hidden', wordBreak: 'break-word' }}>
      {!detailCustomer ? (
        <EmptyState text="選一位客戶後，這裡會顯示客戶檔案與互動摘要" />
      ) : detailLoading ? (
        <Loading />
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{detailCustomer.display_name || '未命名客戶'}</div>
              <span style={S.tag('green')}>LINE</span>
              {detailCustomer.linked_customer
                ? <span style={S.tag(stageMeta[currentStage]?.color || '')}>{stageMeta[currentStage]?.label || '詢問名單'}</span>
                : <span style={S.tag('red')}>未綁定</span>}
            </div>
            <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
              {detailCustomer.linked_customer
                ? `${detailCustomer.linked_customer.company_name || detailCustomer.linked_customer.name || '已建立 ERP 客戶'}`
                : '目前尚未建立正式客戶連結'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6, ...S.mono }}>MSG</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{fmt(detailSummary.message_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6, ...S.mono }}>QUOTE</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', ...S.mono }}>{fmt(detailSummary.quote_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6, ...S.mono }}>ORDER</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', ...S.mono }}>{fmt(detailSummary.order_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6, ...S.mono }}>SALE</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', ...S.mono }}>{fmt(detailSummary.sale_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6, ...S.mono }}>REVENUE</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981', ...S.mono }}>{fmtP(detailSummary.sales_total)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ ...S.panelMuted, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>CUSTOMER_PROFILE</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
                <div><span style={{ color: '#6b7280', ...S.mono }}>LAST_CONTACT -</span> {fmtDate(detailCustomer.last_contact_at || detailCustomer.created_at)}</div>
                <div><span style={{ color: '#6b7280', ...S.mono }}>STATUS</span> {(detailCustomer.message_count || 0) > 1 ? '既有客戶' : '新客戶'}</div>
              </div>
            </div>

            {detailCustomer.linked_customer ? (
              <div style={{ ...S.panelMuted, background: '#f2fbf6', borderColor: '#c9edd7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#10b981', marginBottom: 8, ...S.mono }}>ERP_PROFILE</div>
                    <div style={{ fontSize: 15, color: '#111827', fontWeight: 700 }}>
                      {detailCustomer.linked_customer.company_name || detailCustomer.linked_customer.name || '未命名客戶'}
                    </div>
                  </div>
                  <button onClick={() => setEditingProfile(!editingProfile)} style={S.btnGhost}>
                    {editingProfile ? '取消編輯' : '編輯客戶資料'}
                  </button>
                </div>
                {editingProfile ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                      <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="聯絡人姓名" style={S.input} />
                      <input value={profileForm.company_name} onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })} placeholder="公司名稱" style={S.input} />
                      <input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="電話" style={S.input} />
                      <input value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="Email" style={S.input} />
                      <input value={profileForm.tax_id} onChange={(e) => setProfileForm({ ...profileForm, tax_id: e.target.value })} placeholder="統編" style={S.input} />
                      <input value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} placeholder="地址" style={S.input} />
                    </div>
                    <textarea
                      value={profileForm.notes}
                      onChange={(e) => setProfileForm({ ...profileForm, notes: e.target.value })}
                      placeholder="備註"
                      rows={3}
                      style={{ ...S.input, resize: 'vertical', lineHeight: 1.6 }}
                    />
                    <button onClick={saveCustomerProfile} style={S.btnPrimary} disabled={profileSaving}>
                      {profileSaving ? '儲存中...' : '儲存客戶資料'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
                    <div><span style={{ color: '#6b7280', ...S.mono }}>CONTACT -</span> {detailCustomer.linked_customer.name || '-'}</div>
                    <div><span style={{ color: '#6b7280', ...S.mono }}>PHONE -</span> {detailCustomer.linked_customer.phone || '-'}</div>
                    <div><span style={{ color: '#6b7280', ...S.mono }}>EMAIL -</span> {detailCustomer.linked_customer.email || '-'}</div>
                    <div><span style={{ color: '#6b7280', ...S.mono }}>TAX_ID -</span> {detailCustomer.linked_customer.tax_id || '-'}</div>
                    <div><span style={{ color: '#6b7280', ...S.mono }}>ADDRESS -</span> {detailCustomer.linked_customer.address || '-'}</div>
                    <div><span style={{ color: '#6b7280', ...S.mono }}>NOTES</span> {detailCustomer.linked_customer.notes || '-'}</div>
                  </div>
                )}
                {detail?.customer_stage_ready ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, ...S.mono }}>CUSTOMER_STAGE</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {Object.entries(stageMeta).map(([value, meta]) => (
                        <button
                          key={value}
                          onClick={() => updateCustomerStage(value)}
                          disabled={stageSaving}
                          style={{
                            ...S.btnGhost,
                            padding: '7px 12px',
                            fontSize: 12,
                            background: currentStage === value ? '#dbeafe' : '#fff',
                            borderColor: currentStage === value ? '#93c5fd' : '#e5e7eb',
                            color: currentStage === value ? '#3b82f6' : '#5b6779',
                          }}
                        >
                          {meta.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                    目前資料庫還沒有 customer_stage 欄位，若要改用明確階段判定，請先補欄位 migration。
                  </div>
                )}
                {!formalProfileComplete && (
                  <div style={{ marginTop: 8, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                    目前這筆還不是正式客戶。若要視為正式客戶，可把階段改成「正式客戶 / VIP」，並補齊公司、電話、Email 或統編。
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...S.panelMuted, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, ...S.mono }}>ERP_BINDING</div>
                    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                      目前尚未綁定正式客戶。綁定後，這位 LINE 客戶就能連到 ERP 客戶主檔、報價、訂單與銷貨資料。
                    </div>
                  </div>
                  <button onClick={() => bindingLineId === detailCustomer.line_user_id ? closeBinder() : openBinder(detailCustomer)} style={S.btnPrimary} disabled={!data.erp_ready}>
                    {bindingLineId === detailCustomer.line_user_id ? '收起綁定面板' : '綁定正式客戶'}
                  </button>
                </div>
                {bindingLineId === detailCustomer.line_user_id && (
                  <div style={{ ...S.panelMuted, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                      <input
                        value={lookupKeyword}
                        onChange={(e) => setLookupKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && lookupErpCustomers()}
                        placeholder="輸入正式客戶姓名、公司或電話..."
                        style={{ ...S.input, flex: 1 }}
                      />
                      <button onClick={lookupErpCustomers} style={S.btnGhost} disabled={lookupLoading}>
                        {lookupLoading ? '查詢中...' : '查 ERP 客戶'}
                      </button>
                    </div>
                    {lookupError && <div style={{ fontSize: 13, color: '#ef4444', lineHeight: 1.7 }}>{lookupError}</div>}
                    {lookupResults.length > 0 && (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {lookupResults.map((erpCustomer) => (
                          <div key={erpCustomer.id} style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                            <div>
                              <div style={{ fontSize: 14, color: '#111827', fontWeight: 700 }}>
                                {erpCustomer.company_name || erpCustomer.name || '未命名客戶'}
                              </div>
                      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.8, marginTop: 4 }}>
                        <div><span style={{ color: '#6b7280', ...S.mono }}>CONTACT -</span> {erpCustomer.name || '-'}</div>
                        <div><span style={{ color: '#6b7280', ...S.mono }}>PHONE -</span> {erpCustomer.phone || '-'}</div>
                        <div><span style={{ color: '#6b7280', ...S.mono }}>TAX_ID -</span> {erpCustomer.tax_id || '-'}</div>
                        {erpCustomer.customer_stage && <div><span style={{ color: '#6b7280', ...S.mono }}>STAGE</span> {stageMeta[erpCustomer.customer_stage]?.label || erpCustomer.customer_stage}</div>}
                      </div>
                    </div>
                    <button onClick={() => bindCustomer(detailCustomer, erpCustomer)} style={S.btnPrimary} disabled={bindLoadingId === detailCustomer.line_user_id}>
                              {bindLoadingId === detailCustomer.line_user_id ? '綁定中...' : '綁定這位客戶'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={S.panelMuted}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, ...S.mono }}>RECENT_MESSAGES</div>
              {detail?.recent_messages?.length ? detail.recent_messages.map((message) => (
                <div key={message.id} style={{ padding: '8px 0', borderTop: '1px solid #e6edf5' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, ...S.mono }}>{fmtDate(message.created_at)}</div>
                  <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.6 }}>{message.user_message}</div>
                </div>
              )) : <EmptyState text="目前還沒有可顯示的最近訊息" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageLead
        eyebrow="LINE"
        title="LINE 客戶"
        description="這裡專門看來自 LINE 官方帳號的客戶名單，方便做人工綁定、查訊息和對應正式客戶。"
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1, search)}
          placeholder="搜尋客戶名稱或 LINE ID..."
          style={{ ...S.input, flex: 1 }}
          onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
          onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
        />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.erp_ready && (
        <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00', padding: '14px 16px' }}>
          目前還找不到 erp_customers 資料表，人工綁定功能需要先把 docs/erp-schema-v1.sql 跑進 Supabase。
        </div>
      )}
      {bindMessage && (
        <div style={{ ...S.card, background: '#edf9f2', borderColor: '#bdeccb', color: '#127248', padding: '14px 16px' }}>
          {bindMessage}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, ...S.mono }}>共 {data.total} 位客戶</div>
      {loading ? <Loading /> : data.customers.length === 0 ? <EmptyState text="目前沒有符合條件的客戶資料" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1.25fr) minmax(340px, 0.9fr)', gap: 16, alignItems: 'start' }}>
          <div style={S.card}>
            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) 110px 150px 110px', gap: 12, padding: '0 10px 10px', borderBottom: '1px solid #e6edf5', marginBottom: 8, color: '#6b7280', fontSize: 12, fontWeight: 600, ...S.mono }}>
                <div>客戶</div>
                <div>狀態</div>
                <div>ERP</div>
                <div style={{ textAlign: 'right' }}>訊息數</div>
              </div>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {data.customers.map((customer) => {
                const selected = customer.line_user_id === selectedLineId;
                return (
                  <button
                    key={customer.id || customer.line_user_id}
                    onClick={() => setSelectedLineId(customer.line_user_id || '')}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: selected ? '#dbeafe' : '#fff',
                      border: `1px solid ${selected ? '#93c5fd' : '#e5e7eb'}`,
                      borderRadius: 12,
                      padding: '12px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : 'minmax(0, 1.6fr) 110px 150px 110px', gap: 12, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 15, color: '#111827', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {customer.display_name || '未命名客戶'}
                          </span>
                          <span style={S.tag('green')}>LINE</span>
                        </div>
                      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                          {customer.linked_customer
                            ? `${customer.linked_customer.company_name || customer.linked_customer.name || '已建立 ERP 客戶'}`
                            : '尚未綁定正式客戶'}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: (customer.message_count || 0) > 1 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                        {(customer.message_count || 0) > 1 ? '既有客戶' : '新客戶'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {hasErpProfile(customer)
                          ? <span style={S.tag(stageMeta[getCustomerStage(customer)]?.color || '')}>
                              {stageMeta[getCustomerStage(customer)]?.label || '詢問名單'}
                            </span>
                          : <span style={S.tag('red')}>未綁定</span>}
                      </div>
                      <div style={{ textAlign: isMobile ? 'left' : 'right', fontSize: 16, color: '#3b82f6', fontWeight: 700, ...S.mono }}>
                        {fmt(customer.message_count)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ position: isTablet ? 'relative' : 'sticky', top: isTablet ? 'auto' : 80, maxHeight: isTablet ? 'none' : 'calc(100vh - 96px)', overflowY: isTablet ? 'visible' : 'auto', minWidth: 0 }}>
              {detailPanel}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
        {data.page > 1 && <button onClick={() => load(data.page - 1)} style={S.btnGhost}>← 上一頁</button>}
        <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{data.page}</span>
        {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={S.btnGhost}>下一頁 →</button>}
      </div>
    </div>
  );
}

/* ========================================= PRODUCT SEARCH ========================================= */
function ProductSearch() {
}
