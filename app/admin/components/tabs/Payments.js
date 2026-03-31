'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { StatCard } from '../shared/ui';

export default function Payments() {
  const { isMobile, isTablet } = useResponsive();
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
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', ...(isMobile ? { width: '100%' } : {}) }}>
          <button onClick={handleExport} style={{ ...S.btnGhost, ...(isMobile ? { flex: 1 } : {}) }}>匯出 CSV</button>
          <button onClick={() => setCreateOpen(true)} style={{ ...S.btnPrimary, ...(isMobile ? { flex: 1, minHeight: 44 } : {}) }}>+ 新增收款</button>
        </div>} />
      <div style={{ ...S.statGrid, ...(isMobile ? S.mobile.statGrid : {}) }}>
        <StatCard code="PEND" label="待確認" value={fmt(sm.pending)} tone="blue" accent={t.color.warning} />
        <StatCard code="CONF" label="已確認" value={fmt(sm.confirmed)} tone="blue" accent={t.color.brand} />
        <StatCard code="AMT" label="已收金額" value={fmtP(sm.total_confirmed_amount)} tone="blue" />
      </div>
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 8, flexWrap: 'wrap', alignItems: isMobile ? 'stretch' : 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', ...(isMobile ? { width: '100%' } : {}) }}>
            {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
              <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: isMobile ? '8px 12px' : '6px 14px', fontSize: isMobile ? 14 : 13, minHeight: isMobile ? 44 : undefined, background: datePreset === key ? t.color.link : t.color.bgCard, color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? t.color.link : t.color.border }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...(isMobile ? { width: '100%' } : {}) }}>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, flex: isMobile ? 1 : undefined, width: isMobile ? undefined : 150, fontSize: isMobile ? 14 : 13, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined, ...S.mono }} />
            <span style={{ color: t.color.textMuted, fontSize: 13, flexShrink: 0 }}>~</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, flex: isMobile ? 1 : undefined, width: isMobile ? undefined : 150, fontSize: isMobile ? 14 : 13, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined, ...S.mono }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...(isMobile ? { width: '100%' } : {}) }}>
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ ...S.input, flex: isMobile ? 1 : undefined, width: isMobile ? undefined : 150, fontSize: isMobile ? 14 : 13, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined }}>
              <option value="">全部狀態</option>
              <option value="pending">待確認</option>
              <option value="confirmed">已確認</option>
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusF, dateFrom, dateTo)} placeholder="搜尋..." style={{ ...S.input, flex: 1, minWidth: isMobile ? 0 : 160, fontSize: isMobile ? 14 : 13, padding: isMobile ? '10px 12px' : '6px 10px', minHeight: isMobile ? 44 : undefined }} />
            <button onClick={() => load(1, search, statusF, dateFrom, dateTo)} style={{ ...S.btnPrimary, padding: isMobile ? '10px 16px' : '6px 18px', fontSize: isMobile ? 14 : 13, minHeight: isMobile ? 44 : undefined, flexShrink: 0 }}>查詢</button>
          </div>
        </div>
      </div>
      {loading ? <Loading /> : data.payments.length === 0 ? <EmptyState text="目前沒有收款記錄" /> : isMobile ? (
        data.payments.map(p => (
          <div key={p.id} style={{ ...S.mobileCard, marginBottom: 10 }}>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>收款單號</span>
              <span style={{ ...S.mobileCardValue, color: t.color.link }}>{p.payment_number || '-'}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>金額</span>
              <span style={S.mobileCardValue}>{fmtP(p.amount)}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>付款方式</span>
              <span style={S.mobileCardValue}>{methodLabel(p.payment_method)}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>付款日期</span>
              <span style={S.mobileCardValue}>{fmtDate(p.payment_date || p.created_at)}</span>
            </div>
            <div style={{ ...S.mobileCardRow }}>
              <span style={S.mobileCardLabel}>狀態</span>
              <div>
                {p.status === 'pending' ? <button onClick={() => handleConfirm(p.id)} style={{ ...S.btnPrimary, padding: '8px 16px', fontSize: 14, minHeight: 44 }}>確認</button> : <span style={S.tag('green')}>已確認</span>}
              </div>
            </div>
          </div>
        ))
      ) : (
        data.payments.map(p => (
          <div key={p.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 100px 120px minmax(0,1fr) 100px', gap: 10, alignItems: 'center' }}>
              <div><div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>PAY_NO</div><div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{p.payment_number || '-'}</div></div>
              <div><div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>AMOUNT</div><div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold }}>{fmtP(p.amount)}</div></div>
              <div><div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>METHOD</div><div style={{ fontSize: t.fontSize.h3 }}>{methodLabel(p.payment_method)}</div></div>
              <div><div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, ...S.mono }}>DATE</div><div style={{ fontSize: t.fontSize.body }}>{fmtDate(p.payment_date || p.created_at)}</div></div>
              <div>{p.status === 'pending' ? <button onClick={() => handleConfirm(p.id)} style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 12 }}>確認</button> : <span style={S.tag('green')}>已確認</span>}</div>
            </div>
          </div>
        ))
      )}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF, dateFrom, dateTo)} />
      {createOpen && isMobile ? (
        <div style={{ ...S.mobileModal }}>
          <div style={{ ...S.mobileModalHeader }}>
            <h3 style={{ margin: '0', fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold }}>新增收款記錄</h3>
            <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, padding: '8px 12px' }}>關閉</button>
          </div>
          <div style={{ ...S.mobileModalBody }}>
            {[
              { key: 'order_id', label: '訂單 ID (qb_sales_history)', type: 'text' },
              { key: 'amount', label: '金額', type: 'number' },
              { key: 'payment_date', label: '付款日期', type: 'date' },
              { key: 'bank_last5', label: '帳號末五碼', type: 'text' },
              { key: 'notes', label: '備註', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 16 }}>
                <label style={S.label}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={{ ...S.input, ...S.mobile.input, width: '100%' }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>付款方式</label>
              <select value={form.payment_method} onChange={(e) => setForm(prev => ({ ...prev, payment_method: e.target.value }))} style={{ ...S.input, ...S.mobile.input, width: '100%' }}>
                <option value="transfer">匯款</option><option value="cash">現金</option><option value="check">支票</option><option value="card">信用卡</option>
              </select>
            </div>
          </div>
          <div style={{ ...S.mobileModalFooter }}>
            <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, flex: 1, minHeight: 44 }}>取消</button>
            <button onClick={handleCreate} style={{ ...S.btnPrimary, ...S.mobile.btnPrimary, flex: 1 }}>建立收款</button>
          </div>
        </div>
      ) : createOpen ? (
        <div style={{ ...p.modalOverlay }}>
          <div style={{ ...p.modalBody('md') }}>
            <h3 style={{ margin: '0 0 12px', fontSize: t.fontSize.h2 }}>新增收款記錄</h3>
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
      ) : null}
    </div>
  );
}
