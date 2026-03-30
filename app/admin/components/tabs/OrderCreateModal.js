'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PanelHeader } from '../shared/ui';
import { useUnsavedGuard } from '../shared/UnsavedChangesGuard';

function todayInTaipei() {
  const now = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return new Date(taipei.getFullYear(), taipei.getMonth(), taipei.getDate());
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function OrderCreateModal({ open, onClose, onCreated, tableReady = true }) {
  const { isMobile, isTablet } = useResponsive();
  const { setDirty, confirmIfDirty } = useUnsavedGuard();
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', company_name: '', phone: '', email: '', tax_id: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [dupWarning, setDupWarning] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [productLoading, setProductLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [form, setForm] = useState(() => {
    const today = toDateInputValue(todayInTaipei());
    return {
      order_date: today,
      status: 'draft',
      remark: '',
      discount_amount: 0,
      shipping_fee: 0,
      tax_excluded: true,
      sales_person: '',
      items: [],
    };
  });

  useEffect(() => {
    apiGet({ action: 'staff_list' }).then(res => setStaffList(res.staff || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) { setDirty(false); return; }
    setError('');
    setCustomerSearch('');
    setCustomerResults([]);
    setShowNewCustomer(false);
    setSelectedCustomer(null);
    setProductSearch('');
    setProductResults([]);
  }, [open, setDirty]);

  // 追蹤表單是否有內容
  useEffect(() => {
    if (!open) return;
    const hasContent = !!(selectedCustomer || form.items.length > 0 || form.remark);
    setDirty(hasContent);
  }, [open, selectedCustomer, form.items, form.remark, setDirty]);

  const guardedClose = () => confirmIfDirty(() => { setDirty(false); onClose?.(); });

  const searchCustomers = async (term) => {
    const q = (term !== undefined ? term : customerSearch).trim();
    if (!q) { setCustomerResults([]); setShowNewCustomer(false); return; }
    setCustomerLoading(true);
    setShowNewCustomer(false);
    try {
      const result = await apiGet({ action: 'formal_customers', page: '1', limit: '10', search: q });
      const customers = result.customers || [];
      setCustomerResults(customers);
      if (customers.length === 0) {
        setShowNewCustomer(true);
      }
    } finally {
      setCustomerLoading(false);
    }
  };

  // Auto-search customers with debounce
  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerResults([]); setShowNewCustomer(false); return; }
    const timer = setTimeout(() => searchCustomers(customerSearch), 350);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  // Keep new customer name synced with search input
  useEffect(() => {
    if (showNewCustomer && customerSearch.trim()) {
      setNewCustomer(prev => ({ ...prev, name: customerSearch.trim() }));
    }
  }, [customerSearch, showNewCustomer]);

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch('');
    setCustomerResults([]);
  };

  const createCustomer = async (forceCreate = false) => {
    if (!newCustomer.name.trim()) return;
    setSavingCustomer(true);
    setDupWarning(null);
    try {
      const result = await apiPost({ action: 'quick_create_customer', ...newCustomer, force: forceCreate });
      if (result?.error === 'duplicate_found') {
        setDupWarning(result);
        setSavingCustomer(false);
        return;
      }
      if (result?.error) { alert(result.error); setSavingCustomer(false); return; }
      setSelectedCustomer(result.customer);
      setShowNewCustomer(false);
      setNewCustomer({ name: '', company_name: '', phone: '', email: '', tax_id: '' });
      setDupWarning(null);
    } catch (err) {
      alert(err.message || '建立失敗');
    } finally {
      setSavingCustomer(false);
    }
  };

  const searchProducts = async (term) => {
    const q = (term !== undefined ? term : productSearch).trim();
    if (!q) { setProductResults([]); return; }
    setProductLoading(true);
    try {
      const result = await apiGet({ action: 'products', q, category: 'all', page: '1', limit: '10', lite: 1 });
      setProductResults(result.products || []);
    } finally {
      setProductLoading(false);
    }
  };

  // Auto-search products with debounce
  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return; }
    const timer = setTimeout(() => searchProducts(productSearch), 350);
    return () => clearTimeout(timer);
  }, [productSearch]);

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
      items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item),
    }));
  };

  const removeItem = (index) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, i) => i !== index),
    }));
  };

  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.unit_price || 0)), 0);
  const taxableBase = Math.max(0, subtotal - Number(form.discount_amount || 0) + Number(form.shipping_fee || 0));
  const taxAmount = form.tax_excluded ? Math.round(taxableBase * 0.05) : 0;
  const totalAmount = taxableBase + taxAmount;

  const submit = async () => {
    if (!tableReady) {
      setError('目前尚未建立 erp_orders / erp_order_items 資料表。');
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
        action: 'create_order',
        customer_id: selectedCustomer.id,
        order_date: form.order_date,
        status: form.status,
        remark: form.remark,
        discount_amount: Number(form.discount_amount || 0),
        shipping_fee: Number(form.shipping_fee || 0),
        tax_excluded: form.tax_excluded,
        tax_amount: taxAmount,
        subtotal: subtotal,
        total_amount: totalAmount,
        sales_person: form.sales_person || null,
        items: form.items,
      });
      setDirty(false);
      onCreated?.();
      onClose?.();
    } catch (err) {
      setError(err.message || '建立訂單失敗');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={guardedClose}>
      <div style={{ width: isMobile ? '100%' : 'min(1280px, 100%)', maxHeight: isMobile ? '90vh' : '92vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: isMobile ? '16px 16px 0 0' : 14, padding: isMobile ? '12px 16px' : '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={S.eyebrow}>Create Order</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>建立訂單</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>直接建立訂單，選擇客戶與商品後即可進入出貨流程。</div>
          </div>
          <button onClick={guardedClose} style={S.btnGhost}>關閉</button>
        </div>
        {error ? <div style={{ ...S.card, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 10 }}>{error}</div> : null}
        {!tableReady ? (
          <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00', marginBottom: 10 }}>
            尚未建立 erp_orders / erp_order_items 資料表。
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr', gap: 10 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {/* 選擇客戶 */}
            <div style={{ ...S.card, minHeight: 180 }}>
              <PanelHeader title="選擇客戶" meta="先綁正式客戶，再建立訂單。" badge={selectedCustomer ? <div style={S.tag('green')}>已選客戶</div> : null} />
              {!selectedCustomer && (
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                    <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCustomers()} placeholder="搜尋公司、聯絡人或電話..." style={{ ...S.input, ...S.mobile.input, flex: 1 }} />
                    <button onClick={() => searchCustomers()} style={{ ...S.btnPrimary, ...(isMobile && S.mobile.btnPrimary) }}>搜尋</button>
                  </div>
                  {!customerLoading && customerResults.length > 0 && !showNewCustomer && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, display: 'grid', gap: 6, maxHeight: 230, overflowY: 'auto' }}>
                      {customerResults.map((customer) => {
                        const displayName = customer.company_name || customer.name || '未命名客戶';
                        const contactName = customer.name && customer.name !== customer.company_name ? customer.name : '';
                        const info = [customer.customer_code, customer.tax_id, customer.phone].filter(Boolean).join(' · ');
                        return (
                          <button key={customer.id} onClick={() => selectCustomer(customer)} style={{ ...S.panelMuted, width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid #f0f2f5', background: '#fafbfc' }}>
                            <div style={{ fontSize: 14, color: '#111827', fontWeight: 700 }}>{displayName}</div>
                            {contactName && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{contactName}</div>}
                            <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{info || '-'}</div>
                          </button>
                        );
                      })}
                      <button onClick={() => { setShowNewCustomer(true); setNewCustomer(prev => ({ ...prev, name: customerSearch.trim() })); }} style={{ ...S.panelMuted, width: '100%', textAlign: 'center', cursor: 'pointer', color: '#3b82f6', borderColor: '#93c5fd', fontSize: 13, fontWeight: 600 }}>都不是？新增客戶</button>
                    </div>
                  )}
                  {customerLoading && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 12, textAlign: 'center' }}><Loading /></div>}
                </div>
              )}
              {selectedCustomer ? (
                <div style={{ ...S.panelMuted, borderColor: '#bde6c9', background: '#f4fbf6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#10b981', fontWeight: 700, ...S.mono }}>SELECTED CUSTOMER</div>
                    <div style={{ fontSize: 16, color: '#111827', fontWeight: 700, marginTop: 6 }}>{selectedCustomer.company_name || selectedCustomer.name || '未命名客戶'}</div>
                    <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{selectedCustomer.customer_code || '-'} · {selectedCustomer.phone || '-'}</div>
                  </div>
                  <button onClick={() => setSelectedCustomer(null)} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#9ca3af', transition: 'all 0.15s' }} title="更換客戶">&times;</button>
                </div>
              ) : showNewCustomer ? (
                <div style={{ ...S.panelMuted, display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>新增客戶</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={S.label}>客戶名稱 *</label>
                      <input type="text" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="客戶名稱..." style={{ ...S.input, ...S.mobile.input }} />
                    </div>
                    <div>
                      <label style={S.label}>公司名稱</label>
                      <input type="text" value={newCustomer.company_name} onChange={(e) => setNewCustomer({ ...newCustomer, company_name: e.target.value })} placeholder="公司名稱..." style={{ ...S.input, ...S.mobile.input }} />
                    </div>
                    <div>
                      <label style={S.label}>電話</label>
                      <input type="text" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="電話..." style={{ ...S.input, ...S.mobile.input }} />
                    </div>
                    <div>
                      <label style={S.label}>統編</label>
                      <input type="text" value={newCustomer.tax_id} onChange={(e) => setNewCustomer({ ...newCustomer, tax_id: e.target.value })} placeholder="統一編號..." style={{ ...S.input, ...S.mobile.input }} />
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>電子信箱</label>
                    <input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} placeholder="電子信箱..." style={{ ...S.input, ...S.mobile.input }} />
                  </div>
                  {dupWarning && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>偵測到 {dupWarning.duplicates?.length} 筆重複客戶：</div>
                      {(dupWarning.duplicates || []).map((d, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0', color: '#374151' }}>
                          <span style={{ fontFamily: 'monospace', color: '#6b7280' }}>{d.customer_code}</span>
                          <span style={{ fontWeight: 600 }}>{d.company_name || d.name}</span>
                          <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '0px 5px', fontSize: 10, fontWeight: 700 }}>符合：{(d.matchFields || []).join('、')}</span>
                          <button onClick={() => { setSelectedCustomer({ id: d.id, customer_code: d.customer_code, company_name: d.company_name, name: d.name, phone: d.phone, tax_id: d.tax_id }); setShowNewCustomer(false); setDupWarning(null); }} style={{ ...S.btnGhost, padding: '1px 6px', fontSize: 10 }}>直接選用</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={() => createCustomer(true)} disabled={savingCustomer} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11, color: '#d97706', borderColor: '#fde68a' }}>{savingCustomer ? '建立中...' : '仍要強制建立'}</button>
                        <button onClick={() => setDupWarning(null)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11 }}>返回修改</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column-reverse' : 'row' }}>
                    <button onClick={() => createCustomer(false)} disabled={savingCustomer || !newCustomer.name.trim()} style={{ ...S.btnPrimary, ...(isMobile && S.mobile.btnPrimary), flex: 1, opacity: savingCustomer || !newCustomer.name.trim() ? 0.7 : 1 }}>{savingCustomer ? '建立中...' : '建立客戶'}</button>
                    <button onClick={() => { setShowNewCustomer(false); setNewCustomer({ name: '', company_name: '', phone: '', email: '', tax_id: '' }); setDupWarning(null); }} style={{ ...S.btnGhost, ...(isMobile && { width: '100%' }), flex: 1 }}>取消</button>
                  </div>
                </div>
              ) : !customerSearch.trim() ? <div style={{ fontSize: 12, color: '#6b7280' }}>輸入關鍵字後搜尋正式客戶，找不到會自動跳新增。</div> : null}
            </div>

            {/* 訂單明細 */}
            <div style={{ ...S.card, minHeight: 200, marginBottom: 10 }}>
              <PanelHeader title="訂單明細" meta="用商品搜尋快速加入明細，或直接調整數量與單價。" badge={<div style={S.tag('')}>{fmt(form.items.length)} 項</div>} />
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                  <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchProducts()} placeholder="搜尋料號或品名..." style={{ ...S.input, ...S.mobile.input, flex: 1, ...S.mono }} />
                  <button onClick={searchProducts} style={{ ...S.btnPrimary, ...(isMobile && S.mobile.btnPrimary) }}>找商品</button>
                </div>
                {!productLoading && productResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                    {productResults.map((product) => (
                      <button key={product.item_number} onClick={() => addProduct(product)} style={{ ...S.panelMuted, width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid #f0f2f5', background: '#fafbfc' }}>
                        <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{product.item_number}</div>
                        <div style={{ fontSize: 13, color: '#111827', marginTop: 2 }}>{product.description || '-'}</div>
                        <div style={{ fontSize: 12, color: '#10b981', marginTop: 2, ...S.mono }}>{fmtP(product.tw_reseller_price || product.tw_retail_price)}</div>
                      </button>
                    ))}
                  </div>
                )}
                {productLoading && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 12, textAlign: 'center' }}><Loading /></div>}
              </div>
              {form.items.length ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f0fdf4', borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: '#374151' }}>共 <strong>{form.items.length}</strong> 項商品</span>
                    <span style={{ color: '#10b981', fontWeight: 700, ...S.mono }}>{fmtP(subtotal)}</span>
                  </div>
                  <div style={{ maxHeight: 380, overflowY: 'auto', display: 'grid', gap: 5, paddingRight: 4 }}>
                    {form.items.map((item, index) => (
                      <div key={`${item.item_number_snapshot}-${index}`} style={{ background: '#f9fafb', border: '1px solid #f0f2f5', borderRadius: 8, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, ...S.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.item_number_snapshot || '-'}</div>
                          <div style={{ fontSize: 13, color: '#111827', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description_snapshot || '-'}</div>
                        </div>
                        <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(index, 'qty', Number(e.target.value || 1))} style={{ ...S.input, width: 52, textAlign: 'center', ...S.mono, padding: '4px 6px', fontSize: 13, flexShrink: 0 }} />
                        <input type="number" min="0" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', Number(e.target.value || 0))} style={{ ...S.input, width: 82, textAlign: 'right', ...S.mono, padding: '4px 6px', fontSize: 13, flexShrink: 0 }} />
                        <div style={{ fontSize: 13, color: '#10b981', fontWeight: 700, ...S.mono, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 72, textAlign: 'right' }}>{fmtP(Number(item.qty || 0) * Number(item.unit_price || 0))}</div>
                        <button onClick={() => removeItem(index)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 16, padding: '0 3px', lineHeight: 1, flexShrink: 0 }}>&times;</button>
                      </div>
                    ))}
                  </div>
                </>
              ) : <EmptyState text="目前還沒有商品明細，先搜尋商品加入。" />}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {/* 訂單抬頭 */}
            <div style={{ ...S.card, marginBottom: 10 }}>
              <PanelHeader title="訂單抬頭" meta="設定日期與備註。" />
              <div style={{ display: 'grid', gap: 10 }}>
                <div><label style={{ ...S.label, marginBottom: 6 }}>訂單日期</label><input type="date" value={form.order_date} onChange={(e) => setForm((current) => ({ ...current, order_date: e.target.value }))} style={{ ...S.input, ...S.mobile.input }} /></div>
                <div>
                  <label style={{ ...S.label, marginBottom: 6 }}>負責業務</label>
                  <select value={form.sales_person} onChange={(e) => setForm((current) => ({ ...current, sales_person: e.target.value }))} style={{ ...S.input, ...S.mobile.input }}>
                    <option value="">-- 選擇業務 --</option>
                    {staffList.map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div><label style={{ ...S.label, marginBottom: 6 }}>備註</label><textarea value={form.remark} onChange={(e) => setForm((current) => ({ ...current, remark: e.target.value }))} rows={4} style={{ ...S.input, ...S.mobile.input, resize: 'vertical' }} /></div>
              </div>
            </div>
            {/* 金額摘要 */}
            <div style={{ ...S.card, marginBottom: 10 }}>
              <PanelHeader title="金額摘要" meta="系統會自動算小計、稅額與總額。" />
              <div style={{ display: 'grid', gap: 10 }}>
                <div><label style={S.label}>折扣金額</label><input type="number" min="0" value={form.discount_amount} onChange={(e) => setForm((current) => ({ ...current, discount_amount: Number(e.target.value || 0) }))} style={{ ...S.input, ...S.mobile.input, ...S.mono }} /></div>
                <div><label style={S.label}>運費</label><input type="number" min="0" value={form.shipping_fee} onChange={(e) => setForm((current) => ({ ...current, shipping_fee: Number(e.target.value || 0) }))} style={{ ...S.input, ...S.mobile.input, ...S.mono }} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="order_tax_excluded" checked={form.tax_excluded} onChange={(e) => setForm(cur => ({ ...cur, tax_excluded: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#16a34a', cursor: 'pointer' }} />
                  <label htmlFor="order_tax_excluded" style={{ fontSize: 13, color: '#111827', fontWeight: 600, cursor: 'pointer' }}>稅額外加 (5%)</label>
                </div>
                <div style={{ ...S.panelMuted, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>小計</span><strong style={S.mono}>{fmtP(subtotal)}</strong></div>
                  {form.tax_excluded && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>稅額 (5%)</span><strong style={S.mono}>{fmtP(taxAmount)}</strong></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#10b981', fontWeight: 700 }}><span>總額</span><strong style={S.mono}>{fmtP(totalAmount)}</strong></div>
                </div>
                <button onClick={submit} disabled={saving || !tableReady} style={{ ...S.btnPrimary, ...S.mobile.btnPrimary, width: '100%', opacity: saving || !tableReady ? 0.7 : 1 }}>{saving ? '建立中...' : '建立訂單'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
