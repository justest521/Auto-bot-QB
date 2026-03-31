'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';

export default function PurchaseReturns() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30 });
  const [loading, setLoading] = useState(true); const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: '', reason: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', qty_returned: 1, unit_cost: 0, line_total: 0 }]);

  const load = useCallback(async (page = 1, q = search) => { setLoading(true); try { setData(await apiGet({ action: 'purchase_returns', page: String(page), search: q })); } finally { setLoading(false); } }, [search]);
  useEffect(() => { load(); }, []);
  const updateItem = (idx, key, val) => setItems(prev => { const next = [...prev]; next[idx] = { ...next[idx], [key]: val }; if (key === 'qty_returned' || key === 'unit_cost') next[idx].line_total = Number(next[idx].qty_returned || 0) * Number(next[idx].unit_cost || 0); return next; });
  const handleCreate = async () => { try { await apiPost({ action: 'create_purchase_return', ...form, items: items.filter(i => i.item_number) }); setCreateOpen(false); load(); } catch (e) { alert(e.message); } };

  const handleExport = async () => {
    try {
      const all = await apiGet({ action: 'purchase_returns', page: '1', search, limit: '9999', export: 'true' });
      exportCsv(all.rows || [], [
        { key: 'return_no', label: '退出單號' },
        { key: r => fmtDate(r.return_date), label: '日期' },
        { key: 'total_amount', label: '金額' },
        { key: 'reason', label: '原因' },
      ], `進貨退出_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  return (
    <div>
      <PageLead eyebrow="Purchase Returns" title="進貨退出" description="將已進貨商品退回廠商，自動扣減庫存。"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>
            <button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 建立退出</button>
          </div>
        } />
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search)} placeholder="搜尋退出單號..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), flex: 1, width: isMobile ? '100%' : 'auto' }} />
        <button onClick={() => load(1, search)} style={{ ...S.btnPrimary, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有進貨退出單" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '10px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px 100px 120px minmax(0,1fr)', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{r.return_no || '-'}</div>
            <div style={{ fontSize: t.fontSize.body }}>{fmtDate(r.return_date)}</div>
            <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold }}>{fmtP(r.total_amount)}</div>
            <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary }}>{r.reason || '-'}</div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search)} />
      {createOpen && (
        <div style={p.modalOverlay} onClick={() => setCreateOpen(false)}>
          <div style={{ ...(isMobile ? S.mobileModal : p.modalBody('lg')), overflowY: 'auto', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 12, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 0 }}>
              <div>
                <div style={S.eyebrow}>Purchase Return</div>
                <div style={{ fontSize: t.fontSize.h1, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>建立進貨退出</div>
              </div>
              <button onClick={() => setCreateOpen(false)} style={S.btnGhost}>關閉</button>
            </div>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>廠商 ID</label><input value={form.vendor_id} onChange={(e) => setForm(prev => ({ ...prev, vendor_id: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
                <div><label style={S.label}>退貨原因</label><input value={form.reason} onChange={(e) => setForm(prev => ({ ...prev, reason: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
              </div>
            </div>
            <div style={{ ...S.card }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textSecondary }}>退出明細</span>
                <span style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled }}>{items.length} 項</span>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 5, paddingRight: 4 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ background: t.color.bgMuted, border: `1px solid ${t.color.borderLight}`, borderRadius: t.radius.md, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input value={it.item_number} onChange={(e) => updateItem(idx, 'item_number', e.target.value)} style={{ ...S.input, flex: 1, fontSize: t.fontSize.caption, padding: '4px 6px', ...S.mono }} placeholder="料號" />
                    <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ ...S.input, flex: 1, fontSize: t.fontSize.caption, padding: '4px 6px' }} placeholder="品名" />
                    <input type="number" value={it.qty_returned} onChange={(e) => updateItem(idx, 'qty_returned', e.target.value)} style={{ ...S.input, width: 52, fontSize: t.fontSize.caption, padding: '4px 6px', textAlign: 'center', flexShrink: 0 }} placeholder="數量" />
                    <input type="number" value={it.unit_cost} onChange={(e) => updateItem(idx, 'unit_cost', e.target.value)} style={{ ...S.input, width: 72, fontSize: t.fontSize.caption, padding: '4px 6px', textAlign: 'right', flexShrink: 0, ...S.mono }} placeholder="成本" />
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.success, fontWeight: t.fontWeight.bold, ...S.mono, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>{fmtP(it.line_total)}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setItems(prev => [...prev, { item_number: '', description: '', qty_returned: 1, unit_cost: 0, line_total: 0 }])} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, marginTop: 8, width: '100%' }}>+ 新增品項</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={handleCreate} style={{ ...S.btnPrimary, flex: 1, ...(isMobile ? S.mobile.btnPrimary : {}) }}>建立退出</button>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, flex: 1, ...(isMobile ? S.mobile.input : {}) }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
