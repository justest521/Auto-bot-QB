'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, exportCsv } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, StatCard, PanelHeader, Pager } from '../shared/ui';
import { QuoteCreateModal } from './QuoteCreateModal';

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

// Focus keys for navigation
const SALES_DOCUMENT_FOCUS_KEY = 'qb_sales_document_focus';
const PO_FOCUS_KEY = 'qb_purchase_order_focus';
const ORDER_FOCUS_KEY = 'qb_order_focus';

// ========== 報價單詳情頁 ==========
function QuoteDetailView({ quote, onBack, onRefresh, salesUsers, setTab }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [editingSales, setEditingSales] = useState(false);
  const [convertingOrder, setConvertingOrder] = useState(false);
  const [localStatus, setLocalStatus] = useState(null);

  const statusKey = String(localStatus || quote.status || 'draft').toLowerCase();
  const QUOTE_STATUS_MAP = { draft: '草稿', sent: '已發送', approved: '已核准', converted: '已轉單', closed: '已結案' };
  const QUOTE_STATUS_COLOR = { draft: '#6b7280', sent: '#3b82f6', approved: '#16a34a', converted: '#059669', closed: '#9ca3af' };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'quote_detail', quote_id: quote.id });
        setDetail(result);
      } catch (e) {
        setMsg(e.message || '無法取得報價單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [quote.id]);

  const convertToOrder = async () => {
    if (!confirm(`確定將報價單 ${quote.quote_no || ''} 轉為訂單？`)) return;
    setConvertingOrder(true);
    try {
      const result = await apiPost({ action: 'convert_quote_to_order', quote_id: quote.id });
      setMsg(`已轉成訂單 ${result.order?.order_no || ''}`.trim());
      setLocalStatus('converted');
      // Reload detail to refresh timeline
      const refreshed = await apiGet({ action: 'quote_detail', quote_id: quote.id });
      setDetail(refreshed);
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '轉訂單失敗');
    } finally {
      setConvertingOrder(false);
    }
  };

  const updateSalesPerson = async (value) => {
    try {
      await apiPost({ action: 'update_quote', quote_id: quote.id, sales_person: value });
      setMsg('已更新業務');
      setEditingSales(false);
      // Refresh detail
      const result = await apiGet({ action: 'quote_detail', quote_id: quote.id });
      setDetail(result);
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '更新失敗');
    }
  };

  const deleteQuote = async () => {
    if (!confirm(`確定刪除報價單 ${quote.quote_no}？此操作無法復原。`)) return;
    try {
      await apiPost({ action: 'delete_quote', quote_id: quote.id });
      onBack();
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '刪除失敗');
    }
  };

  const sendToLine = async () => {
    try {
      const result = await apiPost({ action: 'send_quote_to_line', quote_id: quote.id });
      setMsg(result.message || '已發送');
      const refreshed = await apiGet({ action: 'quote_detail', quote_id: quote.id });
      setDetail(refreshed);
      onRefresh?.();
    } catch (e) {
      setMsg(e.message || '發送失敗');
    }
  };

  const q = detail?.quote || quote;
  const c = q.customer || quote.customer || {};
  const items = detail?.items || [];
  const isConverted = statusKey === 'converted';
  const isEditable = statusKey === 'draft' || statusKey === 'sent';
  const isDeletable = statusKey === 'draft' || statusKey === 'sent';

  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 };
  const cardStyle = { ...S.card, borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5', marginBottom: 0 };

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* ====== Header ====== */}
      <div style={{ ...cardStyle, padding: '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#6b7280', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#111827', ...S.mono, letterSpacing: -0.5 }}>{quote.quote_no || '-'}</span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, ...S.mono }}>
              {quote.quote_date || '-'}
              {quote.valid_until && <span style={{ color: '#d1d5db' }}> &middot; </span>}
              {quote.valid_until && <span>有效至 {quote.valid_until}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!isConverted && <button onClick={convertToOrder} disabled={convertingOrder} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: convertingOrder ? 0.7 : 1, transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>{convertingOrder ? '轉單中...' : '轉訂單'}</button>}
          <button onClick={() => window.open(`/api/pdf?type=quote&id=${quote.id}`, '_blank')} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', transition: 'all 0.15s' }}>PDF</button>
          {c.line_user_id && <button onClick={sendToLine} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #86efac', background: '#f0fdf4', fontSize: 13, fontWeight: 600, color: '#16a34a', cursor: 'pointer' }}>LINE</button>}
          {isDeletable && <button onClick={deleteQuote} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #fecaca', background: '#fff', fontSize: 13, fontWeight: 600, color: '#ef4444', cursor: 'pointer' }}>刪除</button>}
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10, padding: '10px 16px', fontSize: 14 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 10, alignItems: 'start' }}>
          {/* ====== Left: Items ====== */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f2f5' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>商品明細</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
            </div>
            {items.length > 0 ? (
              <div>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 55px 100px 110px', gap: 10, padding: '8px 16px', background: '#f8f9fb', fontSize: 12, fontWeight: 700, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  <div>編號</div><div>品名</div><div style={{ textAlign: 'right' }}>數量</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'right' }}>小計</div>
                </div>
                {/* Table rows */}
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 55px 100px 110px', gap: 10, padding: '10px 16px', borderTop: '1px solid #f3f5f7', background: '#fff', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background='#f8fafc'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                    <div style={{ ...S.mono, fontSize: 14, color: '#374151', paddingTop: 2 }}>{item.item_number_snapshot || '-'}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937', lineHeight: 1.4 }}>{item.description_snapshot || '-'}</div>
                    <div style={{ textAlign: 'right', ...S.mono, fontSize: 14, color: '#374151', fontWeight: 600 }}>{item.qty || 0}</div>
                    <div style={{ textAlign: 'right', ...S.mono, fontSize: 14, color: '#6b7280' }}>{fmtP(item.unit_price)}</div>
                    <div style={{ textAlign: 'right', ...S.mono, fontWeight: 800, color: '#059669', fontSize: 14 }}>{fmtP(item.line_total)}</div>
                  </div>
                ))}
                {/* Totals */}
                <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderTop: '2px solid #d1fae5' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 24 }}>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 14, color: '#6b7280' }}>小計 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(q.subtotal || 0)}</strong></span>
                      {q.discount_amount > 0 && <span style={{ fontSize: 14, color: '#ef4444' }}>折扣 <strong style={{ ...S.mono, fontSize: 16, fontWeight: 600 }}>-{fmtP(q.discount_amount)}</strong></span>}
                      {q.shipping_fee > 0 && <span style={{ fontSize: 14, color: '#6b7280' }}>運費 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(q.shipping_fee)}</strong></span>}
                      {q.tax_amount > 0 && <span style={{ fontSize: 14, color: '#6b7280' }}>稅金 <strong style={{ ...S.mono, fontSize: 16, color: '#374151', fontWeight: 600 }}>{fmtP(q.tax_amount)}</strong></span>}
                    </div>
                    <div style={{ borderLeft: '2px solid #a7f3d0', paddingLeft: 20, textAlign: 'right' }}>
                      <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, display: 'block', marginBottom: 2 }}>合計</span>
                      <span style={{ ...S.mono, fontSize: 22, fontWeight: 900, color: '#059669', letterSpacing: -1 }}>{fmtP(q.total_amount || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: 14 }}>尚無品項</div>
            )}
          </div>

          {/* ====== Right sidebar ====== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 1. PDF button */}
            <button onClick={() => window.open(`/api/pdf?type=quote&id=${quote.id}`, '_blank')} style={{ ...S.btnGhost, width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>下載 PDF</button>

            {/* 2. Customer card */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>客戶資訊</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{c.company_name || c.name || '未綁定客戶'}</div>
              {[
                { label: '聯絡人', value: c.contact_person || q.contact_person },
                { label: '電話', value: c.phone, mono: true },
                { label: '信箱', value: c.email, mono: true },
                { label: '地址', value: c.address },
              ].filter(f => f.value).map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{f.label}</span>
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, ...(f.mono ? S.mono : {}), overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.value}</span>
                </div>
              ))}
            </div>

            {/* 3. Unified record timeline card */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>合併所有紀錄</div>
              {(() => {
                const fmtTime = (t) => {
                  if (!t) return '';
                  const d = new Date(t);
                  if (isNaN(d.getTime())) return typeof t === 'string' ? t.slice(0, 10) : '';
                  const pad = (n) => String(n).padStart(2, '0');
                  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                };
                const makeClickable = (text) => {
                  const saMatch = text.match(/(SA-\d+)/);
                  const qtMatch = text.match(/(QT\d+)/);
                  const poMatch = text.match(/(PO-[\w-]+)/);
                  const soMatch = text.match(/(SO\d+)/);
                  const linkStyle = { color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' };
                  if (saMatch) { const p = text.split(saMatch[1]); return <>{p[0]}<span style={linkStyle} onClick={() => { window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, saMatch[1]); setTab?.('sales_documents'); }}>{saMatch[1]}</span>{p[1]}</>; }
                  if (qtMatch) { const p = text.split(qtMatch[1]); return <>{p[0]}<span style={linkStyle} onClick={() => { window.localStorage.setItem('qb_quote_focus', qtMatch[1]); setTab?.('quotes'); }}>{qtMatch[1]}</span>{p[1]}</>; }
                  if (poMatch) { const p = text.split(poMatch[1]); return <>{p[0]}<span style={linkStyle} onClick={() => { window.localStorage.setItem(PO_FOCUS_KEY, poMatch[1]); setTab?.('purchase_orders'); }}>{poMatch[1]}</span>{p[1]}</>; }
                  if (soMatch) { const p = text.split(soMatch[1]); return <>{p[0]}<span style={linkStyle} onClick={() => { window.localStorage.setItem(ORDER_FOCUS_KEY, soMatch[1]); setTab?.('orders'); }}>{soMatch[1]}</span>{p[1]}</>; }
                  return text;
                };

                // Build unified timeline entries
                const entries = [];

                // Quote created
                entries.push({ dot: '#16a34a', label: '報價建立', ref: quote.quote_no, refType: 'quote', time: quote.quote_date || quote.created_at, status: 'done' });

                // Process existing timeline events if available
                if (detail?.timeline && detail.timeline.length > 0) {
                  detail.timeline.forEach(ev => {
                    const dotColor = ev.status === 'done' ? '#16a34a' : ev.status === 'pending' ? '#f59e0b' : ev.status === 'rejected' ? '#ef4444' : ev.status === 'expired' ? '#9ca3af' : '#d1d5db';
                    const text = ev.event || '';
                    const saMatch = text.match(/(SA-\d+)/);
                    const qtMatch = text.match(/(QT\d+)/);
                    const poMatch = text.match(/(PO-[\w-]+)/);
                    const soMatch = text.match(/(SO\d+)/);

                    let refType = null;
                    let ref = null;
                    if (saMatch) { refType = 'sale'; ref = saMatch[1]; }
                    else if (qtMatch) { refType = 'quote'; ref = qtMatch[1]; }
                    else if (poMatch) { refType = 'po'; ref = poMatch[1]; }
                    else if (soMatch) { refType = 'order'; ref = soMatch[1]; }

                    entries.push({
                      dot: dotColor,
                      label: ev.event ? (text.includes('轉訂單') ? '轉訂單' : text.includes('建立') ? '建立' : text) : '事件',
                      ref: ref,
                      refType: refType,
                      detail: ev.by ? `由 ${ev.by}` : '',
                      time: ev.time,
                      status: ev.status || 'pending'
                    });
                  });
                }

                // Add current status based on quote status
                const statusColor = QUOTE_STATUS_COLOR[statusKey] || '#6b7280';
                const statusText = QUOTE_STATUS_MAP[statusKey] || statusKey;
                if (statusKey === 'sent') {
                  entries.push({ dot: '#3b82f6', label: '已發送', detail: '等待客戶回應', status: 'current' });
                } else if (statusKey === 'approved') {
                  entries.push({ dot: '#16a34a', label: '已核准', detail: '客戶已核准', status: 'done' });
                } else if (statusKey === 'converted') {
                  entries.push({ dot: '#059669', label: '轉訂單', detail: '已轉為訂單', status: 'done' });
                } else if (statusKey === 'closed') {
                  entries.push({ dot: '#9ca3af', label: '已結案', detail: '報價已結案', status: 'pending' });
                }

                return entries.length > 0 ? (
                  <div style={{ position: 'relative', paddingLeft: 18 }}>
                    {entries.map((e, i) => {
                      const isLast = i === entries.length - 1;
                      const isCurrent = e.status === 'current' || e.status === 'warning';
                      return (
                        <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 14, minHeight: isLast ? 'auto' : 28 }}>
                          {!isLast && <div style={{ position: 'absolute', left: -11, top: 10, width: 2, bottom: 0, background: '#e5e7eb' }} />}
                          <div style={{ position: 'absolute', left: -14, top: 3, width: isCurrent ? 10 : 8, height: isCurrent ? 10 : 8, borderRadius: '50%', background: e.dot, border: '2px solid #fff', boxShadow: isCurrent ? `0 0 0 3px ${e.dot}25` : `0 0 0 1.5px ${e.dot}30` }} />
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', lineHeight: 1.3 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: e.status === 'done' ? '#1f2937' : e.status === 'rejected' ? '#dc2626' : isCurrent ? '#1d4ed8' : '#9ca3af' }}>{e.label}</span>
                            {e.ref && (() => {
                              const clickHandler = e.refType === 'sale' ? () => { window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, e.ref); setTab?.('sales_documents'); }
                                : e.refType === 'po' ? () => { window.localStorage.setItem(PO_FOCUS_KEY, e.ref); setTab?.('purchase_orders'); }
                                : e.refType === 'quote' ? () => { window.localStorage.setItem('qb_quote_focus', e.ref); setTab?.('quotes'); }
                                : e.refType === 'order' ? () => { window.localStorage.setItem(ORDER_FOCUS_KEY, e.ref); setTab?.('orders'); }
                                : null;
                              return <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', ...S.mono, cursor: clickHandler ? 'pointer' : 'default', textDecoration: clickHandler ? 'underline' : 'none' }} onClick={clickHandler}>{e.ref}</span>;
                            })()}
                            {e.detail && <span style={{ fontSize: 11, fontWeight: 600, color: e.status === 'done' ? '#6b7280' : e.status === 'warning' ? '#92400e' : '#9ca3af', background: isCurrent || e.status === 'warning' ? `${e.dot}14` : 'transparent', padding: isCurrent || e.status === 'warning' ? '1px 6px' : 0, borderRadius: 4 }}>{e.detail}</span>}
                          </div>
                          {e.time && <div style={{ fontSize: 10, color: '#b0b5bf', marginTop: 1, ...S.mono }}>{fmtTime(e.time)}</div>}
                        </div>
                      );
                    })}
                  </div>
                ) : null;
              })()}
            </div>

            {/* 4. Remark card */}
            {q.remark && (
              <div style={{ ...cardStyle, padding: '10px 16px' }}>
                <div style={labelStyle}>備註</div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontWeight: 700 }}>{q.remark}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 報價單主元件 ==========
