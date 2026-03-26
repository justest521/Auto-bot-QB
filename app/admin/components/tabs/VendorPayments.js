'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useViewportWidth } from '@/lib/admin/helpers';
import { StatCard } from '../shared/ui';

export default function VendorPayments() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true); const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: '', amount: '', payment_method: 'transfer', payment_date: '', bank_info: '', remark: '' });

  const load = useCallback(async (page = 1, q = search) => { setLoading(true); try { setData(await apiGet({ action: 'vendor_payments', page: String(page), search: q })); } finally { setLoading(false); } }, [search]);
  useEffect(() => { load(); }, []);
  const handleCreate = async () => { try { await apiPost({ action: 'create_vendor_payment', ...form }); setCreateOpen(false); setForm({ vendor_id: '', amount: '', payment_method: 'transfer', payment_date: '', bank_info: '', remark: '' }); load(); } catch (e) { alert(e.message); } };
  const handleConfirm = async (id) => { try { await apiPost({ action: 'confirm_vendor_payment', payment_id: id }); load(); } catch (e) { alert(e.message); } };

  const handleExport = async () => {
    try {
      const result = await apiGet({ action: 'vendor_payments', page: '1', search: search, limit: '9999', export: 'true' });
      const rows = result.rows || [];
      const columns = [
        { key: 'payment_no', label: '付款單號' },
        { key: 'vendor_id', label: '廠商 ID' },
        { key: 'amount', label: '金額' },
        { key: (row) => ({ transfer: '匯款', cash: '現金', check: '支票', card: '信用卡' })[row.payment_method] || row.payment_method || '-', label: '付款方式' },
        { key: (row) => fmtDate(row.payment_date), label: '付款日期' },
        { key: (row) => row.status === 'confirmed' ? '已付款' : '待確認', label: '狀態' },
        { key: 'remark', label: '備註' },
      ];
      exportCsv(rows, columns, `付款單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert(e.message); }
  };

  const sm = data.summary || {};
  return (
    <div>
      <PageLead eyebrow="Vendor Payments" title="付款單" description="管理對廠商的付款記錄，追蹤應付帳款。"
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>
          <button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增付款</button>
        </div>} />
      <div style={S.statGrid}>
        <StatCard code="PEND" label="待確認" value={fmt(sm.pending)} tone="blue" accent="#f59e0b" />
        <StatCard code="CONF" label="已付款" value={fmt(sm.confirmed)} tone="blue" accent="#16a34a" />
        <StatCard code="AMT" label="已付總額" value={fmtP(sm.total_paid)} tone="blue" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有付款記錄" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px 100px 120px 100px minmax(0,1fr) 100px', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{r.payment_no || '-'}</div>
            <div style={{ fontSize: 13 }}>{fmtDate(r.payment_date)}</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtP(r.amount)}</div>
            <div><span style={S.tag(r.status === 'confirmed' ? 'green' : 'default')}>{r.status === 'confirmed' ? '已付款' : '待確認'}</span></div>
            <div style={{ fontSize: 13, color: '#374151' }}>{r.remark || '-'}</div>
            <div>{r.status === 'pending' && <button onClick={() => handleConfirm(r.id)} style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 12 }}>確認</button>}</div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增付款單</h3>
            {[{ key: 'vendor_id', label: '廠商 ID', type: 'text' }, { key: 'amount', label: '金額', type: 'number' }, { key: 'payment_date', label: '付款日期', type: 'date' }, { key: 'bank_info', label: '銀行/帳號資訊', type: 'text' }, { key: 'remark', label: '備註', type: 'text' }].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}><label style={S.label}>{f.label}</label><input type={f.type} value={form[f.key]} onChange={(e) => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.input} /></div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button><button onClick={handleCreate} style={S.btnPrimary}>建立付款</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
