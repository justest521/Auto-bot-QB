'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtDate, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead } from '../shared/ui';

const { t, p } = S;

const STATUS_MAP = {
  draft: { label: '草稿', color: t.color.textDisabled },
  confirmed: { label: '已確認', color: t.color.success },
  cancelled: { label: '已取消', color: t.color.error },
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
    return <span style={p.badge(m.color)}>{m.label}</span>;
  };

  return (
    <div>
      <PageLead eyebrow="Assembly" title="組合單" description="將多項原料 / 零件組合成套件或成品，自動扣減原料庫存並增加成品庫存。"
        action={
          <div style={{ display: 'flex', gap: t.spacing.sm, alignItems: 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto' }}>
            <button onClick={handleExport} style={{ ...S.btnGhost, ...(isMobile ? S.mobile.btnGhost : {}) }}>匯出 CSV</button>
            <button onClick={() => setCreateOpen(true)} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}) }}>+ 新增組合</button>
          </div>
        } />

      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有組合記錄" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, ...p.listCard }} onClick={() => setDetailRow(r)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ ...p.docNo, color: t.color.purple }}>{r.assembly_no}</span>
              <span style={{ fontSize: t.fontSize.body, color: t.color.textSecondary }}>{fmtDate(r.assembly_date)}</span>
              {statusTag(r.status)}
            </div>
            <div style={{ fontSize: t.fontSize.body, color: t.color.textMuted }}>
              <span style={{ ...S.mono, fontWeight: t.fontWeight.semibold }}>{r.output_item_number}</span>
              <span style={{ marginLeft: 6 }}>{r.output_description || ''}</span>
              <span style={{ marginLeft: 8, color: t.color.purple, fontWeight: t.fontWeight.semibold }}>×{r.output_qty}</span>
              {r.items?.length ? <span style={{ marginLeft: 8, color: t.color.textDisabled }}>({r.items.length} 項原料)</span> : null}
            </div>
          </div>
        </div>
      ))}

      {data.total > data.limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: t.spacing.sm, marginTop: t.spacing.lg }}>
          {Array.from({ length: Math.ceil(data.total / data.limit) }, (_, i) => (
            <button key={i} onClick={() => load(i + 1)}
              style={{ ...S.btnGhost, fontWeight: data.page === i + 1 ? t.fontWeight.bold : t.fontWeight.normal, minWidth: 36, padding: '4px 8px' }}>{i + 1}</button>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detailRow && (
        <div style={{ ...(isMobile ? S.mobileModal : p.modalOverlay) }} onClick={() => setDetailRow(null)}>
          <div style={{ ...(isMobile ? S.mobileModalBody : p.modalBody('lg')) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: t.spacing.md }}>
              <div>
                <div style={S.eyebrow}>Assembly Detail</div>
                <div style={p.modalTitle(isMobile)}>{detailRow.assembly_no}</div>
              </div>
              <button onClick={() => setDetailRow(null)} style={S.btnGhost}>關閉</button>
            </div>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.spacing.sm }}>
                <div><span style={S.label}>日期</span><div style={p.fieldValue}>{fmtDate(detailRow.assembly_date)}</div></div>
                <div><span style={S.label}>狀態</span><div>{statusTag(detailRow.status)}</div></div>
                <div><span style={S.label}>產出料號</span><div style={{ ...S.mono, ...p.fieldValue }}>{detailRow.output_item_number}</div></div>
                <div><span style={S.label}>產出品名</span><div style={p.fieldValue}>{detailRow.output_description || '-'}</div></div>
                <div><span style={S.label}>產出數量</span><div style={{ ...S.mono, fontWeight: t.fontWeight.bold, color: t.color.purple }}>{detailRow.output_qty}</div></div>
              </div>
              {detailRow.remark && <div style={{ marginTop: t.spacing.sm }}><span style={S.label}>備註</span><div style={{ ...p.fieldValue, color: t.color.textMuted }}>{detailRow.remark}</div></div>}
            </div>
            {detailRow.items?.length > 0 && (
              <div style={S.card}>
                <div style={p.sectionTitle}>原料耗用明細</div>
                {detailRow.items.map((it, idx) => (
                  <div key={idx} style={p.detailRow(idx === detailRow.items.length - 1)}>
                    <div><span style={{ ...S.mono, color: t.color.purple }}>{it.item_number}</span> <span style={{ color: t.color.textMuted, marginLeft: 6 }}>{it.description || ''}</span></div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ ...p.hint }}>{it.before_qty} → {it.after_qty}</span>
                      <span style={{ ...S.mono, fontWeight: t.fontWeight.semibold, color: t.color.error }}>-{it.quantity}</span>
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
        <div style={{ ...(isMobile ? S.mobileModal : p.modalOverlay) }} onClick={() => setCreateOpen(false)}>
          <div style={{ ...(isMobile ? S.mobileModalBody : p.modalBody('lg')) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: t.spacing.md, gap: isMobile ? 10 : 0 }}>
              <div>
                <div style={S.eyebrow}>Stock Assembly</div>
                <div style={p.modalTitle(isMobile)}>新增組合單</div>
              </div>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, ...(isMobile ? S.mobile.btnGhost : {}) }}>關閉</button>
            </div>

            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={p.sectionTitle}>組合產出</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>產出料號 *</label><input value={form.output_item_number} onChange={(e) => setForm(prev => ({ ...prev, output_item_number: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} placeholder="例：KIT-001" /></div>
                <div><label style={S.label}>產出品名</label><input value={form.output_description} onChange={(e) => setForm(prev => ({ ...prev, output_description: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} placeholder="例：Snap-on 起步工具組" /></div>
                <div><label style={S.label}>產出數量</label><input type="number" value={form.output_qty} onChange={(e) => setForm(prev => ({ ...prev, output_qty: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono, textAlign: 'center' }} min="1" /></div>
                <div><label style={S.label}>備註</label><input value={form.remark} onChange={(e) => setForm(prev => ({ ...prev, remark: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
              </div>
            </div>

            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={p.sectionTitle}>原料明細</span>
                <span style={p.hint}>組合後原料庫存將被扣減</span>
              </div>
              <div style={{ maxHeight: isMobile ? 200 : 280, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', display: 'grid', gap: 5, paddingRight: 4 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={p.inlineItemRow(isMobile)}>
                    <input value={it.item_number} onChange={(e) => setItems(prev => { const n = [...prev]; n[idx] = { ...n[idx], item_number: e.target.value }; return n; })} style={{ ...S.input, ...p.inlineInput(isMobile), ...S.mono }} placeholder="原料料號" />
                    <input value={it.description} onChange={(e) => setItems(prev => { const n = [...prev]; n[idx] = { ...n[idx], description: e.target.value }; return n; })} style={{ ...S.input, ...p.inlineInput(isMobile) }} placeholder="原料品名" />
                    <input type="number" value={it.quantity} onChange={(e) => setItems(prev => { const n = [...prev]; n[idx] = { ...n[idx], quantity: e.target.value }; return n; })} style={{ ...S.input, ...p.inlineInput(isMobile), width: isMobile ? '100%' : 70, textAlign: 'center', flexShrink: 0, ...S.mono }} placeholder="數量" min="1" />
                    {items.length > 1 && <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, padding: '2px 8px', color: t.color.error, flexShrink: 0 }}>刪除</button>}
                  </div>
                ))}
              </div>
              <button onClick={() => setItems(prev => [...prev, { item_number: '', description: '', quantity: 1 }])} style={{ ...S.btnGhost, fontSize: isMobile ? t.fontSize.body : t.fontSize.caption, marginTop: t.spacing.sm, width: '100%', minHeight: isMobile ? 44 : 'auto' }}>+ 新增原料</button>
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
