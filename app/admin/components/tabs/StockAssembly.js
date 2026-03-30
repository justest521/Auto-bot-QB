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

export default function StockAssembly() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30 });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [form, setForm] = useState({ output_item_number: '', output_description: '', output_qty: 1, remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', quantity: 1 }]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'stock_assemblies', page: String(page) })); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const validItems = items.filter(i => i.item_number && Number(i.quantity) > 0);
    if (!validItems.length) return alert('請至少填寫一項原料品項');
    if (!form.output_item_number) return alert('請填寫組合產出料號');
    if (Number(form.output_qty) <= 0) return alert('產出數量必須大於 0');
    try {
      await apiPost({ action: 'create_stock_assembly', ...form, items: validItems });
      setCreateOpen(false);
      setForm({ output_item_number: '', output_description: '', output_qty: 1, remark: '' });
      setItems([{ item_number: '', description: '', quantity: 1 }]);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleExport = async () => {
    try {
      const all = await apiGet({ action: 'stock_assemblies', page: '1', limit: '9999', export: 'true' });
      exportCsv(all.rows || [], [
        { key: 'assembly_no', label: '組合單號' },
        { key: r => fmtDate(r.assembly_date), label: '日期' },
        { key: 'output_item_number', label: '產出料號' },
        { key: 'output_description', label: '產出品名' },
        { key: 'output_qty', label: '產出數量' },
        { key: 'status', label: '狀態' },
        { key: 'remark', label: '備註' },
      ], `組合單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  const statusTag = (s) => {
    const m = STATUS_MAP[s] || STATUS_MAP.draft;
    return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: m.color + '18', color: m.color }}>{m.label}</span>;
  };

  return (
    <div>
      <PageLead eyebrow="Assembly" title="組合單" description="將多項原料 / 零件組合成套件或成品，自動扣減原料庫存並增加成品庫存。"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto' }}>
            <button onClick={handleExport} style={{ ...S.btnGhost, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>匯出 CSV</button>
            <button onClick={() => setCreateOpen(true)} style={{ ...S.btnPrimary, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>+ 新增組合</button>
          </div>
        } />

      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有組合記錄" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '10px 16px', marginBottom: 10, cursor: 'pointer' }} onClick={() => setDetailRow(r)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6', ...S.mono }}>{r.assembly_no}</span>
              <span style={{ fontSize: 13, color: '#374151' }}>{fmtDate(r.assembly_date)}</span>
              {statusTag(r.status)}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              <span style={{ ...S.mono, fontWeight: 600 }}>{r.output_item_number}</span>
              <span style={{ marginLeft: 6 }}>{r.output_description || ''}</span>
              <span style={{ marginLeft: 8, color: '#8b5cf6', fontWeight: 600 }}>×{r.output_qty}</span>
              {r.items?.length ? <span style={{ marginLeft: 8, color: '#9ca3af' }}>({r.items.length} 項原料)</span> : null}
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
          <div style={{ ...(isMobile ? S.mobileModalBody : { width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={S.eyebrow}>Assembly Detail</div>
                <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: '#111827' }}>{detailRow.assembly_no}</div>
              </div>
              <button onClick={() => setDetailRow(null)} style={S.btnGhost}>關閉</button>
            </div>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, color: '#374151' }}>
                <div><span style={S.label}>日期</span><div>{fmtDate(detailRow.assembly_date)}</div></div>
                <div><span style={S.label}>狀態</span><div>{statusTag(detailRow.status)}</div></div>
                <div><span style={S.label}>產出料號</span><div style={S.mono}>{detailRow.output_item_number}</div></div>
                <div><span style={S.label}>產出品名</span><div>{detailRow.output_description || '-'}</div></div>
                <div><span style={S.label}>產出數量</span><div style={{ ...S.mono, fontWeight: 700, color: '#8b5cf6' }}>{detailRow.output_qty}</div></div>
              </div>
              {detailRow.remark && <div style={{ marginTop: 8 }}><span style={S.label}>備註</span><div style={{ fontSize: 13, color: '#6b7280' }}>{detailRow.remark}</div></div>}
            </div>
            {detailRow.items?.length > 0 && (
              <div style={S.card}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 8 }}>原料耗用明細</div>
                {detailRow.items.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: idx < detailRow.items.length - 1 ? '1px solid #f0f2f5' : 'none', fontSize: 13 }}>
                    <div><span style={{ ...S.mono, color: '#8b5cf6' }}>{it.item_number}</span> <span style={{ color: '#6b7280', marginLeft: 6 }}>{it.description || ''}</span></div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>{it.before_qty} → {it.after_qty}</span>
                      <span style={{ ...S.mono, fontWeight: 600, color: '#ef4444' }}>-{it.quantity}</span>
                    </div>
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
          <div style={{ ...(isMobile ? S.mobileModalBody : { width: 'min(660px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 14, padding: '16px 18px 20px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 12, gap: isMobile ? 10 : 0 }}>
              <div>
                <div style={S.eyebrow}>Stock Assembly</div>
                <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: '#111827' }}>新增組合單</div>
              </div>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>關閉</button>
            </div>

            {/* Output Product */}
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 8 }}>組合產出</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>產出料號 *</label><input value={form.output_item_number} onChange={(e) => setForm(p => ({ ...p, output_item_number: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} placeholder="例：KIT-001" /></div>
                <div><label style={S.label}>產出品名</label><input value={form.output_description} onChange={(e) => setForm(p => ({ ...p, output_description: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} placeholder="例：Snap-on 起步工具組" /></div>
                <div><label style={S.label}>產出數量</label><input type="number" value={form.output_qty} onChange={(e) => setForm(p => ({ ...p, output_qty: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono, textAlign: 'center' }} min="1" /></div>
                <div><label style={S.label}>備註</label><input value={form.remark} onChange={(e) => setForm(p => ({ ...p, remark: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
              </div>
            </div>

            {/* Component Items */}
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>原料明細</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>組合後原料庫存將被扣減</span>
              </div>
              <div style={{ maxHeight: isMobile ? 200 : 280, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', display: 'grid', gap: 5, paddingRight: 4 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ background: '#f9fafb', border: '1px solid #f0f2f5', borderRadius: 8, padding: isMobile ? '8px 10px' : '7px 10px', display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr' : 'auto', gap: isMobile ? 8 : 6, alignItems: isMobile ? 'stretch' : 'center' }}>
                    <input value={it.item_number} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], item_number: e.target.value }; return n; })} style={{ ...S.input, ...S.mobile.input, fontSize: isMobile ? 13 : 12, padding: isMobile ? '10px 12px' : '4px 6px', ...S.mono }} placeholder="原料料號" />
                    <input value={it.description} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], description: e.target.value }; return n; })} style={{ ...S.input, ...S.mobile.input, fontSize: isMobile ? 13 : 12, padding: isMobile ? '10px 12px' : '4px 6px' }} placeholder="原料品名" />
                    <input type="number" value={it.quantity} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], quantity: e.target.value }; return n; })} style={{ ...S.input, ...S.mobile.input, width: isMobile ? '100%' : 70, fontSize: isMobile ? 13 : 12, padding: isMobile ? '10px 12px' : '4px 6px', textAlign: 'center', flexShrink: 0, ...S.mono }} placeholder="數量" min="1" />
                    {items.length > 1 && <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))} style={{ ...S.btnGhost, fontSize: 12, padding: '2px 8px', color: '#ef4444', flexShrink: 0 }}>刪除</button>}
                  </div>
                ))}
              </div>
              <button onClick={() => setItems(p => [...p, { item_number: '', description: '', quantity: 1 }])} style={{ ...S.btnGhost, fontSize: isMobile ? 13 : 12, marginTop: 8, width: '100%', minHeight: isMobile ? 44 : 'auto' }}>+ 新增原料</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={handleCreate} style={{ ...S.btnPrimary, flex: 1, ...(isMobile ? S.mobile.btnPrimary : {}) }}>確認組合</button>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, flex: 1, ...(isMobile ? { minHeight: 44 } : {}) }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
