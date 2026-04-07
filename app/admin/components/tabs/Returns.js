'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

const STATUS_MAP = { pending: '待審核', approved: '已核准', rejected: '已拒絕', refunded: '已退款' };
const STATUS_COLOR = { pending: t.color.warning, approved: t.color.brand, rejected: t.color.error, refunded: t.color.link };
const cardStyle = { ...S.card, borderRadius: t.radius.lg, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5' };
const labelStyle = { fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textDisabled, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };

// ========== 退貨單明細頁 ==========
function ReturnDetailView({ ret: initRet, onBack, onRefresh }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [processing, setProcessing] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'return_detail', return_id: initRet.id });
        setDetail(result);
      } catch (e) {
        setMsg(e.message || '無法取得退貨單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [initRet.id]);

  const ret = detail?.return_doc || initRet;
  const items = detail?.items || [];
  const order = detail?.order;
  const customer = detail?.customer;
  const statusKey = ret.status || 'pending';

  const updateStatus = async (newStatus) => {
    const label = STATUS_MAP[newStatus] || newStatus;
    if (!confirm(`確定將退貨單狀態改為「${label}」？`)) return;
    setProcessing(newStatus); setMsg('');
    try {
      await apiPost({ action: 'approve_return', return_id: ret.id, status: newStatus, notify_line: true });
      setMsg(`已更新為 ${label}${newStatus === 'approved' ? '，庫存已自動回補' : ''}`);
      const result = await apiGet({ action: 'return_detail', return_id: ret.id });
      setDetail(result);
      if (onRefresh) onRefresh();
    } catch (e) { setMsg(e.message || '更新失敗'); }
    finally { setProcessing(''); }
  };

  const nextActions = [];
  if (statusKey === 'pending') {
    nextActions.push({ status: 'approved', label: '核准退貨', color: t.color.brand, outline: false });
    nextActions.push({ status: 'rejected', label: '拒絕退貨', color: t.color.error, outline: true });
  }
  if (statusKey === 'approved') {
    nextActions.push({ status: 'refunded', label: '標記已退款', color: t.color.link, outline: false });
  }

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* Header */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: t.radius.md, border: '1px solid #e5e7eb', background: t.color.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.fontSize.h2, color: t.color.textMuted, transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = t.color.bgCard; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: t.fontSize.h1, fontWeight: 800, color: t.color.textPrimary, ...S.mono, letterSpacing: -0.5 }}>{ret.return_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[statusKey] || t.color.textMuted}14`, color: STATUS_COLOR[statusKey] || t.color.textMuted, border: `1px solid ${STATUS_COLOR[statusKey] || t.color.textMuted}30` }}>
                {STATUS_MAP[statusKey] || statusKey}
              </span>
            </div>
            <div style={{ fontSize: t.fontSize.body, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>
              {fmtDate(ret.return_date || ret.created_at)}
              {ret.reason && <span style={{ color: '#d1d5db' }}> &middot; </span>}
              {ret.reason && <span style={{ color: t.color.textMuted }}>{ret.reason}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {nextActions.map(a => (
            <button key={a.status} onClick={() => updateStatus(a.status)} disabled={!!processing}
              style={{ padding: '9px 22px', borderRadius: t.radius.lg, border: a.outline ? `1px solid ${a.color}40` : 'none', background: a.outline ? t.color.bgCard : `linear-gradient(135deg, ${a.color}, ${a.color}dd)`, color: a.outline ? a.color : t.color.bgCard, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, cursor: 'pointer', opacity: processing ? 0.7 : 1, transition: 'all 0.15s', boxShadow: a.outline ? 'none' : `0 2px 8px ${a.color}40` }}>
              {processing === a.status ? '處理中...' : a.label}
            </button>
          ))}
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') || msg.includes('拒絕') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') || msg.includes('拒絕') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') || msg.includes('拒絕') ? '#b42318' : '#15803d', marginBottom: 10, padding: '8px 16px', fontSize: t.fontSize.h3 }}>{msg}</div>}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 10, alignItems: 'start' }}>
          {/* Left: Items */}
          <div>
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f2f5' }}>
                <span style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textDisabled }}>退貨品項</span>
                <span style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.medium, color: t.color.textDisabled, marginLeft: 8 }}>{items.length} 項</span>
              </div>
              {items.length > 0 ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr) 75px 90px 100px', gap: 8, padding: '8px 16px', background: '#f8f9fb', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textDisabled, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    <div>料號</div><div>品名</div><div style={{ textAlign: 'center' }}>退貨數</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'right' }}>小計</div>
                  </div>
                  {items.map((item, i) => (
                    <div key={item.id || i} style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr) 75px 90px 100px', gap: 8, padding: '10px 16px', borderTop: '1px solid #f3f5f7', background: t.color.bgCard, transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = t.color.bgCard}>
                      <div style={{ ...S.mono, fontSize: t.fontSize.h3, color: t.color.textSecondary }}>{item.item_number || '-'}</div>
                      <div style={{ fontWeight: t.fontWeight.semibold, fontSize: t.fontSize.h3, color: t.color.textPrimary, lineHeight: 1.4 }}>{item.description || '-'}</div>
                      <div style={{ textAlign: 'center', ...S.mono, fontSize: t.fontSize.h3, fontWeight: 800, color: t.color.error }}>{item.qty_returned || 0}</div>
                      <div style={{ textAlign: 'right', ...S.mono, fontSize: t.fontSize.h3, color: t.color.textMuted }}>{fmtP(item.unit_price)}</div>
                      <div style={{ textAlign: 'right', ...S.mono, fontWeight: 800, color: t.color.error, fontSize: t.fontSize.h2 }}>{fmtP(item.line_total || (item.unit_price * (item.qty_returned || 0)))}</div>
                    </div>
                  ))}
                  {/* Totals */}
                  <div style={{ padding: '10px 16px', background: 'linear-gradient(135deg, #fef2f2, #fff1f2)', borderTop: '2px solid #fecdd3' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 24 }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <span style={{ fontSize: t.fontSize.h3, color: t.color.textMuted }}>共 {items.length} 項</span>
                        <span style={{ fontSize: t.fontSize.h3, color: t.color.textMuted }}>退貨數 <strong style={{ ...S.mono, fontSize: t.fontSize.h2, color: t.color.textSecondary, fontWeight: t.fontWeight.semibold }}>{items.reduce((s, i) => s + Number(i.qty_returned || 0), 0)}</strong></span>
                      </div>
                      <div style={{ borderLeft: '2px solid #fca5a5', paddingLeft: 10, textAlign: 'right' }}>
                        <span style={{ fontSize: t.fontSize.caption, color: t.color.error, fontWeight: t.fontWeight.semibold, display: 'block', marginBottom: 2 }}>退款金額</span>
                        <span style={{ ...S.mono, fontSize: 28, fontWeight: 900, color: t.color.error, letterSpacing: -1 }}>{fmtP(ret.refund_amount || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: t.fontSize.h3 }}>尚無退貨品項明細</div>
              )}
            </div>

            {/* Status timeline */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>審核流程</div>
              <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                {['pending', 'approved', 'refunded'].map((st, i) => {
                  const steps = ['pending', 'approved', 'refunded'];
                  const currentIdx = steps.indexOf(statusKey);
                  const isActive = currentIdx >= i;
                  const isCurrent = statusKey === st;
                  return (
                    <div key={st} style={{ display: 'flex', alignItems: 'center' }}>
                      {i > 0 && <div style={{ width: 40, height: 2, background: isActive ? t.color.brand : t.color.border }} />}
                      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: isCurrent ? (STATUS_COLOR[st] || t.color.textMuted) : isActive ? t.color.successBg : '#f3f4f6', color: isCurrent ? t.color.bgCard : isActive ? '#15803d' : t.color.textDisabled, border: isCurrent ? 'none' : `2px solid ${isActive ? '#86efac' : t.color.border}` }}>
                        {i + 1}
                      </div>
                      <span style={{ marginLeft: 6, fontSize: t.fontSize.caption, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? (STATUS_COLOR[st] || t.color.textMuted) : isActive ? '#15803d' : t.color.textDisabled }}>{STATUS_MAP[st]}</span>
                    </div>
                  );
                })}
                {statusKey === 'rejected' && (
                  <div style={{ display: 'flex', alignItems: 'center', marginLeft: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.fontSize.h3, background: t.color.errorBg, color: t.color.error }}>✕</div>
                    <span style={{ marginLeft: 6, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.error }}>已拒絕</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Return info */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>退貨資訊</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: '退貨單號', value: ret.return_no, mono: true },
                  { label: '退貨日期', value: fmtDate(ret.return_date || ret.created_at), mono: true },
                  { label: '退貨原因', value: ret.reason },
                  { label: '退款金額', value: fmtP(ret.refund_amount), mono: true },
                  { label: '備註', value: ret.remark },
                ].filter(f => f.value).map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                    <span style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled, flexShrink: 0, fontWeight: t.fontWeight.medium }}>{f.label}</span>
                    <span style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, textAlign: 'right', fontWeight: t.fontWeight.medium, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Order card */}
            {order && (
              <div style={{ ...cardStyle, padding: '10px 16px' }}>
                <div style={labelStyle}>關聯訂單</div>
                <div style={{ fontSize: t.fontSize.h2, fontWeight: 800, color: t.color.textPrimary, marginBottom: 10, ...S.mono }}>{order.order_no || '-'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: '訂單日期', value: order.order_date, mono: true },
                    { label: '訂單金額', value: fmtP(order.total_amount), mono: true },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                      <span style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled, flexShrink: 0, fontWeight: t.fontWeight.medium }}>{f.label}</span>
                      <span style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, textAlign: 'right', fontWeight: t.fontWeight.medium, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Customer card */}
            {customer && (
              <div style={{ ...cardStyle, padding: '10px 16px' }}>
                <div style={labelStyle}>客戶資訊</div>
                <div style={{ fontSize: t.fontSize.h2, fontWeight: 800, color: t.color.textPrimary, marginBottom: 10, lineHeight: 1.3 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: '聯絡人', value: customer.name },
                    { label: '電話', value: customer.phone, mono: true },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                      <span style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled, flexShrink: 0, fontWeight: t.fontWeight.medium }}>{f.label}</span>
                      <span style={{ fontSize: t.fontSize.h3, color: t.color.textPrimary, textAlign: 'right', fontWeight: t.fontWeight.medium, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 退貨管理主元件 ==========
export default function Returns() {
  const { isMobile, isTablet } = useResponsive();
  const { colWidths, gridTemplate, ResizableHeader } = useResizableColumns('returns_list', [40, 160, 200, 110, 100, 100, 140]);
  const [data, setData] = useState({ returns: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ customer_id: '', reason: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', qty_returned: 1, unit_price: 0, line_total: 0 }]);
  const [selectedReturn, setSelectedReturn] = useState(null);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const load = useCallback(async (page = 1, q = search, st = statusF, df = dateFrom, dt = dateTo) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'returns', page: String(page), limit: '20', search: q, status: st, date_from: df, date_to: dt })); } finally { setLoading(false); }
  }, [search, statusF, dateFrom, dateTo]);

  useEffect(() => { load(); }, []);

  const updateItem = (idx, key, val) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      if (key === 'qty_returned' || key === 'unit_price') {
        next[idx].line_total = Number(next[idx].qty_returned || 0) * Number(next[idx].unit_price || 0);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    try {
      await apiPost({ action: 'create_return', ...form, items: items.filter(i => i.item_number) });
      setCreateOpen(false); setForm({ customer_id: '', reason: '', remark: '' });
      setItems([{ item_number: '', description: '', qty_returned: 1, unit_price: 0, line_total: 0 }]);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleApprove = async (e, id) => {
    e.stopPropagation();
    try { await apiPost({ action: 'approve_return', return_id: id, notify_line: true }); load(); } catch (e2) { alert(e2.message); }
  };

  const handleExport = async () => {
    try {
      const result = await apiGet({ action: 'returns', page: '1', search, status: statusF, date_from: dateFrom, date_to: dateTo, limit: '9999', export: 'true' });
      const columns = [
        { key: 'return_no', label: '退貨單號' },
        { key: (row) => (STATUS_MAP[row.status] || row.status), label: '狀態' },
        { key: (row) => fmtDate(row.return_date || row.created_at), label: '退貨日期' },
        { key: 'reason', label: '原因' },
        { key: 'refund_amount', label: '退款金額' },
      ];
      exportCsv(result.returns || [], columns, `退貨單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert('匯出失敗: ' + e.message); }
  };

  // ★ 明細頁
  if (selectedReturn) {
    return (
      <ReturnDetailView
        ret={selectedReturn}
        onBack={() => { setSelectedReturn(null); load(); }}
        onRefresh={() => load()}
      />
    );
  }

  const sm = data.summary || {};

  return (
    <div>
      <PageLead eyebrow="Returns" title="退貨管理" description="管理客戶退貨申請、審核退貨並自動回補庫存。"
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', ...(isMobile ? { width: '100%' } : {}) }}><button onClick={handleExport} style={{ ...S.btnGhost, ...(isMobile ? { flex: 1 } : {}) }}>匯出 CSV</button><button onClick={() => setCreateOpen(true)} style={{ ...S.btnPrimary, ...(isMobile ? { flex: 1, minHeight: 44 } : {}) }}>+ 建立退貨</button></div>} />

      <div style={{ ...S.statGrid, ...(isMobile ? S.mobile.statGrid : {}) }}>
        <StatCard code="PEND" label="待審核" value={fmt(sm.pending)} tone="blue" accent={t.color.warning} />
        <StatCard code="APVD" label="已核准" value={fmt(sm.approved)} tone="blue" accent={t.color.brand} />
        <StatCard code="REFN" label="退款總額" value={fmtP(sm.total_refund)} tone="blue" accent={t.color.error} />
      </div>

      {/* Filter bar */}
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 8, flexWrap: 'wrap', alignItems: isMobile ? 'stretch' : 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', ...(isMobile ? { width: '100%' } : {}) }}>
            {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
              <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: isMobile ? '8px 12px' : '6px 14px', fontSize: isMobile ? t.fontSize.body : t.fontSize.caption, minHeight: isMobile ? 44 : undefined, background: datePreset === key ? t.color.link : t.color.bgCard, color: datePreset === key ? t.color.bgCard : '#4b5563', borderColor: datePreset === key ? t.color.link : t.color.border }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...(isMobile ? { width: '100%' } : {}) }}>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, flex: isMobile ? 1 : undefined, width: isMobile ? undefined : 150, fontSize: isMobile ? t.fontSize.body : t.fontSize.caption, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined, ...S.mono }} />
            <span style={{ color: t.color.textMuted, fontSize: t.fontSize.body, flexShrink: 0 }}>~</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, flex: isMobile ? 1 : undefined, width: isMobile ? undefined : 150, fontSize: isMobile ? t.fontSize.body : t.fontSize.caption, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined, ...S.mono }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...(isMobile ? { width: '100%' } : {}) }}>
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ ...S.input, flex: isMobile ? 1 : undefined, width: isMobile ? undefined : 150, fontSize: isMobile ? t.fontSize.body : t.fontSize.caption, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined }}>
              <option value="">全部狀態</option>
              <option value="pending">待審核</option>
              <option value="approved">已核准</option>
              <option value="rejected">已拒絕</option>
              <option value="refunded">已退款</option>
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusF, dateFrom, dateTo)} placeholder="搜尋..." style={{ ...S.input, flex: 1, minWidth: isMobile ? 0 : 160, fontSize: isMobile ? t.fontSize.body : t.fontSize.caption, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined }} />
            <button onClick={() => load(1, search, statusF, dateFrom, dateTo)} style={{ ...S.btnPrimary, padding: isMobile ? '10px 16px' : '6px 18px', fontSize: isMobile ? t.fontSize.body : t.fontSize.caption, minHeight: isMobile ? 44 : undefined, flexShrink: 0 }}>查詢</button>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? <Loading /> : data.returns.length === 0 ? <EmptyState text="目前沒有退貨記錄" /> : isMobile ? (
        data.returns.map((r, idx) => (
          <div key={r.id} style={{ ...S.mobileCard, marginBottom: 10, cursor: 'pointer' }} onClick={() => setSelectedReturn(r)}>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>退貨單號</span>
              <span style={{ ...S.mobileCardValue, color: t.color.link }}>{r.return_no || '-'}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>原因</span>
              <span style={S.mobileCardValue}>{r.reason || '-'}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>退款金額</span>
              <span style={{ ...S.mobileCardValue, color: t.color.error }}>{fmtP(r.refund_amount)}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>日期</span>
              <span style={S.mobileCardValue}>{fmtDate(r.return_date || r.created_at)}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>狀態</span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[r.status] || t.color.textMuted}14`, color: STATUS_COLOR[r.status] || t.color.textMuted, border: `1px solid ${STATUS_COLOR[r.status] || t.color.textMuted}30` }}>
                {STATUS_MAP[r.status] || r.status}
              </span>
            </div>
            {r.status === 'pending' && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                <button onClick={(e) => handleApprove(e, r.id)} style={{ ...S.btnPrimary, width: '100%', minHeight: 44, fontSize: t.fontSize.h3 }}>核准退貨</button>
              </div>
            )}
          </div>
        ))
      ) : (
        <div style={{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }}>
          <ResizableHeader headers={[
            { label: '#', align: 'center' },
            { label: '退貨單號', align: 'center' },
            { label: '原因', align: 'center' },
            { label: '退款金額', align: 'center' },
            { label: '日期', align: 'center' },
            { label: '狀態', align: 'center' },
            { label: '操作', align: 'center' },
          ]} />
          {data.returns.map((r, idx) => (
            <div key={r.id} onClick={() => setSelectedReturn(r)}
              style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 0, padding: 0, borderBottom: '1px solid #f3f5f7', background: t.color.bgCard, cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = t.color.bgCard}>
              <div style={{ fontSize: t.fontSize.body, color: t.color.textDisabled, fontWeight: t.fontWeight.medium, padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center' }}>{(data.page * (data.limit || 30)) + idx + 1}</div>
              <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.link, padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center', ...S.mono }}>{r.return_no || '-'}</div>
              <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{r.reason || '-'}</div>
              <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.error, padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'right', ...S.mono }}>{fmtP(r.refund_amount)}</div>
              <div style={{ fontSize: t.fontSize.body, color: t.color.textMuted, padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textAlign: 'center', ...S.mono }}>{fmtDate(r.return_date || r.created_at)}</div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 10px', borderRight: '1px solid #e5e7eb' }}>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[r.status] || t.color.textMuted}14`, color: STATUS_COLOR[r.status] || t.color.textMuted, border: `1px solid ${STATUS_COLOR[r.status] || t.color.textMuted}30` }}>
                  {STATUS_MAP[r.status] || r.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', padding: '8px 10px' }}>
                {r.status === 'pending' && <button onClick={(e) => handleApprove(e, r.id)} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: t.fontSize.tiny, borderColor: '#86efac', color: t.color.brand }}>核准</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF, dateFrom, dateTo)} />
      </div>

      {/* Create modal */}
      {createOpen && isMobile ? (
        <div style={{ ...S.mobileModal }}>
          <div style={{ ...S.mobileModalHeader }}>
            <div>
              <div style={S.eyebrow}>Sales Return</div>
              <h3 style={{ margin: '4px 0 0', fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold }}>建立退貨單</h3>
            </div>
            <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, padding: '8px 12px' }}>關閉</button>
          </div>
          <div style={{ ...S.mobileModalBody }}>
            <div style={{ marginBottom: 16 }}><label style={S.label}>客戶 ID (選填)</label><input value={form.customer_id} onChange={(e) => setForm(p => ({ ...p, customer_id: e.target.value }))} style={{ ...S.input, ...S.mobile.input, width: '100%' }} /></div>
            <div style={{ marginBottom: 16 }}><label style={S.label}>退貨原因</label><input value={form.reason} onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))} style={{ ...S.input, ...S.mobile.input, width: '100%' }} /></div>
            <div style={{ marginBottom: 16 }}><label style={S.label}>備註</label><input value={form.remark} onChange={(e) => setForm(p => ({ ...p, remark: e.target.value }))} style={{ ...S.input, ...S.mobile.input, width: '100%' }} /></div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textSecondary }}>退貨明細</span>
                <span style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled }}>{items.length} 項</span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ background: t.color.bgMuted, border: '1px solid #f0f2f5', borderRadius: t.radius.md, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={it.item_number} onChange={(e) => updateItem(idx, 'item_number', e.target.value)} style={{ ...S.input, ...S.mobile.input, width: '100%' }} placeholder="料號" />
                    <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ ...S.input, ...S.mobile.input, width: '100%' }} placeholder="品名" />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={it.qty_returned} onChange={(e) => updateItem(idx, 'qty_returned', e.target.value)} style={{ ...S.input, ...S.mobile.input, flex: 1 }} placeholder="數量" />
                      <input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, 'unit_price', e.target.value)} style={{ ...S.input, ...S.mobile.input, flex: 1, ...S.mono }} placeholder="單價" />
                    </div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.success, fontWeight: t.fontWeight.bold, ...S.mono, textAlign: 'right' }}>小計: {fmtP(it.line_total)}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setItems(p => [...p, { item_number: '', description: '', qty_returned: 1, unit_price: 0, line_total: 0 }])} style={{ ...S.btnGhost, fontSize: t.fontSize.h3, marginTop: 12, width: '100%', minHeight: 44 }}>+ 新增品項</button>
            </div>
          </div>
          <div style={{ ...S.mobileModalFooter }}>
            <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, flex: 1, minHeight: 44 }}>取消</button>
            <button onClick={handleCreate} style={{ ...S.btnPrimary, ...S.mobile.btnPrimary, flex: 1 }}>建立退貨</button>
          </div>
        </div>
      ) : createOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: t.color.overlay, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setCreateOpen(false)}>
          <div style={{ width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: t.radius.xl, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={S.eyebrow}>Sales Return</div>
                <div style={{ fontSize: t.fontSize.h1, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>建立退貨單</div>
              </div>
              <button onClick={() => setCreateOpen(false)} style={S.btnGhost}>關閉</button>
            </div>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div><label style={S.label}>客戶 ID (選填)</label><input value={form.customer_id} onChange={(e) => setForm(p => ({ ...p, customer_id: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>退貨原因</label><input value={form.reason} onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))} style={S.input} /></div>
              </div>
              <div><label style={S.label}>備註</label><input value={form.remark} onChange={(e) => setForm(p => ({ ...p, remark: e.target.value }))} style={S.input} /></div>
            </div>
            <div style={{ ...S.card }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textSecondary }}>退貨明細</span>
                <span style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled }}>{items.length} 項</span>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 5, paddingRight: 4 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ background: t.color.bgMuted, border: '1px solid #f0f2f5', borderRadius: t.radius.md, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input value={it.item_number} onChange={(e) => updateItem(idx, 'item_number', e.target.value)} style={{ ...S.input, flex: 1, fontSize: t.fontSize.caption, padding: '4px 6px', ...S.mono }} placeholder="料號" />
                    <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ ...S.input, flex: 1, fontSize: t.fontSize.caption, padding: '4px 6px' }} placeholder="品名" />
                    <input type="number" value={it.qty_returned} onChange={(e) => updateItem(idx, 'qty_returned', e.target.value)} style={{ ...S.input, width: 52, fontSize: t.fontSize.caption, padding: '4px 6px', textAlign: 'center', flexShrink: 0 }} placeholder="數量" />
                    <input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, 'unit_price', e.target.value)} style={{ ...S.input, width: 72, fontSize: t.fontSize.caption, padding: '4px 6px', textAlign: 'right', flexShrink: 0, ...S.mono }} placeholder="單價" />
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.success, fontWeight: t.fontWeight.bold, ...S.mono, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>{fmtP(it.line_total)}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setItems(p => [...p, { item_number: '', description: '', qty_returned: 1, unit_price: 0, line_total: 0 }])} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, marginTop: 8, width: '100%' }}>+ 新增品項</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button onClick={handleCreate} style={{ ...S.btnPrimary, flex: 1 }}>建立退貨</button>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, flex: 1 }}>取消</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
