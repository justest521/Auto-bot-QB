'use client';
import { useEffect, useState } from 'react';
import { EmptyState, Loading, PageLead, S, apiGet, apiPost, fmt, useViewportWidth } from '../shared/common';;

export default function Promotions() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', note: '', items: '' });
  const load = () => { apiGet({ action: 'promotions' }).then(d => setPromos(d.promotions || [])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const submit = async () => {
    const items = form.items.split('\n').filter(Boolean).map(line => {
      const match = line.match(/^([A-Za-z0-9-]+)\s*[→=:]\s*(?:NT\$?)([\d,]+)(?:\s*[（(](.+)[)）])?/);
      if (!match) return null;
      return { item_number: match[1].toUpperCase(), promo_price: parseInt(match[2].replace(/,/g, '')), promo_note: match[3] || null };
    }).filter(Boolean);
    const res = await apiPost({ action: 'create_promotion', ...form, items });
    if (!res.error) { setShowForm(false); setForm({ name: '', start_date: '', end_date: '', note: '', items: '' }); load(); }
  };
  const toggle = async (id, active) => { await apiPost({ action: 'toggle_promotion', id, is_active: !active }); load(); };
  return (
    <div>
      <PageLead eyebrow="Campaigns" title="活動管理" description="建立與切換促銷活動，集中管理優惠商品與檔期資訊。" action={<button onClick={() => setShowForm(!showForm)} style={S.btnPrimary}>{showForm ? '取消' : '+ 新增活動'}</button>} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>共 {promos.length} 個活動</div>
      </div>
      {showForm && (
        <div style={{ ...S.card, borderColor: '#10b98130', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', marginBottom: 18 }}>NEW_PROMOTION</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label style={S.label}>活動名稱</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="四月工具月" style={S.input} /></div>
            <div><label style={S.label}>備註</label><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="滿 10,000 免運" style={S.input} /></div>
            <div><label style={S.label}>開始日期</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={S.input} /></div>
            <div><label style={S.label}>結束日期</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={S.input} /></div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={S.label}>活動商品（每行格式：型號 → 價格（備註））</label>
            <textarea value={form.items} onChange={e => setForm({ ...form, items: e.target.value })} placeholder={`ATECH3FR250B → 28000\nTPGDL2000 → 8500（買一送充氣嘴組）`} rows={5} style={{ ...S.input, resize: 'vertical', ...S.mono, fontSize: 12, lineHeight: 1.6 }} />
          </div>
          <button onClick={submit} style={S.btnPrimary}>建立活動</button>
        </div>
      )}
      {loading ? <Loading /> : promos.map(p => (
        <div key={p.id} style={{ ...S.card, borderColor: p.is_active ? '#bdeccb' : '#dbe3ee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1c2740' }}>{p.name}</span>
              <span style={S.tag(p.is_active ? 'green' : 'red')}>{p.is_active ? 'ACTIVE' : 'CLOSED'}</span>
            </div>
            <button onClick={() => toggle(p.id, p.is_active)} style={{ ...S.btnGhost, color: p.is_active ? '#f87171' : '#4ade80', borderColor: p.is_active ? '#ef444425' : '#22c55e25', fontSize: 12 }}>{p.is_active ? '關閉' : '啟用'}</button>
          </div>
          <div style={{ color: '#6f7d90', fontSize: 12, marginTop: 6, ...S.mono }}>{p.start_date} → {p.end_date}{p.note ? ` · ${p.note}` : ''}</div>
          {p.quickbuy_promotion_items?.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #e6edf5', paddingTop: 10 }}>
              {p.quickbuy_promotion_items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', fontSize: 12 }}>
                  <span style={{ color: '#1976f3', ...S.mono, width: 140 }}>{item.item_number}</span>
                  <span style={{ color: '#129c59', ...S.mono }}>NT${fmt(item.promo_price)}</span>
                  {item.promo_note && <span style={{ color: '#77859a' }}>({item.promo_note})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {!loading && promos.length === 0 && !showForm && <EmptyState text="尚無活動，點「+ 新增活動」建立" />}
    </div>
  );
}

/* ========================================= PRICING RULES ========================================= */
