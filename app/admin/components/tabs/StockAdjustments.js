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

export default function StockAdjustments() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30 });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
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

  const statusTag = (s) => {
    const m = STATUS_MAP[s] || STATUS_MAP.draft;
    return <span style={p.badge(m.color)}>{m.label}</span>;
  };

  return (
    <div>
      <PageLead eyebrow="Adjustments" title="調整單" description="手動調整商品庫存數量（正數增加、負數減少），記錄調整原因。"
        action={
          <div style={{ display: 'flex', gap: t.spacing.sm, alignItems: 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto' }}>
            <button onClick={handleExport} style={{ ...S.btnGhost, ...(isMobile ? S.mobile.btnGhost : {}) }}>匯出 CSV</button>
            <button onClick={() => setCreateOpen(true)} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}) }}>+ 新增調整</button>
          </div>
        } />
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有調整記錄" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, ...p.listCard }} onClick={() => setDetailRow(r)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={p.docNo}>{r.adjustment_no}</span>
              <span style={{ fontSize: t.fontSize.body, color: t.color.textSecondary }}>{fmtDate(r.adjustment_date)}</span>
              {statusTag(r.status)}
            </div>
            <div style={{ fontSize: t.fontSize.body, color: t.color.textMuted }}>
              {r.reason || '-'}
              {r.items?.length ? <span style={{ marginLeft: 8, color: t.color.textDisabled }}>({r.items.length} 項)</span> : null}
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
          <div style={{ ...(isMobile ? S.mobileModalBody : p.modalBody('md')) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: t.spacing.md }}>
              <div>
                <div style={S.eyebrow}>Adjustment Detail</div>
                <div style={p.modalTitle(isMobile)}>{detailRow.adjustment_no}</div>
              </div>
              <button onClick={() => setDetailRow(null)} style={S.btnGhost}>關閉</button>
            </div>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.spacing.sm }}>
                <div><span style={S.label}>日期</span><div style={p.fieldValue}>{fmtDate(detailRow.adjustment_date)}</div></div>
                <div><span style={S.label}>狀態</span><div>{statusTag(detailRow.status)}</div></div>
                <div><span style={S.label}>原因</span><div style={p.fieldValue}>{detailRow.reason || '-'}</div></div>
              </div>
              {detailRow.remark && <div style={{ marginTop: t.spacing.sm }}><span style={S.label}>備註</span><div style={{ ...p.fieldValue, color: t.color.textMuted }}>{detailRow.remark}</div></div>}
            </div>
            {detailRow.items?.length > 0 && (
              <div style={S.card}>
                <div style={p.sectionTitle}>調整明細</div>
                {detailRow.items.map((it, idx) => (
                  <div key={idx} style={p.detailRow(idx === detailRow.items.length - 1)}>
                    <div><span style={{ ...S.mono, color: t.color.link }}>{it.item_number}</span> <span style={{ color: t.color.textMuted, marginLeft: 6 }}>{it.description || ''}</span></div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={p.hint}>{it.before_qty} → {it.after_qty}</span>
                      <span style={{ ...S.mono, fontWeight: t.fontWeight.semibold, color: it.adjust_qty >= 0 ? t.color.success : t.color.error }}>{it.adjust_qty >= 0 ? '+' : ''}{it.adjust_qty}</span>
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
          <div style={{ ...(isMobile ? S.mobileModalBody : p.modalBody('md')) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: t.spacing.md, gap: isMobile ? 10 : 0 }}>
              <div>
                <div style={S.eyebrow}>Stock Adjustment</div>
                <div style={p.modalTitle(isMobile)}>新增調整單</div>
              </div>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, ...(isMobile ? S.mobile.btnGhost : {}) }}>關閉</button>
            </div>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div><label style={S.label}>調整原因</label><input value={form.reason} onChange={(e) => setForm(prev => ({ ...prev, reason: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
            </div>
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={p.sectionTitle}>調整明細</span>
                <span style={p.hint}>正數=增加, 負數=減少</span>
              </div>
              <div style={{ maxHeight: isMobile ? 200 : 280, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', display: 'grid', gap: 5, paddingRight: 4 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={p.inlineItemRow(isMobile)}>
                    <input value={it.item_number} onChange={(e) => setItems(prev => { const n = [...prev]; n[idx] = { ...n[idx], item_number: e.target.value }; return n; })} style={{ ...S.input, ...p.inlineInput(isMobile), ...S.mono }} placeholder="料號" />
                    <input value={it.description} onChange={(e) => setItems(prev => { const n = [...prev]; n[idx] = { ...n[idx], description: e.target.value }; return n; })} style={{ ...S.input, ...p.inlineInput(isMobile) }} placeholder="品名" />
                    <input type="number" value={it.adjust_qty} onChange={(e) => setItems(prev => { const n = [...prev]; n[idx] = { ...n[idx], adjust_qty: e.target.value }; return n; })} style={{ ...S.input, ...p.inlineInput(isMobile), width: isMobile ? '100%' : 70, textAlign: 'center', flexShrink: 0, ...S.mono }} placeholder="±數量" />
                    {items.length > 1 && <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, padding: '2px 8px', color: t.color.error, flexShrink: 0 }}>刪除</button>}
                  </div>
                ))}
              </div>
              <button onClick={() => setItems(prev => [...prev, { item_number: '', description: '', adjust_qty: 0 }])} style={{ ...S.btnGhost, fontSize: isMobile ? t.fontSize.body : t.fontSize.caption, marginTop: t.spacing.sm, width: '100%', minHeight: isMobile ? 44 : 'auto' }}>+ 新增品項</button>
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
