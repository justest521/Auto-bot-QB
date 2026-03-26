'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, exportCsv, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead } from '../shared/ui';

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

export default function Invoices() {
  const width = useViewportWidth(); const isMobile = width < 820;
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
        action={<button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={S.statGrid}>
        <StatCard code="UNPD" label="未付款" value={fmtP(s.unpaid_amount)} tone="yellow" />
        <StatCard code="PAID" label="已收款" value={fmtP(s.paid_amount)} tone="green" />
        <StatCard code="OVRD" label="逾期" value={fmtP(s.overdue_amount)} tone="red" />
        <StatCard code="TOTL" label="發票數" value={data.total} tone="blue" />
      </div>

      {/* Unified filter card */}
      <div style={{ ...S.card, marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); load(e.target.value, search); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="sent">已寄出</option>
            <option value="unpaid">未付款</option>
            <option value="partial">部分付款</option>
            <option value="paid">已付款</option>
            <option value="overdue">逾期</option>
            <option value="cancelled">已取消</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋發票號、客戶..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 13 }}>查詢</button>
        </div>
      </div>

      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有發票資料" /> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f3f4f6' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>發票號</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>客戶</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>狀態</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>金額</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>已付</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>餘額</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>到期日</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>操作</th>
          </tr></thead>
          <tbody>{(data.rows || []).map(inv => {
            const st = STATUS_MAP[inv.status] || STATUS_MAP.draft;
            const balance = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
            return (
              <tr key={inv.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#3b82f6', ...S.mono }}>{inv.invoice_no || '-'}</td>
                <td style={{ padding: '10px 12px' }}>{inv.customer_name || '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 10 }}>{st.label}</span></td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(inv.total_amount)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', ...S.mono }}>{fmtP(inv.paid_amount)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: balance > 0 ? '#dc2626' : '#16a34a', ...S.mono }}>{fmtP(balance)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, ...S.mono }}>{inv.due_date?.slice(0, 10) || '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {balance > 0 && inv.status !== 'cancelled' && (
                    <button onClick={() => { setPayDialog(inv); setPayAmount(String(balance)); }} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 10 }}>收款</button>
                  )}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      )}

      {payDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 400, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>記錄收款</h3>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#374151' }}>發票：{payDialog.invoice_no} / 餘額：{fmtP(Number(payDialog.total_amount || 0) - Number(payDialog.paid_amount || 0))}</div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>收款金額</label><input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} style={S.input} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPayDialog(null)} style={S.btnGhost}>取消</button>
              <button onClick={handlePay} style={S.btnPrimary}>確認收款</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
