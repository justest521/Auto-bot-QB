'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtDate, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead } from '../shared/ui';

export default function StockAdjustments() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30 });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ reason: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', adjust_qty: 0 }]);

  const load = useCallback(async (page = 1) => { setLoading(true); try { setData(await apiGet({ action: 'stock_adjustments', page: String(page) })); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, []);
  const handleCreate = async () => { try { await apiPost({ action: 'create_stock_adjustment', ...form, items: items.filter(i => i.item_number) }); setCreateOpen(false); setForm({ reason: '', remark: '' }); setItems([{ item_number: '', description: '', adjust_qty: 0 }]); load(); } catch (e) { alert(e.message); } };

  const handleExport = async () => {
    try {
      const all = await apiGet({ action: 'stock_adjustments', page: '1', limit: '9999', export: 'true' });
      exportCsv(all.rows || [], [
        { key: 'adjustment_no', label: '調整單號' },
        { key: r => fmtDate(r.adjustment_date), label: '日期' },
        { key: 'reason', label: '原因' },
        { key: 'remark', label: '備註' },
      ], `調整單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  return (
    <div>
      <PageLead eyebrow="Adjustments" title="調整單" description="手動調整商品庫存數量（正數增加、負數減少），記錄調整原因。"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto' }}>
            <button onClick={handleExport} style={{ ...S.btnGhost, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>匯出 CSV</button>
            <button onClick={() => setCreateOpen(true)} style={{ ...S.btnPrimary, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>+ 新增調整</button>
          </div>
        } />
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有調整記錄" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '10px 16px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><span style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{r.adjustment_no}</span><span style={{ marginLeft: 12, fontSize: 13, color: '#374151' }}>{fmtDate(r.adjustment_date)}</span></div>
            <div style={{ fontSize: 13, color: '#374151' }}>{r.reason || '-'}</div>
          </div>
        </div>
      ))}
      {createOpen && (
        <div style={{ ...(isMobile ? S.mobileModal : { position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }) }} onClick={() => setCreateOpen(false)}>
          <div style={{ ...(isMobile ? S.mobileModalBody : { width: 'min(580px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 12, gap: isMobile ? 10 : 0 }}>
              <div>
                <div style={S.eyebrow}>Stock Adjustment</div>
                <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: '#111827' }}>新增調整單</div>
              </div>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>關閉</button>
            </div>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div><label style={S.label}>調整原因</label><input value={form.reason} onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
            </div>
            <div style={{ ...S.card }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>調整明細</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>正數=增加, 負數=減少</span>
              </div>
              <div style={{ maxHeight: isMobile ? 200 : 280, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', display: 'grid', gap: 5, paddingRight: 4 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ background: '#f9fafb', border: '1px solid #f0f2f5', borderRadius: 8, padding: isMobile ? '8px 10px' : '7px 10px', display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr' : 'auto', gap: isMobile ? 8 : 6, alignItems: isMobile ? 'stretch' : 'center' }}>
                    <input value={it.item_number} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], item_number: e.target.value }; return n; })} style={{ ...S.input, ...S.mobile.input, fontSize: isMobile ? 13 : 12, padding: isMobile ? '10px 12px' : '4px 6px', ...S.mono }} placeholder="料號" />
                    <input value={it.description} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], description: e.target.value }; return n; })} style={{ ...S.input, ...S.mobile.input, fontSize: isMobile ? 13 : 12, padding: isMobile ? '10px 12px' : '4px 6px' }} placeholder="品名" />
                    <input type="number" value={it.adjust_qty} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], adjust_qty: e.target.value }; return n; })} style={{ ...S.input, ...S.mobile.input, width: isMobile ? '100%' : 70, fontSize: isMobile ? 13 : 12, padding: isMobile ? '10px 12px' : '4px 6px', textAlign: 'center', flexShrink: 0, ...S.mono }} placeholder="±數量" />
                  </div>
                ))}
              </div>
              <button onClick={() => setItems(p => [...p, { item_number: '', description: '', adjust_qty: 0 }])} style={{ ...S.btnGhost, fontSize: isMobile ? 13 : 12, marginTop: 8, width: '100%', minHeight: isMobile ? 44 : 'auto' }}>+ 新增品項</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={handleCreate} style={{ ...S.btnPrimary, flex: 1, ...(isMobile ? S.mobile.btnPrimary : {}) }}>確認調整</button>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, flex: 1, ...(isMobile ? { minHeight: 44 } : {}) }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
