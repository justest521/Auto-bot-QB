'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, exportCsv, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

function GridTable({ data, onRowClick }) {
  const { widths, setWidth } = useResizableColumns('payment_records', DEFAULT_COLUMN_WIDTHS);
  const colKeys = ['seq', 'receipt_no', 'customer_name', 'receipt_date', 'total_amount', 'payment_method', 'status', 'reference_no', 'actions'];
  const colLabels = ['序', '收款單號', '客戶', '收款日期', '金額', '付款方式', '狀態', '參考號', '操作'];
  const gridTemplate = colKeys.map(k => `${widths[k]}px`).join(' ');

  const cell = { padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' };
  const cCenter = { ...cell, justifyContent: 'center' };
  const cRight = { ...cell, justifyContent: 'flex-end' };
  const cellLast = { ...cell, borderRight: 'none' };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, background: '#f3f4f6', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#6b7280', minWidth: 'min-content' }}>
        {colKeys.map((key, idx) => (
          <div key={key} style={{ ...(idx === colKeys.length - 1 ? cellLast : cell), justifyContent: key === 'seq' || key.includes('amount') || key === 'actions' ? 'center' : 'flex-start' }}>
            {idx < colKeys.length - 1 ? (
              <ResizableHeader label={colLabels[idx]} width={widths[key]} onResize={(w) => setWidth(key, w)} />
            ) : (
              colLabels[idx]
            )}
          </div>
        ))}
      </div>
      {data.map((rec, idx) => {
        const st = STATUS_MAP[rec.status] || STATUS_MAP.pending;
        const methodLabel = PAYMENT_METHOD_MAP[rec.payment_method] || rec.payment_method;
        return (
          <div key={rec.id} style={{ display: 'grid', gridTemplateColumns: gridTemplate, borderBottom: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s', minWidth: 'min-content' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
            onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'}
            onClick={() => onRowClick(rec)}>
            <div style={{ ...cCenter, fontSize: 13, color: '#6b7280', ...S.mono }}>{idx + 1}</div>
            <div style={{ ...cell, fontSize: 13, fontWeight: 600, color: '#3b82f6', ...S.mono }}>{rec.receipt_no || '-'}</div>
            <div style={cell}><span style={{ fontSize: 13, color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.customer_name || '-'}</span></div>
            <div style={{ ...cCenter, fontSize: 13, ...S.mono }}>{rec.receipt_date?.slice(0, 10) || '-'}</div>
            <div style={{ ...cRight, fontSize: 13, fontWeight: 700, ...S.mono }}>{fmtP(rec.total_amount)}</div>
            <div style={{ ...cCenter, fontSize: 13 }}>{methodLabel}</div>
            <div style={{ ...cCenter }}><span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 10 }}>{st.label}</span></div>
            <div style={{ ...cell, fontSize: 13, ...S.mono }}>{rec.reference_no || '-'}</div>
            <div style={{ ...cCenter }}>
              <button onClick={(e) => { e.stopPropagation(); onRowClick(rec); }} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 10 }}>詳情</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResizableHeader({ label, width, onResize }) {
  const [isResizing, setIsResizing] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', userSelect: 'none' }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div
        onMouseDown={() => setIsResizing(true)}
        onMouseUp={() => setIsResizing(false)}
        onMouseLeave={() => setIsResizing(false)}
        style={{ width: 4, height: '100%', cursor: 'col-resize', background: isResizing ? '#3b82f6' : 'transparent' }}
      />
    </div>
  );
}

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

const PAYMENT_METHOD_MAP = {
  transfer: '匯款', cash: '現金', check: '支票', credit_card: '信用卡', other: '其他'
};

const STATUS_MAP = {
  pending: { label: '待確認', color: '#f59e0b' },
  confirmed: { label: '已確認', color: '#16a34a' },
  cancelled: { label: '已取消', color: '#6b7280' },
};

const DEFAULT_COLUMN_WIDTHS = {
  seq: 50,
  receipt_no: 120,
  customer_name: 150,
  receipt_date: 110,
  total_amount: 100,
  payment_method: 110,
  status: 90,
  reference_no: 120,
  actions: 80,
};

export default function PaymentRecords() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [msg, setMsg] = useState('');
  const [createDialog, setCreateDialog] = useState(false);
  const [detailDialog, setDetailDialog] = useState(null);
  const [customers, setCustomers] = useState([]);

  // Create form state
  const [createForm, setCreateForm] = useState({
    customer_id: '', receipt_date: new Date().toISOString().slice(0, 10), amount: '',
    payment_method: 'transfer', bank_name: '', reference_no: '', check_no: '',
    check_date: '', remark: ''
  });

  const load = async (status = statusFilter, method = methodFilter, q = search) => {
    setLoading(true);
    try {
      const params = { action: 'payment_receipts', status, payment_method: method, search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await apiGet(params);
      setData(res);
    } finally { setLoading(false); }
  };

  const loadCustomers = async () => {
    try {
      const res = await apiGet({ action: 'customers', limit: '999' });
      setCustomers(res.rows || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); loadCustomers(); }, []);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(statusFilter, methodFilter, search);

  const handleCreateSubmit = async () => {
    if (!createForm.customer_id || !createForm.amount || Number(createForm.amount) <= 0) return;
    try {
      await apiPost({
        action: 'create_payment_receipt',
        customer_id: createForm.customer_id,
        receipt_date: createForm.receipt_date,
        amount: Number(createForm.amount),
        payment_method: createForm.payment_method,
        bank_name: createForm.bank_name,
        reference_no: createForm.reference_no,
        check_no: createForm.check_no,
        check_date: createForm.check_date,
        remark: createForm.remark,
      });
      setMsg('收款記錄已建立');
      setCreateDialog(false);
      setCreateForm({ customer_id: '', receipt_date: new Date().toISOString().slice(0, 10), amount: '', payment_method: 'transfer', bank_name: '', reference_no: '', check_no: '', check_date: '', remark: '' });
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const handleConfirm = async (id) => {
    try {
      await apiPost({ action: 'confirm_payment_receipt', id });
      setMsg('收款已確認');
      setDetailDialog(null);
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const handleCancel = async (id) => {
    try {
      await apiPost({ action: 'cancel_payment_receipt', id });
      setMsg('收款已取消');
      setDetailDialog(null);
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const handleExport = async () => {
    try {
      const params = { action: 'payment_receipts', status: statusFilter, payment_method: methodFilter, limit: '9999', export: 'true', search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const all = await apiGet(params);
      exportCsv(all.rows || [], [
        { key: 'receipt_no', label: '收款單號' },
        { key: 'customer_name', label: '客戶' },
        { key: 'receipt_date', label: '收款日期' },
        { key: 'total_amount', label: '金額' },
        { key: r => PAYMENT_METHOD_MAP[r.payment_method] || r.payment_method, label: '付款方式' },
        { key: 'status', label: '狀態' },
        { key: 'reference_no', label: '參考號' },
      ], `收款記錄_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  const s = data.summary || {};

  return (
    <div>
      <PageLead eyebrow="PAYMENT RECEIPTS" title="收款登錄" description="管理客戶收款記錄、應收款追蹤，參考 Odoo 應收款模組。"
        action={<button onClick={handleExport} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnGhost) }}>匯出 CSV</button>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 10, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 12 }}>
        <StatCard code="PEND" label="待確認" value={s.pending_count || 0} tone="yellow" />
        <StatCard code="CONF" label="已確認" value={s.confirmed_count || 0} tone="green" />
        <StatCard code="CANC" label="已取消" value={s.cancelled_count || 0} tone="gray" />
        <StatCard code="TOTL" label="本期收款總額" value={fmtP(s.total_period_amount)} tone="blue" />
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
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); load(e.target.value, methodFilter, search); }} style={{ ...S.input, width: isMobile ? '100%' : 140, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="pending">待確認</option>
            <option value="confirmed">已確認</option>
            <option value="cancelled">已取消</option>
          </select>
          <select value={methodFilter} onChange={(e) => { setMethodFilter(e.target.value); load(statusFilter, e.target.value, search); }} style={{ ...S.input, width: isMobile ? '100%' : 140, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px' }}>
            <option value="">全部方式</option>
            <option value="transfer">匯款</option>
            <option value="cash">現金</option>
            <option value="check">支票</option>
            <option value="credit_card">信用卡</option>
            <option value="other">其他</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋客戶、單號..." style={{ ...S.input, flex: isMobile ? '1 1 100%' : '1 1 auto', minWidth: isMobile ? 0 : 160, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: 13 }}>查詢</button>
          <button onClick={() => setCreateDialog(true)} style={{ ...S.btnPrimary, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: 13 }}>新增收款</button>
        </div>
      </div>

      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有收款記錄" /> : isMobile ? (
        <div>
          {(data.rows || []).map(rec => {
            const st = STATUS_MAP[rec.status] || STATUS_MAP.pending;
            const methodLabel = PAYMENT_METHOD_MAP[rec.payment_method] || rec.payment_method;
            return (
              <div key={rec.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8, cursor: 'pointer' }} onClick={() => setDetailDialog(rec)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{rec.receipt_no || '-'}</div>
                    <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{rec.customer_name || '-'}</div>
                  </div>
                  <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 4 }}>{st.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, color: '#6b7280', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e5e7eb' }}>
                  <div><span style={{ color: '#6b7280' }}>金額</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827', ...S.mono }}>{fmtP(rec.total_amount)}</div></div>
                  <div><span style={{ color: '#6b7280' }}>日期</span><div style={{ fontSize: 12, color: '#111827', ...S.mono }}>{rec.receipt_date?.slice(0, 10) || '-'}</div></div>
                  <div><span style={{ color: '#6b7280' }}>方式</span><div style={{ fontSize: 12, color: '#111827' }}>{methodLabel}</div></div>
                  <div><span style={{ color: '#6b7280' }}>參考號</span><div style={{ fontSize: 12, color: '#111827', ...S.mono }}>{rec.reference_no || '-'}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div style={{ ...S.card, padding: 0, overflow: 'auto', border: '1px solid #d1d5db' }}>
            <GridTable data={data.rows || []} onRowClick={setDetailDialog} />
          </div>
          {data.total > 20 && <Pager />}
        </>
      )}

      {/* Create Dialog */}
      {createDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: isMobile ? '90vw' : 480, maxWidth: '90vw', borderRadius: 14, padding: isMobile ? '16px 18px' : '16px 18px 20px', maxHeight: '85vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增收款</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>客戶 *</label>
              <select value={createForm.customer_id} onChange={(e) => setCreateForm({ ...createForm, customer_id: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}>
                <option value="">選擇客戶</option>
                {(customers || []).map(c => <option key={c.id} value={c.id}>{c.customer_name || c.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>收款日期 *</label>
              <input type="date" value={createForm.receipt_date} onChange={(e) => setCreateForm({ ...createForm, receipt_date: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>金額 *</label>
              <input type="number" value={createForm.amount} onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })} step="0.01" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>付款方式 *</label>
              <select value={createForm.payment_method} onChange={(e) => setCreateForm({ ...createForm, payment_method: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}>
                <option value="transfer">匯款</option>
                <option value="cash">現金</option>
                <option value="check">支票</option>
                <option value="credit_card">信用卡</option>
                <option value="other">其他</option>
              </select>
            </div>

            {createForm.payment_method === 'transfer' && (
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>銀行名稱</label>
                <input type="text" value={createForm.bank_name} onChange={(e) => setCreateForm({ ...createForm, bank_name: e.target.value })} placeholder="e.g. 台灣銀行" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} />
              </div>
            )}

            {createForm.payment_method === 'transfer' && (
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>匯款編號</label>
                <input type="text" value={createForm.reference_no} onChange={(e) => setCreateForm({ ...createForm, reference_no: e.target.value })} placeholder="匯款編號" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} />
              </div>
            )}

            {createForm.payment_method === 'check' && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>支票號碼</label>
                  <input type="text" value={createForm.check_no} onChange={(e) => setCreateForm({ ...createForm, check_no: e.target.value })} placeholder="支票號碼" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>支票日期</label>
                  <input type="date" value={createForm.check_date} onChange={(e) => setCreateForm({ ...createForm, check_date: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} />
                </div>
              </>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>備註</label>
              <textarea value={createForm.remark} onChange={(e) => setCreateForm({ ...createForm, remark: e.target.value })} placeholder="備註說明" style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: 80, fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => setCreateDialog(false)} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' } : S.btnGhost) }}>取消</button>
              <button onClick={handleCreateSubmit} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>新增</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {detailDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: isMobile ? '90vw' : 500, maxWidth: '90vw', borderRadius: 14, padding: isMobile ? '16px 18px' : '16px 18px 20px', maxHeight: '85vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>收款詳情</h3>

            <div style={{ fontSize: 13, color: '#374151', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><span style={{ color: '#6b7280', fontSize: 12 }}>收款單號</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827', ...S.mono }}>{detailDialog.receipt_no || '-'}</div></div>
                <div><span style={{ color: '#6b7280', fontSize: 12 }}>狀態</span><div style={{ fontSize: 14, fontWeight: 700 }}><span style={{ background: STATUS_MAP[detailDialog.status]?.color || '#6b7280', color: '#fff', padding: '2px 8px', borderRadius: 3, fontSize: 11 }}>{STATUS_MAP[detailDialog.status]?.label || '-'}</span></div></div>
                <div><span style={{ color: '#6b7280', fontSize: 12 }}>客戶</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{detailDialog.customer_name || '-'}</div></div>
                <div><span style={{ color: '#6b7280', fontSize: 12 }}>收款日期</span><div style={{ fontSize: 14, color: '#111827', ...S.mono }}>{detailDialog.receipt_date?.slice(0, 10) || '-'}</div></div>
                <div><span style={{ color: '#6b7280', fontSize: 12 }}>金額</span><div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', ...S.mono }}>{fmtP(detailDialog.total_amount)}</div></div>
                <div><span style={{ color: '#6b7280', fontSize: 12 }}>付款方式</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{PAYMENT_METHOD_MAP[detailDialog.payment_method] || detailDialog.payment_method}</div></div>
                {detailDialog.reference_no && <div><span style={{ color: '#6b7280', fontSize: 12 }}>參考號</span><div style={{ fontSize: 12, color: '#111827', ...S.mono }}>{detailDialog.reference_no}</div></div>}
                {detailDialog.bank_name && <div><span style={{ color: '#6b7280', fontSize: 12 }}>銀行</span><div style={{ fontSize: 12, color: '#111827' }}>{detailDialog.bank_name}</div></div>}
              </div>
            </div>

            {detailDialog.allocations && detailDialog.allocations.length > 0 && (
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>應收帳款配置</h4>
                {(detailDialog.allocations || []).map((alloc, idx) => (
                  <div key={idx} style={{ fontSize: 12, color: '#374151', marginBottom: 8, padding: 8, background: '#f9fafb', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{alloc.invoice_no || '-'}</span>
                      <span style={{ fontWeight: 700, ...S.mono }}>{fmtP(alloc.allocated_amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detailDialog.unallocated_amount > 0 && (
              <div style={{ marginBottom: 16, padding: 10, background: '#fef3c7', borderRadius: 4, fontSize: 13, fontWeight: 600, color: '#d97706' }}>
                未配置金額：{fmtP(detailDialog.unallocated_amount)}
              </div>
            )}

            {detailDialog.remark && (
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>備註</h4>
                <div style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap' }}>{detailDialog.remark}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => setDetailDialog(null)} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' } : S.btnGhost) }}>關閉</button>
              {detailDialog.status === 'pending' && (
                <>
                  <button onClick={() => handleCancel(detailDialog.id)} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' } : S.btnGhost) }}>取消</button>
                  <button onClick={() => handleConfirm(detailDialog.id)} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>確認</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
