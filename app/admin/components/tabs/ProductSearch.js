'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
import { useResponsive } from '@/lib/admin/helpers';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, CsvImportButton, StatusBanner, ProductEditModal, CategoryComboBox } from '../shared/ui';

export default function ProductSearch() {
  const { isMobile, isTablet } = useResponsive();
  const STATUS_OPTIONS = ['all', 'Current', 'New Announced', 'Legacy', 'Discontinued'];
  const STATUS_LABEL = { Current: '上架中', 'New Announced': '新品預告', Legacy: '舊型', Discontinued: '已停產' };
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [products, setProducts] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
  const [summary, setSummary] = useState({ total_products: 0, current_products: 0, replacement_products: 0, category_count: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [snaponStock, setSnaponStock] = useState({});
  const [editingProduct, setEditingProduct] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({ item_number: '', description: '', tw_retail_price: '', tw_reseller_price: '', us_price: '', category: 'other', product_status: 'Current' });
  const PAGE_SIZE = 25;
  const tableRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        setExpanded(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doSearch = useCallback(async (q, cat, status, pg = 1) => {
    setLoading(true);
    const data = await apiGet({
      action: 'products',
      q: q || '',
      category: cat || 'all',
      status: status || 'all',
      page: String(pg),
      limit: String(PAGE_SIZE),
    });
    setProducts(data.products || []);
    setTotal(data.total || 0);
    setSummary(data.summary || { total_products: 0, current_products: 0, replacement_products: 0, category_count: 0 });
    if (data.categories && data.categories.length > 0) setDbCategories(data.categories);
    setLoading(false);
  }, []);

  useEffect(() => { const timer = setTimeout(() => { setPage(1); doSearch(search, category, statusFilter, 1); }, 300); return () => clearTimeout(timer); }, [search, category, statusFilter, doSearch]);

  useEffect(() => {
    if (!expanded) return;
    if (snaponStock[expanded]) return;
    setSnaponStock(prev => ({ ...prev, [expanded]: { loading: true } }));
    fetch(`/api/snapon-stock?item=${encodeURIComponent(expanded)}`)
      .then(r => r.json())
      .then(data => setSnaponStock(prev => ({ ...prev, [expanded]: { ...data, loading: false } })))
      .catch(() => setSnaponStock(prev => ({ ...prev, [expanded]: { stock_status: 'error', stock_message: '查詢失敗', loading: false } })));
  }, [expanded]);

  const goPage = (pg) => { setPage(pg); doSearch(search, category, statusFilter, pg); };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageLead
        eyebrow="Product Master"
        title="商品主檔"
        description="這裡是正式 ERP 商品主檔，不只是查價，也用來維護商品狀態、分類、替代型號與價格。"
        action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <CsvImportButton datasetId="quickbuy_products" onImported={() => doSearch(search, category, statusFilter, page)} compact />
          <button onClick={async () => {
            const all = await apiGet({ action: 'products', q: '', category: 'all', status: 'all', page: '1', limit: '999999', export: 'true' });
            const rows = all.products || [];
            const headers = ['品號','品名','美國原價','牌價','進貨價','狀態','分類','替代型號','產地','重量'];
            const keys = ['item_number','description','us_price','tw_retail_price','tw_reseller_price','product_status','category','replacement_model','origin_country','weight_kg'];
            const csvContent = [headers.join(','), ...rows.map(r => keys.map(k => `"${(r[k] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `商品主檔_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
          }} style={S.btnGhost}>匯出 CSV</button>
          <button onClick={() => setShowAddForm(true)} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), minHeight: isMobile ? 44 : 'auto' }}>+ 新增商品</button>
        </div>}
      />
      {saveMessage ? <StatusBanner text={saveMessage} tone="success" /> : null}
      {showAddForm && (
        <div style={{ ...S.card, borderColor: '#93c5fd', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>新增商品</div>
            <button onClick={() => setShowAddForm(false)} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 12 }}>取消</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
            <div><label style={S.label}>品號 *</label><input value={newProduct.item_number} onChange={e => setNewProduct(p => ({ ...p, item_number: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} placeholder="例：FDX71" /></div>
            <div style={{ gridColumn: isMobile ? 'auto' : 'span 3' }}><label style={S.label}>品名 *</label><input value={newProduct.description} onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} placeholder="商品描述" /></div>
            <div><label style={S.label}>牌價</label><input type="number" value={newProduct.tw_retail_price} onChange={e => setNewProduct(p => ({ ...p, tw_retail_price: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} placeholder="0" /></div>
            <div><label style={S.label}>進貨價</label><input type="number" value={newProduct.tw_reseller_price} onChange={e => setNewProduct(p => ({ ...p, tw_reseller_price: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} placeholder="0" /></div>
            <div><label style={S.label}>US PRICE</label><input type="number" value={newProduct.us_price} onChange={e => setNewProduct(p => ({ ...p, us_price: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} placeholder="0" /></div>
            <div><label style={S.label}>分類</label>
              <CategoryComboBox value={newProduct.category} onChange={v => setNewProduct(p => ({ ...p, category: v }))} categories={dbCategories} />
            </div>
          </div>
          <button onClick={async () => {
            if (!newProduct.item_number.trim() || !newProduct.description.trim()) { setSaveMessage('品號和品名為必填'); setTimeout(() => setSaveMessage(''), 3000); return; }
            try {
              await apiPost({ action: 'create_product', product: { ...newProduct, tw_retail_price: Number(newProduct.tw_retail_price) || 0, tw_reseller_price: Number(newProduct.tw_reseller_price) || 0, us_price: Number(newProduct.us_price) || 0 } });
              setSaveMessage(`商品 ${newProduct.item_number} 已新增`);
              setNewProduct({ item_number: '', description: '', tw_retail_price: '', tw_reseller_price: '', us_price: '', category: 'other', product_status: 'Current' });
              setShowAddForm(false);
              doSearch(search, category, statusFilter, page);
              setTimeout(() => setSaveMessage(''), 3000);
            } catch (err) { setSaveMessage(`新增失敗: ${err.message}`); setTimeout(() => setSaveMessage(''), 5000); }
          }} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), minHeight: isMobile ? 44 : 'auto' }}>確認新增</button>
        </div>
      )}
      <div style={{ ...S.statGrid, ...(isMobile ? S.mobile.statGrid : {}), marginBottom: 10 }}>
        <div style={S.panelMuted}><div style={S.label}>TOTAL_PRODUCTS</div><div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, color: '#111827', ...S.mono }}>{fmt(summary.total_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>CURRENT</div><div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, color: '#10b981', ...S.mono }}>{fmt(summary.current_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>WITH_REPLACEMENT</div><div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{fmt(summary.replacement_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>CATEGORIES</div><div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, color: '#111827', ...S.mono }}>{fmt(summary.category_count)}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋料號或關鍵字... (例: FDX71, wrench)" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), flex: 1, ...S.mono, minHeight: isMobile ? 44 : 'auto' }} onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 180, minHeight: isMobile ? 44 : 'auto' }}>
          <option value="all">全部分類</option>
          {dbCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 150, minHeight: isMobile ? 44 : 'auto' }}>
          {STATUS_OPTIONS.map((value) => <option key={value} value={value}>{value === 'all' ? '全部狀態' : STATUS_LABEL[value] || value}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, ...S.mono, display: 'flex', alignItems: 'center', gap: 8 }}>
        主檔共 {fmt(total)} 筆 {totalPages > 1 && `· P${page}/${totalPages}`}
        {loading && <span style={{ color: '#3b82f6', fontSize: 11 }}>搜尋中...</span>}
      </div>
      {!loading && products.length === 0 ? <EmptyState text={search ? '找不到符合的產品' : '輸入料號或關鍵字開始搜尋'} /> : (
        <div ref={tableRef} style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s', pointerEvents: loading ? 'none' : 'auto', overflowX: isMobile ? 'auto' : 'visible' }}>
          {!isMobile && <div style={{ display: 'flex', padding: '8px 16px', fontSize: 12, fontWeight: 600, color: '#6b7280', ...S.mono, borderBottom: '1px solid #dbe3ee', marginBottom: 4 }}>
            <div style={{ width: 150 }}>ITEM_NO</div><div style={{ width: 36 }}></div><div style={{ flex: 1 }}>DESCRIPTION</div><div style={{ width: 120, textAlign: 'center' }}>分類</div><div style={{ width: 80, textAlign: 'center' }}>狀態</div><div style={{ width: 100, textAlign: 'right' }}>牌價</div><div style={{ width: 100, textAlign: 'right' }}>進貨價</div><div style={{ width: 80, textAlign: 'center' }}>操作</div>
          </div>}
          {products.map(p => (
            <div key={p.item_number}>
              <div onClick={() => setExpanded(expanded === p.item_number ? null : p.item_number)} style={{ ...S.card, cursor: 'pointer', padding: isMobile ? '8px 12px' : '10px 16px', marginBottom: 10, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0, borderColor: expanded === p.item_number ? '#93c5fd' : '#e5e7eb', minHeight: isMobile ? 44 : 'auto' }}>
                <div style={{ width: isMobile ? '100%' : 150, fontWeight: 700, color: '#3b82f6', fontSize: 14, ...S.mono, flexShrink: 0 }}>{p.item_number}</div>
                <div style={{ width: 36, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.image_url ? <a href={`https://shop.snapon.com/product/${p.item_number}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ width: 28, height: 28, borderRadius: 4, overflow: 'hidden', background: '#f9fafb', border: '1px solid #e5e7eb', display: 'block' }}><img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} /></a> : null}
                </div>
                <div style={{ flex: 1, width: isMobile ? '100%' : 'auto', fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap', minWidth: 0 }}>{p.description}</div>
                <div style={{ width: isMobile ? '100%' : 120, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'center', whiteSpace: 'nowrap', flexShrink: 0 }}>{p.category && <span style={{ ...S.tag(''), fontSize: 10, whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.category}</span>}</div>
                <div style={{ width: isMobile ? '100%' : 80, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'center', flexShrink: 0 }}><span style={S.tag(String(p.product_status || '').toLowerCase() === 'current' ? 'green' : String(p.product_status || '').toLowerCase() === 'new announced' ? 'red' : '')}>{STATUS_LABEL[p.product_status] || p.product_status || '-'}</span></div>
                <div style={{ width: isMobile ? '100%' : 100, textAlign: isMobile ? 'left' : 'right', fontSize: 14, color: '#111827', ...S.mono, flexShrink: 0 }}>{isMobile ? `牌價 ${fmtP(p.tw_retail_price)}` : fmtP(p.tw_retail_price)}</div>
                <div style={{ width: isMobile ? '100%' : 100, textAlign: isMobile ? 'left' : 'right', fontSize: 14, color: p.tw_reseller_price ? '#f59e0b' : '#9ca3af', fontWeight: 600, ...S.mono, flexShrink: 0 }}>{p.tw_reseller_price ? (isMobile ? `進貨 ${fmtP(p.tw_reseller_price)}` : fmtP(p.tw_reseller_price)) : '-'}</div>
                <div style={{ width: isMobile ? '100%' : 80, display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'center', flexShrink: 0 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingProduct(p); }}
                    style={{ ...S.btnGhost, padding: isMobile ? '8px 12px' : '6px 10px', fontSize: isMobile ? 12 : 12, minHeight: isMobile ? 40 : 'auto' }}
                  >
                    編輯
                  </button>
                </div>
              </div>
              {expanded === p.item_number && (
                <div style={{ background: '#eff6ff', border: '1px solid #dbe6f3', borderRadius: 10, padding: isMobile ? '8px 12px' : '10px 16px', marginBottom: 10, marginTop: -2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {p.image_url && <a href={`https://shop.snapon.com/product/${p.item_number}`} target="_blank" rel="noopener noreferrer" style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', display: 'block', cursor: 'pointer' }}><img src={p.image_url} alt={p.item_number} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} onError={(e) => { e.target.parentElement.style.display = 'none'; }} /></a>}
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  <div><div style={S.label}>US PRICE</div><div style={{ color: '#374151', fontSize: 14, ...S.mono }}>{p.us_price ? `$${Number(p.us_price).toFixed(2)}` : '-'}</div></div>
                  <div><div style={S.label}>牌價</div><div style={{ color: '#111827', fontSize: 14, ...S.mono }}>{fmtP(p.tw_retail_price)}</div></div>
                  <div><div style={S.label}>進貨價</div><div style={{ color: '#f59e0b', fontSize: 14, fontWeight: 700, ...S.mono }}>{fmtP(p.tw_reseller_price)}</div></div>
                  <div><div style={S.label}>毛利率</div><div style={{ color: p.tw_retail_price > 0 && p.tw_reseller_price > 0 ? '#10b981' : '#9ca3af', fontSize: 14, fontWeight: 700, ...S.mono }}>{p.tw_retail_price > 0 && p.tw_reseller_price > 0 ? `${Math.round((1 - p.tw_reseller_price / p.tw_retail_price) * 100)}%` : '-'}</div></div>
                  <div><div style={S.label}>狀態</div><div style={{ color: '#374151', fontSize: 14 }}>{STATUS_LABEL[p.product_status] || p.product_status || '-'}</div></div>
                  <div><div style={S.label}>重量</div><div style={{ color: '#374151', fontSize: 14, ...S.mono }}>{p.weight_kg ? `${p.weight_kg} kg` : '-'}</div></div>
                  <div><div style={S.label}>產地</div><div style={{ color: '#374151', fontSize: 14, ...S.mono }}>{p.origin_country || '-'}</div></div>
                  <div><div style={S.label}>替代型號</div><div style={{ color: p.replacement_model ? '#3b82f6' : '#6b7280', fontSize: 14, ...S.mono }}>{p.replacement_model || '-'}</div></div>
                  <div><div style={S.label}>美國庫存</div><div style={{ fontSize: 13 }}>{(() => {
                    const ss = snaponStock[p.item_number];
                    if (!ss || ss.loading) return <span style={{ color: '#9ca3af', fontSize: 12 }}>查詢中...</span>;
                    const colors = { in_stock: '#10b981', backordered: '#f59e0b', discontinued: '#ef4444', out_of_stock: '#ef4444', unknown: '#9ca3af', error: '#9ca3af' };
                    return <span style={{ color: colors[ss.stock_status] || '#9ca3af', fontWeight: 600 }}>{ss.stock_message || '-'}</span>;
                  })()}</div></div>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {page > 1 && <button onClick={() => goPage(page - 1)} style={{ ...S.btnGhost, minHeight: isMobile ? 40 : 'auto' }}>← 上一頁</button>}
            <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page}/{totalPages}</span>
            {page < totalPages && <button onClick={() => goPage(page + 1)} style={{ ...S.btnGhost, minHeight: isMobile ? 40 : 'auto' }}>下一頁 →</button>}
          </div>
        </div>
      )}
      <ProductEditModal
        key={editingProduct?.item_number || ''}
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        categories={dbCategories}
        onSaved={async () => {
          setSaveMessage(`商品 ${editingProduct?.item_number || ''} 已更新`);
          await doSearch(search, category, statusFilter, page);
          setTimeout(() => setSaveMessage(''), 3000);
        }}
      />
    </div>
  );
}
