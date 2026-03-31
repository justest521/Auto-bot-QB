'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtDate, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead } from '../shared/ui';

export default function Stocktake() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30 });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailItems, setDetailItems] = useState([]);

  const load = useCallback(async (page = 1) => { setLoading(true); try { setData(await apiGet({ action: 'stocktakes', page: String(page) })); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => { try { const r = await apiPost({ action: 'create_stocktake', remark: '' }); load(); if (r.stocktake?.id) openDetail(r.stocktake.id); } catch (e) { alert(e.message); } };
  const openDetail = async (id) => { const r = await apiGet({ action: 'stocktake_detail', id }); setDetail(r.stocktake); setDetailItems(r.items || []); };
  const updateActual = async (itemId, val) => { await apiPost({ action: 'update_stocktake_item', item_id: itemId, actual_qty: val }); setDetailItems(prev => prev.map(i => i.id === itemId ? { ...i, actual_qty: Number(val), diff_qty: Number(val) - i.system_qty } : i)); };
  const handleComplete = async () => { if (!detail?.id) return; if (!confirm('確認盤點將自動調整庫存，確定？')) return; try { await apiPost({ action: 'complete_stocktake', stocktake_id: detail.id }); setDetail(null); load(); } catch (e) { alert(e.message); } };

  return (
    <div>
      <PageLead eyebrow="Stocktake" title="盤點精靈" description="建立盤點單自動載入商品系統庫存，輸入實際數量後確認即可調整差異。"
        action={<button onClick={handleCreate} style={S.btnPrimary}>+ 新增盤點</button>} />
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有盤點記錄" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '10px 16px', marginBottom: 10, cursor: 'pointer' }} onClick={() => r.status !== 'completed' && openDetail(r.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><span style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{r.stocktake_no}</span><span style={{ marginLeft: 12, fontSize: t.fontSize.body, color: t.color.textSecondary }}>{fmtDate(r.stocktake_date)}</span></div>
            <span style={S.tag(r.status === 'completed' ? 'green' : 'default')}>{r.status === 'completed' ? '已完成' : r.status === 'counting' ? '盤點中' : '草稿'}</span>
          </div>
        </div>
      ))}
      {detail && (
        <div style={{ ...(isMobile ? S.mobileModal : { position: 'fixed', inset: 0, background: t.color.overlay, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }) }} onClick={() => setDetail(null)}>
          <div style={{ ...(isMobile ? S.mobileModalBody : p.modalBody('lg')) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 12, gap: isMobile ? 10 : 0 }}>
              <div>
                <div style={S.eyebrow}>Stocktake</div>
                <div style={{ fontSize: isMobile ? 18 : t.fontSize.h1, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>盤點 {detail.stocktake_no}</div>
                <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 4 }}>共 {detailItems.length} 品項，差異 {detailItems.filter(i => i.diff_qty !== 0).length} 項</div>
              </div>
              <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto', flexWrap: 'wrap' }}>
                {detail.status !== 'completed' && <button onClick={handleComplete} style={{ ...S.btnPrimary, ...(isMobile ? { flex: 1, minHeight: 44 } : {}) }}>確認盤點</button>}
                <button onClick={() => setDetail(null)} style={{ ...S.btnGhost, ...(isMobile ? { flex: 1, minHeight: 44 } : {}) }}>關閉</button>
              </div>
            </div>
            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ maxHeight: isMobile ? 300 : 420, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: isMobile ? t.fontSize.tiny : t.fontSize.caption }}>
                  <thead><tr style={{ background: t.color.bgMuted, position: 'sticky', top: 0, zIndex: 2 }}>{['料號','品名','系統數量','實際數量','差異'].map(h => <th key={h} style={{ padding: isMobile ? '6px 8px' : '8px 16px', textAlign: 'left', fontSize: isMobile ? t.fontSize.tiny : t.fontSize.caption, color: t.color.textMuted, fontWeight: t.fontWeight.bold, borderBottom: `1px solid ${t.color.border}` }}>{h}</th>)}</tr></thead>
                  <tbody>{detailItems.map(it => (
                    <tr key={it.id} style={{ borderBottom: `1px solid ${t.color.borderLight}`, background: it.diff_qty !== 0 ? t.color.warningBg : 'transparent' }}>
                      <td style={{ padding: isMobile ? '6px 8px' : '8px 16px', ...S.mono, color: t.color.link, fontSize: isMobile ? t.fontSize.tiny : t.fontSize.caption }}>{it.item_number}</td>
                      <td style={{ padding: isMobile ? '6px 8px' : '8px 16px', fontSize: isMobile ? t.fontSize.tiny : t.fontSize.caption }}>{isMobile ? (it.description || '-').slice(0, 8) : (it.description || '-')}</td>
                      <td style={{ padding: isMobile ? '6px 8px' : '8px 16px', textAlign: 'right', fontSize: isMobile ? t.fontSize.tiny : t.fontSize.caption }}>{it.system_qty}</td>
                      <td style={{ padding: isMobile ? '6px 8px' : '8px 16px' }}>{detail.status !== 'completed' ? <input type="number" defaultValue={it.actual_qty} onBlur={(e) => updateActual(it.id, e.target.value)} style={{ ...S.input, width: isMobile ? 50 : 70, padding: '4px 6px', fontSize: isMobile ? t.fontSize.tiny : t.fontSize.caption, textAlign: 'right', minHeight: isMobile ? 32 : 'auto' }} /> : <span style={{ fontSize: isMobile ? t.fontSize.tiny : t.fontSize.caption }}>{it.actual_qty}</span>}</td>
                      <td style={{ padding: isMobile ? '6px 8px' : '8px 16px', textAlign: 'right', fontWeight: t.fontWeight.bold, fontSize: isMobile ? t.fontSize.tiny : t.fontSize.caption, color: it.diff_qty > 0 ? t.color.brand : it.diff_qty < 0 ? t.color.error : t.color.textSecondary }}>{it.diff_qty > 0 ? '+' : ''}{it.diff_qty}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
