'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';

const CLAIM_TYPE_MAP = { repair: '維修', replacement: '換貨', refund: '退款' };
const CLAIM_TYPE_COLOR = { repair: t.color.link, replacement: t.color.warning, refund: t.color.error };

const CLAIM_STATUS_MAP = {
  pending: '待處理',
  submitted: '已提交',
  responded: '原廠回覆',
  resolved: '已結案',
  rejected: '拒絕'
};
const CLAIM_STATUS_COLOR = {
  pending: '#eab308',
  submitted: t.color.link,
  responded: '#a855f7',
  resolved: t.color.success,
  rejected: t.color.error
};

const BRANDS = ['Snap-on', 'Bahco', 'Blue Point', 'Bosch', 'OTC Tools', 'Muc-Off'];

const cardStyle = { ...S.card, borderRadius: t.radius.lg, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5' };
const labelStyle = { fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };

// ========== 索賠詳情頁 ==========
function ClaimDetailView({ claim: initClaim, onBack, onRefresh }) {
  const { isMobile } = useResponsive();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [processing, setProcessing] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'warranty_claim_detail', claim_id: initClaim.id });
        setDetail(result);
        setForm({
          status: result.status || 'pending',
          vendor_claim_ref: result.vendor_claim_ref || '',
          resolution: result.resolution || '',
          replacement_item: result.replacement_item || '',
          replacement_serial: result.replacement_serial || '',
          approved_amount: result.approved_amount || '',
        });
      } catch (e) {
        setMsg(e.message || '無法取得索賠詳情');
      } finally {
        setLoading(false);
      }
    })();
  }, [initClaim.id]);

  const claim = detail || initClaim;
  const statusKey = form.status || 'pending';

  const handleUpdate = async () => {
    setProcessing(true);
    setMsg('');
    try {
      await apiPost({ action: 'update_warranty_claim', id: claim.id, ...form });
      setMsg('已更新索賠資訊');
      setEditMode(false);
      const result = await apiGet({ action: 'warranty_claim_detail', claim_id: claim.id });
      setDetail(result);
      if (onRefresh) onRefresh();
    } catch (e) {
      setMsg(e.message || '更新失敗');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: '0 12px' }}>
      {/* Header */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: t.radius.md, border: '1px solid #e5e7eb', background: t.color.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: t.color.textMuted, transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = t.color.bgCard; }}>&larr;</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: t.color.textPrimary, ...S.mono, letterSpacing: -0.5 }}>{claim.claim_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: `${CLAIM_STATUS_COLOR[statusKey] || t.color.textMuted}14`, color: CLAIM_STATUS_COLOR[statusKey] || t.color.textMuted, border: `1px solid ${CLAIM_STATUS_COLOR[statusKey] || t.color.textMuted}30` }}>
                {CLAIM_STATUS_MAP[statusKey] || statusKey}
              </span>
            </div>
            <div style={{ fontSize: t.fontSize.body, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>
              {fmtDate(claim.submitted_at || claim.created_at)}
              {claim.customer_name && <span style={{ color: '#d1d5db' }}> &middot; </span>}
              {claim.customer_name && <span style={{ color: t.color.textMuted }}>{claim.customer_name}</span>}
            </div>
          </div>
        </div>
        <button
          onClick={() => setEditMode(!editMode)}
          style={{ ...S.btnGhost, minHeight: isMobile ? 44 : undefined }}
        >
          {editMode ? '取消編輯' : '編輯'}
        </button>
      </div>

      {msg && (
        <div style={{ ...cardStyle, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10, padding: '8px 16px', fontSize: t.fontSize.h3 }}>
          {msg}
        </div>
      )}

      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 10, alignItems: 'start' }}>
          {/* Left: Claim Info */}
          <div>
            {/* Basic Info */}
            <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10 }}>
              <div style={labelStyle}>索賠基本資訊</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4, ...S.mono }}>客戶名稱</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{claim.customer_name || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4, ...S.mono }}>產品名稱</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{claim.product_name || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4, ...S.mono }}>品牌</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary }}>{claim.brand || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4, ...S.mono }}>料號</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{claim.item_number || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4, ...S.mono }}>序號</div>
                  <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{claim.serial_number || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4, ...S.mono }}>索賠類型</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: `${CLAIM_TYPE_COLOR[claim.claim_type]}14`, color: CLAIM_TYPE_COLOR[claim.claim_type], border: `1px solid ${CLAIM_TYPE_COLOR[claim.claim_type]}30` }}>
                      {CLAIM_TYPE_MAP[claim.claim_type] || '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Issue Description */}
            <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10 }}>
              <div style={labelStyle}>問題描述</div>
              <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, lineHeight: 1.6 }}>
                {claim.issue_description || '-'}
              </div>
            </div>

            {/* Status & Resolution */}
            {editMode ? (
              <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10 }}>
                <div style={labelStyle}>編輯處理狀態</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={S.label}>狀態</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))}
                      style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}
                    >
                      {Object.entries(CLAIM_STATUS_MAP).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>原廠索賠編號</label>
                    <input
                      value={form.vendor_claim_ref}
                      onChange={(e) => setForm(p => ({ ...p, vendor_claim_ref: e.target.value }))}
                      style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}
                      placeholder="例：WC2025-001234"
                    />
                  </div>
                  <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                    <label style={S.label}>處理結果</label>
                    <textarea
                      value={form.resolution}
                      onChange={(e) => setForm(p => ({ ...p, resolution: e.target.value }))}
                      style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: 80, fontFamily: 'inherit' }}
                      placeholder="記錄原廠回覆或處理結果"
                    />
                  </div>
                  {form.status === 'resolved' && (
                    <>
                      <div>
                        <label style={S.label}>換貨品項 (如適用)</label>
                        <input
                          value={form.replacement_item}
                          onChange={(e) => setForm(p => ({ ...p, replacement_item: e.target.value }))}
                          style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}
                          placeholder="換貨品名"
                        />
                      </div>
                      <div>
                        <label style={S.label}>換貨序號 (如適用)</label>
                        <input
                          value={form.replacement_serial}
                          onChange={(e) => setForm(p => ({ ...p, replacement_serial: e.target.value }))}
                          style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}
                          placeholder="換貨序號"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label style={S.label}>核定金額</label>
                    <input
                      type="number"
                      value={form.approved_amount}
                      onChange={(e) => setForm(p => ({ ...p, approved_amount: e.target.value }))}
                      style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button
                    onClick={handleUpdate}
                    disabled={processing}
                    style={{ ...S.btnPrimary, flex: 1, ...(isMobile ? S.mobile.btnPrimary : {}), opacity: processing ? 0.6 : 1 }}
                  >
                    {processing ? '儲存中...' : '儲存更新'}
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    style={{ ...S.btnGhost, flex: 1 }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10 }}>
                <div style={labelStyle}>處理資訊</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4, ...S.mono }}>原廠索賠編號</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, ...S.mono }}>{form.vendor_claim_ref || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4, ...S.mono }}>核定金額</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, fontWeight: t.fontWeight.bold }}>{fmtP(form.approved_amount || 0)}</div>
                  </div>
                </div>
                {form.resolution && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4, ...S.mono }}>處理結果</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, lineHeight: 1.6 }}>{form.resolution}</div>
                  </div>
                )}
                {form.replacement_item && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4, ...S.mono }}>換貨資訊</div>
                    <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary }}>
                      {form.replacement_item} (序號: {form.replacement_serial || '-'})
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Timeline & Amount */}
          <div>
            <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10 }}>
              <div style={labelStyle}>索賠金額</div>
              <div style={{ ...S.mono, fontSize: 28, fontWeight: 900, color: t.color.warning, letterSpacing: -1, marginBottom: 16 }}>
                {fmtP(claim.claim_amount || 0)}
              </div>
              <div style={labelStyle}>提交日期</div>
              <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, marginBottom: 12 }}>
                {fmtDate(claim.submitted_at || claim.created_at)}
              </div>
            </div>

            {/* Timeline */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>處理流程</div>
              <div style={{ display: 'flex', gap: 0, alignItems: 'center', flexDirection: 'column' }}>
                {['submitted', 'responded', 'resolved'].map((st, i) => {
                  const steps = ['submitted', 'responded', 'resolved'];
                  const currentIdx = steps.indexOf(statusKey);
                  const isActive = currentIdx >= i || statusKey === 'resolved';
                  const isCurrent = statusKey === st;
                  return (
                    <div key={st} style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: i < steps.length - 1 ? 0 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        {i > 0 && <div style={{ width: '100%', height: 2, background: isActive ? t.color.brand : '#e5e7eb', marginBottom: 10 }} />}
                      </div>
                      <div style={{ width: '100%', paddingBottom: i < steps.length - 1 ? 10 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: isActive ? t.color.brand : '#e5e7eb', border: isCurrent ? `3px solid ${t.color.bgCard}` : 'none', flexShrink: 0 }} />
                          <span style={{ fontSize: t.fontSize.body, fontWeight: isCurrent ? t.fontWeight.bold : t.fontWeight.medium, color: isActive ? t.color.textPrimary : t.color.textMuted }}>
                            {CLAIM_STATUS_MAP[st]}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 主頁面 ==========
export default function WarrantyClaims() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ claims: [], total: 0, page: 1, limit: 30 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [form, setForm] = useState({
    customer_name: '',
    product_name: '',
    item_number: '',
    serial_number: '',
    brand: '',
    claim_type: 'repair',
    issue_description: '',
    vendor_name: '',
    claim_amount: '',
    remark: ''
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (page = 1, q = search, status = statusFilter) => {
    setLoading(true);
    try {
      const result = await apiGet({
        action: 'warranty_claims',
        page: String(page),
        limit: 30,
        status: status === 'all' ? '' : status,
        search: q
      });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.product_name.trim()) {
      setMsg('請輸入產品名稱');
      return;
    }
    if (!form.issue_description.trim()) {
      setMsg('請輸入問題描述');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      await apiPost({ action: 'create_warranty_claim', ...form });
      setCreateOpen(false);
      setForm({
        customer_name: '',
        product_name: '',
        item_number: '',
        serial_number: '',
        brand: '',
        claim_type: 'repair',
        issue_description: '',
        vendor_name: '',
        claim_amount: '',
        remark: ''
      });
      setMsg('索賠已建立');
      load(1, search, statusFilter);
    } catch (e) {
      setMsg(e.message || '建立失敗');
    } finally {
      setSaving(false);
    }
  };

  if (selectedClaim) {
    return (
      <ClaimDetailView
        claim={selectedClaim}
        onBack={() => setSelectedClaim(null)}
        onRefresh={() => load(data.page, search, statusFilter)}
      />
    );
  }

  return (
    <div>
      <PageLead
        eyebrow="CLAIMS"
        title="索賠管理"
        description="保固索賠與換貨流程追蹤。"
        action={
          <button onClick={() => setCreateOpen(true)} style={{ ...S.btnPrimary, minHeight: isMobile ? 44 : undefined }}>
            + 建立索賠
          </button>
        }
      />

      {msg && (
        <div
          style={{
            ...S.card,
            background: msg.includes('失敗') ? t.color.errorBg : t.color.successBg,
            borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0',
            color: msg.includes('失敗') ? t.color.error : '#15803d',
            marginBottom: 10,
            cursor: 'pointer'
          }}
          onClick={() => setMsg('')}
        >
          {msg}
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', alignItems: isMobile ? 'stretch' : 'center' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusFilter)}
          placeholder="搜尋索賠編號、客戶名稱或產品..."
          style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), flex: 1, minWidth: 200 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            load(1, search, e.target.value);
          }}
          style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minWidth: 130 }}
        >
          <option value="all">全部狀態</option>
          <option value="pending">待處理</option>
          <option value="submitted">已提交</option>
          <option value="responded">原廠回覆</option>
          <option value="resolved">已結案</option>
          <option value="rejected">拒絕</option>
        </select>
        <button
          onClick={() => load(1, search, statusFilter)}
          style={{ ...S.btnPrimary, minHeight: isMobile ? 44 : undefined }}
        >
          搜尋
        </button>
      </div>

      <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 12, ...S.mono }}>
        共 {fmt(data.total)} 筆索賠
      </div>

      {loading ? (
        <Loading />
      ) : data.claims.length === 0 ? (
        <EmptyState text="目前沒有索賠資料" />
      ) : (
        data.claims.map((claim) => (
          <div
            key={claim.id}
            onClick={() => setSelectedClaim(claim)}
            style={{
              ...S.card,
              padding: isMobile ? '12px 14px' : '10px 16px',
              marginBottom: 10,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => !isMobile && (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={(e) => !isMobile && (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)')}
          >
            {isMobile ? (
              // Mobile Card View
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>
                      {claim.claim_no || '-'}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: t.fontSize.caption,
                        fontWeight: t.fontWeight.bold,
                        background: `${CLAIM_STATUS_COLOR[claim.claim_status] || t.color.textMuted}14`,
                        color: CLAIM_STATUS_COLOR[claim.claim_status] || t.color.textMuted,
                        border: `1px solid ${CLAIM_STATUS_COLOR[claim.claim_status] || t.color.textMuted}30`
                      }}
                    >
                      {CLAIM_STATUS_MAP[claim.claim_status] || '-'}
                    </span>
                  </div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: t.fontSize.caption,
                      fontWeight: t.fontWeight.bold,
                      background: `${CLAIM_TYPE_COLOR[claim.claim_type]}14`,
                      color: CLAIM_TYPE_COLOR[claim.claim_type],
                      border: `1px solid ${CLAIM_TYPE_COLOR[claim.claim_type]}30`
                    }}
                  >
                    {CLAIM_TYPE_MAP[claim.claim_type] || '-'}
                  </span>
                </div>
                <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 6 }}>
                  {claim.product_name || '未命名'}
                </div>
                <div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, lineHeight: 1.6 }}>
                  <div><span style={{ color: t.color.textMuted, ...S.mono }}>客戶 -</span> {claim.customer_name || '-'}</div>
                  <div><span style={{ color: t.color.textMuted, ...S.mono }}>品牌 -</span> {claim.brand || '-'}</div>
                  <div><span style={{ color: t.color.textMuted, ...S.mono }}>日期 -</span> {fmtDate(claim.submitted_at || claim.created_at)}</div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ ...S.mono, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.warning }}>
                    {fmtP(claim.claim_amount || 0)}
                  </span>
                </div>
              </div>
            ) : (
              // Desktop Table View
              <div style={{ display: 'grid', gridTemplateColumns: '100px 140px 130px 90px 80px 80px 100px 130px', gap: 10, alignItems: 'center' }}>
                <div style={{ ...S.mono, fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.link }}>
                  {claim.claim_no || '-'}
                </div>
                <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, fontWeight: t.fontWeight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {claim.customer_name || '-'}
                </div>
                <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {claim.product_name || '-'}
                </div>
                <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary }}>
                  {claim.brand || '-'}
                </div>
                <div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: t.fontSize.caption,
                      fontWeight: t.fontWeight.bold,
                      background: `${CLAIM_TYPE_COLOR[claim.claim_type]}14`,
                      color: CLAIM_TYPE_COLOR[claim.claim_type],
                      border: `1px solid ${CLAIM_TYPE_COLOR[claim.claim_type]}30`,
                      display: 'inline-block',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {CLAIM_TYPE_MAP[claim.claim_type] || '-'}
                  </span>
                </div>
                <div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: t.fontSize.caption,
                      fontWeight: t.fontWeight.bold,
                      background: `${CLAIM_STATUS_COLOR[claim.claim_status]}14`,
                      color: CLAIM_STATUS_COLOR[claim.claim_status],
                      border: `1px solid ${CLAIM_STATUS_COLOR[claim.claim_status]}30`,
                      display: 'inline-block',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {CLAIM_STATUS_MAP[claim.claim_status] || '-'}
                  </span>
                </div>
                <div style={{ textAlign: 'right', ...S.mono, fontWeight: t.fontWeight.bold, color: t.color.warning }}>
                  {fmtP(claim.claim_amount || 0)}
                </div>
                <div style={{ fontSize: t.fontSize.body, color: t.color.textSecondary, ...S.mono }}>
                  {fmtDate(claim.submitted_at || claim.created_at)}
                </div>
              </div>
            )}
          </div>
        ))
      )}

      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusFilter)} />

      {/* Create Dialog */}
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setCreateOpen(false)}>
          <div
            style={{
              ...S.card,
              ...(isMobile ? { width: '92vw', maxHeight: '90vh' } : { width: 620, maxHeight: '90vh' }),
              borderRadius: t.radius.xl,
              padding: isMobile ? '16px 14px 20px' : '16px 18px 20px',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: isMobile ? t.fontSize.h2 : t.fontSize.h1, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>
              建立索賠
            </h3>

            {msg && (
              <div style={{ ...S.card, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10, padding: '8px 12px', fontSize: t.fontSize.h3 }}>
                {msg}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>客戶名稱</label>
                <input
                  value={form.customer_name}
                  onChange={(e) => setForm(p => ({ ...p, customer_name: e.target.value }))}
                  style={{ ...(isMobile ? S.mobile.input : S.input) }}
                  placeholder="例：台灣汽機車維修廠"
                />
              </div>

              <div>
                <label style={S.label}>產品名稱 *</label>
                <input
                  value={form.product_name}
                  onChange={(e) => setForm(p => ({ ...p, product_name: e.target.value }))}
                  style={{ ...(isMobile ? S.mobile.input : S.input) }}
                  placeholder="例：1/2 套筒扳手組"
                />
              </div>

              <div>
                <label style={S.label}>料號</label>
                <input
                  value={form.item_number}
                  onChange={(e) => setForm(p => ({ ...p, item_number: e.target.value }))}
                  style={{ ...(isMobile ? S.mobile.input : S.input) }}
                  placeholder="例：SNP-2025-001"
                />
              </div>

              <div>
                <label style={S.label}>序號</label>
                <input
                  value={form.serial_number}
                  onChange={(e) => setForm(p => ({ ...p, serial_number: e.target.value }))}
                  style={{ ...(isMobile ? S.mobile.input : S.input) }}
                  placeholder="序號"
                />
              </div>

              <div>
                <label style={S.label}>品牌</label>
                <select
                  value={form.brand}
                  onChange={(e) => setForm(p => ({ ...p, brand: e.target.value }))}
                  style={{ ...(isMobile ? S.mobile.input : S.input) }}
                >
                  <option value="">-- 選擇品牌 --</option>
                  {BRANDS.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={S.label}>索賠類型 *</label>
                <select
                  value={form.claim_type}
                  onChange={(e) => setForm(p => ({ ...p, claim_type: e.target.value }))}
                  style={{ ...(isMobile ? S.mobile.input : S.input) }}
                >
                  <option value="repair">維修</option>
                  <option value="replacement">換貨</option>
                  <option value="refund">退款</option>
                </select>
              </div>

              <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                <label style={S.label}>問題描述 *</label>
                <textarea
                  value={form.issue_description}
                  onChange={(e) => setForm(p => ({ ...p, issue_description: e.target.value }))}
                  style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: 80, fontFamily: 'inherit' }}
                  placeholder="詳細描述產品問題或故障情況"
                />
              </div>

              <div>
                <label style={S.label}>原廠/供應商</label>
                <input
                  value={form.vendor_name}
                  onChange={(e) => setForm(p => ({ ...p, vendor_name: e.target.value }))}
                  style={{ ...(isMobile ? S.mobile.input : S.input) }}
                  placeholder="例：Snap-on Tool Company"
                />
              </div>

              <div>
                <label style={S.label}>索賠金額</label>
                <input
                  type="number"
                  value={form.claim_amount}
                  onChange={(e) => setForm(p => ({ ...p, claim_amount: e.target.value }))}
                  style={{ ...(isMobile ? S.mobile.input : S.input) }}
                  placeholder="0"
                />
              </div>

              <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                <label style={S.label}>備註</label>
                <textarea
                  value={form.remark}
                  onChange={(e) => setForm(p => ({ ...p, remark: e.target.value }))}
                  style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), minHeight: 60, fontFamily: 'inherit' }}
                  placeholder="其他備註"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, ...(isMobile ? { minHeight: 44 } : {}), flex: isMobile ? 1 : undefined }}>
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                style={{ ...S.btnPrimary, ...(isMobile ? { minHeight: 44 } : {}), flex: isMobile ? 1 : undefined, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? '建立中...' : '建立索賠'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
