'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';

function StatCard({ label, value, tone }) {
  const TONE = { red: { bg: '#fee2e2', color: '#dc2626' }, yellow: { bg: '#fef3c7', color: '#d97706' }, blue: { bg: '#dbeafe', color: '#2563eb' }, green: { bg: '#dcfce7', color: '#16a34a' }, gray: { bg: '#f3f4f6', color: '#6b7280' } };
  const t = TONE[tone] || TONE.gray;
  return (<div style={{ ...S.card, padding: '16px', textAlign: 'center', borderTop: `3px solid ${t.color}` }}><div style={{ fontSize: 24, fontWeight: 800, color: t.color, ...S.mono }}>{value}</div><div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div></div>);
}

const PAY_METHOD = { transfer: '匯款', cash: '現金', check: '支票', card: '信用卡' };

export default function VendorPayments() {
  const { isMobile } = useResponsive();
  const [tab, setTab] = useState('payments'); // payments | payables | matching
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30, summary: {} });
  const [payables, setPayables] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: '', amount: '', payment_method: 'transfer', payment_date: '', bank_info: '', remark: '' });
  const [detailPayment, setDetailPayment] = useState(null);
  const [detailAllocs, setDetailAllocs] = useState([]);

  // Matching state
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [unpaidPayables, setUnpaidPayables] = useState([]);
  const [matchAmounts, setMatchAmounts] = useState({});
  const [matchChecked, setMatchChecked] = useState(new Set());

  const load = useCallback(async (page = 1, q = search) => {
    setLoading(true);
    try {
      const [paymentsRes, payablesRes] = await Promise.all([
        apiGet({ action: 'vendor_payments', page: String(page), search: q }),
        apiGet({ action: 'vendor_payables', page: '1', limit: '999' }),
      ]);
      setData(paymentsRes);
      setPayables(payablesRes);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      await apiPost({ action: 'create_vendor_payment', ...form });
      setCreateOpen(false);
      setForm({ vendor_id: '', amount: '', payment_method: 'transfer', payment_date: '', bank_info: '', remark: '' });
      setMsg('付款單已建立');
      load();
    } catch (e) { alert(e.message); }
  };

  const handleConfirm = async (id) => {
    try {
      await apiPost({ action: 'confirm_vendor_payment', payment_id: id });
      setMsg('付款單已確認');
      load();
    } catch (e) { alert(e.message); }
  };

  const handleExport = async () => {
    try {
      const result = await apiGet({ action: 'vendor_payments', page: '1', search, limit: '9999', export: 'true' });
      exportCsv(result.rows || [], [
        { key: 'payment_no', label: '付款單號' },
        { key: 'amount', label: '金額' },
        { key: (r) => PAY_METHOD[r.payment_method] || r.payment_method || '-', label: '付款方式' },
        { key: (r) => fmtDate(r.payment_date), label: '付款日期' },
        { key: (r) => r.status === 'confirmed' ? '已付款' : '待確認', label: '狀態' },
        { key: 'remark', label: '備註' },
      ], `付款單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert(e.message); }
  };

  const showDetail = async (payment) => {
    setDetailPayment(payment);
    try {
      const res = await apiGet({ action: 'vendor_payment_allocations', payment_id: payment.id });
      setDetailAllocs(res.rows || []);
    } catch { setDetailAllocs([]); }
  };

  // Matching functions
  const selectForMatching = async (payment) => {
    setSelectedPayment(payment);
    setMatchAmounts({});
    setMatchChecked(new Set());
    try {
      const res = await apiGet({ action: 'unpaid_vendor_payables', vendor_id: payment.vendor_id || '' });
      setUnpaidPayables(res.rows || []);
    } catch { setUnpaidPayables([]); }
    setTab('matching');
  };

  const toggleMatchCheck = (payableId, balance) => {
    setMatchChecked(prev => {
      const s = new Set(prev);
      if (s.has(payableId)) { s.delete(payableId); } else { s.add(payableId); }
      return s;
    });
    if (!matchAmounts[payableId]) {
      setMatchAmounts(prev => ({ ...prev, [payableId]: Math.abs(balance) }));
    }
  };

  const getAllocatedTotal = () => {
    let total = 0;
    matchChecked.forEach(id => { total += Number(matchAmounts[id] || 0); });
    return total;
  };

  const getPaymentRemaining = () => {
    if (!selectedPayment) return 0;
    // Calculate existing allocated
    return Number(selectedPayment.amount || 0);
  };

  const executeMatching = async () => {
    if (!selectedPayment || matchChecked.size === 0) return;
    const allocations = [];
    matchChecked.forEach(id => {
      const amt = Number(matchAmounts[id] || 0);
      if (amt > 0) allocations.push({ payable_id: id, amount: amt });
    });
    if (!allocations.length) return;

    try {
      const res = await apiPost({ action: 'execute_vendor_matching', payment_id: selectedPayment.id, allocations });
      setMsg(res.message || '沖帳完成');
      setSelectedPayment(null);
      setTab('payments');
      load();
    } catch (e) { alert(e.message); }
  };

  const sm = data.summary || {};
  const ps = payables.summary || {};

  const TABS = [
    { id: 'payments', label: '付款單' },
    { id: 'payables', label: '應付帳款' },
    { id: 'matching', label: '付款沖帳' },
  ];

  return (
    <div>
      <PageLead eyebrow="Vendor Payments" title="付款單" description="管理對廠商的付款、應付帳款追蹤與沖帳配對。"
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>
          <button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增付款</button>
        </div>} />

      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 10, cursor: 'pointer', padding: '10px 16px' }} onClick={() => setMsg('')}>{msg}</div>}

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer',
            background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#111827' : '#6b7280',
            boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ═══════ Tab: 付款單 ═══════ */}
      {tab === 'payments' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: isMobile ? 8 : 12, marginBottom: 12 }}>
          <StatCard label="待確認" value={fmt(sm.pending)} tone="yellow" />
          <StatCard label="已付款" value={fmt(sm.confirmed)} tone="green" />
          <StatCard label="已付總額" value={fmtP(sm.total_paid)} tone="blue" />
        </div>

        <div style={{ ...S.card, marginBottom: 10, padding: isMobile ? '12px 14px' : '10px 16px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, search)} placeholder="搜尋付款單號..." style={{ ...S.input, flex: 1, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px' }} />
            <button onClick={() => load(1, search)} style={{ ...S.btnPrimary, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: 13 }}>查詢</button>
          </div>
        </div>

        {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="沒有付款記錄" /> : (
          <div style={{ ...S.card, padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>付款單號</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>日期</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>金額</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>方式</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>狀態</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>備註</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>操作</th>
              </tr></thead>
              <tbody>{data.rows.map((r, idx) => (
                <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer' }} onClick={() => showDetail(r)}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#3b82f6', ...S.mono }}>{r.payment_no || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', ...S.mono }}>{fmtDate(r.payment_date)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(r.amount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{PAY_METHOD[r.payment_method] || r.payment_method || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={S.tag(r.status === 'confirmed' ? 'green' : 'default')}>{r.status === 'confirmed' ? '已付款' : '待確認'}</span></td>
                  <td style={{ padding: '10px 12px', color: '#374151' }}>{r.remark || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    {r.status === 'pending' && <button onClick={() => handleConfirm(r.id)} style={{ ...S.btnPrimary, padding: '4px 12px', fontSize: 11 }}>確認</button>}
                    {r.status === 'confirmed' && <button onClick={() => selectForMatching(r)} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, color: '#0d9488', borderColor: '#0d9488' }}>沖帳</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search)} />
      </>)}

      {/* ═══════ Tab: 應付帳款 ═══════ */}
      {tab === 'payables' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: isMobile ? 8 : 12, marginBottom: 12 }}>
          <StatCard label="應付總額" value={fmtP(ps.total_payable)} tone="red" />
          <StatCard label="已付總額" value={fmtP(ps.total_paid)} tone="green" />
          <StatCard label="逾期金額" value={fmtP(ps.overdue_amount)} tone="yellow" />
        </div>

        {loading ? <Loading /> : (payables.rows || []).length === 0 ? <EmptyState text="沒有應付帳款" /> : (
          <div style={{ ...S.card, padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>應付單號</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>來源</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>廠商</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>到期日</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>應付金額</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>已付</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>餘額</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>狀態</th>
              </tr></thead>
              <tbody>{(payables.rows || []).map((r, idx) => {
                const isReturn = Number(r.total_amount) < 0;
                const statusColor = r.payment_status === 'paid' ? 'green' : r.payment_status === 'partial' ? 'yellow' : 'default';
                const statusLabel = { unpaid: '未付', partial: '部分付', paid: '已付清', cancelled: '已取消' }[r.payment_status] || r.payment_status;
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fff' : '#fafbfd' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: isReturn ? '#dc2626' : '#374151', ...S.mono }}>{r.payable_no}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, color: isReturn ? '#dc2626' : '#2563eb', background: isReturn ? '#fee2e2' : '#eff6ff', padding: '2px 8px', borderRadius: 4 }}>{isReturn ? '退貨沖減' : '進貨'}</span>
                      <span style={{ marginLeft: 6, ...S.mono, fontSize: 12, color: '#6b7280' }}>{r.source_no || '-'}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{r.vendor_name || '-'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', ...S.mono }}>{r.due_date?.slice(0, 10) || '-'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: isReturn ? '#dc2626' : '#111827', ...S.mono }}>{fmtP(r.total_amount)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', ...S.mono }}>{fmtP(r.paid_amount)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: Number(r.balance) > 0 ? '#dc2626' : '#16a34a', ...S.mono }}>{fmtP(r.balance)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={S.tag(statusColor)}>{statusLabel}</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </>)}

      {/* ═══════ Tab: 付款沖帳 ═══════ */}
      {tab === 'matching' && (<>
        {!selectedPayment ? (
          <div>
            <div style={{ ...S.card, padding: '16px', marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>請在「付款單」頁籤中選擇一筆已確認的付款單，點擊「沖帳」按鈕開始配對。</div>
            </div>
          </div>
        ) : (
          <div>
            {/* Selected payment info */}
            <div style={{ ...S.card, padding: '16px', marginBottom: 12, borderLeft: '4px solid #0d9488' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>選定付款單</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0d9488', ...S.mono }}>{selectedPayment.payment_no}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>付款金額</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', ...S.mono }}>{fmtP(selectedPayment.amount)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>已沖帳</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', ...S.mono }}>{fmtP(getAllocatedTotal())}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>沖帳後餘額</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: getPaymentRemaining() - getAllocatedTotal() > 0.01 ? '#f59e0b' : '#16a34a', ...S.mono }}>{fmtP(getPaymentRemaining() - getAllocatedTotal())}</div>
                </div>
              </div>
            </div>

            {/* Unpaid payables to match */}
            <div style={{ ...S.card, padding: '12px 0', marginBottom: 12 }}>
              <div style={{ padding: '0 16px 10px', fontSize: 14, fontWeight: 700, color: '#111827' }}>未付應付帳款</div>
              {unpaidPayables.length === 0 ? <EmptyState text="此廠商沒有未付應付帳款" /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#f3f4f6' }}>
                    <th style={{ padding: '8px 12px', width: 36 }}></th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>應付單號</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>來源</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>到期日</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>餘額</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600, width: 120 }}>沖帳金額</th>
                  </tr></thead>
                  <tbody>{unpaidPayables.map((p, idx) => {
                    const bal = Math.abs(Number(p.balance || 0));
                    const checked = matchChecked.has(p.id);
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid #f0f0f0', background: checked ? '#f0fdfa' : idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer' }}
                        onClick={() => toggleMatchCheck(p.id, p.balance)}>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <input type="checkbox" checked={checked} readOnly style={{ width: 15, height: 15, accentColor: '#0d9488', cursor: 'pointer' }} />
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 600, ...S.mono }}>{p.payable_no}</td>
                        <td style={{ padding: '8px 12px', ...S.mono, fontSize: 12, color: '#6b7280' }}>{p.source_no || '-'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', ...S.mono }}>{p.due_date?.slice(0, 10) || '-'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626', ...S.mono }}>{fmtP(bal)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <input type="number" value={matchAmounts[p.id] ?? ''} min={0} max={bal}
                            onChange={e => setMatchAmounts(prev => ({ ...prev, [p.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                            style={{ ...S.input, width: 100, textAlign: 'right', padding: '4px 8px', fontSize: 13, ...S.mono }} />
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </div>

            {/* Action bar */}
            <div style={{ ...S.card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>已勾選 {matchChecked.size} 筆，沖帳金額 <span style={{ fontWeight: 700, color: '#111827', ...S.mono }}>{fmtP(getAllocatedTotal())}</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setSelectedPayment(null); setTab('payments'); }} style={S.btnGhost}>取消</button>
                <button onClick={executeMatching} disabled={matchChecked.size === 0 || getAllocatedTotal() <= 0 || getAllocatedTotal() > getPaymentRemaining() + 0.01}
                  style={{ ...S.btnPrimary, background: '#0d9488', borderColor: '#0d9488', opacity: matchChecked.size === 0 ? 0.5 : 1 }}>
                  執行沖帳
                </button>
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ═══════ Detail modal ═══════ */}
      {detailPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setDetailPayment(null)}>
          <div style={{ ...(isMobile ? S.mobileModal : { ...S.card, width: 560, maxWidth: '90vw' }), overflowY: 'auto', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>付款單明細</h3>
              <span onClick={() => setDetailPayment(null)} style={{ cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>x</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: '#6b7280' }}>單號</span><div style={{ fontWeight: 700, ...S.mono }}>{detailPayment.payment_no}</div></div>
              <div><span style={{ color: '#6b7280' }}>金額</span><div style={{ fontWeight: 700, color: '#111827', ...S.mono }}>{fmtP(detailPayment.amount)}</div></div>
              <div><span style={{ color: '#6b7280' }}>日期</span><div style={S.mono}>{fmtDate(detailPayment.payment_date)}</div></div>
              <div><span style={{ color: '#6b7280' }}>方式</span><div>{PAY_METHOD[detailPayment.payment_method] || '-'}</div></div>
              <div><span style={{ color: '#6b7280' }}>狀態</span><div><span style={S.tag(detailPayment.status === 'confirmed' ? 'green' : 'default')}>{detailPayment.status === 'confirmed' ? '已付款' : '待確認'}</span></div></div>
              {detailPayment.remark && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#6b7280' }}>備註</span><div>{detailPayment.remark}</div></div>}
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>沖帳記錄</div>
            {detailAllocs.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>尚無沖帳記錄</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '8px', textAlign: 'left', color: '#6b7280' }}>應付單號</th>
                  <th style={{ padding: '8px', textAlign: 'left', color: '#6b7280' }}>來源</th>
                  <th style={{ padding: '8px', textAlign: 'right', color: '#6b7280' }}>沖帳金額</th>
                  <th style={{ padding: '8px', textAlign: 'center', color: '#6b7280' }}>日期</th>
                </tr></thead>
                <tbody>{detailAllocs.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px', ...S.mono }}>{a.payable_no}</td>
                    <td style={{ padding: '8px', ...S.mono, color: '#6b7280' }}>{a.source_no}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#16a34a', ...S.mono }}>{fmtP(a.allocated_amount)}</td>
                    <td style={{ padding: '8px', textAlign: 'center', ...S.mono }}>{a.allocation_date?.slice(0, 10) || '-'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══════ Create modal ═══════ */}
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ ...(isMobile ? S.mobileModal : { ...S.card, width: 440, maxWidth: '90vw' }), overflowY: 'auto', maxHeight: '90vh' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>新增付款單</h3>
            {[{ key: 'vendor_id', label: '廠商 ID', type: 'text' }, { key: 'amount', label: '金額', type: 'number' }, { key: 'payment_date', label: '付款日期', type: 'date' }, { key: 'bank_info', label: '銀行/帳號資訊', type: 'text' }, { key: 'remark', label: '備註', type: 'text' }].map(f => (
              <div key={f.key} style={{ marginBottom: 10 }}><label style={S.label}>{f.label}</label><input type={f.type} value={form[f.key]} onChange={(e) => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
            ))}
            <div style={{ marginBottom: 10 }}>
              <label style={S.label}>付款方式</label>
              <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}>
                <option value="transfer">匯款</option><option value="cash">現金</option><option value="check">支票</option><option value="card">信用卡</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: isMobile ? 'stretch' : 'flex-end', flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, ...(isMobile ? { width: '100%' } : {}) }}>取消</button>
              <button onClick={handleCreate} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}) }}>建立付款</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
