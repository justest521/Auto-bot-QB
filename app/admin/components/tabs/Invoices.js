'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, exportCsv, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

const INVOICE_DEFAULT_WIDTHS = [50, 100, 140, 100, 100, 100, 100, 120, 100];

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

export default function Invoices() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [msg, setMsg] = useState('');
  const [payDialog, setPayDialog] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const { gridTemplate: invoiceGridTemplate, ResizableHeader: InvoiceHeader } = useResizableColumns('invoices_list', INVOICE_DEFAULT_WIDTHS);

  const load = async (status = statusFilter, q = search) => {
    setLoading(true);
    try {
      const params = { action: 'invoices', status, search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await apiGet(params);
      setData(res);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const STATUS_MAP = {
    draft: { label: '草稿', color: '#9ca3af' },
    sent: { label: '已寄送', color: '#3b82f6' },
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

  const doSearch = () => load(statusFilter, search);

  const handlePay = async () => {
    if (!payDialog || !payAmount || Number(payAmount) <= 0) return;
    try {
      await apiPost({ action: 'record_payment', invoice_id: payDialog.id, amount: Number(payAmount), payment_method: 'transfer' });
      setMsg('付款已記錄'); setPayDialog(null); setPayAmount(''); await load();
    } catch (e) { setMsg(e.message); }
  };

  const handleExport = async () => {
    try {
      const params = { action: 'invoices', status: statusFilter, limit: '9999', export: 'true', search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const all = await apiGet(params);
      exportCsv(all.rows || [], [
        { key: 'invoice_no', label: '發票號' },
        { key: 'customer_name', label: '客戶' },
        { key: 'status', label: '狀態' },
        { key: 'total_amount', label: '金額' },
        { key: 'paid_amount', label: '已付' },
        { key: r => Number(r.total_amount || 0) - Number(r.paid_amount || 0), label: '餘額' },
        { key: r => r.due_date?.slice(0, 10) || '', label: '到期日' },
      ], `發票清單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  const s = data.summary || {};

  return (
    <div>
      <PageLead eyebrow="INVOICES" title="發票管理" description="管理發票開立、付款狀態追蹤，參考 Odoo 會計模組。"
        action={<button onClick={handleExport} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnGhost) }}>匯出 CSV</button>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 10, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 12 }}>
        <StatCard code="UNPD" label="未付款" value={fmtP(s.unpaid_amount)} tone="yellow" />
        <StatCard code="PAID" label="已收款" value={fmtP(s.paid_amount)} tone="green" />
        <StatCard code="OVRD" label="逾期" value={fmtP(s.overdue_amount)} tone="red" />
        <StatCard code="TOTL" label="發票數" value={data.total} tone="blue" />
      </div>

      {/* Unified filter card */}
      <div style={{ ...S.card, marginBottom: 10, padding: isMobile ? '12px 14px' : '10px 16px' }}>
        <div style={{ display: 'flex', gap: isMobile ? 6 : 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: isMobile ? '6px 12px' : '6px 14px', fontSize: isMobile ? 12 : 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: isMobile ? 'calc(50% - 4px)' : 150, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px', ...S.mono }} />
          {!isMobile && <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>}
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: isMobile ? 'calc(50% - 4px)' : 150, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); load(e.target.value, search); }} style={{ ...S.input, width: isMobile ? '100%' : 150, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="sent">已寄出</option>
            <option value="unpaid">未付款</option>
            <option value="partial">部分付款</option>
            <option value="paid">已付款</option>
            <option value="overdue">逾期</option>
            <option value="cancelled">已取消</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋發票號、客戶..." style={{ ...S.input, flex: isMobile ? '1 1 100%' : '1 1 auto', minWidth: isMobile ? 0 : 160, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: 13 }}>查詢</button>
        </div>
      </div>

      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有發票資料" /> : isMobile ? (
        <div>
          {(data.rows || []).map(inv => {
            const st = STATUS_MAP[inv.status] || STATUS_MAP.draft;
            const balance = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
            return (
              <div key={inv.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{inv.invoice_no || '-'}</div>
                    <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{inv.customer_name || '-'}</div>
                  </div>
                  <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 4 }}>{st.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, color: '#6b7280', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e5e7eb' }}>
                  <div><span style={{ color: '#6b7280' }}>金額</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827', ...S.mono }}>{fmtP(inv.total_amount)}</div></div>
                  <div><span style={{ color: '#6b7280' }}>已付</span><div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', ...S.mono }}>{fmtP(inv.paid_amount)}</div></div>
                  <div><span style={{ color: '#6b7280' }}>餘額</span><div style={{ fontSize: 14, fontWeight: 700, color: balance > 0 ? '#dc2626' : '#16a34a', ...S.mono }}>{fmtP(balance)}</div></div>
                  <div><span style={{ color: '#6b7280' }}>到期日</span><div style={{ fontSize: 12, color: '#111827', ...S.mono }}>{inv.due_date?.slice(0, 10) || '-'}</div></div>
                </div>
                {balance > 0 && inv.status !== 'cancelled' && (
                  <button onClick={() => { setPayDialog(inv); setPayAmount(String(balance)); }} style={{ width: '100%', ...S.mobile.btnPrimary }}>收款</button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }}>
          <InvoiceHeader headers={[
            { label: '序', align: 'center' },
            { label: '發票號', align: 'left' },
            { label: '客戶', align: 'left' },
            { label: '狀態', align: 'center' },
            { label: '金額', align: 'right' },
            { label: '已付', align: 'right' },
            { label: '餘額', align: 'right' },
            { label: '到期日', align: 'center' },
            { label: '操作', align: 'center' },
          ]} />
          {(data.rows || []).map((inv, idx) => {
            const st = STATUS_MAP[inv.status] || STATUS_MAP.draft;
            const balance = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
            const cell = { padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' };
            const cCenter = { ...cell, justifyContent: 'center' };
            const cRight = { ...cell, justifyContent: 'flex-end' };
            const cellLast = { ...cell, borderRight: 'none', justifyContent: 'center' };

            return (
              <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: invoiceGridTemplate, borderBottom: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f0f7ff'}
                onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'}>
                <div style={{ ...cCenter, fontSize: 13, color: '#6b7280', ...S.mono }}>{idx + 1}</div>
                <div style={{ ...cell, fontSize: 13, color: '#3b82f6', fontWeight: 700, ...S.mono, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{inv.invoice_no || '-'}</div>
                <div style={cell}>
                  <span style={{ fontSize: 13, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.customer_name || '-'}</span>
                </div>
                <div style={cCenter}><span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 10 }}>{st.label}</span></div>
                <div style={{ ...cRight, fontSize: 13, fontWeight: 700, ...S.mono }}>{fmtP(inv.total_amount)}</div>
                <div style={{ ...cRight, fontSize: 13, color: '#16a34a', ...S.mono }}>{fmtP(inv.paid_amount)}</div>
                <div style={{ ...cRight, fontSize: 13, fontWeight: 700, color: balance > 0 ? '#dc2626' : '#16a34a', ...S.mono }}>{fmtP(balance)}</div>
                <div style={{ ...cCenter, fontSize: 13, ...S.mono }}>{inv.due_date?.slice(0, 10) || '-'}</div>
                <div style={cellLast}>
                  {balance > 0 && inv.status !== 'cancelled' && (
                    <button onClick={() => { setPayDialog(inv); setPayAmount(String(balance)); }} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 10 }}>收款</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || 20}
        total={data.total || 0}
        onPageChange={(nextPage) => load()}
        onLimitChange={(nextLimit) => load()}
      />

      {payDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: isMobile ? '90vw' : 400, maxWidth: '90vw', borderRadius: 14, padding: isMobile ? '16px 18px' : '16px 18px 20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>記錄收款</h3>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#374151' }}>發票：{payDialog.invoice_no} / 餘額：{fmtP(Number(payDialog.total_amount || 0) - Number(payDialog.paid_amount || 0))}</div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>收款金額</label><input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => setPayDialog(null)} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' } : S.btnGhost) }}>取消</button>
              <button onClick={handlePay} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>確認收款</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
