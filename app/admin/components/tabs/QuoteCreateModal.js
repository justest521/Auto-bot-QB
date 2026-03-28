'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP } from '@/lib/admin/helpers';
import { Loading, EmptyState, PanelHeader } from '../shared/ui';

function getPresetDateRange(preset) {
  const todayInTaipei = () => {
    const now = new Date();
    const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    return new Date(taipei.getFullYear(), taipei.getMonth(), taipei.getDate());
  };
  
  const today = todayInTaipei();
  const start = new Date(today);
  const end = new Date(today);

  if (preset === 'week') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
  } else if (preset === 'month') {
    start.setDate(1);
  } else if (preset === 'quarter') {
    const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(quarterStartMonth, 1);
  } else if (preset === 'year') {
    start.setMonth(0, 1);
  }

  return {
    from: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    to: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
  };
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayInTaipei() {
  const now = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return new Date(taipei.getFullYear(), taipei.getMonth(), taipei.getDate());
}

export function QuoteCreateModal({ open, onClose, onCreated, tableReady = true }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', company_name: '', phone: '', email: '', tax_id: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [productLoading, setProductLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => {
    const today = getPresetDateRange('today').from;
    const validDate = new Date(todayInTaipei());
    validDate.setMonth(validDate.getMonth() + 1);
    const validUntil = toDateInputValue(validDate);
    return {
      quote_date: today,
      valid_until: validUntil,
      status: 'draft',
      remark: '',
      discount_amount: 0,
      shipping_fee: 0,
      tax_excluded: true,
      items: [],
    };
  });

  // Only clear error when reopening — keep all other state (customer, items, form) intact
  useEffect(() => {
    if (open) setError('');
  }, [open]);

  // Full reset — call after successful creation
  const resetAll = () => {
    setCustomerSearch('');
    setCustomerResults([]);
    setShowNewCustomer(false);
    setSelectedCustomer(null);
    setNewCustomer({ name: '', company_name: '', phone: '', email: '', tax_id: '' });
    setProductSearch('');
    setProductResults([]);
    setError('');
    const today = getPresetDateRange('today').from;
    const validDate = new Date(todayInTaipei());
    validDate.setMonth(validDate.getMonth() + 1);
    const validUntil = toDateInputValue(validDate);
    setForm({ quote_date: today, valid_until: validUntil, status: 'draft', remark: '', discount_amount: 0, shipping_fee: 0, tax_excluded: true, items: [] });
  };

  const searchCustomers = async (term) => {
    const q = (term !== undefined ? term : customerSearch).trim();
    if (!q) {
      setCustomerResults([]);
      setShowNewCustomer(false);
      return;
    }
    setCustomerLoading(true);
    setShowNewCustomer(false);
    try {
      const result = await apiGet({ action: 'formal_customers', page: '1', limit: '10', search: q });
      const customers = result.customers || [];
      setCustomerResults(customers);
      // No results → auto show add customer form
      if (customers.length === 0) {
        setShowNewCustomer(true);
      }
    } finally {
      setCustomerLoading(false);
    }
  };

  // Auto-search with debounce as user types
  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomerResults([]);
      setShowNewCustomer(false);
      return;
    }
    const timer = setTimeout(() => searchCustomers(customerSearch), 350);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  // Keep new customer name synced with search input (avoid stale debounce values)
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

  const createCustomer = async () => {
    if (!newCustomer.name.trim()) return;
    setSavingCustomer(true);
    try {
      const result = await apiPost({ action: 'quick_create_customer', ...newCustomer });
      setSelectedCustomer(result.customer);
      setShowNewCustomer(false);
      setNewCustomer({ name: '', company_name: '', phone: '', email: '', tax_id: '' });
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
  const taxAmount = form.tax_excluded ? Math.round(taxableBase * 0.05) : 0;
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
        tax_excluded: form.tax_excluded,
        items: form.items,
      });
      resetAll();
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
      <div style={{ width: 'min(1280px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={S.eyebrow}>Create Quote</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>建立報價單</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>先建立基本報價單，之後就能往訂單與銷貨流程接。</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(selectedCustomer || form.items.length > 0) && <button onClick={() => { if (confirm('確定清除所有已填資料？')) resetAll(); }} style={{ ...S.btnGhost, fontSize: 12, color: '#ef4444', borderColor: '#fecaca' }}>清除</button>}
            <button onClick={onClose} style={S.btnGhost}>關閉</button>
          </div>
        </div>
        {error ? <div style={{ ...S.card, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 10 }}>{error}</div> : null}
        {!tableReady ? (
          <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00', marginBottom: 10 }}>
            目前尚未建立 `erp_quotes` / `erp_quote_items`，請先跑 [`/Users/tungyiwu/Desktop/AI/Auto QB/Auto-bot-QB/docs/erp-schema-v1.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-schema-v1.sql)。
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 10 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ ...S.card, minHeight: 180 }}>
              <PanelHeader title="選擇客戶" meta="先綁正式客戶，再建立報價。" badge={selectedCustomer ? <div style={S.tag('green')}>已選客戶</div> : null} />
              {!selectedCustomer && (
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCustomers()} placeholder="搜尋公司、聯絡人或電話..." style={{ ...S.input, flex: 1 }} />
                    <button onClick={() => searchCustomers()} style={S.btnPrimary}>搜尋</button>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={S.label}>客戶名稱 *</label>
                      <input type="text" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="客戶名稱..." style={S.input} />
                    </div>
                    <div>
                      <label style={S.label}>公司名稱</label>
                      <input type="text" value={newCustomer.company_name} onChange={(e) => setNewCustomer({ ...newCustomer, company_name: e.target.value })} placeholder="公司名稱..." style={S.input} />
                    </div>
                    <div>
                      <label style={S.label}>電話</label>
                      <input type="text" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="電話..." style={S.input} />
                    </div>
                    <div>
                      <label style={S.label}>統編</label>
                      <input type="text" value={newCustomer.tax_id} onChange={(e) => setNewCustomer({ ...newCustomer, tax_id: e.target.value })} placeholder="統一編號..." style={S.input} />
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>電子信箱</label>
                    <input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} placeholder="電子信箱..." style={S.input} />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={createCustomer} disabled={savingCustomer || !newCustomer.name.trim()} style={{ ...S.btnPrimary, flex: 1, opacity: savingCustomer || !newCustomer.name.trim() ? 0.7 : 1 }}>{savingCustomer ? '建立中...' : '建立客戶'}</button>
                    <button onClick={() => { setShowNewCustomer(false); setNewCustomer({ name: '', company_name: '', phone: '', email: '', tax_id: '' }); }} style={{ ...S.btnGhost, flex: 1 }}>取消</button>
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ ...S.card, minHeight: 200, marginBottom: 10 }}>
              <PanelHeader title="報價明細" meta="用商品搜尋快速加入明細，或直接調整數量與單價。" badge={<div style={S.tag('')}>{fmt(form.items.length)} 項</div>} />
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchProducts()} placeholder="搜尋料號或品名..." style={{ ...S.input, flex: 1, ...S.mono }} />
                  <button onClick={searchProducts} style={S.btnPrimary}>找商品</button>
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
            <div style={{ ...S.card, marginBottom: 10 }}>
              <PanelHeader title="報價抬頭" meta="設定日期、狀態與補充備註。" />
              <div style={{ display: 'grid', gap: 10 }}>
                <div><label style={{ ...S.label, marginBottom: 6 }}>報價日期</label><input type="date" value={form.quote_date} onChange={(e) => setForm((current) => ({ ...current, quote_date: e.target.value }))} style={S.input} /></div>
                <div><label style={{ ...S.label, marginBottom: 6 }}>有效期限</label><input type="date" value={form.valid_until} onChange={(e) => setForm((current) => ({ ...current, valid_until: e.target.value }))} style={S.input} /></div>
                <div><label style={{ ...S.label, marginBottom: 6 }}>備註</label><textarea value={form.remark} onChange={(e) => setForm((current) => ({ ...current, remark: e.target.value }))} rows={4} style={{ ...S.input, resize: 'vertical' }} /></div>
              </div>
            </div>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <PanelHeader title="金額摘要" meta="系統會自動算小計、稅額與總額。" />
              <div style={{ display: 'grid', gap: 10 }}>
                <div><label style={S.label}>折扣金額</label><input type="number" min="0" value={form.discount_amount} onChange={(e) => setForm((current) => ({ ...current, discount_amount: Number(e.target.value || 0) }))} style={{ ...S.input, ...S.mono }} /></div>
                <div><label style={S.label}>運費</label><input type="number" min="0" value={form.shipping_fee} onChange={(e) => setForm((current) => ({ ...current, shipping_fee: Number(e.target.value || 0) }))} style={{ ...S.input, ...S.mono }} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="tax_excluded" checked={form.tax_excluded} onChange={(e) => setForm(cur => ({ ...cur, tax_excluded: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#16a34a', cursor: 'pointer' }} />
                  <label htmlFor="tax_excluded" style={{ fontSize: 13, color: '#111827', fontWeight: 600, cursor: 'pointer' }}>稅額外加 (5%)</label>
                </div>
                <div style={{ ...S.panelMuted, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>小計</span><strong style={S.mono}>{fmtP(subtotal)}</strong></div>
                  {form.tax_excluded && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>稅額 (5%)</span><strong style={S.mono}>{fmtP(taxAmount)}</strong></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#10b981', fontWeight: 700 }}><span>總額</span><strong style={S.mono}>{fmtP(totalAmount)}</strong></div>
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
