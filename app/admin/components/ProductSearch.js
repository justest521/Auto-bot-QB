'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { S } from '../shared/styles';
import { fmt, fmtP, fmtDate, fmtMs, getPresetDateRange, toDateInputValue, todayInTaipei } from '../shared/formatters';
import { apiGet, apiPost, SALES_DOCUMENT_FOCUS_KEY } from '../shared/api';
import { Loading, EmptyState, StatusBanner, PageLead, Pager, PanelHeader, CsvImportButton, ProductEditModal } from '../shared/ui';

export function ProductSearch() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const CATS = { all: '全部', wrench: '扳手', socket: '套筒', ratchet: '棘輪', screwdriver: '螺絲起子', plier: '鉗子', power_tool: '電動工具', torque_wrench: '扭力扳手', storage: '工具車/收納', light: '照明', diagnostic: '診斷', battery: '電池', tester: '測試儀', borescope: '內視鏡', jack_lift: '千斤頂', torque_multiplier: '扭力倍增器', tire_inflator: '打氣機', other: '其他' };
  const STATUS_OPTIONS = ['all', 'Current', 'Legacy', 'Discontinued'];
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState({ total_products: 0, current_products: 0, replacement_products: 0, category_count: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const PAGE_SIZE = 25;

  const doSearch = useCallback(async (q, cat, status, pg = 0) => {
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
    setLoading(false);
  }, []);

  useEffect(() => { const timer = setTimeout(() => { setPage(0); doSearch(search, category, statusFilter, 0); }, 300); return () => clearTimeout(timer); }, [search, category, statusFilter, doSearch]);
  const goPage = (pg) => { setPage(pg); doSearch(search, category, statusFilter, pg); };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageLead
        eyebrow="Product Master"
        title="商品主檔"
        description="這裡是正式 ERP 商品主檔，不只是查價，也用來維護商品狀態、分類、替代型號與價格。"
        action={<CsvImportButton datasetId="quickbuy_products" onImported={() => doSearch(search, category, statusFilter, page)} compact />}
      />
      {saveMessage ? <StatusBanner text={saveMessage} tone="success" /> : null}
      <div style={{ ...S.statGrid, marginBottom: 18 }}>
        <div style={S.panelMuted}><div style={S.label}>TOTAL_PRODUCTS</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(summary.total_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>CURRENT</div><div style={{ fontSize: 26, fontWeight: 700, color: '#129c59', ...S.mono }}>{fmt(summary.current_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>WITH_REPLACEMENT</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1976f3', ...S.mono }}>{fmt(summary.replacement_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>CATEGORIES</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(summary.category_count)}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋料號或關鍵字... (例: FDX71, wrench)" style={{ ...S.input, flex: 1, ...S.mono }} onFocus={e => e.target.style.borderColor = '#1976f3'} onBlur={e => e.target.style.borderColor = '#ccd6e3'} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, width: isMobile ? '100%' : 150 }}>
          {STATUS_OPTIONS.map((value) => <option key={value} value={value}>{value === 'all' ? '全部狀態' : value}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {Object.entries(CATS).map(([key, label]) => (
          <button key={key} onClick={() => setCategory(key)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, color: category === key ? '#1976f3' : '#66768a', borderColor: category === key ? '#94c3ff' : '#d6deea', background: category === key ? '#edf5ff' : '#fff' }}>{label}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>主檔共 {fmt(total)} 筆 {totalPages > 1 && `· P${page + 1}/${totalPages}`}</div>
      {loading ? <Loading /> : products.length === 0 ? <EmptyState text={search ? '找不到符合的產品' : '輸入料號或關鍵字開始搜尋'} /> : (
        <>
          {!isMobile && <div style={{ display: 'flex', padding: '8px 16px', fontSize: 10, color: '#7b889b', ...S.mono, borderBottom: '1px solid #dbe3ee', marginBottom: 4 }}>
            <div style={{ width: 150 }}>ITEM_NO</div><div style={{ flex: 1 }}>DESCRIPTION</div><div style={{ width: 90, textAlign: 'right' }}>分類</div><div style={{ width: 110, textAlign: 'right' }}>狀態</div><div style={{ width: 100, textAlign: 'right' }}>牌價</div><div style={{ width: 100, textAlign: 'right' }}>經銷價</div><div style={{ width: 96, textAlign: 'right' }}>操作</div>
          </div>}
          {products.map(p => (
            <div key={p.item_number}>
              <div onClick={() => setExpanded(expanded === p.item_number ? null : p.item_number)} style={{ ...S.card, cursor: 'pointer', padding: '10px 16px', marginBottom: 2, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0, borderColor: expanded === p.item_number ? '#94c3ff' : '#dbe3ee' }}>
                <div style={{ width: isMobile ? '100%' : 150, fontWeight: 700, color: '#1976f3', fontSize: 13, ...S.mono }}>{p.item_number}</div>
                <div style={{ flex: 1, width: isMobile ? '100%' : 'auto', fontSize: 12, color: '#5f6f83', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>{p.description}</div>
                <div style={{ width: isMobile ? '100%' : 90, textAlign: isMobile ? 'left' : 'right' }}>{p.category && p.category !== 'other' && <span style={{ ...S.tag(''), fontSize: 10 }}>{CATS[p.category] || p.category}</span>}</div>
                <div style={{ width: isMobile ? '100%' : 110, textAlign: isMobile ? 'left' : 'right' }}><span style={S.tag(String(p.product_status || '').toLowerCase() === 'current' ? 'green' : '')}>{p.product_status || '-'}</span></div>
                <div style={{ width: isMobile ? '100%' : 100, textAlign: isMobile ? 'left' : 'right', fontSize: 13, color: '#273346', ...S.mono }}>{isMobile ? `牌價 ${fmtP(p.tw_retail_price)}` : fmtP(p.tw_retail_price)}</div>
                <div style={{ width: isMobile ? '100%' : 100, textAlign: isMobile ? 'left' : 'right', fontSize: 13, color: '#129c59', fontWeight: 700, ...S.mono }}>{isMobile ? `經銷價 ${fmtP(p.tw_reseller_price)}` : fmtP(p.tw_reseller_price)}</div>
                <div style={{ width: isMobile ? '100%' : 96, textAlign: isMobile ? 'left' : 'right' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingProduct(p); }}
                    style={{ ...S.btnGhost, padding: '6px 10px', fontSize: 12 }}
                  >
                    編輯
                  </button>
                </div>
              </div>
              {expanded === p.item_number && (
                <div style={{ background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 10, padding: '14px 20px', marginBottom: 8, marginTop: -2, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  <div><div style={S.label}>US PRICE</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.us_price ? `$${Number(p.us_price).toFixed(2)}` : '-'}</div></div>
                  <div><div style={S.label}>牌價</div><div style={{ color: '#273346', fontSize: 13, ...S.mono }}>{fmtP(p.tw_retail_price)}</div></div>
                  <div><div style={S.label}>經銷價</div><div style={{ color: '#129c59', fontSize: 13, fontWeight: 700, ...S.mono }}>{fmtP(p.tw_reseller_price)}</div></div>
                  <div><div style={S.label}>狀態</div><div style={{ color: '#5f6f83', fontSize: 13 }}>{p.product_status || '-'}</div></div>
                  <div><div style={S.label}>重量</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.weight_kg ? `${p.weight_kg} kg` : '-'}</div></div>
                  <div><div style={S.label}>產地</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.origin_country || '-'}</div></div>
                  <div><div style={S.label}>替代型號</div><div style={{ color: p.replacement_model ? '#1976f3' : '#8a96a8', fontSize: 13, ...S.mono }}>{p.replacement_model || '-'}</div></div>
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
            {page > 0 && <button onClick={() => goPage(page - 1)} style={S.btnGhost}>← 上一頁</button>}
            <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page + 1}/{totalPages}</span>
            {page < totalPages - 1 && <button onClick={() => goPage(page + 1)} style={S.btnGhost}>下一頁 →</button>}
          </div>
        </>
      )}
      <ProductEditModal
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSaved={async () => {
          setSaveMessage(`商品 ${editingProduct?.item_number || ''} 已更新`);
          await doSearch(search, category, statusFilter, page);
          setTimeout(() => setSaveMessage(''), 3000);
        }}
      />
    </div>
  );
}

/* ========================================= QUOTES ========================================= */
