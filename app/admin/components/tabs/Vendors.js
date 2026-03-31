'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, exportCsv, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, CsvImportButton, ComingSoonBanner } from '../shared/ui';

const VENDOR_COLUMNS = [
  { key: 'vendor_code', label: '廠商代號' },
  { key: 'vendor_name', label: '廠商名稱' },
  { key: 'contact_name', label: '聯絡人' },
  { key: 'phone', label: '電話' },
  { key: 'mobile', label: '手機' },
  { key: 'email', label: 'Email' },
  { key: 'tax_id', label: '統編' },
  { key: 'address', label: '地址' },
  { key: 'bank_account', label: '匯款帳號' },
  { key: 'payment_terms', label: '付款條件' },
  { key: 'remark', label: '備註' },
];

export default function Vendors() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ vendors: [], total: 0, page: 1, limit: 20, table_ready: true });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_name: '', vendor_code: '', contact_name: '', phone: '', mobile: '', email: '', fax: '', address: '', tax_id: '', bank_account: '', payment_terms: '', remark: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (page = 1, q = search) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'vendors', page: String(page), search: q });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.vendor_name.trim()) { setMsg('請輸入廠商名稱'); return; }
    setSaving(true); setMsg('');
    try {
      await apiPost({ action: 'create_vendor', ...form });
      setCreateOpen(false);
      setForm({ vendor_name: '', vendor_code: '', contact_name: '', phone: '', mobile: '', email: '', fax: '', address: '', tax_id: '', bank_account: '', payment_terms: '', remark: '' });
      setMsg('廠商已新增');
      load(1, search);
    } catch (e) { setMsg(e.message || '新增失敗'); }
    finally { setSaving(false); }
  };

  const handleExport = async () => {
    // Fetch all vendors for export (no pagination)
    try {
      const all = await apiGet({ action: 'vendors', page: '1', limit: '9999', export: 'true', search });
      exportCsv(all.vendors || [], VENDOR_COLUMNS, `廠商主檔_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  return (
    <div>
      <PageLead
        eyebrow="Vendors"
        title="廠商主檔"
        description="查看供應商主檔、聯絡窗口與統編資訊，後續可接採購與補貨流程。"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <CsvImportButton datasetId="erp_vendors" onImported={() => load(1, search)} compact />
            <button onClick={handleExport} style={{ ...S.btnGhost, minHeight: isMobile ? 44 : undefined }}>匯出 CSV</button>
            <button onClick={() => setCreateOpen(true)} style={{ ...S.btnPrimary, minHeight: isMobile ? 44 : undefined }}>+ 新增廠商</button>
          </div>
        }
      />
      <ComingSoonBanner tabId="vendors" />
      {msg && <div style={{ ...S.card, background: msg.includes('失敗') ? t.color.errorBg : t.color.successBg, borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? t.color.error : '#15803d', marginBottom: 10, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search)} placeholder="搜尋廠商名稱、代號或聯絡人..." style={{ ...(isMobile ? S.mobile.input : S.input), flex: 1 }} />
        <button onClick={() => load(1, search)} style={{ ...S.btnPrimary, minHeight: isMobile ? 44 : undefined }}>搜尋</button>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00', marginBottom: 10 }}>尚未建立 erp_vendors 資料表。</div>}
      <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 12, ...S.mono }}>共 {fmt(data.total)} 筆廠商</div>
      {loading ? <Loading /> : data.vendors.length === 0 ? <EmptyState text="目前沒有廠商資料" /> : data.vendors.map((vendor) => (
        <div key={vendor.id} style={{ ...S.card, padding: isMobile ? '12px 14px' : '10px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '160px minmax(0, 1fr) 160px', gap: isMobile ? 8 : 10, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: isMobile ? t.fontSize.caption : t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6, ...S.mono }}>VENDOR_CODE</div>
              <div style={{ fontSize: isMobile ? t.fontSize.body : t.fontSize.h3, color: t.color.link, fontWeight: t.fontWeight.bold, ...S.mono }}>{vendor.vendor_code || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: isMobile ? t.fontSize.h3 : t.fontSize.h3, color: t.color.textPrimary, fontWeight: t.fontWeight.bold }}>{vendor.vendor_name || '未命名廠商'}</div>
              <div style={{ fontSize: isMobile ? t.fontSize.tiny : t.fontSize.caption, color: t.color.textSecondary, lineHeight: 1.8, marginTop: 6 }}>
                <div><span style={{ color: t.color.textMuted, ...S.mono }}>CONTACT -</span> {vendor.contact_name || '-'}</div>
                <div><span style={{ color: t.color.textMuted, ...S.mono }}>PHONE -</span> {vendor.phone || vendor.mobile || '-'}</div>
                <div><span style={{ color: t.color.textMuted, ...S.mono }}>EMAIL -</span> {vendor.email || '-'}</div>
                <div><span style={{ color: t.color.textMuted, ...S.mono }}>ADDRESS -</span> {vendor.address || '-'}</div>
              </div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: isMobile ? t.fontSize.caption : t.fontSize.tiny, color: t.color.textMuted, marginBottom: 6, ...S.mono }}>TAX_ID</div>
              <div style={{ fontSize: isMobile ? t.fontSize.body : t.fontSize.h3, color: t.color.textPrimary, ...S.mono }}>{vendor.tax_id || '-'}</div>
            </div>
          </div>
        </div>
      ))}
      {data.total > data.limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
          {data.page > 1 && <button onClick={() => load(data.page - 1)} style={{ ...S.btnGhost, minHeight: isMobile ? 44 : undefined }}>← 上一頁</button>}
          <span style={{ color: '#666', padding: '8px 0', fontSize: t.fontSize.caption, ...S.mono }}>P{data.page}</span>
          {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={{ ...S.btnGhost, minHeight: isMobile ? 44 : undefined }}>下一頁 →</button>}
        </div>
      )}

      {/* ===== Create Vendor Modal ===== */}
      {createOpen && (
        <div style={{ ...p.modalOverlay }}>
          <div style={{ ...S.card, ...(isMobile ? S.mobileModal : {}), width: isMobile ? undefined : 580, maxWidth: '92vw', maxHeight: isMobile ? '90vh' : '90vh', overflowY: 'auto', borderRadius: t.radius.xl, padding: isMobile ? '16px 14px 20px' : '16px 18px 20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: isMobile ? t.fontSize.h2 : t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textPrimary }}>新增廠商</h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div><label style={S.label}>廠商名稱 *</label><input value={form.vendor_name} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} placeholder="例：三陽工業" /></div>
              <div><label style={S.label}>廠商代號</label><input value={form.vendor_code} onChange={e => setForm(p => ({ ...p, vendor_code: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} placeholder="自動產生" /></div>
              <div><label style={S.label}>聯絡人</label><input value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} /></div>
              <div><label style={S.label}>統一編號</label><input value={form.tax_id} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} /></div>
              <div><label style={S.label}>電話</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} /></div>
              <div><label style={S.label}>手機</label><input value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} /></div>
              <div><label style={S.label}>Email</label><input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} type="email" /></div>
              <div><label style={S.label}>傳真</label><input value={form.fax} onChange={e => setForm(p => ({ ...p, fax: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} /></div>
              <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}><label style={S.label}>地址</label><input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} /></div>
              <div><label style={S.label}>匯款帳號</label><input value={form.bank_account} onChange={e => setForm(p => ({ ...p, bank_account: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} /></div>
              <div><label style={S.label}>付款條件</label><input value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} placeholder="例：月結30天" /></div>
              <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}><label style={S.label}>備註</label><input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} style={{ ...(isMobile ? S.mobile.input : S.input) }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, minHeight: isMobile ? 44 : undefined }}>取消</button>
              <button onClick={handleCreate} disabled={saving} style={{ ...S.btnPrimary, minHeight: isMobile ? 44 : undefined, opacity: saving ? 0.6 : 1 }}>{saving ? '儲存中...' : '建立廠商'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
