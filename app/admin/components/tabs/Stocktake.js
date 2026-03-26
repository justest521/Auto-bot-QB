'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtDate } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead } from '../shared/ui';

export default function Stocktake() {
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
        <div key={r.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' }} onClick={() => r.status !== 'completed' && openDetail(r.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><span style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{r.stocktake_no}</span><span style={{ marginLeft: 12, fontSize: 13, color: '#374151' }}>{fmtDate(r.stocktake_date)}</span></div>
            <span style={S.tag(r.status === 'completed' ? 'green' : 'default')}>{r.status === 'completed' ? '已完成' : r.status === 'counting' ? '盤點中' : '草稿'}</span>
          </div>
        </div>
      ))}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setDetail(null)}>
          <div style={{ width: 'min(740px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <div style={S.eyebrow}>Stocktake</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>盤點 {detail.stocktake_no}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>共 {detailItems.length} 品項，差異 {detailItems.filter(i => i.diff_qty !== 0).length} 項</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {detail.status !== 'completed' && <button onClick={handleComplete} style={S.btnPrimary}>確認盤點</button>}
                <button onClick={() => setDetail(null)} style={S.btnGhost}>關閉</button>
              </div>
            </div>
            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                  <thead><tr style={{ background: '#f3f4f6', position: 'sticky', top: 0, zIndex: 2 }}>{['料號','品名','系統數量','實際數量','差異'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, color: '#6b7280', fontWeight: 700, borderBottom: '1px solid #dbe3ee' }}>{h}</th>)}</tr></thead>
                  <tbody>{detailItems.map(it => (
                    <tr key={it.id} style={{ borderBottom: '1px solid #edf0f5', background: it.diff_qty !== 0 ? '#fff8eb' : 'transparent' }}>
                      <td style={{ padding: '6px 10px', ...S.mono, color: '#3b82f6', fontSize: 12 }}>{it.item_number}</td>
                      <td style={{ padding: '6px 10px', fontSize: 12 }}>{it.description || '-'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12 }}>{it.system_qty}</td>
                      <td style={{ padding: '6px 10px' }}>{detail.status !== 'completed' ? <input type="number" defaultValue={it.actual_qty} onBlur={(e) => updateActual(it.id, e.target.value)} style={{ ...S.input, width: 70, padding: '4px 8px', fontSize: 12, textAlign: 'right' }} /> : <span style={{ fontSize: 12 }}>{it.actual_qty}</span>}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontSize: 12, color: it.diff_qty > 0 ? '#16a34a' : it.diff_qty < 0 ? '#ef4444' : '#374151' }}>{it.diff_qty > 0 ? '+' : ''}{it.diff_qty}</td>
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
