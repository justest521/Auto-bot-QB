'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead } from '../shared/ui';

const BRANDS = ['Snap-on', 'Bahco', 'Blue Point', 'Bosch', 'OTC Tools', 'Muc-Off'];
const BRAND_COLORS = {
  'Snap-on': '#dc2626',
  'Bahco': '#2563eb',
  'Blue Point': '#0ea5e9',
  'Bosch': '#1d4ed8',
  'OTC Tools': '#f97316',
  'Muc-Off': '#ec4899',
};

export default function WarrantySettings() {
  const { isMobile } = useResponsive();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [expandedBrand, setExpandedBrand] = useState(null);
  const [form, setForm] = useState({
    brand: BRANDS[0],
    category: '',
    policy_name: '',
    is_lifetime: false,
    warranty_months: 12,
    coverage_scope: '製造瑕疵',
    exclusions: '',
    claim_process: '',
    is_active: true,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'warranty_policies', active_only: 'false' });
      setPolicies(res.warranty_policies || []);
    } catch (err) {
      console.error(err);
      setMsg('載入失敗');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({
      brand: BRANDS[0],
      category: '',
      policy_name: '',
      is_lifetime: false,
      warranty_months: 12,
      coverage_scope: '製造瑕疵',
      exclusions: '',
      claim_process: '',
      is_active: true,
    });
    setEditingId(null);
  };

  const openDialog = (policy = null) => {
    if (policy) {
      setForm({
        brand: policy.brand,
        category: policy.category || '',
        policy_name: policy.policy_name,
        is_lifetime: policy.is_lifetime || false,
        warranty_months: policy.warranty_months || 12,
        coverage_scope: policy.coverage_scope || '製造瑕疵',
        exclusions: policy.exclusions || '',
        claim_process: policy.claim_process || '',
        is_active: policy.is_active,
      });
      setEditingId(policy.id);
    } else {
      resetForm();
    }
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    resetForm();
  };

  const save = async () => {
    if (!form.policy_name) {
      setMsg('請填寫保固政策名稱');
      return;
    }
    try {
      const payload = {
        action: 'upsert_warranty_policy',
        ...form,
      };
      if (editingId) {
        payload.id = editingId;
      }
      await apiPost(payload);
      setMsg(editingId ? '保固政策已更新' : '保固政策已新增');
      closeDialog();
      await load();
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg(err.message || '儲存失敗');
    }
  };

  const deletePol = async (id) => {
    if (!confirm('確定刪除此保固政策？')) return;
    try {
      await apiPost({ action: 'delete_warranty_policy', id });
      setMsg('保固政策已刪除');
      await load();
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg(err.message || '刪除失敗');
    }
  };

  const toggleActive = async (id, isActive) => {
    try {
      await apiPost({ action: 'upsert_warranty_policy', id, is_active: !isActive });
      await load();
    } catch (err) {
      setMsg(err.message || '更新失敗');
    }
  };

  const groupedByBrand = {};
  policies.forEach(p => {
    if (!groupedByBrand[p.brand]) groupedByBrand[p.brand] = [];
    groupedByBrand[p.brand].push(p);
  });

  if (loading) return <Loading />;

  return (
    <div style={{ maxWidth: isMobile ? '100%' : 1200, margin: '0 auto', padding: isMobile ? '0 16px' : '0' }}>
      <PageLead
        eyebrow="WARRANTY SETTINGS"
        title="保固政策設定"
        description="依品牌與產品分類設定保固條款。"
        action={
          <button
            onClick={() => openDialog()}
            style={{
              ...S.btnPrimary,
              ...(isMobile ? S.mobile.btnPrimary : {}),
              minHeight: isMobile ? 44 : 'auto',
            }}
          >
            + 新增政策
          </button>
        }
      />

      {msg && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: msg.includes('失敗') ? '#fef2f2' : '#f0fdf4',
            color: msg.includes('失敗') ? t.color.error : t.color.brand,
            fontSize: 13,
            fontWeight: t.fontWeight.semibold,
            marginBottom: 12,
          }}
        >
          {msg}
        </div>
      )}

      {/* Dialog Overlay */}
      {showDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: isMobile ? 16 : 0,
        }}>
          <div style={{
            background: t.color.bgCard,
            borderRadius: t.radius.md,
            padding: isMobile ? 16 : 24,
            maxWidth: isMobile ? '100%' : 500,
            maxHeight: '85vh',
            overflow: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          }}>
            <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 16 }}>
              {editingId ? '編輯保固政策' : '新增保固政策'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={S.label}>品牌 *</label>
                <select
                  value={form.brand}
                  onChange={e => setForm({ ...form, brand: e.target.value })}
                  style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }}
                >
                  {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>分類（空=通用）</label>
                <input
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  placeholder="手工具、電動工具、耗材"
                  style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>政策名稱 *</label>
              <input
                value={form.policy_name}
                onChange={e => setForm({ ...form, policy_name: e.target.value })}
                placeholder="標準保固"
                style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '8px 12px', background: t.color.bgMuted, borderRadius: t.radius.md }}>
              <input
                type="checkbox"
                checked={form.is_lifetime}
                onChange={e => setForm({ ...form, is_lifetime: e.target.checked })}
                id="lifetime-cb"
                style={{ cursor: 'pointer', width: 16, height: 16 }}
              />
              <label htmlFor="lifetime-cb" style={{ cursor: 'pointer', fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 0 }}>
                終身保固
              </label>
            </div>

            {!form.is_lifetime && (
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>保固月數</label>
                <input
                  type="number"
                  min="0"
                  value={form.warranty_months}
                  onChange={e => setForm({ ...form, warranty_months: parseInt(e.target.value) || 0 })}
                  style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: isMobile ? 44 : 'auto' }}
                />
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>保固範圍</label>
              <textarea
                value={form.coverage_scope}
                onChange={e => setForm({ ...form, coverage_scope: e.target.value })}
                rows={3}
                style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), resize: 'vertical', minHeight: isMobile ? 44 : 'auto' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>不保事項</label>
              <textarea
                value={form.exclusions}
                onChange={e => setForm({ ...form, exclusions: e.target.value })}
                rows={3}
                style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), resize: 'vertical', minHeight: isMobile ? 44 : 'auto' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>理賠流程</label>
              <textarea
                value={form.claim_process}
                onChange={e => setForm({ ...form, claim_process: e.target.value })}
                rows={3}
                style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), resize: 'vertical', minHeight: isMobile ? 44 : 'auto' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '8px 12px', background: t.color.bgMuted, borderRadius: t.radius.md }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
                id="active-cb"
                style={{ cursor: 'pointer', width: 16, height: 16 }}
              />
              <label htmlFor="active-cb" style={{ cursor: 'pointer', fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 0 }}>
                啟用此政策
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column' : 'row' }}>
              <button
                onClick={closeDialog}
                style={{
                  ...S.btnGhost,
                  ...(isMobile ? { width: '100%', minHeight: 44 } : {}),
                }}
              >
                取消
              </button>
              <button
                onClick={save}
                style={{
                  ...S.btnPrimary,
                  ...(isMobile ? { width: '100%', minHeight: 44 } : {}),
                }}
              >
                {editingId ? '更新' : '新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brand Groups */}
      {BRANDS.map(brand => {
        const brandPolicies = groupedByBrand[brand] || [];
        const isExpanded = expandedBrand === brand;
        return (
          <div key={brand} style={{ marginBottom: 12 }}>
            {/* Brand Header */}
            <button
              onClick={() => setExpandedBrand(isExpanded ? null : brand)}
              style={{
                width: '100%',
                padding: isMobile ? '12px 16px' : '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                background: BRAND_COLORS[brand],
                border: 'none',
                borderRadius: t.radius.md,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => e.target.style.opacity = '0.9'}
              onMouseLeave={e => e.target.style.opacity = '1'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <span style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: '#fff' }}>{brand}</span>
                <span style={{ fontSize: t.fontSize.body, color: 'rgba(255,255,255,0.8)' }}>({brandPolicies.length})</span>
              </div>
              <span style={{ fontSize: 18, color: '#fff', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                ▼
              </span>
            </button>

            {/* Policies List */}
            {isExpanded && (
              <div style={{
                background: t.color.bgCard,
                border: `1px solid ${t.color.border}`,
                borderTop: 'none',
                borderRadius: `0 0 ${t.radius.md} ${t.radius.md}`,
                overflow: 'hidden',
              }}>
                {brandPolicies.length === 0 ? (
                  <div style={{ padding: isMobile ? '16px' : '24px', textAlign: 'center', color: t.color.textDisabled, fontSize: t.fontSize.body }}>
                    此品牌尚無保固政策
                  </div>
                ) : (
                  <div>
                    {brandPolicies.map((policy, idx) => (
                      <div
                        key={policy.id}
                        style={{
                          padding: isMobile ? '12px 16px' : '14px 20px',
                          borderBottom: idx < brandPolicies.length - 1 ? `1px solid ${t.color.borderLight}` : 'none',
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1.5fr 1.5fr 200px',
                          gap: isMobile ? 8 : 12,
                          alignItems: 'center',
                          opacity: policy.is_active ? 1 : 0.6,
                        }}
                      >
                        {/* Category & Name */}
                        <div>
                          <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary }}>
                            {policy.policy_name}
                          </div>
                          <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 2 }}>
                            {policy.category ? `${policy.category}` : '通用'}
                          </div>
                        </div>

                        {/* Warranty Duration */}
                        <div>
                          <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.brand }}>
                            {policy.is_lifetime ? '終身保固' : `${policy.warranty_months}個月`}
                          </div>
                        </div>

                        {/* Coverage */}
                        {!isMobile && (
                          <div>
                            <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 2 }}>保固範圍</div>
                            <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, ...S.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {policy.coverage_scope}
                            </div>
                          </div>
                        )}

                        {/* Status & Actions */}
                        {!isMobile && (
                          <div>
                            <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4 }}>狀態</div>
                            <span style={S.tag(policy.is_active ? 'green' : 'gray')}>
                              {policy.is_active ? '啟用' : '停用'}
                            </span>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => toggleActive(policy.id, policy.is_active)}
                            style={{
                              ...S.btnGhost,
                              color: policy.is_active ? '#f87171' : '#4ade80',
                              borderColor: policy.is_active ? '#ef444425' : '#22c55e25',
                              padding: isMobile ? '6px 10px' : '4px 12px',
                              fontSize: t.fontSize.tiny,
                              flex: isMobile ? 1 : 'auto',
                              minHeight: isMobile ? 40 : 'auto',
                            }}
                          >
                            {policy.is_active ? '停用' : '啟用'}
                          </button>
                          <button
                            onClick={() => openDialog(policy)}
                            style={{
                              ...S.btnGhost,
                              padding: isMobile ? '6px 10px' : '4px 12px',
                              fontSize: t.fontSize.tiny,
                              flex: isMobile ? 1 : 'auto',
                              minHeight: isMobile ? 40 : 'auto',
                            }}
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => deletePol(policy.id)}
                            style={{
                              ...S.btnGhost,
                              color: '#ef4444',
                              borderColor: '#fecdd3',
                              padding: isMobile ? '6px 10px' : '4px 12px',
                              fontSize: t.fontSize.tiny,
                              flex: isMobile ? 1 : 'auto',
                              minHeight: isMobile ? 40 : 'auto',
                            }}
                          >
                            刪除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {policies.length === 0 && (
        <EmptyState text="尚無保固政策，點「+ 新增政策」建立" />
      )}
    </div>
  );
}
