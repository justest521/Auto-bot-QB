'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, useViewportWidth, exportCsv, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard, CsvImportButton } from '../shared/ui';

const SALES_DOCUMENT_FOCUS_KEY = 'qb_sales_document_focus';
const PO_FOCUS_KEY = 'qb_purchase_order_focus';
const ORDER_FOCUS_KEY = 'qb_order_focus';

// ========== 銷貨單詳情頁 ==========
function SaleDetailView({ sale, onBack, setTab }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [shipping, setShipping] = useState(false);
  const [timeline, setTimeline] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'sale_detail', slip_number: sale.slip_number });
        setDetail(result);
        setTimeline(result.timeline || []);
      } catch (e) {
        setMsg(e.message || '無法取得銷貨單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [sale.slip_number]);

  const s = detail?.sale || sale;
  const invoice = detail?.invoice;
  const items = detail?.items || [];

  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 };
  const cardStyle = { ...S.card, borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5' };

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header ====== */}
      <div style={{ ...cardStyle, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{sale.slip_number || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#dcfce714', color: '#16a34a', border: '1px solid #16a34a30' }}>
                銷貨單
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4, ...S.mono }}>
              {s.sale_date || sale.sale_date || '-'}
              {s.invoice_number && <span style={{ color: '#d1d5db' }}> &middot; </span>}
              {s.invoice_number && <span>發票 {s.invoice_number}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={async () => {
            if (!confirm('確定從此銷貨單建立出貨？')) return;
            setShipping(true); setMsg('');
            try {
              const result = await apiPost({ action: 'create_shipment', sale_id: sale.id, items: (detail?.items || []).map(i => ({ order_item_id: i.id, qty_shipped: i.quantity || i.qty || 1 })) });
              setMsg(`已建立出貨單 ${result.shipment?.shipment_no || ''}`);
            } catch (e) { setMsg(e.message || '建立出貨失敗'); }
            finally { setShipping(false); }
          }} disabled={shipping} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: shipping ? 0.7 : 1, transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(245,158,11,0.25)' }}>{shipping ? '出貨中...' : '建立出貨'}</button>
          <button onClick={() => window.open(`/api/pdf?type=sale&id=${sale.id}`, '_blank')} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}>PDF</button>
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 16, padding: '12px 20px', fontSize: 14 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          {/* ====== Left: Items ====== */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f2f5' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>商品明細</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
            </div>
            {items.length > 0 ? (
              <div>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 55px 100px 110px', gap: 10, padding: '10px 24px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  <div>編號</div><div>品名</div><div style={{ textAlign: 'right' }}>數量</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'right' }}>小計</div>
                </div>
                {/* Table rows */}
                {items.map((item, i) => (
                  <div key={item.id || i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 55px 100px 110px', gap: 10, padding: '16px 24px', borderTop: '1px solid #f3f5f7', background: '#fff', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background='#f8fafc'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                    <div style={{ ...S.mono, fontSize: 14, color: '#374151', paddingTop: 2 }}>{item.item_number || item.item_number_snapshot || '-'}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937', lineHeight: 1.4 }}>{item.description || item.description_snapshot || '-'}</div>
                    <div style={{ textAlign: 'right', ...S.mono, fontSize: 14, color: '#374151', fontWeight: 600 }}>{item.quantity || item.qty || 0}</div>
                    <div style={{ textAlign: 'right', ...S.mono, fontSize: 14, color: '#6b7280' }}>{fmtP(item.unit_price)}</div>
                    <div style={{ textAlign: 'right', ...S.mono, fontWeight: 800, color: '#059669', fontSize: 16 }}>{fmtP(item.subtotal || item.line_total || (item.unit_price * (item.quantity || item.qty || 0)))}</div>
                  </div>
                ))}
                {/* Totals */}
                <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderTop: '2px solid #d1fae5' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 24 }}>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 14, color: '#6b7280' }}>小計 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(s.subtotal || 0)}</strong></span>
                      {(s.tax > 0 || s.tax_amount > 0) && <span style={{ fontSize: 14, color: '#6b7280' }}>稅金 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(s.tax || s.tax_amount || 0)}</strong></span>}
                    </div>
                    <div style={{ borderLeft: '2px solid #a7f3d0', paddingLeft: 20, textAlign: 'right' }}>
                      <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: 2 }}>合計</span>
                      <span style={{ ...S.mono, fontSize: 28, fontWeight: 900, color: '#059669', letterSpacing: -1 }}>{fmtP(s.total || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: 14 }}>尚無品項明細</div>
            )}
          </div>

          {/* ====== Right sidebar ====== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status card */}
            <div style={{ ...cardStyle, padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={labelStyle}>目前狀態</div>
              <span style={{ padding: '6px 16px', borderRadius: 20, fontSize: 14, fontWeight: 700, background: (s.status === 'paid' ? '#16a34a' : s.status === 'void' ? '#ef4444' : '#3b82f6') + '14', color: s.status === 'paid' ? '#16a34a' : s.status === 'void' ? '#ef4444' : '#3b82f6', border: `1px solid ${(s.status === 'paid' ? '#16a34a' : s.status === 'void' ? '#ef4444' : '#3b82f6')}30` }}>
                {{ draft: '草稿', issued: '已開立', paid: '已收款', void: '作廢' }[String(s.status || 'issued').toLowerCase()] || s.status || '已開立'}
              </span>
            </div>

            {/* Customer card */}
            <div style={{ ...cardStyle, padding: '22px 24px' }}>
              <div style={labelStyle}>客戶資訊</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 14, lineHeight: 1.3 }}>{s.customer_name || sale.customer_name || '未命名客戶'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: '業務', value: s.sales_person || sale.sales_person },
                  { label: '發票號碼', value: s.invoice_number, mono: true },
                  { label: '銷貨日期', value: s.sale_date || sale.sale_date, mono: true },
                ].filter(f => f.value).map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                    <span style={{ fontSize: 14, color: '#b0b8c4', flexShrink: 0, fontWeight: 600 }}>{f.label}</span>
                    <span style={{ fontSize: 14, color: '#1f2937', textAlign: 'right', fontWeight: 700, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Profit card */}
            <div style={{ ...cardStyle, padding: '22px 24px' }}>
              <div style={labelStyle}>毛利分析</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, color: '#b0b8c4', fontWeight: 600 }}>成本</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#374151', ...S.mono }}>{fmtP(s.cost || 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, color: '#b0b8c4', fontWeight: 600 }}>毛利</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: (s.gross_profit || 0) >= 0 ? '#059669' : '#ef4444', ...S.mono }}>{fmtP(s.gross_profit || 0)}</span>
                </div>
                {s.total > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 14, color: '#b0b8c4', fontWeight: 600 }}>毛利率</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#374151', ...S.mono }}>{((s.gross_profit || 0) / s.total * 100).toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Invoice card */}
            {invoice && (
              <div style={{ ...cardStyle, padding: '22px 24px' }}>
                <div style={labelStyle}>發票資訊</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: '發票號碼', value: invoice.invoice_number, mono: true },
                    { label: '發票類型', value: invoice.invoice_type },
                    { label: '公司名稱', value: invoice.company_name },
                    { label: '統編', value: invoice.tax_id, mono: true },
                    { label: '金額', value: fmtP(invoice.amount), mono: true },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                      <span style={{ fontSize: 14, color: '#b0b8c4', flexShrink: 0, fontWeight: 600 }}>{f.label}</span>
                      <span style={{ fontSize: 14, color: '#1f2937', textAlign: 'right', fontWeight: 700, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline card */}
            {timeline && timeline.length > 0 && (
              <div style={{ ...cardStyle, padding: '22px 24px' }}>
                <div style={labelStyle}>狀態歷程</div>
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  {timeline.map((ev, i) => {
                    const isLast = i === timeline.length - 1;
                    const dotColor = ev.status === 'done' ? '#16a34a' : ev.status === 'pending' ? '#f59e0b' : ev.status === 'rejected' ? '#ef4444' : ev.status === 'expired' ? '#9ca3af' : '#d1d5db';
                    const fmtTime = (t) => {
                      if (!t) return '';
                      const d = new Date(t);
                      if (isNaN(d.getTime())) return typeof t === 'string' ? t.slice(0, 10) : '';
                      const pad = (n) => String(n).padStart(2, '0');
                      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    };
                    return (
                      <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 20, minHeight: isLast ? 'auto' : 44 }}>
                        {!isLast && <div style={{ position: 'absolute', left: -12, top: 10, width: 2, bottom: 0, background: '#e5e7eb' }} />}
                        <div style={{ position: 'absolute', left: -16, top: 4, width: 10, height: 10, borderRadius: '50%', background: dotColor, border: '2px solid #fff', boxShadow: `0 0 0 2px ${dotColor}30` }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: ev.status === 'rejected' ? '#ef4444' : ev.status === 'pending' ? '#f59e0b' : '#1f2937', lineHeight: 1.3 }}>{(() => {
                            const text = ev.event || '';
                            const saMatch = text.match(/(SA-\d+)/);
                            const qtMatch = text.match(/(QT\d+)/);
                            const poMatch = text.match(/(PO-[\w-]+)/);
                            const soMatch = text.match(/(SO\d+)/);
                            if (saMatch) { const parts = text.split(saMatch[1]); return <>{parts[0]}<span style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, saMatch[1]); setTab?.('sales_documents'); }}>{saMatch[1]}</span>{parts[1]}</>; }
                            if (qtMatch) { const parts = text.split(qtMatch[1]); return <>{parts[0]}<span style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { window.localStorage.setItem('qb_quote_focus', qtMatch[1]); setTab?.('quotes'); }}>{qtMatch[1]}</span>{parts[1]}</>; }
                            if (poMatch) { const parts = text.split(poMatch[1]); return <>{parts[0]}<span style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { window.localStorage.setItem(PO_FOCUS_KEY, poMatch[1]); setTab?.('purchase_orders'); }}>{poMatch[1]}</span>{parts[1]}</>; }
                            if (soMatch) { const parts = text.split(soMatch[1]); return <>{parts[0]}<span style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { window.localStorage.setItem(ORDER_FOCUS_KEY, soMatch[1]); setTab?.('orders'); }}>{soMatch[1]}</span>{parts[1]}</>; }
                            return text;
                          })()}</div>
                          {ev.time && <div style={{ fontSize: 14, color: '#9ca3af', marginTop: 2, ...S.mono, fontWeight: 600 }}>{fmtTime(ev.time)}</div>}
                          {ev.by && <div style={{ fontSize: 14, color: '#6b7280', marginTop: 1, fontWeight: 600 }}>由 {ev.by}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PDF button */}
            <button onClick={() => window.open(`/api/pdf?type=sale&id=${sale.id}`, '_blank')} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>下載 PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 銷貨單主元件 ==========
