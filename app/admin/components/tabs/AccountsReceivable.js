'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, exportCsv, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
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

export default function AccountsReceivable() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [msg, setMsg] = useState('');
  const [detailDialog, setDetailDialog] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [newAr, setNewAr] = useState({ customer_id: '', amount: '', due_date: '', remark: '' });

  const load = async (status = statusFilter, q = search) => {
    setLoading(true);
    try {
      const params = { action: 'accounts_receivable', status, search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await apiGet(params);
      setData(res);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

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

  const doSearch = () => load(statusFilter, search);

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
      await load();
    } catch (e) { setMsg(e.message); }
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
      <PageLead eyebrow="ACCOUNTS RECEIVABLE" title="應收帳款管理" description="管理應收帳款、收款狀態追蹤，參考 Odoo 會計模組。"
        action={<button onClick={handleExport} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnGhost) }}>匯出 CSV</button>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 10, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 12 }}>
        <StatCard code="RECV" label="應收總額" value={fmtP(s.total_amount)} tone="red" />
        <StatCard code="PAID" label="已收總額" value={fmtP(s.paid_amount)} tone="green" />
        <StatCard code="OVRD" label="逾期總額" value={fmtP(s.overdue_amount)} tone="yellow" />
        <StatCard code="BLNC" label="未沖餘額" value={fmtP(s.balance_amount)} tone="blue" />
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
            <option value="unpaid">未付款</option>
            <option value="partial">部分付款</option>
            <option value="paid">已付清</option>
            <option value="overdue">逾期</option>
            <option value="cancelled">已取消</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋應收單號、客戶..." style={{ ...S.input, flex: isMobile ? '1 1 100%' : '1 1 auto', minWidth: isMobile ? 0 : 160, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: 13 }}>查詢</button>
        </div>
      </div>

      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有應收帳款資料" /> : isMobile ? (
        <div>
          {(data.rows || []).map(ar => {
            const st = STATUS_MAP[ar.status] || STATUS_MAP.unpaid;
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
                {daysOverdue > 0 && <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>逾期 {daysOverdue} 天</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>應收單號</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>客戶</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>開單日</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>到期日</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>狀態</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>應收金額</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>已收金額</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>未沖餘額</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>逾期天數</th>
            </tr></thead>
            <tbody>{(data.rows || []).map(ar => {
              const st = STATUS_MAP[ar.status] || STATUS_MAP.unpaid;
              const balance = Number(ar.total_amount || 0) - Number(ar.paid_amount || 0);
              const daysOverdue = ar.due_date ? Math.max(0, Math.floor((new Date() - new Date(ar.due_date)) / (1000 * 60 * 60 * 24))) : 0;
              return (
                <tr key={ar.id} onClick={() => loadDetail(ar.id)} style={{ borderTop: '1px solid #f0f0f0', cursor: 'pointer' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#3b82f6', ...S.mono }}>{ar.invoice_no || '-'}</td>
                  <td style={{ padding: '10px 12px' }}>{ar.customer_name || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, ...S.mono }}>{ar.invoice_date?.slice(0, 10) || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, ...S.mono }}>{ar.due_date?.slice(0, 10) || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 10 }}>{st.label}</span></td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(ar.total_amount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', ...S.mono }}>{fmtP(ar.paid_amount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: balance > 0 ? '#dc2626' : '#16a34a', ...S.mono }}>{fmtP(balance)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: daysOverdue > 0 ? '#dc2626' : '#6b7280', fontWeight: daysOverdue > 0 ? 600 : 400 }}>{daysOverdue > 0 ? daysOverdue : '-'}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

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