export default function Quotes({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total_amount: 0, open_count: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [showCreate, setShowCreate] = useState(false);
  const [editingQuote, setEditingQuote] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [statusFilter, setStatusFilter] = useState('');
  const [salesUsers, setSalesUsers] = useState([]);
  // ★ 新增：選中的報價單（進入詳情頁）
  const [selectedQuote, setSelectedQuote] = useState(null);

  const QUOTE_STATUS_MAP = { draft: '草稿', sent: '已發送', approved: '已核准', converted: '已轉單', closed: '已結案' };
  const QUOTE_STATUS_TONE = { draft: '', sent: 'blue', approved: 'green', converted: 'green', closed: '' };

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const params = { action: 'quotes', page: String(page), limit: String(limit), search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (statusFilter) params.status = statusFilter;
      const result = await apiGet(params);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, dateFrom, dateTo, statusFilter]);

  useEffect(() => { load(); }, []);
  // Focus on a specific quote if navigated from another page
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const focusedQuote = window.localStorage.getItem('qb_quote_focus');
    if (!focusedQuote) return;
    setSearch(focusedQuote);
    load(1, focusedQuote);
    window.localStorage.removeItem('qb_quote_focus');
  }, [load]);
  useEffect(() => {
    apiGet({ action: 'dealer_users' }).then(res => {
      setSalesUsers((res.rows || []).filter(u => u.role === 'sales' && u.status === 'active'));
    }).catch(() => {});
  }, []);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(1, search, pageSize);

  const duplicateQuote = async (quote) => {
    try {
      setActionMessage('複製中...');
      const detail = await apiGet({ action: 'quotes', page: '1', limit: '1', search: quote.quote_no || '' });
      const original = (detail.rows || [])[0] || quote;
      await apiPost({
        action: 'create_quote',
        customer_id: original.customer_id,
        quote_date: toDateInputValue(todayInTaipei()),
        valid_until: toDateInputValue(new Date(todayInTaipei().getTime() + 7 * 86400000)),
        status: 'draft',
        remark: `(複製自 ${original.quote_no || ''}) ${original.remark || ''}`.trim(),
        discount_amount: Number(original.discount_amount || 0),
        shipping_fee: Number(original.shipping_fee || 0),
        items: [],
      });
      setActionMessage('報價單已複製（明細請手動補充）');
      await load(1, search, pageSize);
    } catch (error) {
      setActionMessage(error.message || '複製報價單失敗');
    }
  };

  const handleExport = async () => {
    try {
      const params = { action: 'quotes', page: '1', limit: '9999', export: 'true', search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (statusFilter) params.status = statusFilter;
      const result = await apiGet(params);
      const columns = [
        { key: 'quote_no', label: '報價單號' },
        { key: (row) => row.customer?.company_name || row.customer?.name || '-', label: '客戶' },
        { key: 'status', label: '狀態' },
        { key: 'quote_date', label: '報價日期' },
        { key: 'valid_until', label: '有效期限' },
        { key: 'total_amount', label: '總金額' },
        { key: 'remark', label: '備註' },
      ];
      exportCsv(result.rows || [], columns, `報價單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert('匯出失敗: ' + e.message); }
  };

  // ★ 如果選中了某筆報價單，顯示詳情頁
  if (selectedQuote) {
    return (
      <QuoteDetailView
        quote={selectedQuote}
        onBack={() => setSelectedQuote(null)}
        onRefresh={() => load()}
        salesUsers={salesUsers}
        setTab={setTab}
      />
    );
  }

  // ★ 報價單列表（原本的畫面）
  return (
    <div>
      <PageLead eyebrow="QUOTES" title="報價單" description="管理報價單，確認後可轉為訂單進入銷售流程。" action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button><button onClick={() => data.table_ready && setShowCreate(true)} disabled={!data.table_ready} style={{ ...S.btnPrimary, opacity: data.table_ready ? 1 : 0.6, cursor: data.table_ready ? 'pointer' : 'not-allowed' }}>+ 新增報價單</button></div>} />
      {actionMessage ? (
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10 }}>
          {actionMessage}
        </div>
      ) : null}
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 14, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 14 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, width: 150, fontSize: 14, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="sent">已發送</option>
            <option value="approved">已核准</option>
            <option value="converted">已轉單</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋單號、客戶或備註..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 14, padding: '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: '6px 16px', fontSize: 14 }}>查詢</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 erp_quotes 資料表。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        <StatCard code="QTOT" label="報價總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="OPEN" label="待處理" value={fmt(data.summary?.open_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有報價單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '50px 130px minmax(0,1fr) 100px 100px' : '50px 150px minmax(0,1.2fr) 100px 100px 100px minmax(0,1fr) 120px', gap: 10, padding: '8px 16px', borderBottom: '2px solid #e6edf5', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>
            <div>序</div>
            <div>單號</div>
            <div>客戶</div>
            <div>日期</div>
            <div>狀態</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>總金額</div>}
            {!isTablet && <div>備註</div>}
            <div style={{ textAlign: 'right' }}>操作</div>
          </div>
          {data.rows.map((row, idx) => {
            const statusKey = String(row.status || 'draft').toLowerCase();
            const isConverted = statusKey === 'converted';
            const isEditable = statusKey === 'draft' || statusKey === 'sent';
            const isDeletable = statusKey === 'draft' || statusKey === 'sent';
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '50px 130px minmax(0,1fr) 100px 100px' : '50px 150px minmax(0,1.2fr) 100px 100px 100px minmax(0,1fr) 120px', gap: 10, padding: '10px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => setSelectedQuote(row)} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f7ff'} onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'}>
                <div style={{ fontSize: 12, color: '#6b7280', ...S.mono }}>{((data.page - 1) * (data.limit || pageSize)) + idx + 1}</div>
                <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{row.quote_no || '-'}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</div>
                </div>
                <div style={{ fontSize: 12, color: '#374151', ...S.mono }}>{row.quote_date || '-'}</div>
                <div><span style={S.tag(QUOTE_STATUS_TONE[statusKey] || '')}>{QUOTE_STATUS_MAP[statusKey] || statusKey}</span></div>
                {!isTablet && <div style={{ fontSize: 14, color: '#10b981', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>}
                {!isTablet && <div style={{ fontSize: 14, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.remark || '-'}</div>}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => duplicateQuote(row)} title="複製報價單" style={{ ...S.btnGhost, padding: '5px 8px', fontSize: 12 }}>複製</button>
                  <button onClick={() => window.open(`/api/pdf?type=quote&id=${row.id}`, '_blank')} style={{ ...S.btnGhost, padding: '5px 8px', fontSize: 12 }}>PDF</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => { setPageSize(nextLimit); load(1, search, nextLimit); }}
      />
      <QuoteCreateModal open={showCreate || !!editingQuote} editQuote={editingQuote} onClose={() => { setShowCreate(false); setEditingQuote(null); }} onCreated={() => { load(1, search, pageSize); setEditingQuote(null); }} tableReady={data.table_ready} />
    </div>
  );
}