export default function SalesDocuments({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total: 0, gross_profit: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSale, setSelectedSale] = useState(null);
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const params = { action: 'sales_documents', page: String(page), limit: String(limit), search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const result = await apiGet(params);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, dateFrom, dateTo]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const focusedSlip = window.localStorage.getItem(SALES_DOCUMENT_FOCUS_KEY);
    if (!focusedSlip) return;
    setSearch(focusedSlip);
    load(1, focusedSlip, pageSize);
    window.localStorage.removeItem(SALES_DOCUMENT_FOCUS_KEY);
  }, [load, pageSize]);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(1, search, pageSize);

  const handleExport = async () => {
    try {
      const params = { action: 'sales_documents', page: '1', limit: '9999', export: 'true', search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const result = await apiGet(params);
      const columns = [
        { key: 'slip_number', label: '銷貨單號' },
        { key: 'customer_name', label: '客戶' },
        { key: 'invoice_number', label: '發票號碼' },
        { key: 'sale_date', label: '銷貨日期' },
        { key: 'sales_person', label: '業務' },
        { key: 'subtotal', label: '未稅金額' },
        { key: 'total', label: '總額' },
        { key: 'gross_profit', label: '毛利' },
      ];
      exportCsv(result.rows || [], columns, `銷貨單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert('匯出失敗: ' + e.message); }
  };

  // ★ 如果選中了某筆銷貨單，顯示詳情頁
  if (selectedSale) {
    return (
      <SaleDetailView
        sale={selectedSale}
        onBack={() => setSelectedSale(null)}
        setTab={setTab}
      />
    );
  }

  // ★ 銷貨單列表
  return (
    <div>
      <PageLead eyebrow="SALES" title="銷貨單" description="查看實際銷貨單、發票號碼與毛利，並可點單號查看完整銷貨單內容。" action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><CsvImportButton datasetId="qb_sales_history" onImported={() => load(1, search, pageSize)} compact /><button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button></div>} />
      <div style={{ ...S.card, marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋銷貨單號、客戶、業務或發票..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 13 }}>查詢</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 qb_sales_history 或目前資料不可讀。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="STOT" label="銷貨筆數" value={fmt(data.total)} tone="blue" />
        <StatCard code="REV" label="本頁營收" value={fmtP(data.summary?.total)} tone="green" />
        <StatCard code="GP" label="本頁毛利" value={fmtP(data.summary?.gross_profit)} tone="yellow" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有銷貨單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '50px 160px minmax(0,1fr) 100px' : '50px 170px minmax(0,1.3fr) 120px 120px 120px 120px 120px', gap: 10, padding: '12px 16px', borderBottom: '2px solid #e6edf5', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>
            <div>序</div>
            <div>銷貨單號</div>
            <div>客戶 / 發票</div>
            <div>日期</div>
            {!isTablet && <div>業務</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>未稅</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>毛利</div>}
          </div>
          {data.rows.map((row, idx) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '50px 160px minmax(0,1fr) 100px' : '50px 170px minmax(0,1.3fr) 120px 120px 120px 120px 120px', gap: 10, padding: '12px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => setSelectedSale(row)} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f7ff'} onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'}>
              <div style={{ fontSize: 12, color: '#6b7280', ...S.mono }}>{((data.page - 1) * (data.limit || pageSize)) + idx + 1}</div>
              <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{row.slip_number || '-'}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, ...S.mono }}>{row.invoice_number ? `INV ${row.invoice_number}` : ''}</div>
              </div>
              <div style={{ fontSize: 13, color: '#374151', ...S.mono }}>{row.sale_date || '-'}</div>
              {!isTablet && <div style={{ fontSize: 13, color: '#374151' }}>{row.sales_person || '-'}</div>}
              {!isTablet && <div style={{ fontSize: 14, color: '#111827', textAlign: 'right', ...S.mono }}>{fmtP(row.subtotal)}</div>}
              {!isTablet && <div style={{ fontSize: 14, color: '#10b981', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>}
              {!isTablet && <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 14, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{fmtP(row.gross_profit)}</span>
              </div>}
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
