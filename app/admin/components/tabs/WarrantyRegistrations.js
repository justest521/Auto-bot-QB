'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, useResponsive, fmtDate } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard } from '../shared/ui';

const BRAND_OPTIONS = ['Snap-on', 'Bahco', 'Blue Point', 'Bosch', 'OTC Tools', 'Muc-Off'];
const STATUS_MAP = { active: '有效', expired: '已過期', voided: '已作廢' };
const STATUS_COLOR = { active: t.color.brand, expired: t.color.error, voided: '#9ca3af' };

const cardStyle = { ...S.card, borderRadius: t.radius.lg, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5' };
const labelStyle = { fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };

function WarrantyDetailView({ warranty, onBack, onRefresh }) {
  const { isMobile } = useResponsive();
  const [msg, setMsg] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleVoid = async () => {
    if (!confirm(`確定要作廢保固登錄 ${warranty.registration_number} ？`)) return;
    setProcessing(true);
    setMsg('');
    try {
      await apiPost({ action: 'void_warranty_registration', warranty_id: warranty.id });
      setMsg('保固登錄已作廢');
      setTimeout(() => onBack(), 1500);
    } catch (e) {
      setMsg(e.message || '作廢失敗');
    } finally {
      setProcessing(false);
    }
  };

  const statusKey = warranty.status || 'active';
  const daysRemaining = warranty.days_remaining || 0;
  const isExpiring = daysRemaining > 0 && daysRemaining <= 30;

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: isMobile ? '0' : '0 12px' }}>
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: t.radius.md, border: '1px solid #e5e7eb', background: t.color.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: t.color.textMuted, transition: 'all 0.15s', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = t.color.bgCard; }}>&larr;</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: isMobile ? 16 : 22, fontWeight: 800, color: t.color.textPrimary, ...S.mono, letterSpacing: -0.5 }}>{warranty.registration_number || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: t.radius.pill, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[statusKey] || t.color.textMuted}14`, color: STATUS_COLOR[statusKey] || t.color.textMuted, border: `1px solid ${STATUS_COLOR[statusKey] || t.color.textMuted}30` }}>
                {STATUS_MAP[statusKey] || statusKey}
              </span>
            </div>
            <div style={{ fontSize: t.fontSize.body, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>
              {fmtDate(warranty.purchase_date)}
            </div>
          </div>
        </div>
        {statusKey !== 'voided' && (
          <button onClick={handleVoid} disabled={processing} style={{ padding: '9px 22px', borderRadius: t.radius.lg, border: `1px solid ${t.color.error}40`, background: t.color.bgCard, color: t.color.error, fontSize: 14, fontWeight: t.fontWeight.bold, cursor: 'pointer', opacity: processing ? 0.7 : 1, transition: 'all 0.15s' }}>
            {processing ? '處理中...' : '作廢'}
          </button>
        )}
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 10, padding: '10px 16px', fontSize: t.fontSize.h3 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        <div>
          <div style={cardStyle}>
            <div style={labelStyle}>基本資訊</div>
            <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
              <div><span style={{ color: '#6b7280', fontWeight: 600 }}>客戶:</span> <span style={{ color: '#111827', marginLeft: 8 }}>{warranty.customer_name || '-'}</span></div>
              <div><span style={{ color: '#6b7280', fontWeight: 600 }}>產品名稱:</span> <span style={{ color: '#111827', marginLeft: 8 }}>{warranty.product_name || '-'}</span></div>
              <div><span style={{ color: '#6b7280', fontWeight: 600 }}>料號:</span> <span style={{ color: '#111827', marginLeft: 8, ...S.mono }}>{warranty.item_number || '-'}</span></div>
              <div><span style={{ color: '#6b7280', fontWeight: 600 }}>序號:</span> <span style={{ color: '#111827', marginLeft: 8, ...S.mono }}>{warranty.serial_number || '-'}</span></div>
              <div><span style={{ color: '#6b7280', fontWeight: 600 }}>品牌:</span> <span style={{ color: '#111827', marginLeft: 8 }}>{warranty.brand || '-'}</span></div>
              <div><span style={{ color: '#6b7280', fontWeight: 600 }}>分類:</span> <span style={{ color: '#111827', marginLeft: 8 }}>{warranty.category || '-'}</span></div>
            </div>
          </div>
        </div>

        <div>
          <div style={cardStyle}>
            <div style={labelStyle}>保固資訊</div>
            <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
              <div><span style={{ color: '#6b7280', fontWeight: 600 }}>購買日期:</span> <span style={{ color: '#111827', marginLeft: 8, ...S.mono }}>{fmtDate(warranty.purchase_date) || '-'}</span></div>
              <div><span style={{ color: '#6b7280', fontWeight: 600 }}>保固到期:</span> <span style={{ color: '#111827', marginLeft: 8, ...S.mono }}>{warranty.is_lifetime ? '終身保固' : fmtDate(warranty.warranty_end_date) || '-'}</span></div>
              {warranty.is_lifetime ? (
                <div><span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#dbeafe', color: '#3b82f6' }}>終身保固</span></div>
              ) : (
                isExpiring ? (
                  <div><span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#fef9c3', color: '#854d0e' }}>剩餘 {daysRemaining} 天</span></div>
                ) : (
                  <div style={{ color: '#6b7280', fontSize: 12 }}>狀態: {statusKey === 'expired' ? '已過期' : '有效'}</div>
                )
              )}
              {warranty.remark && (
                <div><span style={{ color: '#6b7280', fontWeight: 600 }}>備註:</span> <span style={{ color: '#374151', marginLeft: 8, marginTop: 4, display: 'block' }}>{warranty.remark}</span></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateWarrantyDialog({ open, onClose, onCreated }) {
  const { isMobile } = useResponsive();
  const [form, setForm] = useState({
    customer_name: '',
    product_name: '',
    item_number: '',
    serial_number: '',
    brand: '',
    category: '',
    purchase_date: '',
    remark: '',
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSubmit = async () => {
    if (!form.product_name.trim() || !form.purchase_date) {
      setMsg('產品名稱和購買日期為必填');
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      await apiPost({ action: 'create_warranty_registration', ...form });
      setMsg('保固登錄已建立');
      setTimeout(() => {
        setForm({ customer_name: '', product_name: '', item_number: '', serial_number: '', brand: '', category: '', purchase_date: '', remark: '' });
        onCreated?.();
        onClose();
      }, 1000);
    } catch (e) {
      setMsg(e.message || '建立失敗');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ ...cardStyle, width: 640, maxWidth: '90vw', maxHeight: '85vh', borderRadius: 14, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>新增保固登錄</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#9ca3af', cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ flex: 1, padding: '16px 18px', overflowY: 'auto' }}>
          {msg && <div style={{ background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 12, padding: '10px 12px', borderRadius: 8, fontSize: 13, border: `1px solid ${msg.includes('失敗') ? '#fecdd3' : '#bbf7d0'}` }}>{msg}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>客戶名稱</div>
              <input type="text" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="客戶名稱" style={S.input} />
            </div>
            <div>
              <div style={labelStyle}>產品名稱 *</div>
              <input type="text" value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} placeholder="產品名稱" style={S.input} />
            </div>
            <div>
              <div style={labelStyle}>料號</div>
              <input type="text" value={form.item_number} onChange={e => setForm({ ...form, item_number: e.target.value })} placeholder="料號" style={S.input} />
            </div>
            <div>
              <div style={labelStyle}>序號</div>
              <input type="text" value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} placeholder="序號" style={S.input} />
            </div>
            <div>
              <div style={labelStyle}>品牌</div>
              <select value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} style={S.input}>
                <option value="">-- 選擇品牌 --</option>
                {BRAND_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>分類</div>
              <input type="text" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="分類" style={S.input} />
            </div>
            <div>
              <div style={labelStyle}>購買日期 *</div>
              <input type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} style={S.input} />
            </div>
            <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
              <div style={labelStyle}>備註</div>
              <textarea value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} placeholder="備註" style={{ ...S.input, minHeight: 80, fontFamily: 'inherit' }} />
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={S.btnGhost}>取消</button>
          <button onClick={handleSubmit} disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.7 : 1 }}>{loading ? '建立中...' : '建立'}</button>
        </div>
      </div>
    </div>
  );
}

export default function WarrantyRegistrations() {
  const { isMobile } = useResponsive();
  const [warranties, setWarranties] = useState([]);
  const [stats, setStats] = useState({ active: 0, lifetime: 0, expiring: 0, expired: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [expiring, setExpiring] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const loadData = async (p = 1) => {
    setLoading(true);
    try {
      const result = await apiGet({
        action: 'warranty_registrations',
        page: p,
        limit: 30,
        status: status !== 'all' ? status : undefined,
        search: search || undefined,
        expiring: expiring ? true : undefined,
      });
      setWarranties(result.data || []);
      setStats(result.stats || { active: 0, lifetime: 0, expiring: 0, expired: 0 });
      setTotal(result.total || 0);
      setPage(p);
    } catch (e) {
      console.error('Error loading warranties:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(1);
  }, [status, search, expiring]);

  const handleBack = () => {
    setSelectedWarranty(null);
    loadData(page);
  };

  if (selectedWarranty) {
    return <WarrantyDetailView warranty={selectedWarranty} onBack={handleBack} onRefresh={() => loadData(page)} />;
  }

  return (
    <div style={{ animation: 'fadeIn 0.25s ease' }}>
      <PageLead
        eyebrow="WARRANTY"
        title="保固登錄"
        description="產品保固登錄查詢與管理。"
        action={
          <button onClick={() => setShowCreateDialog(true)} style={S.btnPrimary}>
            + 新增保固登錄
          </button>
        }
      />

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        <StatCard code="有效" label="有效保固" value={stats.active || 0} tone="green" />
        <StatCard code="終身" label="終身保固" value={stats.lifetime || 0} tone="blue" />
        <StatCard code="即將" label="即將到期(30天內)" value={stats.expiring || 0} tone="yellow" />
        <StatCard code="過期" label="已過期" value={stats.expired || 0} tone="red" />
      </div>

      {/* Filter Bar */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            placeholder="搜尋登錄號、客戶、產品名稱..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={S.input}
          />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...S.input, minWidth: 120 }}>
          <option value="all">全部狀態</option>
          <option value="active">有效</option>
          <option value="expired">已過期</option>
          <option value="voided">已作廢</option>
        </select>
        <button
          onClick={() => setExpiring(!expiring)}
          style={{
            padding: '8px 16px',
            borderRadius: t.radius.lg,
            border: expiring ? 'none' : '1px solid #e5e7eb',
            background: expiring ? '#fef9c3' : t.color.bgCard,
            color: expiring ? '#854d0e' : '#374151',
            fontSize: 14,
            fontWeight: t.fontWeight.bold,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {expiring ? '✓' : '○'} 即將到期
        </button>
      </div>

      {/* Table / Cards */}
      {loading ? (
        <Loading />
      ) : warranties.length === 0 ? (
        <EmptyState text="目前沒有保固登錄" />
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {warranties.map(w => {
            const statusKey = w.status || 'active';
            const isExpiring = w.days_remaining > 0 && w.days_remaining <= 30;
            return (
              <div
                key={w.id}
                onClick={() => setSelectedWarranty(w)}
                style={{
                  ...cardStyle,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f9fbfd'; }}
                onMouseLeave={e => { e.currentTarget.style.background = t.color.bgCard; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', ...S.mono }}>{w.registration_number}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{w.customer_name || '-'}</div>
                  </div>
                  <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${STATUS_COLOR[statusKey]}14`, color: STATUS_COLOR[statusKey] }}>
                    {STATUS_MAP[statusKey]}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                  <div><span style={{ color: '#6b7280' }}>產品:</span> {w.product_name}</div>
                  <div><span style={{ color: '#6b7280' }}>品牌:</span> {w.brand || '-'}</div>
                  <div>
                    <span style={{ color: '#6b7280' }}>保固:</span> {' '}
                    {w.is_lifetime ? (
                      <span style={{ color: '#3b82f6', fontWeight: 600 }}>終身保固</span>
                    ) : isExpiring ? (
                      <span style={{ color: '#854d0e', fontWeight: 600 }}>剩餘 {w.days_remaining} 天</span>
                    ) : (
                      <span>{fmtDate(w.warranty_end_date)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={S.tableScroll}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>登錄號</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>客戶</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>產品名稱</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>料號</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>序號</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>品牌</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>購買日期</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>保固到期</th>
                <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>狀態</th>
              </tr>
            </thead>
            <tbody>
              {warranties.map((w) => {
                const statusKey = w.status || 'active';
                const isExpiring = w.days_remaining > 0 && w.days_remaining <= 30;
                return (
                  <tr
                    key={w.id}
                    onClick={() => setSelectedWarranty(w)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f9fbfd'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '8px 14px', color: '#111827', ...S.mono }}>{w.registration_number}</td>
                    <td style={{ padding: '8px 14px', color: '#111827' }}>{w.customer_name || '-'}</td>
                    <td style={{ padding: '8px 14px', color: '#111827' }}>{w.product_name || '-'}</td>
                    <td style={{ padding: '8px 14px', color: '#6b7280', ...S.mono }}>{w.item_number || '-'}</td>
                    <td style={{ padding: '8px 14px', color: '#6b7280', ...S.mono }}>{w.serial_number || '-'}</td>
                    <td style={{ padding: '8px 14px', color: '#6b7280' }}>{w.brand || '-'}</td>
                    <td style={{ padding: '8px 14px', color: '#6b7280', ...S.mono }}>{fmtDate(w.purchase_date)}</td>
                    <td style={{ padding: '8px 14px', color: w.is_lifetime ? '#3b82f6' : isExpiring ? '#854d0e' : '#6b7280' }}>
                      {w.is_lifetime ? '終身保固' : isExpiring ? `剩餘 ${w.days_remaining} 天` : fmtDate(w.warranty_end_date)}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${STATUS_COLOR[statusKey]}14`, color: STATUS_COLOR[statusKey] }}>
                        {STATUS_MAP[statusKey]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pager */}
      {!loading && warranties.length > 0 && (
        <Pager page={page} total={total} limit={30} onPageChange={p => { setPage(p); loadData(p); }} onLimitChange={() => {}} />
      )}

      <CreateWarrantyDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} onCreated={() => loadData(1)} />
    </div>
  );
}
