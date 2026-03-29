'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { useResponsive } from '@/lib/admin/helpers';
import { apiGet, apiPost } from '@/lib/admin/api';
import { Loading, PageLead } from '../shared/ui';

export default function PricingRules() {
  const { isMobile } = useResponsive();
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => { apiGet({ action: 'pricing' }).then(d => setRules(d.rules)).finally(() => setLoading(false)); }, []);
  const save = async () => { await apiPost({ action: 'update_pricing', rules }); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  if (loading || !rules) return <Loading />;
  return (
    <div style={{ maxWidth: isMobile ? '100%' : 560, width: '100%' }}>
      <PageLead eyebrow="Pricing" title="報價規則" description="維護後台內部報價參數，快速調整折扣、免運門檻與提示文字。" />
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6', marginBottom: 20, ...S.mono }}>PRICING_CONFIG</div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>預設折扣比例</label><div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}><input type="number" step="0.01" min="0" max="1" value={rules.default_discount} onChange={e => setRules({ ...rules, default_discount: parseFloat(e.target.value) })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 120, textAlign: 'center', ...S.mono, minHeight: isMobile ? 44 : 'auto' }} /><span style={{ color: '#6b7280', fontSize: 12 }}>= {Math.round(rules.default_discount * 100)} 折（內部參考）</span></div></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>免運門檻 (NT$)</label><input type="number" step="100" value={rules.free_shipping_threshold} onChange={e => setRules({ ...rules, free_shipping_threshold: parseInt(e.target.value) })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 160, ...S.mono, minHeight: isMobile ? 44 : 'auto' }} /></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>優惠提示文字</label><input value={rules.promo_hint_text || '✨ 私訊享優惠價'} onChange={e => setRules({ ...rules, promo_hint_text: e.target.value })} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }} /></div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
          <label style={{ color: '#374151', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: isMobile ? 44 : 'auto', padding: isMobile ? '8px 0' : 0 }}><input type="checkbox" checked={rules.show_retail_price} onChange={e => setRules({ ...rules, show_retail_price: e.target.checked })} style={{ accentColor: '#3b82f6', width: 18, height: 18, cursor: 'pointer' }} />顯示建議售價</label>
          <label style={{ color: '#374151', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: isMobile ? 44 : 'auto', padding: isMobile ? '8px 0' : 0 }}><input type="checkbox" checked={rules.show_promo_hint} onChange={e => setRules({ ...rules, show_promo_hint: e.target.checked })} style={{ accentColor: '#3b82f6', width: 18, height: 18, cursor: 'pointer' }} />顯示優惠提示</label>
        </div>
        <button onClick={save} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), background: saved ? '#10b981' : 'linear-gradient(180deg, #2d8cff 0%, #3b82f6 100%)', transition: 'background 0.3s', width: '100%', padding: isMobile ? '12px 16px' : '11px 0', fontSize: 14, minHeight: isMobile ? 44 : 'auto' }}>{saved ? '✓ SAVED' : '儲存設定'}</button>
      </div>
    </div>
  );
}
