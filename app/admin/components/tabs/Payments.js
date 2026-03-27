'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useViewportWidth } from '@/lib/admin/helpers';
import { StatCard } from '../shared/ui';

export default function Payments() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ payments: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ order_id: '', amount: '', payment_method: 'transfer', payment_date: '', bank_last5: '', notes: '' });

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const load = useCallback(async (page = 1, q = search, st = statusF, df = dateFrom, dt = dateTo) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'payments', page: String(page), search: q, status: st, date_from: df, date_to: dt })); } finally { setLoading(false); }
  }, [search, statusF, dateFrom, dateTo]);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      await apiPost({ action: 'create_payment', ...form });
      setCreateOpen(false); setForm({ order_id: '', amount: '', payment_method: 'transfer', payment_date: '', bank_last5: '', notes: '' });
      load();
    } catch (e) { alert(e.message); }
  };

  const handleConfirm = async (id) => {
    try { await apiPost({ action: 'confirm_payment', payment_id: id }); load(); } catch (e) { alert(e.message); }
  };

  const handleExport = async () => {
    try {
      const result = await apiGet({ action: 'payments', page: '1', search: search, status: statusF, date_from: dateFrom, date_to: dateTo, limit: '9999', export: 'true' });
      const rows = result.payments || [];
      const columns = [
        { key: 'payment_number', label: '收款單號' },
        { key: 'customer_name', label: '客戶名稱' },
        { key: 'amount', label: '金額' },
        { key: (row) => ({ transfer: '匯款', cash: '現金', check: '支票', card: '信用卡' })[row.payment_method] || row.payment_method || '-', label: '付款方式' },
        { key: (row) => fmtDate(row.payment_date || row.created_at), label: '付款日期' },
        { key: (row) => row.status === 'confirmed' ? '已確認' : '待確認', label: '狀態' },
      ];
      exportCsv(rows, columns, `收款_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert(e.message); }
  };

  const sm = data.summary || {};
  const methodLabel = (m) => ({ transfer: '匯款', cash: '現金', check: '支票', card: '信用卡' })[m] || m || '-';

  return (
    <div>
      <PageLead eyebrow="Payments" title="收款管理" description="記錄客戶付款、確認收款狀態，自動更新訂單付款進度。"
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>
          <button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增收款</button>
        </div>} />
      <div style={S.statGrid}>
        <StatCard code="PEND" label="待確認" value={fmt(sm.pending)} tone="blue" accent="#f59e0b" />
        <StatCard code="CONF" label="已確認" value={fmt(sm.confirmed)} tone="blue" accent="#16a34a" />
        <StatCard code="AMT" label="已收金額" value={fmtP(sm.total_confirmed_amount)} tone="blue" />
      </div>
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="pending">待確認</option>
            <option value="confirmed">已確認</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusF, dateFrom, dateTo)} placeholder="搜尋..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }} />
          <button onClick={() => load(1, search, statusF, dateFrom, dateTo)} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 13 }}>查詢</button>
        </div>
      </div>
      {loading ? <Loading /> : data.payments.length === 0 ? <EmptyState text="目前沒有收款記錄" /> : data.payments.map(p => (
        <div key={p.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '140px 100px 120px minmax(0,1fr) 100px', gap: 10, alignItems: 'center' }}>
            <div><div style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>PAY_NO</div><div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{p.payment_number || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>AMOUNT</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtP(p.amount)}</div></div>
            <div><div style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>METHOD</div><div style={{ fontSize: 14 }}>{methodLabel(p.payment_method)}</div></div>
            <div><div style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>DATE</div><div style={{ fontSize: 13 }}>{fmtDate(p.payment_date || p.created_at)}</div></div>
            <div>{p.status === 'pending' ? <button onClick={() => handleConfirm(p.id)} style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 12 }}>確認</button> : <span style={S.tag('green')}>已確認</span>}</div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF, dateFrom, dateTo)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>新增收款記錄</h3>
            {[
              { key: 'order_id', label: '訂單 ID (qb_sales_history)', type: 'text' },
              { key: 'amount', label: '金額', type: 'number' },
              { key: 'payment_date', label: '付款日期', type: 'date' },
              { key: 'bank_last5', label: '帳號末五碼', type: 'text' },
              { key: 'notes', label: '備註', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 6 }}>
                <label style={S.label}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={S.input} />
              </div>
            ))}
            <div style={{ marginBottom: 6 }}>
              <label style={S.label}>付款方式</label>
              <select value={form.payment_method} onChange={(e) => setForm(prev => ({ ...prev, payment_method: e.target.value }))} style={S.input}>
                <option value="transfer">匯款</option><option value="cash">現金</option><option value="check">支票</option><option value="card">信用卡</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button>
              <button onClick={handleCreate} style={S.btnPrimary}>建立收款</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
