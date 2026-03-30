'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, exportCsv, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';
import { DocumentTimeline } from '../shared/DocumentTimeline';

function StatCard({ code, label, value, tone }) {
  const TONE_MAP = {
    red: { bg: '#fee2e2', color: '#dc2626' },
    yellow: { bg: '#fef3c7', color: '#d97706' },
    blue: { bg: '#dbeafe', color: '#2563eb' },
    green: { bg: '#dcfce7', color: '#16a34a' },
    gray: { bg: '#f3f4f6', color: '#6b7280' },
  };
  const t = TONE_MAP[tone] || TONE_MAP.gray;
  return (
    <div style={{ ...S.card, padding: '16px', textAlign: 'center', borderTop: `3px solid ${t.color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: t.color, ...S.mono }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

const AR_DEFAULT_WIDTHS = [40, 155, 120, 70, 100, 100, 75, 110, 100, 110, 65, 65];

export default function AccountsReceivable() {
  const { isMobile, isTablet } = useResponsive();
  const { gridTemplate: arGridTemplate, ResizableHeader: ARHeader } = useResizableColumns('ar_list', AR_DEFAULT_WIDTHS);
  const [data, setData] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [msg, setMsg] = useState('');
  const [detailDialog, setDetailDialog] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [newAr, setNewAr] = useState({ customer_id: '', amount: '', due_date: '', remark: '' });
  const [payDialog, setPayDialog] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'transfer', remark: '' });
  const [paying, setPaying] = useState(false);

  const load = async (p = page, status = statusFilter, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const params = { action: 'accounts_receivable', status, search: q, page: p, limit };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await apiGet(params);
      setData(res);
      setPage(p);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(1); }, []);

  const STATUS_MAP = {
    unpaid: { label: '未付款', color: '#f59e0b' },
    partial: { label: '部分付款', color: '#f97316' },
    paid: { label: '已付清', color: '#16a34a' },
    overdue: { label: '逾期', color: '#dc2626' },
    cancelled: { label: '已取消', color: '#6b7280' },
  };

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(1, statusFilter, search, pageSize);

  const loadDetail = async (invoiceId) => {
    try {
      const res = await apiGet({ action: 'invoice_allocations', invoice_id: invoiceId });
      setDetailData(res);
      setDetailDialog(invoiceId);
    } catch (e) { setMsg('無法載入沖帳記錄'); }
  };

  const handleCreate = async () => {
    if (!newAr.customer_id || !newAr.amount || Number(newAr.amount) <= 0) {
      setMsg('請填寫必要欄位');
      return;
    }
    try {
      await apiPost({
        action: 'create_receivable',
        customer_id: newAr.customer_id,
        amount: Number(newAr.amount),
        due_date: newAr.due_date,
        remark: newAr.remark
      });
      setMsg('應收帳款已新增');
      setCreateDialog(false);
      setNewAr({ customer_id: '', amount: '', due_date: '', remark: '' });
      await load(1);
    } catch (e) { setMsg(e.message); }
  };

  const openPayDialog = (ar, e) => {
    if (e) e.stopPropagation();
    const balance = Number(ar.total_amount || 0) - Number(ar.paid_amount || 0);
    setPayDialog(ar);
    setPayForm({ amount: balance > 0 ? String(balance) : '', method: 'transfer', remark: '' });
  };

  const handlePay = async () => {
    if (!payDialog || !payForm.amount || Number(payForm.amount) <= 0) { setMsg('請填寫收款金額'); return; }
    setPaying(true);
    try {
      const res = await apiPost({ action: 'record_payment', invoice_id: payDialog.id, amount: Number(payForm.amount), payment_method: payForm.method, remark: payForm.remark || '' });
      setMsg(res.message || '沖帳成功');
      setPayDialog(null);
      await load(page, statusFilter, search, pageSize);
    } catch (e) { setMsg(e.message || '沖帳失敗'); }
    finally { setPaying(false); }
  };

  const handleExport = async () => {
    try {
      const params = { action: 'accounts_receivable', status: statusFilter, limit: '9999', export: 'true', search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const all = await apiGet(params);
      exportCsv(all.rows || [], [
        { key: 'invoice_no', label: '應收單號' },
        { key: 'customer_name', label: '客戶' },
        { key: 'status', label: '狀態' },
        { key: 'total_amount', label: '應收金額' },
        { key: 'paid_amount', label: '已收金額' },
        { key: r => Number(r.total_amount || 0) - Number(r.paid_amount || 0), label: '未沖餘額' },
        { key: r => r.invoice_date?.slice(0, 10) || '', label: '開單日' },
        { key: r => r.due_date?.slice(0, 10) || '', label: '到期日' },
      ], `應收帳款清單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { setMsg('匯出失敗'); }
  };

  const s = data.summary || {};
  const currentInvoice = detailDialog ? (data.rows || []).find(r => r.id === detailDialog) : null;

  return (
    <div>
      <PageLead eyebrow="ACCOUNTS RECEIVABLE" title="應收帳款" description="追蹤客戶應收帳款餘額與帳齡分析。"
        action={<button onClick={handleExport} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnGhost) }}>匯出 CSV</button>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 10, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 12 }}>
        <StatCard code="RECV" label="應收總額" value={fmtP(s.total_receivable)} tone="red" />
        <StatCard code="PAID" label="已收總額" value={fmtP(s.total_paid)} tone="green" />
        <StatCard code="OVRD" label="逾期總額" value={fmtP(s.overdue_amount)} tone="yellow" />
        <StatCard code="BLNC" label="未沖餘額" value={fmtP(s.unmatched_balance)} tone="blue" />
      </div>

      {/* Compact filter row */}
      <div style={{ ...S.card, marginBottom: 10, padding: isMobile ? '10px 12px' : '8px 12px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: isMobile ? 'wrap' : 'nowrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb', lineHeight: 1.2 }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: isMobile ? 'calc(50% - 4px)' : 125, fontSize: 12, padding: '4px 6px', ...S.mono }} />
          <span style={{ color: '#9ca3af', fontSize: 12 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: isMobile ? 'calc(50% - 4px)' : 125, fontSize: 12, padding: '4px 6px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); load(1, e.target.value, search, pageSize); }} style={{ ...S.input, width: isMobile ? '100%' : 110, fontSize: 12, padding: '4px 6px' }}>
            <option value="">全部狀態</option>
            <option value="unpaid">未付款</option>
            <option value="partial">部分付款</option>
            <option value="paid">已付清</option>
            <option value="overdue">逾期</option>
            <option value="cancelled">已取消</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋單號、客戶..." style={{ ...S.input, flex: '1 1 auto', minWidth: isMobile ? 0 : 120, fontSize: 12, padding: '4px 8px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: '4px 14px', fontSize: 12 }}>查詢</button>
        </div>
      </div>

      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有應收帳款資料" /> : isMobile ? (
        <div>
          {(data.rows || []).map(ar => {
            const st = STATUS_MAP[ar.payment_status] || STATUS_MAP.unpaid;
            const balance = Number(ar.total_amount || 0) - Number(ar.paid_amount || 0);
            const daysOverdue = ar.due_date ? Math.max(0, Math.floor((new Date() - new Date(ar.due_date)) / (1000 * 60 * 60 * 24))) : 0;
            return (
              <div key={ar.id} onClick={() => loadDetail(ar.id)} style={{ ...S.card, padding: '12px 16px', marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{ar.invoice_no || '-'}</div>
                    <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{ar.customer_name || '-'}</div>
                  </div>
                  <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 4 }}>{st.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, color: '#6b7280', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e5e7eb' }}>
                  <div><span style={{ color: '#6b7280' }}>應收金額</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827', ...S.mono }}>{fmtP(ar.total_amount)}</div></div>
                  <div><span style={{ color: '#6b7280' }}>已收金額</span><div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', ...S.mono }}>{fmtP(ar.paid_amount)}</div></div>
                  <div><span style={{ color: '#6b7280' }}>未沖餘額</span><div style={{ fontSize: 14, fontWeight: 700, color: balance > 0 ? '#dc2626' : '#16a34a', ...S.mono }}>{fmtP(balance)}</div></div>
                  <div><span style={{ color: '#6b7280' }}>到期日</span><div style={{ fontSize: 12, color: '#111827', ...S.mono }}>{ar.due_date?.slice(0, 10) || '-'}</div></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {daysOverdue > 0 && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>逾期 {daysOverdue} 天</span>}
                  {ar.payment_status !== 'paid' && ar.payment_status !== 'cancelled' && (
                    <button onClick={(e) => { e.stopPropagation(); openPayDialog(ar, e); }} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 12, color: '#3b82f6', borderColor: '#bfdbfe', marginLeft: 'auto' }}>沖帳</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: 'auto', border: '1px solid #d1d5db' }}>
          <ARHeader headers={[
            { label: '序', align: 'center' },
            { label: '應收單號', align: 'left' },
            { label: '客戶', align: 'left' },
            { label: '業務', align: 'center' },
            { label: '開單日', align: 'center' },
            { label: '到期日', align: 'center' },
            { label: '狀態', align: 'center' },
            { label: '應收金額', align: 'right' },
            { label: '已收金額', align: 'right' },
            { label: '未沖餘額', align: 'right' },
            { label: '逾期天數', align: 'center' },
            { label: '操作', align: 'center' },
          ]} />
          {(data.rows || []).map((ar, idx) => {
            const st = STATUS_MAP[ar.payment_status] || STATUS_MAP.unpaid;
            const balance = Number(ar.total_amount || 0) - Number(ar.paid_amount || 0);
            const daysOverdue = ar.due_date ? Math.max(0, Math.floor((new Date() - new Date(ar.due_date)) / (1000 * 60 * 60 * 24))) : 0;
            const cell = { padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' };
            const cCenter = { ...cell, justifyContent: 'center' };
            const cRight = { ...cell, justifyContent: 'flex-end' };
            const cellLast = { ...cell, borderRight: 'none', justifyContent: 'center' };
            return (
              <div key={ar.id} onClick={() => loadDetail(ar.id)}
                style={{ display: 'grid', gridTemplateColumns: arGridTemplate, borderBottom: idx < (data.rows || []).length - 1 ? '1px solid #e5e7eb' : 'none', alignItems: 'center', background: idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'}>
                <div style={{ ...cCenter, fontSize: 13, color: '#6b7280', ...S.mono }}>{((page - 1) * pageSize) + idx + 1}</div>
                <div style={{ ...cell, fontSize: 13, color: '#3b82f6', fontWeight: 700, ...S.mono, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ar.invoice_no || '-'}</div>
                <div style={cell}><span style={{ fontSize: 13, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ar.customer_name || '-'}</span></div>
                <div style={{ ...cCenter, fontSize: 12, color: '#374151' }}>{ar.sales_person || <span style={{ color: '#d1d5db' }}>—</span>}</div>
                <div style={{ ...cCenter, fontSize: 13, color: '#374151', ...S.mono, whiteSpace: 'nowrap' }}>{ar.invoice_date?.slice(0, 10) || '-'}</div>
                <div style={{ ...cCenter, fontSize: 13, color: '#374151', ...S.mono, whiteSpace: 'nowrap' }}>{ar.due_date?.slice(0, 10) || '-'}</div>
                <div style={cCenter}><span style={S.tag(ar.payment_status === 'paid' ? 'green' : ar.payment_status === 'partial' ? 'yellow' : ar.payment_status === 'overdue' ? 'red' : 'gray')}>{st.label}</span></div>
                <div style={{ ...cRight, fontSize: 13, fontWeight: 700, ...S.mono }}>{fmtP(ar.total_amount)}</div>
                <div style={{ ...cRight, fontSize: 13, color: '#16a34a', ...S.mono }}>{fmtP(ar.paid_amount)}</div>
                <div style={{ ...cRight, fontSize: 13, fontWeight: 700, color: balance > 0 ? '#dc2626' : '#16a34a', ...S.mono }}>{fmtP(balance)}</div>
                <div style={{ ...cCenter, fontSize: 13, color: daysOverdue > 0 ? '#dc2626' : '#6b7280', fontWeight: daysOverdue > 0 ? 600 : 400 }}>{daysOverdue > 0 ? daysOverdue : '-'}</div>
                <div style={{ ...cellLast, gap: 4 }} onClick={e => e.stopPropagation()}>
                  {ar.payment_status !== 'paid' && ar.payment_status !== 'cancelled' ? (
                    <button onClick={(e) => openPayDialog(ar, e)} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11, color: '#3b82f6', borderColor: '#bfdbfe', whiteSpace: 'nowrap' }}>沖帳</button>
                  ) : <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>已沖</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pager page={page} limit={pageSize} total={data.total || 0}
        onPageChange={(p) => load(p, statusFilter, search, pageSize)}
        onLimitChange={(l) => { setPageSize(l); load(1, statusFilter, search, l); }} />

      {/* Detail modal - showing allocation history */}
      {detailDialog && currentInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '20px 0' : 0, overflowY: 'auto' }}>
          <div style={{ ...S.card, width: isMobile ? '90vw' : 600, maxWidth: '90vw', borderRadius: 14, padding: isMobile ? '16px 18px' : '20px 24px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>應收帳款明細</h3>
              <button onClick={() => setDetailDialog(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>

            {/* Invoice info header */}
            <div style={{ ...S.card, background: '#f9fafb', padding: 12, marginBottom: 16, borderRadius: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
                <div><span style={{ color: '#6b7280' }}>應收單號</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{currentInvoice.invoice_no}</div></div>
                <div><span style={{ color: '#6b7280' }}>客戶</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{currentInvoice.customer_name}</div></div>
                <div><span style={{ color: '#6b7280' }}>開單日</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827', ...S.mono }}>{currentInvoice.invoice_date?.slice(0, 10)}</div></div>
                <div><span style={{ color: '#6b7280' }}>到期日</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827', ...S.mono }}>{currentInvoice.due_date?.slice(0, 10)}</div></div>
                <div><span style={{ color: '#6b7280' }}>應收金額</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827', ...S.mono }}>{fmtP(currentInvoice.total_amount)}</div></div>
                <div><span style={{ color: '#6b7280' }}>已收金額</span><div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', ...S.mono }}>{fmtP(currentInvoice.paid_amount)}</div></div>
              </div>
              {currentInvoice.remark && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>
                  <span style={{ fontWeight: 600 }}>備註：</span>{currentInvoice.remark}
                </div>
              )}
            </div>

            {/* Allocation history */}
            <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#111827' }}>沖帳記錄</h4>
            {!detailData ? (
              <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px 0', fontSize: 13 }}>載入中...</div>
            ) : (detailData.rows || []).length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px 0', fontSize: 13 }}>尚無沖帳記錄</div>
            ) : isMobile ? (
              <div style={{ marginBottom: 16 }}>
                {(detailData.rows || []).map((alloc, idx) => (
                  <div key={idx} style={{ ...S.card, background: '#f9fafb', padding: 10, marginBottom: 8, borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{alloc.receipt_no}</span>
                      <span style={{ fontSize: 12, color: '#6b7280', ...S.mono }}>{alloc.date?.slice(0, 10)}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                      <div><span style={{ color: '#6b7280' }}>金額</span><div style={{ fontWeight: 600, color: '#111827', ...S.mono }}>{fmtP(alloc.amount)}</div></div>
                      <div><span style={{ color: '#6b7280' }}>類型</span><div style={{ fontWeight: 600, color: '#111827' }}>{alloc.type || '-'}</div></div>
                    </div>
                    {alloc.remark && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>備註：{alloc.remark}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ ...S.card, background: '#f9fafb', padding: 0, marginBottom: 16, overflow: 'auto', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: '#f3f4f6' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>收據號</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>日期</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>金額</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>類型</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>備註</th>
                  </tr></thead>
                  <tbody>{(detailData.rows || []).map((alloc, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#3b82f6', ...S.mono }}>{alloc.receipt_no}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, ...S.mono }}>{alloc.date?.slice(0, 10)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, ...S.mono }}>{fmtP(alloc.amount)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{alloc.type || '-'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11, color: '#6b7280' }}>{alloc.remark || '-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* Document chain timeline */}
            <div style={{ marginBottom: 16 }}>
              <DocumentTimeline type="invoice" id={currentInvoice.id} title="單據記錄" />
            </div>

            {/* Remaining balance footer */}
            <div style={{ ...S.card, background: '#f0fdf4', borderColor: '#bbf7d0', padding: 12, marginBottom: 16, borderRadius: 6, fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
                <div><span style={{ color: '#6b7280' }}>應收總額</span><div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', ...S.mono }}>{fmtP(currentInvoice.total_amount)}</div></div>
                <div><span style={{ color: '#6b7280' }}>已沖帳</span><div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', ...S.mono }}>{fmtP(currentInvoice.paid_amount)}</div></div>
                <div><span style={{ color: '#6b7280' }}>未沖餘額</span><div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', ...S.mono }}>{fmtP(Number(currentInvoice.total_amount || 0) - Number(currentInvoice.paid_amount || 0))}</div></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDetailDialog(null)} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' } : S.btnGhost) }}>關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment dialog */}
      {payDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 20 : 0 }} onClick={() => setPayDialog(null)}>
          <div style={{ ...S.card, width: isMobile ? '90vw' : 420, maxWidth: '90vw', borderRadius: 14, padding: isMobile ? '16px 18px' : '16px 18px 20px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>沖帳收款</h3>
              <button onClick={() => setPayDialog(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            <div style={{ ...S.card, background: '#f9fafb', padding: 12, marginBottom: 16, borderRadius: 8, fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><span style={{ color: '#6b7280' }}>應收單號</span><div style={{ fontWeight: 700, color: '#111827', ...S.mono }}>{payDialog.invoice_no}</div></div>
                <div><span style={{ color: '#6b7280' }}>客戶</span><div style={{ fontWeight: 700, color: '#111827' }}>{payDialog.customer_name}</div></div>
                <div><span style={{ color: '#6b7280' }}>應收金額</span><div style={{ fontWeight: 700, color: '#111827', ...S.mono }}>{fmtP(payDialog.total_amount)}</div></div>
                <div><span style={{ color: '#6b7280' }}>未沖餘額</span><div style={{ fontWeight: 700, color: '#dc2626', ...S.mono }}>{fmtP(Number(payDialog.total_amount || 0) - Number(payDialog.paid_amount || 0))}</div></div>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>收款金額</label>
              <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {[['全額', Number(payDialog.total_amount || 0) - Number(payDialog.paid_amount || 0)], ['50%', Math.round((Number(payDialog.total_amount || 0) - Number(payDialog.paid_amount || 0)) * 0.5)], ['30%', Math.round((Number(payDialog.total_amount || 0) - Number(payDialog.paid_amount || 0)) * 0.3)]].map(([label, val]) => (
                  <button key={label} onClick={() => setPayForm(f => ({ ...f, amount: String(val) }))} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11, color: '#3b82f6', borderColor: '#bfdbfe' }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>收款方式</label>
              <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}>
                <option value="transfer">匯款</option>
                <option value="cash">現金</option>
                <option value="check">支票</option>
                <option value="monthly">月結沖帳</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>備註</label>
              <textarea value={payForm.remark} onChange={e => setPayForm(f => ({ ...f, remark: e.target.value }))} placeholder="可選填備註" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: 50, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => setPayDialog(null)} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' } : S.btnGhost) }}>取消</button>
              <button onClick={handlePay} disabled={paying} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary), opacity: paying ? 0.6 : 1 }}>{paying ? '處理中...' : '確認沖帳'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create new AR dialog */}
      {createDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: isMobile ? '90vw' : 400, maxWidth: '90vw', borderRadius: 14, padding: isMobile ? '16px 18px' : '16px 18px 20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>新增應收帳款</h3>
            <div style={{ marginBottom: 12 }}><label style={S.label}>客戶</label><input type="text" value={newAr.customer_id} onChange={e => setNewAr({ ...newAr, customer_id: e.target.value })} placeholder="客戶ID或名稱" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>應收金額</label><input type="number" value={newAr.amount} onChange={e => setNewAr({ ...newAr, amount: e.target.value })} placeholder="0.00" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>到期日</label><input type="date" value={newAr.due_date} onChange={e => setNewAr({ ...newAr, due_date: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>備註</label><textarea value={newAr.remark} onChange={e => setNewAr({ ...newAr, remark: e.target.value })} placeholder="可選備註" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: 60, resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => { setCreateDialog(false); setNewAr({ customer_id: '', amount: '', due_date: '', remark: '' }); }} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' } : S.btnGhost) }}>取消</button>
              <button onClick={handleCreate} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>新增</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
