'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, ComingSoonBanner } from '../shared/ui';

export default function ReorderSuggestions() {
  const { isMobile, isTablet } = useResponsive();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [msg, setMsg] = useState('');

  const load = async () => { setLoading(true); try { const res = await apiGet({ action: 'reorder_suggestions', status: 'pending' }); setSuggestions(res.suggestions || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const generate = async () => { setLoading(true); try { await apiGet({ action: 'reorder_suggestions', generate: '1', status: 'pending' }); await load(); setMsg('已掃描庫存並產生補貨建議'); } catch (e) { setMsg(e.message); } };

  const convertToPO = async () => {
    if (!selected.length) return;
    try {
      const res = await apiPost({ action: 'reorder_to_po', suggestion_ids: selected });
      setMsg(res.message || '採購單已建立');
      setSelected([]);
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const dismiss = async (id) => {
    try { await apiPost({ action: 'dismiss_reorder', suggestion_id: id }); await load(); } catch (e) { setMsg(e.message); }
  };

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(prev => prev.length === suggestions.length ? [] : suggestions.map(s => s.id));

  return (
    <div>
      <PageLead eyebrow="REORDER" title="補貨建議" description="根據安全庫存自動產生補貨建議，可勾選轉為採購單。參考 Odoo 補貨規則。" action={
        <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto' }}>
          <button onClick={generate} style={{ ...S.btnGhost, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>掃描庫存</button>
          {selected.length > 0 && <button onClick={convertToPO} style={{ ...S.btnPrimary, ...(isMobile ? { width: '100%', minHeight: 44 } : {}) }}>轉採購單 ({selected.length})</button>}
        </div>
      } />
      <ComingSoonBanner tabId="reorder" />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}
      {loading ? <Loading /> : suggestions.length === 0 ? <EmptyState text="目前沒有補貨建議，點擊「掃描庫存」檢查" /> : (
        <div style={{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? 12 : 13 }}>
          <thead><tr style={{ background: '#f3f4f6' }}>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'center', width: isMobile ? 30 : 40, fontSize: isMobile ? 11 : 13 }}><input type="checkbox" checked={selected.length === suggestions.length} onChange={toggleAll} /></th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>料號</th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>品名</th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>現有</th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>安全</th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>建議採購</th>
            <th style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>操作</th>
          </tr></thead>
          <tbody>{suggestions.map(s => (
            <tr key={s.id} style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'center', fontSize: isMobile ? 11 : 13 }}><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} /></td>
              <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', fontWeight: 600, color: '#3b82f6', ...S.mono, fontSize: isMobile ? 11 : 13 }}>{s.item_number}</td>
              <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', fontSize: isMobile ? 11 : 13 }}>{isMobile ? (s.description || '-').slice(0, 6) : (s.description || '-')}</td>
              <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', color: s.current_stock <= 0 ? '#dc2626' : '#f59e0b', fontWeight: 700, ...S.mono, fontSize: isMobile ? 11 : 13 }}>{s.current_stock}</td>
              <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', ...S.mono, fontSize: isMobile ? 11 : 13 }}>{s.safety_stock}</td>
              <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a', ...S.mono, fontSize: isMobile ? 11 : 13 }}>{s.suggested_qty}</td>
              <td style={{ padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'center' }}><button onClick={() => dismiss(s.id)} style={{ ...S.btnGhost, padding: isMobile ? '6px 6px' : '3px 8px', fontSize: isMobile ? 10 : 10, minHeight: isMobile ? 32 : 'auto' }}>略過</button></td>
            </tr>
          ))}</tbody>
        </table>
        </div>
      )}
    </div>
  );
}
