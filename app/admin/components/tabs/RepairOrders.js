'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtDate, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';

const STATUS_MAP = {
  pending: '待處理',
  in_progress: '維修中',
  completed: '完成',
  notified: '已通知',
  picked_up: '已取件'
};

const STATUS_COLOR = {
  pending: t.color.warning,
  in_progress: t.color.link,
  completed: t.color.brand,
  notified: '#a855f7',
  picked_up: t.color.textMuted
};

const PRIORITY_MAP = {
  urgent: { label: '急件', color: t.color.error },
  normal: { label: '一般', color: t.color.link },
  low: { label: '低', color: '#9ca3af' }
};

const BRANDS = ['Snap-on', 'Bahco', 'Blue Point', 'Bosch', 'OTC Tools', 'Muc-Off'];

const cardStyle = { ...S.card, borderRadius: t.radius.lg, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5' };
const labelStyle = { fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };

// ========== 維修單詳細頁 ==========
function RepairDetailView({ repair: initRepair, onBack, onRefresh }) {
  const { isMobile } = useResponsive();
  const [detail, setDetail] = useState(initRepair);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [processing, setProcessing] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    diagnosis: initRepair.diagnosis || '',
    repair_notes: initRepair.repair_notes || '',
    parts_used: initRepair.parts_used || '',
    repair_cost: initRepair.repair_cost || ''
  });

  const statusKey = detail.status || 'pending';

  const updateStatus = async (newStatus) => {
    if (!confirm(`確定將狀態改為「${STATUS_MAP[newStatus]}」？`)) return;
    setProcessing(newStatus);
    setMsg('');
    try {
      await apiPost({ action: 'update_repair_order', id: detail.id, status: newStatus });
      setMsg(`已更新為 ${STATUS_MAP[newStatus]}`);
      setDetail({ ...detail, status: newStatus });
      if (onRefresh) onRefresh();
    } catch (e) {
      setMsg(e.message || '更新失敗');
    } finally {
      setProcessing('');
    }
  };

  const handleUpdate = async () => {
    setProcessing('saving');
    setMsg('');
    try {
      await apiPost({
        action: 'update_repair_order',
        id: detail.id,
        diagnosis: editForm.diagnosis,
        repair_notes: editForm.repair_notes,
        parts_used: editForm.parts_used,
        repair_cost: editForm.repair_cost
      });
      setMsg('已保存變更');
      setDetail({
        ...detail,
        diagnosis: editForm.diagnosis,
        repair_notes: editForm.repair_notes,
        parts_used: editForm.parts_used,
        repair_cost: editForm.repair_cost
      });
      setEditMode(false);
      if (onRefresh) onRefresh();
    } catch (e) {
      setMsg(e.message || '保存失敗');
    } finally {
      setProcessing('');
    }
  };

  // Status flow buttons
  const nextActions = [];
  if (statusKey === 'pending') nextActions.push({ status: 'in_progress', label: '開始維修', color: t.color.link });
  if (statusKey === 'in_progress') nextActions.push({ status: 'completed', label: '完成維修', color: t.color.brand });
  if (statusKey === 'completed') nextActions.push({ status: 'notified', label: '通知取件', color: '#a855f7' });
  if (statusKey === 'notified') nextActions.push({ status: 'picked_up', label: '確認取件', color: '#6b7280' });

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: isMobile ? '0' : '0 12px' }}>
      {/* Header */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: t.radius.md, border: '1px solid #e5e7eb', background: t.color.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: t.color.textMuted, transition: 'all 0.15s', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = t.color.bgCard; }}>&larr;</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: isMobile ? 16 : 22, fontWeight: 800, color: t.color.textPrimary, ...S.mono, letterSpacing: -0.5 }}>{detail.repair_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: t.radius.pill, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[statusKey]}14`, color: STATUS_COLOR[statusKey], border: `1px solid ${STATUS_COLOR[statusKey]}30` }}>
                {STATUS_MAP[statusKey]}
              </span>
              {detail.priority && (
                <span style={{ padding: '3px 10px', borderRadius: t.radius.pill, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: `${PRIORITY_MAP[detail.priority].color}14`, color: PRIORITY_MAP[detail.priority].color, border: `1px solid ${PRIORITY_MAP[detail.priority].color}30` }}>
                  {PRIORITY_MAP[detail.priority].label}
                </span>
              )}
            </div>
            <div style={{ fontSize: t.fontSize.body, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>
              {fmtDate(detail.received_at || detail.created_at)}
              {detail.customer_name && <span style={{ color: '#d1d5db' }}> &middot; </span>}
              {detail.customer_name && <span>{detail.customer_name}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {nextActions.map(a => (
            <button key={a.status} onClick={() => updateStatus(a.status)} disabled={!!processing}
              style={{ ...(isMobile ? { flex: 1, minHeight: 44, minWidth: 0 } : {}), padding: isMobile ? '9px 12px' : '9px 22px', borderRadius: t.radius.lg, border: 'none', background: `linear-gradient(135deg, ${a.color}, ${a.color}dd)`, color: t.color.bgCard, fontSize: isMobile ? 12 : 14, fontWeight: t.fontWeight.bold, cursor: 'pointer', opacity: processing ? 0.7 : 1, transition: 'all 0.15s', boxShadow: `0 2px 8px ${a.color}40` }}>
              {processing === a.status ? '處理中...' : a.label}
            </button>
          ))}
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') || msg.includes('錯誤') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') || msg.includes('錯誤') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') || msg.includes('錯誤') ? '#b42318' : '#15803d', marginBottom: 10, padding: '10px 16px', fontSize: t.fontSize.h3 }}>{msg}</div>}

      {loading ? <Loading /> : (
        isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Basic Info */}
            <div style={{ ...cardStyle, padding: '16px' }}>
              <h3 style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, marginBottom: 12, color: t.color.textPrimary }}>基本資訊</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={labelStyle}>維修單號</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{detail.repair_no}</div>
                </div>
                <div>
                  <div style={labelStyle}>客戶名稱</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.customer_name}</div>
                </div>
                <div>
                  <div style={labelStyle}>產品名稱</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.product_name}</div>
                </div>
                <div>
                  <div style={labelStyle}>品牌</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.brand}</div>
                </div>
                <div>
                  <div style={labelStyle}>序號</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{detail.serial_number || '-'}</div>
                </div>
                <div>
                  <div style={labelStyle}>物件編號</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{detail.item_number || '-'}</div>
                </div>
              </div>
            </div>

            {/* Issues & Diagnosis */}
            <div style={{ ...cardStyle, padding: '16px' }}>
              <h3 style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, marginBottom: 12, color: t.color.textPrimary }}>問題與診斷</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={labelStyle}>問題描述</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, whiteSpace: 'pre-wrap' }}>{detail.issue_description}</div>
                </div>
                <div>
                  <div style={labelStyle}>保固狀態</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.is_warranty ? '保固內' : '保固外'}</div>
                </div>
                {editMode ? (
                  <div>
                    <div style={labelStyle}>診斷結果</div>
                    <textarea value={editForm.diagnosis} onChange={e => setEditForm({ ...editForm, diagnosis: e.target.value })} style={{ ...S.input, minHeight: 80, resize: 'vertical' }} placeholder="診斷結果" />
                  </div>
                ) : (
                  <div>
                    <div style={labelStyle}>診斷結果</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, whiteSpace: 'pre-wrap' }}>{detail.diagnosis || '-'}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Repair Details */}
            <div style={{ ...cardStyle, padding: '16px' }}>
              <h3 style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, marginBottom: 12, color: t.color.textPrimary }}>維修明細</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={labelStyle}>指派技師</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.assigned_to || '-'}</div>
                </div>
                <div>
                  <div style={labelStyle}>預計天數</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.estimated_days ? `${detail.estimated_days} 天` : '-'}</div>
                </div>
                {editMode ? (
                  <div>
                    <div style={labelStyle}>維修備註</div>
                    <textarea value={editForm.repair_notes} onChange={e => setEditForm({ ...editForm, repair_notes: e.target.value })} style={{ ...S.input, minHeight: 80, resize: 'vertical' }} placeholder="維修備註" />
                  </div>
                ) : (
                  <div>
                    <div style={labelStyle}>維修備註</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, whiteSpace: 'pre-wrap' }}>{detail.repair_notes || '-'}</div>
                  </div>
                )}
                {editMode ? (
                  <div>
                    <div style={labelStyle}>更換零件</div>
                    <textarea value={editForm.parts_used} onChange={e => setEditForm({ ...editForm, parts_used: e.target.value })} style={{ ...S.input, minHeight: 60, resize: 'vertical' }} placeholder="更換零件清單" />
                  </div>
                ) : (
                  <div>
                    <div style={labelStyle}>更換零件</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, whiteSpace: 'pre-wrap' }}>{detail.parts_used || '-'}</div>
                  </div>
                )}
                {editMode ? (
                  <div>
                    <div style={labelStyle}>維修費用</div>
                    <input type="number" value={editForm.repair_cost} onChange={e => setEditForm({ ...editForm, repair_cost: e.target.value })} style={S.input} placeholder="維修費用" />
                  </div>
                ) : (
                  <div>
                    <div style={labelStyle}>維修費用</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{detail.repair_cost ? `NT$ ${Number(detail.repair_cost).toLocaleString()}` : '-'}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Remarks */}
            {(detail.remark || !editMode) && (
              <div style={{ ...cardStyle, padding: '16px' }}>
                <div style={labelStyle}>其他備註</div>
                <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, whiteSpace: 'pre-wrap' }}>{detail.remark || '-'}</div>
              </div>
            )}

            {/* Edit/Save Buttons */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {editMode ? (
                <>
                  <button onClick={handleUpdate} disabled={processing} style={{ ...S.btnPrimary, flex: 1, minHeight: 44 }}>
                    {processing === 'saving' ? '保存中...' : '保存變更'}
                  </button>
                  <button onClick={() => setEditMode(false)} disabled={processing} style={{ ...S.btnGhost, flex: 1, minHeight: 44 }}>
                    取消編輯
                  </button>
                </>
              ) : (
                <button onClick={() => setEditMode(true)} style={{ ...S.btnGhost, flex: 1, minHeight: 44 }}>
                  編輯詳細資訊
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Left Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Basic Info */}
              <div style={{ ...cardStyle, padding: '16px' }}>
                <h3 style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, marginBottom: 12, color: t.color.textPrimary }}>基本資訊</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={labelStyle}>維修單號</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{detail.repair_no}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>客戶名稱</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.customer_name}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>產品名稱</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.product_name}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>品牌</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.brand}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={labelStyle}>物件編號</div>
                      <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{detail.item_number || '-'}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>序號</div>
                      <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{detail.serial_number || '-'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Issues & Diagnosis */}
              <div style={{ ...cardStyle, padding: '16px' }}>
                <h3 style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, marginBottom: 12, color: t.color.textPrimary }}>問題與診斷</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={labelStyle}>問題描述</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{detail.issue_description}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={labelStyle}>保固狀態</div>
                      <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.is_warranty ? '保固內' : '保固外'}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>優先度</div>
                      <div style={{ fontSize: t.fontSize.body, color: PRIORITY_MAP[detail.priority]?.color || t.color.textPrimary }}>{PRIORITY_MAP[detail.priority]?.label || '-'}</div>
                    </div>
                  </div>
                  {editMode ? (
                    <div>
                      <div style={labelStyle}>診斷結果</div>
                      <textarea value={editForm.diagnosis} onChange={e => setEditForm({ ...editForm, diagnosis: e.target.value })} style={{ ...S.input, minHeight: 100, resize: 'vertical' }} placeholder="診斷結果" />
                    </div>
                  ) : (
                    <div>
                      <div style={labelStyle}>診斷結果</div>
                      <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{detail.diagnosis || '-'}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Repair Details */}
              <div style={{ ...cardStyle, padding: '16px' }}>
                <h3 style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, marginBottom: 12, color: t.color.textPrimary }}>維修明細</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={labelStyle}>指派技師</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.assigned_to || '-'}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>預計天數</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{detail.estimated_days ? `${detail.estimated_days} 天` : '-'}</div>
                  </div>
                  {editMode ? (
                    <div>
                      <div style={labelStyle}>維修備註</div>
                      <textarea value={editForm.repair_notes} onChange={e => setEditForm({ ...editForm, repair_notes: e.target.value })} style={{ ...S.input, minHeight: 80, resize: 'vertical' }} placeholder="維修備註" />
                    </div>
                  ) : (
                    <div>
                      <div style={labelStyle}>維修備註</div>
                      <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto' }}>{detail.repair_notes || '-'}</div>
                    </div>
                  )}
                  {editMode ? (
                    <div>
                      <div style={labelStyle}>更換零件</div>
                      <textarea value={editForm.parts_used} onChange={e => setEditForm({ ...editForm, parts_used: e.target.value })} style={{ ...S.input, minHeight: 80, resize: 'vertical' }} placeholder="更換零件清單" />
                    </div>
                  ) : (
                    <div>
                      <div style={labelStyle}>更換零件</div>
                      <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto' }}>{detail.parts_used || '-'}</div>
                    </div>
                  )}
                  {editMode ? (
                    <div>
                      <div style={labelStyle}>維修費用</div>
                      <input type="number" value={editForm.repair_cost} onChange={e => setEditForm({ ...editForm, repair_cost: e.target.value })} style={S.input} placeholder="維修費用" />
                    </div>
                  ) : (
                    <div>
                      <div style={labelStyle}>維修費用</div>
                      <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{detail.repair_cost ? `NT$ ${Number(detail.repair_cost).toLocaleString()}` : '-'}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Remarks */}
              {(detail.remark || !editMode) && (
                <div style={{ ...cardStyle, padding: '16px' }}>
                  <div style={labelStyle}>其他備註</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{detail.remark || '-'}</div>
                </div>
              )}

              {/* Edit/Save Buttons */}
              <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
                {editMode ? (
                  <>
                    <button onClick={handleUpdate} disabled={processing} style={S.btnPrimary}>
                      {processing === 'saving' ? '保存中...' : '保存變更'}
                    </button>
                    <button onClick={() => setEditMode(false)} disabled={processing} style={S.btnGhost}>
                      取消編輯
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditMode(true)} style={S.btnGhost}>
                    編輯詳細資訊
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ========== 建立維修單對話 ==========
function CreateRepairDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({
    customer_name: '',
    product_name: '',
    item_number: '',
    serial_number: '',
    brand: '',
    issue_description: '',
    is_warranty: false,
    priority: 'normal',
    assigned_to: '',
    estimated_days: '',
    remark: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.product_name || !form.issue_description) {
      setError('請填寫必要欄位：產品名稱、問題描述');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiPost({
        action: 'create_repair_order',
        customer_name: form.customer_name,
        product_name: form.product_name,
        item_number: form.item_number,
        serial_number: form.serial_number,
        brand: form.brand,
        issue_description: form.issue_description,
        is_warranty: form.is_warranty,
        priority: form.priority,
        assigned_to: form.assigned_to,
        estimated_days: form.estimated_days ? Number(form.estimated_days) : null,
        remark: form.remark
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message || '建立失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ ...cardStyle, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <h2 style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, marginBottom: 20, color: t.color.textPrimary }}>建立維修單</h2>

        {error && <div style={{ ...cardStyle, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 16, padding: '10px 16px', fontSize: t.fontSize.body }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Row 1: Customer & Product */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={S.label}>客戶名稱</label>
              <input type="text" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} style={S.input} placeholder="客戶名稱" />
            </div>
            <div>
              <label style={S.label}>產品名稱 *</label>
              <input type="text" value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} style={S.input} placeholder="產品名稱" />
            </div>
          </div>

          {/* Row 2: Brand & Item Number */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={S.label}>品牌</label>
              <select value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} style={S.input}>
                <option value="">選擇品牌</option>
                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>物件編號</label>
              <input type="text" value={form.item_number} onChange={e => setForm({ ...form, item_number: e.target.value })} style={S.input} placeholder="物件編號" />
            </div>
          </div>

          {/* Row 3: Serial Number */}
          <div>
            <label style={S.label}>序號</label>
            <input type="text" value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} style={S.input} placeholder="序號" />
          </div>

          {/* Row 4: Issue Description */}
          <div>
            <label style={S.label}>問題描述 *</label>
            <textarea value={form.issue_description} onChange={e => setForm({ ...form, issue_description: e.target.value })} style={{ ...S.input, minHeight: 100, resize: 'vertical' }} placeholder="詳細描述問題" />
          </div>

          {/* Row 5: Warranty & Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.is_warranty} onChange={e => setForm({ ...form, is_warranty: e.target.checked })} style={{ width: 20, height: 20, cursor: 'pointer' }} id="warranty" />
              <label htmlFor="warranty" style={{ ...S.label, marginBottom: 0, cursor: 'pointer' }}>保固內維修</label>
            </div>
            <div>
              <label style={S.label}>優先度</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={S.input}>
                <option value="urgent">急件</option>
                <option value="normal">一般</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>

          {/* Row 6: Assigned To & Estimated Days */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={S.label}>指派技師</label>
              <input type="text" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} style={S.input} placeholder="指派技師名稱" />
            </div>
            <div>
              <label style={S.label}>預計天數</label>
              <input type="number" value={form.estimated_days} onChange={e => setForm({ ...form, estimated_days: e.target.value })} style={S.input} placeholder="天數" min="0" />
            </div>
          </div>

          {/* Row 7: Remark */}
          <div>
            <label style={S.label}>其他備註</label>
            <textarea value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} style={{ ...S.input, minHeight: 80, resize: 'vertical' }} placeholder="其他備註" />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={saving} style={S.btnGhost}>取消</button>
            <button onClick={handleSubmit} disabled={saving} style={S.btnPrimary}>
              {saving ? '建立中...' : '建立維修單'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== 主元件 ==========
export default function RepairOrders() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(30);
  const [msg, setMsg] = useState('');
  const [detailView, setDetailView] = useState(null);
  const [createDialog, setCreateDialog] = useState(false);

  const load = async (p = page, status = statusFilter, q = search) => {
    setLoading(true);
    try {
      const params = { action: 'repair_orders', page: p, limit: pageSize, status, search: q };
      const res = await apiGet(params);
      setData(res);
      setPage(p);
    } catch (e) {
      setMsg(e.message || '無法載入維修單');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); }, []);

  const handleStatusFilter = (status) => {
    setStatusFilter(status === statusFilter ? '' : status);
    load(1, status === statusFilter ? '' : status, search);
  };

  const handleSearch = () => {
    load(1, statusFilter, search);
  };

  const handleCreated = () => {
    load(1);
    setMsg('維修單已建立');
  };

  const filteredRows = priorityFilter === 'all' ? data.rows : data.rows.filter(r => r.priority === priorityFilter);
  const statusCounts = {
    pending: data.rows.filter(r => r.status === 'pending').length,
    in_progress: data.rows.filter(r => r.status === 'in_progress').length,
    completed: data.rows.filter(r => r.status === 'completed').length,
    notified: data.rows.filter(r => r.status === 'notified').length,
    picked_up: data.rows.filter(r => r.status === 'picked_up').length
  };

  if (detailView) {
    return (
      <RepairDetailView
        repair={detailView}
        onBack={() => setDetailView(null)}
        onRefresh={() => load(page, statusFilter, search)}
      />
    );
  }

  return (
    <div>
      <PageLead eyebrow="REPAIR" title="維修工單" description="管理產品維修進度與記錄。" />

      {msg && <div style={{ ...cardStyle, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 16, padding: '10px 16px', fontSize: t.fontSize.body }}>{msg}</div>}

      {/* Status Pipeline */}
      <div style={{ ...cardStyle, padding: isMobile ? '12px' : '16px', marginBottom: 16, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12, justifyContent: isMobile ? 'flex-start' : 'center', minWidth: 'min-content' }}>
          {['pending', 'in_progress', 'completed', 'notified', 'picked_up'].map((status, idx) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12 }}>
              <button onClick={() => handleStatusFilter(status)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', border: statusFilter === status ? `2px solid ${STATUS_COLOR[status]}` : '1px solid #e5e7eb', background: statusFilter === status ? `${STATUS_COLOR[status]}0a` : t.color.bgCard, borderRadius: t.radius.pill, padding: '8px 12px', transition: 'all 0.15s' }}>
                <span style={{ fontSize: isMobile ? 10 : 12, fontWeight: t.fontWeight.bold, color: STATUS_COLOR[status] }}>{STATUS_MAP[status]}</span>
                <span style={{ fontSize: isMobile ? 12 : 16, fontWeight: 800, color: STATUS_COLOR[status], ...S.mono }}>{statusCounts[status]}</span>
              </button>
              {idx < 4 && <span style={{ fontSize: isMobile ? 14 : 18, color: '#d1d5db' }}>→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ ...S.input, flex: 1, minWidth: 150 }} placeholder="搜尋維修單號、客戶名稱..." />
        <button onClick={handleSearch} style={{ ...S.btnGhost, whiteSpace: 'nowrap' }}>搜尋</button>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{ ...S.input, minWidth: 120 }}>
          <option value="all">所有優先度</option>
          <option value="urgent">急件</option>
          <option value="normal">一般</option>
          <option value="low">低</option>
        </select>
        <button onClick={() => setCreateDialog(true)} style={{ ...S.btnPrimary, whiteSpace: 'nowrap' }}>建立維修單</button>
      </div>

      {/* List */}
      {loading ? (
        <Loading />
      ) : filteredRows.length === 0 ? (
        <EmptyState title="沒有維修單" description="暫無符合條件的維修單，開始建立一個新的。" />
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {filteredRows.map(repair => (
            <div key={repair.id} onClick={() => setDetailView(repair)} style={{ ...cardStyle, padding: '12px 16px', cursor: 'pointer', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: t.color.textPrimary, ...S.mono }}>{repair.repair_no}</span>
                  <span style={{ padding: '2px 8px', borderRadius: t.radius.pill, fontSize: 11, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[repair.status]}14`, color: STATUS_COLOR[repair.status], border: `1px solid ${STATUS_COLOR[repair.status]}30` }}>{STATUS_MAP[repair.status]}</span>
                </div>
                {repair.priority && <span style={{ padding: '2px 8px', borderRadius: t.radius.pill, fontSize: 11, fontWeight: t.fontWeight.bold, background: `${PRIORITY_MAP[repair.priority].color}14`, color: PRIORITY_MAP[repair.priority].color, border: `1px solid ${PRIORITY_MAP[repair.priority].color}30` }}>{PRIORITY_MAP[repair.priority].label}</span>}
              </div>
              <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, fontWeight: t.fontWeight.semibold, marginBottom: 4 }}>{repair.customer_name || '未指定'}</div>
              <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, marginBottom: 4 }}>{repair.product_name}</div>
              <div style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled, marginBottom: 4 }}>{repair.brand}</div>
              <div style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repair.issue_description}</div>
              <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 8, ...S.mono }}>{fmtDate(repair.received_at || repair.created_at)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>維修單號</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>客戶</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>產品</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>品牌</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>問題描述</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>優先度</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>狀態</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>日期</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((repair, idx) => (
                <tr key={repair.id} onClick={() => setDetailView(repair)} style={{ cursor: 'pointer', borderBottom: '1px solid #f0f2f5', transition: 'all 0.15s', background: idx % 2 === 0 ? t.color.bgCard : '#f8fafc' }} onMouseEnter={e => { e.currentTarget.style.background = '#f0f2f5'; }} onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? t.color.bgCard : '#f8fafc'; }}>
                  <td style={{ padding: '12px 16px', fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, ...S.mono }}>{repair.repair_no}</td>
                  <td style={{ padding: '12px 16px', fontSize: t.fontSize.body, color: t.color.textPrimary }}>{repair.customer_name || '-'}</td>
                  <td style={{ padding: '12px 16px', fontSize: t.fontSize.body, color: t.color.textPrimary }}>{repair.product_name}</td>
                  <td style={{ padding: '12px 16px', fontSize: t.fontSize.body, color: t.color.textPrimary }}>{repair.brand || '-'}</td>
                  <td style={{ padding: '12px 16px', fontSize: t.fontSize.body, color: t.color.textPrimary, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repair.issue_description}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: t.fontSize.caption }}>
                    {repair.priority && (
                      <span style={{ padding: '3px 10px', borderRadius: t.radius.pill, fontWeight: t.fontWeight.bold, background: `${PRIORITY_MAP[repair.priority].color}14`, color: PRIORITY_MAP[repair.priority].color, border: `1px solid ${PRIORITY_MAP[repair.priority].color}30` }}>
                        {PRIORITY_MAP[repair.priority].label}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: t.fontSize.caption }}>
                    <span style={{ padding: '3px 10px', borderRadius: t.radius.pill, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[repair.status]}14`, color: STATUS_COLOR[repair.status], border: `1px solid ${STATUS_COLOR[repair.status]}30` }}>
                      {STATUS_MAP[repair.status]}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: t.fontSize.caption, color: t.color.textDisabled, ...S.mono }}>{fmtDate(repair.received_at || repair.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pager */}
      <Pager current={page} total={Math.ceil(data.total / pageSize)} onPageChange={p => { setPage(p); load(p, statusFilter, search); }} />

      {/* Create Dialog */}
      {createDialog && (
        <CreateRepairDialog
          onClose={() => setCreateDialog(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
