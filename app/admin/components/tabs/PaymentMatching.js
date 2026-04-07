'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

const RECEIPT_DEFAULT_WIDTHS = [50, 120, 120, 120, 120, 120, 80];

function StatCard({ code, label, value, tone }) {
  const TONE_MAP = {
    red: { bg: '#fee2e2', color: '#dc2626' },
    yellow: { bg: '#fef3c7', color: '#d97706' },
    blue: { bg: '#dbeafe', color: '#2563eb' },
    green: { bg: '#dcfce7', color: '#16a34a' },
    gray: { bg: '#f3f4f6', color: t.color.textMuted },
  };
  const toneStyle = TONE_MAP[tone] || TONE_MAP.gray;
  return (
    <div style={{ ...S.card, padding: '16px', textAlign: 'center', borderTop: `3px solid ${toneStyle.color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: toneStyle.color, ...S.mono }}>{value}</div>
      <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function PaymentMatching() {
  const { isMobile, isTablet } = useResponsive();
  const [receipts, setReceipts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [allocations, setAllocations] = useState({});
  const [msg, setMsg] = useState('');
  const [writeOffDialog, setWriteOffDialog] = useState(null);
  const [writeOffType, setWriteOffType] = useState('discount');
  const [writeOffAmount, setWriteOffAmount] = useState('');
  const [writeOffRemark, setWriteOffRemark] = useState('');
  const { gridTemplate: receiptGridTemplate, ResizableHeader: ReceiptHeader } = useResizableColumns('receipt_matching_list', RECEIPT_DEFAULT_WIDTHS);

  const loadData = useCallback(async (cid = customerId) => {
    setLoading(true);
    try {
      const params = cid ? { action: 'payment_matching_summary', customer_id: cid } : { action: 'payment_matching_summary' };
      const res = await apiGet(params);
      setSummary(res.summary || {});
      setReceipts(res.receipts || []);
      setInvoices(res.invoices || []);
      setAllocations({});
      setSelectedReceipt(null);
    } finally { setLoading(false); }
  }, [customerId]);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await apiGet({ action: 'customers_list' });
      setCustomers(res.rows || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadCustomers(); loadData(); }, []);

  const handleCustomerSelect = (cid) => {
    setCustomerId(cid);
    setCustomerSearch('');
  };

  const handleReceiptClick = (receipt) => {
    setSelectedReceipt(receipt);
    setAllocations({});
  };

  const handleAllocationCheck = (invoiceId, checked) => {
    const newAlloc = { ...allocations };
    if (checked) {
      const inv = invoices.find(i => i.id === invoiceId);
      const receipt = selectedReceipt;
      if (inv && receipt) {
        const remaining = Number(receipt.remaining_amount || 0);
        const invBalance = Number(inv.balance || 0);
        const amount = Math.min(remaining, invBalance);
        newAlloc[invoiceId] = amount;
      }
    } else {
      delete newAlloc[invoiceId];
    }
    setAllocations(newAlloc);
  };

  const handleAllocationAmount = (invoiceId, amount) => {
    const newAlloc = { ...allocations };
    const num = Number(amount);
    if (num > 0) {
      newAlloc[invoiceId] = num;
    } else {
      delete newAlloc[invoiceId];
    }
    setAllocations(newAlloc);
  };

  const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + Number(v || 0), 0);
  const receiptRemaining = selectedReceipt ? Number(selectedReceipt.remaining_amount || 0) : 0;

  const handleExecuteMatching = async () => {
    if (!selectedReceipt || Object.keys(allocations).length === 0) return;
    if (totalAllocated > receiptRemaining) { setMsg('沖帳金額超過未沖金額'); return; }
    try {
      const allocs = Object.entries(allocations)
        .filter(([_, amt]) => Number(amt) > 0)
        .map(([invId, amt]) => ({ invoice_id: invId, amount: Number(amt) }));
      await apiPost({
        action: 'execute_matching',
        receipt_id: selectedReceipt.id,
        allocations: allocs,
      });
      setMsg('沖帳已執行');
      await loadData(customerId);
    } catch (e) { setMsg(e.message); }
  };

  const handleWriteOff = async () => {
    if (!writeOffDialog || !writeOffAmount || Number(writeOffAmount) <= 0) return;
    try {
      const allocs = [{
        invoice_id: writeOffDialog,
        amount: Number(writeOffAmount),
        allocation_type: writeOffType,
        remark: writeOffRemark,
      }];
      await apiPost({
        action: 'execute_matching',
        receipt_id: selectedReceipt.id,
        allocations: allocs,
      });
      setMsg(`${writeOffType === 'discount' ? '折讓' : '壞帳'}沖銷已執行`);
      setWriteOffDialog(null);
      setWriteOffAmount('');
      setWriteOffRemark('');
      await loadData(customerId);
    } catch (e) { setMsg(e.message); }
  };

  const handleExport = async () => {
    try {
      const params = customerId ? { action: 'unallocated_receipts', customer_id: customerId, limit: '9999', export: 'true' } : { action: 'unallocated_receipts', limit: '9999', export: 'true' };
      const all = await apiGet(params);
      exportCsv(all.rows || [], [
        { key: 'receipt_no', label: '收款單號' },
        { key: 'receipt_date', label: '收款日期' },
        { key: r => r.customer_name || '-', label: '客戶' },
        { key: 'total_amount', label: '收款金額' },
        { key: 'allocated_amount', label: '已沖金額' },
        { key: 'remaining_amount', label: '未沖金額' },
      ], `未沖收款_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  const s = summary || {};

  return (
    <div>
      <PageLead eyebrow="PAYMENT MATCHING" title="沖帳配對" description="配對未沖收款與未付應收，執行沖帳和特殊沖銷處理。"
        action={<button onClick={handleExport} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnGhost) }}>匯出 CSV</button>} />
      {msg && <div style={{ ...S.card, background: t.color.successBg, borderColor: '#bbf7d0', color: '#15803d', marginBottom: 10, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? t.spacing.xs : t.spacing.md }}>
        <StatCard code="RECQ" label="待沖收款筆數" value={s.unallocated_receipt_count || 0} tone="yellow" />
        <StatCard code="RECM" label="待沖收款金額" value={fmtP(s.unallocated_receipt_amount)} tone="blue" />
        <StatCard code="INVQ" label="未沖應收筆數" value={s.unpaid_invoice_count || 0} tone="red" />
        <StatCard code="INVM" label="未沖應收金額" value={fmtP(s.unpaid_invoice_amount)} tone="gray" />
      </div>

      {/* Customer filter */}
      <div style={{ ...S.card, marginBottom: 10, padding: isMobile ? '12px 14px' : '10px 16px' }}>
        <div style={{ display: 'flex', gap: isMobile ? 6 : 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            placeholder="搜尋客戶..."
            style={{ ...S.input, flex: '1 1 auto', minWidth: isMobile ? 0 : 180, fontSize: t.fontSize.caption, padding: isMobile ? '8px 10px' : '6px 10px' }}
          />
          {customerSearch && customers.filter(c => (c.name || '').toLowerCase().includes(customerSearch.toLowerCase())).length > 0 && (
            <div style={{ position: 'absolute', top: isMobile ? 'auto' : 220, left: isMobile ? 16 : 'auto', right: isMobile ? 16 : 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, maxHeight: 200, overflow: 'auto', zIndex: 100, width: isMobile ? 'calc(100% - 32px)' : 280 }}>
              {customers.filter(c => (c.name || '').toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                <div key={c.id} onClick={() => handleCustomerSelect(c.id)} style={{ padding: '10px 12px', fontSize: t.fontSize.caption, borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: customerId === c.id ? '#dbeafe' : '#fff' }}>
                  {c.name}
                </div>
              ))}
            </div>
          )}
          {customerId && (
            <button onClick={() => { setCustomerId(''); loadData(''); }} style={{ ...S.btnGhost, padding: isMobile ? '6px 12px' : '6px 14px', fontSize: t.fontSize.caption }}>清除篩選</button>
          )}
        </div>
      </div>

      {loading ? <Loading /> : (
        <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? 12 : 16 }}>
          {/* LEFT/TOP: Unallocated Receipts */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>未沖收款</h3>
            {(receipts || []).length === 0 ? (
              <EmptyState text="沒有待沖收款" />
            ) : !isMobile ? (
              <div style={{ ...S.card, padding: 0, overflow: 'auto', border: '1px solid #d1d5db' }}>
                <ReceiptHeader headers={[
                  { label: '序', align: 'center' },
                  { label: '收款單號', align: 'left' },
                  { label: '客戶', align: 'left' },
                  { label: '收款日期', align: 'center' },
                  { label: '收款金額', align: 'right' },
                  { label: '已沖金額', align: 'right' },
                  { label: '未沖金額', align: 'right' },
                ]} />
                <div>
                  {(receipts || []).map((receipt, idx) => {
                    const cell = { padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' };
                    const cCenter = { ...cell, justifyContent: 'center' };
                    const cRight = { ...cell, justifyContent: 'flex-end' };
                    const cellLast = { ...cell, borderRight: 'none' };
                    return (
                      <div key={receipt.id} onClick={() => handleReceiptClick(receipt)} style={{ display: 'grid', gridTemplateColumns: receiptGridTemplate, borderBottom: '1px solid #e5e7eb', background: selectedReceipt?.id === receipt.id ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                        onMouseLeave={e => e.currentTarget.style.background = selectedReceipt?.id === receipt.id ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafbfd'}>
                        <div style={{ ...cCenter, fontSize: t.fontSize.caption, color: t.color.textMuted, ...S.mono }}>{idx + 1}</div>
                        <div style={{ ...cell, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: '#2563eb', ...S.mono }}>{receipt.receipt_no || '-'}</div>
                        <div style={cell}><span style={{ fontSize: t.fontSize.caption, color: t.color.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receipt.customer_name || '-'}</span></div>
                        <div style={{ ...cCenter, fontSize: t.fontSize.caption, color: t.color.textSecondary, ...S.mono }}>{receipt.receipt_date?.slice(0, 10) || '-'}</div>
                        <div style={{ ...cRight, fontSize: t.fontSize.caption, color: t.color.textPrimary, fontWeight: t.fontWeight.semibold, ...S.mono }}>{fmtP(receipt.total_amount)}</div>
                        <div style={{ ...cRight, fontSize: t.fontSize.caption, color: '#16a34a', fontWeight: t.fontWeight.semibold, ...S.mono }}>{fmtP(receipt.allocated_amount)}</div>
                        <div style={{ ...cellLast, ...cRight, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: Number(receipt.remaining_amount) > 0 ? '#dc2626' : '#6b7280', ...S.mono }}>{fmtP(receipt.remaining_amount)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(receipts || []).map(receipt => (
                  <div
                    key={receipt.id}
                    onClick={() => handleReceiptClick(receipt)}
                    style={{
                      ...S.card,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      borderWidth: 2,
                      borderColor: selectedReceipt?.id === receipt.id ? '#2563eb' : '#e5e7eb',
                      background: selectedReceipt?.id === receipt.id ? '#f0f9ff' : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: '#2563eb', ...S.mono }}>{receipt.receipt_no || '-'}</div>
                        <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginTop: 4 }}>{receipt.customer_name || '-'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>收款日期</div>
                        <div style={{ fontSize: t.fontSize.tiny, color: t.color.textPrimary, ...S.mono }}>{receipt.receipt_date?.slice(0, 10) || '-'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: t.fontSize.tiny, borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
                      <div>
                        <span style={{ color: t.color.textMuted }}>收款金額</span>
                        <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{fmtP(receipt.total_amount)}</div>
                      </div>
                      <div>
                        <span style={{ color: t.color.textMuted }}>已沖金額</span>
                        <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: '#16a34a', ...S.mono }}>{fmtP(receipt.allocated_amount)}</div>
                      </div>
                      <div>
                        <span style={{ color: t.color.textMuted }}>未沖金額</span>
                        <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: Number(receipt.remaining_amount) > 0 ? '#dc2626' : '#6b7280', ...S.mono }}>{fmtP(receipt.remaining_amount)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT/BOTTOM: Unpaid Invoices (or selected receipt info on mobile) */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>未付應收</h3>
            {selectedReceipt ? (
              <div>
                {isMobile && (
                  <div style={{ ...S.card, padding: '12px 14px', marginBottom: 12, background: '#f0f9ff', borderColor: '#2563eb' }}>
                    <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6 }}>已選收款單</div>
                    <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: '#2563eb', ...S.mono }}>{selectedReceipt.receipt_no}</div>
                    <div style={{ fontSize: t.fontSize.tiny, color: t.color.textPrimary, marginTop: 4 }}>未沖金額：<span style={{ fontWeight: t.fontWeight.bold, color: '#dc2626', ...S.mono }}>{fmtP(selectedReceipt.remaining_amount)}</span></div>
                  </div>
                )}
                {(invoices || []).length === 0 ? (
                  <EmptyState text="沒有未付應收" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(invoices || []).map(inv => {
                      const balance = Number(inv.balance || 0);
                      const isChecked = allocations.hasOwnProperty(inv.id);
                      return (
                        <div key={inv.id} style={{ ...S.card, padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'start', marginBottom: 10 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handleAllocationCheck(inv.id, e.target.checked)}
                              style={{ marginTop: 3, cursor: 'pointer', width: 18, height: 18 }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{inv.invoice_no || '-'}</div>
                              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginTop: 4 }}>{inv.customer_name || '-'}</div>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: t.fontSize.tiny, borderTop: '1px solid #e5e7eb', paddingTop: 10, marginBottom: 10 }}>
                            <div>
                              <span style={{ color: t.color.textMuted }}>應收金額</span>
                              <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{fmtP(inv.total_amount)}</div>
                            </div>
                            <div>
                              <span style={{ color: t.color.textMuted }}>已付金額</span>
                              <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: '#16a34a', ...S.mono }}>{fmtP(inv.paid_amount)}</div>
                            </div>
                            <div>
                              <span style={{ color: t.color.textMuted }}>餘額</span>
                              <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: balance > 0 ? '#dc2626' : '#6b7280', ...S.mono }}>{fmtP(balance)}</div>
                            </div>
                            <div>
                              <span style={{ color: t.color.textMuted }}>到期日</span>
                              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textPrimary, ...S.mono }}>{inv.due_date?.slice(0, 10) || '-'}</div>
                            </div>
                          </div>
                          {isChecked && (
                            <div style={{ marginBottom: 0 }}>
                              <label style={{ ...S.label, fontSize: t.fontSize.tiny }}>沖帳金額</label>
                              <input
                                type="number"
                                value={allocations[inv.id] || ''}
                                onChange={(e) => handleAllocationAmount(inv.id, e.target.value)}
                                style={{ ...S.input, fontSize: t.fontSize.caption, padding: '6px 10px', ...S.mono }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState text="請先選擇待沖收款" />
            )}
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      {selectedReceipt && !isMobile && (
        <div style={{ ...S.card, marginTop: 16, padding: '14px 16px', background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>收款單</div>
              <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: '#2563eb', marginTop: 4, ...S.mono }}>{selectedReceipt.receipt_no}</div>
            </div>
            <div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>未沖金額</div>
              <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: '#dc2626', marginTop: 4, ...S.mono }}>{fmtP(receiptRemaining)}</div>
            </div>
            <div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>本次沖帳</div>
              <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: totalAllocated > receiptRemaining ? '#dc2626' : '#16a34a', marginTop: 4, ...S.mono }}>{fmtP(totalAllocated)}</div>
            </div>
            <div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>沖帳後餘額</div>
              <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: receiptRemaining - totalAllocated > 0 ? '#f59e0b' : '#16a34a', marginTop: 4, ...S.mono }}>{fmtP(receiptRemaining - totalAllocated)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => { setSelectedReceipt(null); setAllocations({}); }} style={{ ...S.btnGhost, padding: '8px 18px', fontSize: t.fontSize.caption }}>取消</button>
            <button onClick={() => setWriteOffDialog(selectedReceipt.id)} style={{ ...S.btnGhost, padding: '8px 18px', fontSize: t.fontSize.caption }}>折讓沖帳</button>
            <button onClick={() => { setWriteOffType('bad_debt'); setWriteOffDialog(selectedReceipt.id); }} style={{ ...S.btnGhost, padding: '8px 18px', fontSize: t.fontSize.caption }}>壞帳沖銷</button>
            <button onClick={handleExecuteMatching} disabled={Object.keys(allocations).length === 0 || totalAllocated > receiptRemaining} style={{ ...S.btnPrimary, padding: '8px 20px', fontSize: t.fontSize.caption, opacity: (Object.keys(allocations).length === 0 || totalAllocated > receiptRemaining) ? 0.5 : 1, cursor: (Object.keys(allocations).length === 0 || totalAllocated > receiptRemaining) ? 'not-allowed' : 'pointer' }}>執行沖帳</button>
          </div>
        </div>
      )}

      {isMobile && selectedReceipt && (
        <div style={{ ...S.card, marginTop: 12, padding: '12px 14px', background: '#f9fafb' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>未沖金額</div>
              <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: '#dc2626', marginTop: 3, ...S.mono }}>{fmtP(receiptRemaining)}</div>
            </div>
            <div>
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>本次沖帳</div>
              <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: totalAllocated > receiptRemaining ? '#dc2626' : '#16a34a', marginTop: 3, ...S.mono }}>{fmtP(totalAllocated)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
            <button onClick={handleExecuteMatching} disabled={Object.keys(allocations).length === 0 || totalAllocated > receiptRemaining} style={{ ...S.mobile.btnPrimary, opacity: (Object.keys(allocations).length === 0 || totalAllocated > receiptRemaining) ? 0.5 : 1 }}>執行沖帳</button>
            <button onClick={() => setWriteOffDialog(selectedReceipt.id)} style={{ ...S.mobile.btnPrimary, background: '#f3f4f6', color: t.color.textMuted, border: '1px solid #e5e7eb' }}>折讓沖帳</button>
            <button onClick={() => { setWriteOffType('bad_debt'); setWriteOffDialog(selectedReceipt.id); }} style={{ ...S.mobile.btnPrimary, background: '#f3f4f6', color: t.color.textMuted, border: '1px solid #e5e7eb' }}>壞帳沖銷</button>
          </div>
        </div>
      )}

      {/* Write-off modal */}
      {writeOffDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: isMobile ? '90vw' : 420, maxWidth: '90vw', borderRadius: 14, padding: isMobile ? '16px 18px' : '20px 22px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold }}>{writeOffType === 'discount' ? '折讓沖帳' : '壞帳沖銷'}</h3>
            <div style={{ marginBottom: 14, fontSize: t.fontSize.caption, color: t.color.textSecondary }}>
              收款單：{selectedReceipt?.receipt_no} / 未沖金額：{fmtP(receiptRemaining)}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>沖銷金額</label>
              <input
                type="number"
                value={writeOffAmount}
                onChange={(e) => setWriteOffAmount(e.target.value)}
                style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>備註說明</label>
              <input
                type="text"
                value={writeOffRemark}
                onChange={(e) => setWriteOffRemark(e.target.value)}
                placeholder="例如：客戶協商折讓"
                style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => { setWriteOffDialog(null); setWriteOffAmount(''); setWriteOffRemark(''); setWriteOffType('discount'); }} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#f3f4f6', color: t.color.textMuted, border: '1px solid #e5e7eb' } : S.btnGhost) }}>取消</button>
              <button onClick={handleWriteOff} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>確認沖銷</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
