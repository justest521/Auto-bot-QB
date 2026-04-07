'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';

function StatCard({ label, value, tone }) {
  const TONE = { red: { bg: t.color.errorBg, color: '#dc2626' }, yellow: { bg: t.color.warningBg, color: '#d97706' }, blue: { bg: '#dbeafe', color: '#2563eb' }, green: { bg: t.color.successBg, color: t.color.brand }, gray: { bg: '#f3f4f6', color: t.color.textMuted } };
  const toneStyle = TONE[tone] || TONE.gray;
  return (<div style={{ ...S.card, padding: '16px', textAlign: 'center', borderTop: `3px solid ${toneStyle.color}` }}><div style={{ fontSize: 24, fontWeight: 800, color: toneStyle.color, ...S.mono }}>{value}</div><div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 4 }}>{label}</div></div>);
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

      {msg && <div style={{ ...S.card, background: t.color.successBg, borderColor: '#bbf7d0', color: '#15803d', marginBottom: 10, cursor: 'pointer', padding: '10px 16px' }} onClick={() => setMsg('')}>{msg}</div>}

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f3f4f6', borderRadius: t.radius.lg, padding: 4 }}>
        {TABS.map(tabItem => (
          <button key={tabItem.id} onClick={() => setTab(tabItem.id)} style={{
            flex: 1, padding: '8px 16px', fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, border: 'none', borderRadius: t.radius.md, cursor: 'pointer',
            background: tab === tabItem.id ? t.color.bgCard : 'transparent', color: tab === tabItem.id ? t.color.textPrimary : t.color.textMuted,
            boxShadow: tab === tabItem.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s',
          }}>{tabItem.label}</button>
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
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, search)} placeholder="搜尋付款單號..." style={{ ...S.input, flex: 1, fontSize: t.fontSize.caption, padding: isMobile ? '8px 10px' : '6px 10px' }} />
            <button onClick={() => load(1, search)} style={{ ...S.btnPrimary, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: t.fontSize.caption }}>查詢</button>
          </div>
        </div>

        {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="沒有付款記錄" /> : (
          <div style={{ ...S.card, padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.fontSize.body }}>
              <thead><tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>付款單號</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>日期</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>金額</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>方式</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>狀態</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>備註</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>操作</th>
              </tr></thead>
              <tbody>{data.rows.map((r, idx) => (
                <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0', background: idx % 2 === 0 ? t.color.bgCard : '#fafbfd', cursor: 'pointer' }} onClick={() => showDetail(r)}>
                  <td style={{ padding: '10px 12px', fontWeight: t.fontWeight.semibold, color: t.color.link, ...S.mono }}>{r.payment_no || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', ...S.mono }}>{fmtDate(r.payment_date)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(r.amount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{PAY_METHOD[r.payment_method] || r.payment_method || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={S.tag(r.status === 'confirmed' ? 'green' : 'default')}>{r.status === 'confirmed' ? '已付款' : '待確認'}</span></td>
                  <td style={{ padding: '10px 12px', color: t.color.textSecondary }}>{r.remark || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    {r.status === 'pending' && <button onClick={() => handleConfirm(r.id)} style={{ ...S.btnPrimary, padding: '4px 12px', fontSize: t.fontSize.tiny }}>確認</button>}
                    {r.status === 'confirmed' && <button onClick={() => selectForMatching(r)} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: t.fontSize.tiny, color: '#0d9488', borderColor: '#0d9488' }}>沖帳</button>}
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.fontSize.body }}>
              <thead><tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>應付單號</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>來源</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>廠商</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>到期日</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>應付金額</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>已付</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>餘額</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>狀態</th>
              </tr></thead>
              <tbody>{(payables.rows || []).map((r, idx) => {
                const isReturn = Number(r.total_amount) < 0;
                const statusColor = r.payment_status === 'paid' ? 'green' : r.payment_status === 'partial' ? 'yellow' : 'default';
                const statusLabel = { unpaid: '未付', partial: '部分付', paid: '已付清', cancelled: '已取消' }[r.payment_status] || r.payment_status;
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0', background: idx % 2 === 0 ? t.color.bgCard : '#fafbfd' }}>
                    <td style={{ padding: '10px 12px', fontWeight: t.fontWeight.semibold, color: isReturn ? '#dc2626' : t.color.textSecondary, ...S.mono }}>{r.payable_no}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: t.fontSize.tiny, color: isReturn ? '#dc2626' : '#2563eb', background: isReturn ? t.color.errorBg : t.color.infoBg, padding: '2px 8px', borderRadius: t.radius.sm }}>{isReturn ? '退貨沖減' : '進貨'}</span>
                      <span style={{ marginLeft: 6, ...S.mono, fontSize: t.fontSize.caption, color: t.color.textMuted }}>{r.source_no || '-'}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{r.vendor_name || '-'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', ...S.mono }}>{r.due_date?.slice(0, 10) || '-'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: t.fontWeight.bold, color: isReturn ? '#dc2626' : t.color.textPrimary, ...S.mono }}>{fmtP(r.total_amount)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: t.color.brand, ...S.mono }}>{fmtP(r.paid_amount)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: t.fontWeight.bold, color: Number(r.balance) > 0 ? '#dc2626' : t.color.brand, ...S.mono }}>{fmtP(r.balance)}</td>
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
              <div style={{ fontSize: t.fontSize.h3, color: t.color.textMuted, textAlign: 'center' }}>請在「付款單」頁籤中選擇一筆已確認的付款單，點擊「沖帳」按鈕開始配對。</div>
            </div>
          </div>
        ) : (
          <div>
            {/* Selected payment info */}
            <div style={{ ...S.card, padding: '16px', marginBottom: 12, borderLeft: '4px solid #0d9488' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>選定付款單</div>
                  <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: '#0d9488', ...S.mono }}>{selectedPayment.payment_no}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>付款金額</div>
                  <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{fmtP(selectedPayment.amount)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>已沖帳</div>
                  <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.brand, ...S.mono }}>{fmtP(getAllocatedTotal())}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>沖帳後餘額</div>
                  <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: getPaymentRemaining() - getAllocatedTotal() > 0.01 ? t.color.warning : t.color.brand, ...S.mono }}>{fmtP(getPaymentRemaining() - getAllocatedTotal())}</div>
                </div>
              </div>
            </div>

            {/* Unpaid payables to match */}
            <div style={{ ...S.card, padding: '12px 0', marginBottom: 12 }}>
              <div style={{ padding: '0 16px 10px', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>未付應付帳款</div>
              {unpaidPayables.length === 0 ? <EmptyState text="此廠商沒有未付應付帳款" /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.fontSize.body }}>
                  <thead><tr style={{ background: '#f3f4f6' }}>
                    <th style={{ padding: '8px 12px', width: 36 }}></th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>應付單號</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>來源</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>到期日</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>餘額</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: t.color.textMuted, fontWeight: t.fontWeight.semibold, width: 120 }}>沖帳金額</th>
                  </tr></thead>
                  <tbody>{unpaidPayables.map((p, idx) => {
                    const bal = Math.abs(Number(p.balance || 0));
                    const checked = matchChecked.has(p.id);
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid #f0f0f0', background: checked ? '#f0fdfa' : idx % 2 === 0 ? t.color.bgCard : '#fafbfd', cursor: 'pointer' }}
                        onClick={() => toggleMatchCheck(p.id, p.balance)}>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <input type="checkbox" checked={checked} readOnly style={{ width: 15, height: 15, accentColor: '#0d9488', cursor: 'pointer' }} />
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: t.fontWeight.semibold, ...S.mono }}>{p.payable_no}</td>
                        <td style={{ padding: '8px 12px', ...S.mono, fontSize: t.fontSize.caption, color: t.color.textMuted }}>{p.source_no || '-'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', ...S.mono }}>{p.due_date?.slice(0, 10) || '-'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: t.fontWeight.bold, color: '#dc2626', ...S.mono }}>{fmtP(bal)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <input type="number" value={matchAmounts[p.id] ?? ''} min={0} max={bal}
                            onChange={e => setMatchAmounts(prev => ({ ...prev, [p.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                            style={{ ...S.input, width: 100, textAlign: 'right', padding: '4px 8px', fontSize: t.fontSize.body, ...S.mono }} />
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </div>

            {/* Action bar */}
            <div style={{ ...S.card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: t.fontSize.body, color: t.color.textMuted }}>已勾選 {matchChecked.size} 筆，沖帳金額 <span style={{ fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{fmtP(getAllocatedTotal())}</span></div>
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
        <div style={p.modalOverlay} onClick={() => setDetailPayment(null)}>
          <div style={{ ...(isMobile ? S.mobileModal : p.modalBody('md')), overflowY: 'auto', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: t.fontSize.h2 }}>付款單明細</h3>
              <span onClick={() => setDetailPayment(null)} style={{ cursor: 'pointer', fontSize: t.fontSize.h1, color: t.color.textMuted }}>x</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: t.fontSize.body }}>
              <div><span style={{ color: t.color.textMuted }}>單號</span><div style={{ fontWeight: t.fontWeight.bold, ...S.mono }}>{detailPayment.payment_no}</div></div>
              <div><span style={{ color: t.color.textMuted }}>金額</span><div style={{ fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{fmtP(detailPayment.amount)}</div></div>
              <div><span style={{ color: t.color.textMuted }}>日期</span><div style={S.mono}>{fmtDate(detailPayment.payment_date)}</div></div>
              <div><span style={{ color: t.color.textMuted }}>方式</span><div>{PAY_METHOD[detailPayment.payment_method] || '-'}</div></div>
              <div><span style={{ color: t.color.textMuted }}>狀態</span><div><span style={S.tag(detailPayment.status === 'confirmed' ? 'green' : 'default')}>{detailPayment.status === 'confirmed' ? '已付款' : '待確認'}</span></div></div>
              {detailPayment.remark && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: t.color.textMuted }}>備註</span><div>{detailPayment.remark}</div></div>}
            </div>

            <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, marginBottom: 8 }}>沖帳記錄</div>
            {detailAllocs.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: t.fontSize.body, color: t.color.textDisabled }}>尚無沖帳記錄</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.fontSize.caption }}>
                <thead><tr style={{ background: t.color.bgMuted }}>
                  <th style={{ padding: '8px', textAlign: 'left', color: t.color.textMuted }}>應付單號</th>
                  <th style={{ padding: '8px', textAlign: 'left', color: t.color.textMuted }}>來源</th>
                  <th style={{ padding: '8px', textAlign: 'right', color: t.color.textMuted }}>沖帳金額</th>
                  <th style={{ padding: '8px', textAlign: 'center', color: t.color.textMuted }}>日期</th>
                </tr></thead>
                <tbody>{detailAllocs.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px', ...S.mono }}>{a.payable_no}</td>
                    <td style={{ padding: '8px', ...S.mono, color: t.color.textMuted }}>{a.source_no}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: t.fontWeight.bold, color: t.color.brand, ...S.mono }}>{fmtP(a.allocated_amount)}</td>
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
        <div style={p.modalOverlay}>
          <div style={{ ...(isMobile ? S.mobileModal : p.modalBody('md')), overflowY: 'auto', maxHeight: '90vh' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: t.fontSize.h2 }}>新增付款單</h3>
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
