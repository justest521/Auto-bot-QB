'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtDate, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead } from '../shared/ui';

const STATUS_MAP = {
  draft: { label: '草稿', color: '#9ca3af' },
  confirmed: { label: '已確認', color: '#10b981' },
  cancelled: { label: '已取消', color: '#ef4444' },
};

export default function StockTransfer() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30 });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [form, setForm] = useState({ from_location: '主倉庫', to_location: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', quantity: 1 }]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'stock_transfers', page: String(page) })); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const validItems = items.filter(i => i.item_number && Number(i.quantity) > 0);
    if (!validItems.length) return alert('請至少填寫一項品項');
    if (!form.from_location || !form.to_location) return alert('請填寫來源與目的地');
    try {
      await apiPost({ action: 'create_stock_transfer', ...form, items: validItems });
      setCreateOpen(false);
      setForm({ from_location: '主倉庫', to_location: '', remark: '' });
      setItems([{ item_number: '', description: '', quantity: 1 }]);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleExport = async () => {
    try {
      const all = await apiGet({ action: 'stock_transfers', page: '1', limit: '9999', export: 'true' });
      exportCsv(all.rows || [], [
        { key: 'transfer_no', label: '調撥單號' },
        { key: r => fmtDate(r.transfer_date), label: '日期' },
        { key: 'from_location', label: '來源' },
        { key: 'to_location', label: '目的地' },
        { key: 'status', label: '狀態' },
        { key: 'remark', label: '備註' },
      ], `調撥單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  const statusTag = (s) => {
    const m = STATUS_MAP[s] || STATUS_MAP.draft;
    return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: m.color + '18', color: m.color }}>{m.label}</span>;
  };

  return (
    <div>
      <PageLead eyebrow="Stock Transfer" title="調撥單" description="記錄商品在不同儲位 / 據點之間的調撥異動。"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto' }}>
            <button onClick={handleExport} style={{ ...S.btnGhost, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>匯出 CSV</button>
            <button onClick={() => setCreateOpen(true)} style={{ ...S.btnPrimary, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>+ 新增調撥</button>
          </div>
        } />

      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有調撥記錄" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '10px 16px', marginBottom: 10, cursor: 'pointer' }} onClick={() => setDetailRow(r)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{r.transfer_no}</span>
              <span style={{ fontSize: 13, color: '#374151' }}>{fmtDate(r.transfer_date)}</span>
              {statusTag(r.status)}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {r.from_location} → {r.to_location}
              {r.items?.length ? <span style={{ marginLeft: 8, color: '#9ca3af' }}>({r.items.length} 項)</span> : null}
            </div>
          </div>
        </div>
      ))}

      {/* Pagination */}
      {data.total > data.limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          {Array.from({ length: Math.ceil(data.total / data.limit) }, (_, i) => (
            <button key={i} onClick={() => load(i + 1)}
              style={{ ...S.btnGhost, fontWeight: data.page === i + 1 ? 700 : 400, minWidth: 36, padding: '4px 8px' }}>{i + 1}</button>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detailRow && (
        <div style={{ ...(isMobile ? S.mobileModal : { position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }) }} onClick={() => setDetailRow(null)}>
          <div style={{ ...(isMobile ? S.mobileModalBody : { width: 'min(580px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={S.eyebrow}>Transfer Detail</div>
                <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: '#111827' }}>{detailRow.transfer_no}</div>
              </div>
              <button onClick={() => setDetailRow(null)} style={S.btnGhost}>關閉</button>
            </div>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, color: '#374151' }}>
                <div><span style={S.label}>日期</span><div>{fmtDate(detailRow.transfer_date)}</div></div>
                <div><span style={S.label}>狀態</span><div>{statusTag(detailRow.status)}</div></div>
                <div><span style={S.label}>來源</span><div>{detailRow.from_location}</div></div>
                <div><span style={S.label}>目的地</span><div>{detailRow.to_location}</div></div>
              </div>
              {detailRow.remark && <div style={{ marginTop: 8 }}><span style={S.label}>備註</span><div style={{ fontSize: 13, color: '#6b7280' }}>{detailRow.remark}</div></div>}
            </div>
            {detailRow.items?.length > 0 && (
              <div style={S.card}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 8 }}>調撥明細</div>
                {detailRow.items.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: idx < detailRow.items.length - 1 ? '1px solid #f0f2f5' : 'none', fontSize: 13 }}>
                    <div><span style={{ ...S.mono, color: '#3b82f6' }}>{it.item_number}</span> <span style={{ color: '#6b7280', marginLeft: 6 }}>{it.description || ''}</span></div>
                    <div style={{ ...S.mono, fontWeight: 600 }}>{it.quantity}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {createOpen && (
        <div style={{ ...(isMobile ? S.mobileModal : { position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }) }} onClick={() => setCreateOpen(false)}>
          <div style={{ ...(isMobile ? S.mobileModalBody : { width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 12, gap: isMobile ? 10 : 0 }}>
              <div>
                <div style={S.eyebrow}>Stock Transfer</div>
                <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: '#111827' }}>新增調撥單</div>
              </div>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>關閉</button>
            </div>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>來源位置</label><input value={form.from_location} onChange={(e) => setForm(p => ({ ...p, from_location: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} placeholder="例：主倉庫" /></div>
                <div><label style={S.label}>目的位置</label><input value={form.to_location} onChange={(e) => setForm(p => ({ ...p, to_location: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} placeholder="例：展示間" /></div>
              </div>
              <div style={{ marginTop: 10 }}><label style={S.label}>備註</label><input value={form.remark} onChange={(e) => setForm(p => ({ ...p, remark: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
            </div>
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>調撥明細</span>
              </div>
              <div style={{ maxHeight: isMobile ? 200 : 280, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', display: 'grid', gap: 5, paddingRight: 4 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ background: '#f9fafb', border: '1px solid #f0f2f5', borderRadius: 8, padding: isMobile ? '8px 10px' : '7px 10px', display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr' : 'auto', gap: isMobile ? 8 : 6, alignItems: isMobile ? 'stretch' : 'center' }}>
                    <input value={it.item_number} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], item_number: e.target.value }; return n; })} style={{ ...S.input, ...S.mobile.input, fontSize: isMobile ? 13 : 12, padding: isMobile ? '10px 12px' : '4px 6px', ...S.mono }} placeholder="料號" />
                    <input value={it.description} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], description: e.target.value }; return n; })} style={{ ...S.input, ...S.mobile.input, fontSize: isMobile ? 13 : 12, padding: isMobile ? '10px 12px' : '4px 6px' }} placeholder="品名" />
                    <input type="number" value={it.quantity} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], quantity: e.target.value }; return n; })} style={{ ...S.input, ...S.mobile.input, width: isMobile ? '100%' : 70, fontSize: isMobile ? 13 : 12, padding: isMobile ? '10px 12px' : '4px 6px', textAlign: 'center', flexShrink: 0, ...S.mono }} placeholder="數量" />
                    {items.length > 1 && <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))} style={{ ...S.btnGhost, fontSize: 12, padding: '2px 8px', color: '#ef4444', flexShrink: 0 }}>刪除</button>}
                  </div>
                ))}
              </div>
              <button onClick={() => setItems(p => [...p, { item_number: '', description: '', quantity: 1 }])} style={{ ...S.btnGhost, fontSize: isMobile ? 13 : 12, marginTop: 8, width: '100%', minHeight: isMobile ? 44 : 'auto' }}>+ 新增品項</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={handleCreate} style={{ ...S.btnPrimary, flex: 1, ...(isMobile ? S.mobile.btnPrimary : {}) }}>確認調撥</button>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, flex: 1, ...(isMobile ? { minHeight: 44 } : {}) }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
