'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useViewportWidth } from '@/lib/admin/helpers';
import { StatCard } from '../shared/ui';

export default function StockIn() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true); const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: '', po_id: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', qty_received: 1, unit_cost: 0, line_total: 0 }]);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const load = useCallback(async (page = 1, q = search, st = statusF, df = dateFrom, dt = dateTo) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'stock_ins', page: String(page), search: q, status: st, date_from: df, date_to: dt })); } finally { setLoading(false); }
  }, [search, statusF, dateFrom, dateTo]);
  useEffect(() => { load(); }, []);

  const updateItem = (idx, key, val) => setItems(prev => { const next = [...prev]; next[idx] = { ...next[idx], [key]: val }; if (key === 'qty_received' || key === 'unit_cost') next[idx].line_total = Number(next[idx].qty_received || 0) * Number(next[idx].unit_cost || 0); return next; });

  const handleCreate = async () => { try { await apiPost({ action: 'create_stock_in', ...form, items: items.filter(i => i.item_number) }); setCreateOpen(false); setForm({ vendor_id: '', po_id: '', remark: '' }); setItems([{ item_number: '', description: '', qty_received: 1, unit_cost: 0, line_total: 0 }]); load(); } catch (e) { alert(e.message); } };
  const handleConfirm = async (id) => { if (!confirm('確認進貨將自動增加庫存，確定？')) return; try { await apiPost({ action: 'confirm_stock_in', stock_in_id: id }); load(); } catch (e) { alert(e.message); } };

  const handleExport = async () => {
    try {
      const result = await apiGet({ action: 'stock_ins', page: '1', search: search, status: statusF, date_from: dateFrom, date_to: dateTo, limit: '9999', export: 'true' });
      const rows = result.rows || [];
      const columns = [
        { key: 'stock_in_no', label: '進貨單號' },
        { key: 'po_no', label: '採購單號' },
        { key: 'vendor_name', label: '廠商名稱' },
        { key: (row) => row.status === 'confirmed' ? '已入庫' : '待確認', label: '狀態' },
        { key: (row) => fmtDate(row.stock_in_date), label: '進貨日期' },
        { key: 'remark', label: '備註' },
      ];
      exportCsv(rows, columns, `進貨_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert(e.message); }
  };

  const sm = data.summary || {};
  return (
    <div>
      <PageLead eyebrow="Stock In" title="進貨單" description="記錄廠商進貨入庫，確認後自動增加商品庫存數量。"
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>
          <button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增進貨</button>
        </div>} />
      <div style={S.statGrid}>
        <StatCard code="PEND" label="待確認" value={fmt(sm.pending)} tone="blue" accent="#f59e0b" />
        <StatCard code="CONF" label="已入庫" value={fmt(sm.confirmed)} tone="blue" accent="#16a34a" />
      </div>
      <div style={{ ...S.card, marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="pending">待入庫</option>
            <option value="completed">已入庫</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusF, dateFrom, dateTo)} placeholder="搜尋..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }} />
          <button onClick={() => load(1, search, statusF, dateFrom, dateTo)} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 13 }}>查詢</button>
        </div>
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有進貨單" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px 100px 120px 100px minmax(0,1fr) 100px', gap: 12, alignItems: 'center' }}>
            <div><div style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>SI_NO</div><div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{r.stock_in_no || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>DATE</div><div style={{ fontSize: 13 }}>{fmtDate(r.stock_in_date)}</div></div>
            <div><div style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>AMOUNT</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtP(r.total_amount)}</div></div>
            <div><span style={S.tag(r.status === 'confirmed' ? 'green' : 'default')}>{r.status === 'confirmed' ? '已入庫' : '待確認'}</span></div>
            <div style={{ fontSize: 13, color: '#374151' }}>{r.remark || '-'}</div>
            <div>{r.status === 'pending' && <button onClick={() => handleConfirm(r.id)} style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 12 }}>確認入庫</button>}</div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF, dateFrom, dateTo)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setCreateOpen(false)}>
          <div style={{ width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <div style={S.eyebrow}>Stock In</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>新增進貨單</div>
              </div>
              <button onClick={() => setCreateOpen(false)} style={S.btnGhost}>關閉</button>
            </div>
            <div style={{ ...S.card, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div><label style={S.label}>廠商 ID</label><input value={form.vendor_id} onChange={(e) => setForm(p => ({ ...p, vendor_id: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>採購單 ID (選填)</label><input value={form.po_id} onChange={(e) => setForm(p => ({ ...p, po_id: e.target.value }))} style={S.input} /></div>
              </div>
              <div><label style={S.label}>備註</label><input value={form.remark} onChange={(e) => setForm(p => ({ ...p, remark: e.target.value }))} style={S.input} /></div>
            </div>
            <div style={{ ...S.card }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>進貨明細</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{items.length} 項</span>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 5, paddingRight: 4 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ background: '#f9fafb', border: '1px solid #f0f2f5', borderRadius: 8, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input value={it.item_number} onChange={(e) => updateItem(idx, 'item_number', e.target.value)} style={{ ...S.input, flex: 1, fontSize: 12, padding: '4px 6px', ...S.mono }} placeholder="料號" />
                    <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ ...S.input, flex: 1, fontSize: 12, padding: '4px 6px' }} placeholder="品名" />
                    <input type="number" value={it.qty_received} onChange={(e) => updateItem(idx, 'qty_received', e.target.value)} style={{ ...S.input, width: 52, fontSize: 12, padding: '4px 6px', textAlign: 'center', flexShrink: 0 }} placeholder="數量" />
                    <input type="number" value={it.unit_cost} onChange={(e) => updateItem(idx, 'unit_cost', e.target.value)} style={{ ...S.input, width: 72, fontSize: 12, padding: '4px 6px', textAlign: 'right', flexShrink: 0, ...S.mono }} placeholder="成本" />
                    <div style={{ fontSize: 12, color: '#10b981', fontWeight: 700, ...S.mono, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>{fmtP(it.line_total)}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setItems(p => [...p, { item_number: '', description: '', qty_received: 1, unit_cost: 0, line_total: 0 }])} style={{ ...S.btnGhost, fontSize: 12, marginTop: 8, width: '100%' }}>+ 新增品項</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={handleCreate} style={{ ...S.btnPrimary, flex: 1 }}>建立進貨</button>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, flex: 1 }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
