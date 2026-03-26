'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { Loading, EmptyState, PageLead, ComingSoonBanner } from '../shared/ui';

function useViewportWidth() {
  const [width, setWidth] = useState(1400);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return width;
}

export default function CRMLeads() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, pipeline: {} });
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: '', contact_name: '', phone: '', email: '', source: 'manual', expected_amount: 0, notes: '' });
  const [msg, setMsg] = useState('');

  const STAGES = [
    { id: 'new', label: '新線索', color: '#6366f1' },
    { id: 'qualified', label: '已確認', color: '#3b82f6' },
    { id: 'proposition', label: '提案中', color: '#f59e0b' },
    { id: 'negotiation', label: '議價中', color: '#f97316' },
    { id: 'won', label: '成交', color: '#16a34a' },
    { id: 'lost', label: '流失', color: '#ef4444' },
  ];
  const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s]));
  const SOURCE_LABELS = { manual: '手動', line: 'LINE', website: '網站', referral: '轉介', dealer: '經銷商' };

  const load = async (stage = stageFilter) => {
    setLoading(true);
    try { const res = await apiGet({ action: 'crm_leads', stage }); setData(res); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.customer_name.trim()) { setMsg('請輸入客戶名稱'); return; }
    try { await apiPost({ action: 'create_lead', ...form }); setCreateOpen(false); setForm({ customer_name: '', contact_name: '', phone: '', email: '', source: 'manual', expected_amount: 0, notes: '' }); setMsg('線索已建立'); await load(); } catch (e) { setMsg(e.message); }
  };

  const updateStage = async (lead, newStage) => {
    try { await apiPost({ action: 'update_lead', lead_id: lead.id, stage: newStage }); await load(); } catch (e) { setMsg(e.message); }
  };

  const p = data.pipeline || {};

  return (
    <div>
      <PageLead eyebrow="CRM PIPELINE" title="商機管線" description="追蹤從線索到成交的完整流程，參考 Odoo CRM 邏輯。" action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增線索</button>} />
      <ComingSoonBanner tabId="crm_leads" />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      {/* Pipeline Kanban Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: 8, marginBottom: 20 }}>
        {STAGES.map(s => (
          <div key={s.id} onClick={() => { setStageFilter(stageFilter === s.id ? '' : s.id); load(stageFilter === s.id ? '' : s.id); }} style={{ ...S.card, cursor: 'pointer', textAlign: 'center', padding: '14px 8px', borderLeft: `3px solid ${s.color}`, background: stageFilter === s.id ? `${s.color}10` : '#fff' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, ...S.mono }}>{p[s.id] || 0}</div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Win rate bar */}
      <div style={{ ...S.card, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 12, color: '#374151' }}>成交率</span>
        <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 999, height: 8, overflow: 'hidden' }}>
          <div style={{ width: `${p.win_rate || 0}%`, background: 'linear-gradient(90deg, #16a34a, #22c55e)', height: '100%', borderRadius: 999, transition: 'width 0.5s' }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', ...S.mono }}>{p.win_rate || 0}%</span>
        <span style={{ fontSize: 12, color: '#374151' }}>成交金額</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f', ...S.mono }}>NT${(p.total_won_amount || 0).toLocaleString()}</span>
      </div>

      {/* Lead list */}
      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有線索" /> : (data.rows || []).map(lead => (
        <div key={lead.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ ...S.tag(STAGE_MAP[lead.stage]?.color ? '' : 'blue'), background: STAGE_MAP[lead.stage]?.color || '#6366f1', color: '#fff', fontSize: 11 }}>{STAGE_MAP[lead.stage]?.label || lead.stage}</span>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{lead.customer_name}</div>
              <div style={{ fontSize: 11, color: '#374151' }}>{lead.contact_name || ''} {lead.phone ? `· ${lead.phone}` : ''}</div>
            </div>
            <span style={S.tag('')}>{SOURCE_LABELS[lead.source] || lead.source}</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f', ...S.mono }}>NT${Number(lead.expected_amount || 0).toLocaleString()}</div>
              <div style={{ fontSize: 10, color: '#9ca3af', ...S.mono }}>{lead.created_at?.slice(0, 10)}</div>
            </div>
            {/* Stage transition buttons */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {lead.stage !== 'won' && lead.stage !== 'lost' && (
                <>
                  {STAGES.filter(s => s.id !== lead.stage && s.id !== 'lost').map(s => (
                    <button key={s.id} onClick={() => updateStage(lead, s.id)} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 10, borderColor: s.color, color: s.color }}>{s.label}</button>
                  ))}
                  <button onClick={() => updateStage(lead, 'lost')} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 10, borderColor: '#ef4444', color: '#ef4444' }}>流失</button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}

      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 480, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增線索</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label style={S.label}>客戶名稱 *</label><input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} style={S.input} /></div>
              <div><label style={S.label}>聯絡人</label><input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} style={S.input} /></div>
              <div><label style={S.label}>電話</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={S.input} /></div>
              <div><label style={S.label}>Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={S.input} /></div>
              <div><label style={S.label}>來源</label><select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={S.input}><option value="manual">手動</option><option value="line">LINE</option><option value="website">網站</option><option value="referral">轉介</option><option value="dealer">經銷商</option></select></div>
              <div><label style={S.label}>預估金額</label><input type="number" value={form.expected_amount} onChange={e => setForm(f => ({ ...f, expected_amount: Number(e.target.value) }))} style={S.input} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>備註</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...S.input, minHeight: 60 }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button><button onClick={handleCreate} style={S.btnPrimary}>建立線索</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
