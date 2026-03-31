'use client';
import { useState, useEffect, useRef } from 'react';
import { useUnsavedGuard } from '../shared/UnsavedChangesGuard';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { useResponsive } from '@/lib/admin/helpers';

const defaultStyles = {
  input: { padding: '8px 12px', borderRadius: t.radius.md, border: '1px solid #e5e7eb', fontSize: t.fontSize.h3, width: '100%', outline: 'none', transition: 'border 0.15s' },
  label: { fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textMuted, marginBottom: 4, display: 'block' },
  card: { background: t.color.bgCard, borderRadius: t.radius.lg, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f2f5', marginBottom: 16 },
};

export default function CompanySettings({ apiGet, apiPost }) {
  const { isMobile } = useResponsive();
  const { setDirty } = useUnsavedGuard();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);
  const origSettings = useRef('{}');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet({ action: 'company_settings' });
        const s = res.settings || {};
        setSettings(s);
        origSettings.current = JSON.stringify(s);
      } catch (err) { console.error(err); }
      setLoading(false);
    })();
  }, []);

  // Track settings changes
  useEffect(() => {
    setDirty(JSON.stringify(settings) !== origSettings.current);
  }, [settings, setDirty]);

  const save = async () => {
    setSaving(true);
    try {
      await apiPost({ action: 'update_company_settings', settings });
      origSettings.current = JSON.stringify(settings);
      setDirty(false);
      setMsg('已儲存');
      setTimeout(() => setMsg(''), 2000);
    } catch (err) { setMsg(err.message || '儲存失敗'); }
    setSaving(false);
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg('請上傳圖片檔案'); return; }
    if (file.size > 2 * 1024 * 1024) { setMsg('檔案大小不可超過 2MB'); return; }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1];
          const res = await apiPost({
            action: 'upload_company_logo',
            file_data: base64,
            file_name: file.name,
            content_type: file.type,
          });
          setSettings(prev => ({ ...prev, logo_url: res.logo_url + '?t=' + Date.now() }));
          setMsg('Logo 已上傳');
          setTimeout(() => setMsg(''), 2000);
        } catch (err) {
          setMsg(err.message || '上傳失敗');
        } finally {
          setUploading(false);
        }
      };
      reader.onerror = () => { setMsg('讀取檔案失敗'); setUploading(false); };
      reader.readAsDataURL(file);
    } catch (err) {
      setMsg(err.message || '上傳失敗');
      setUploading(false);
    }
  };

  const update = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: t.color.textDisabled }}>載入中...</div>;

  return (
    <div style={{ maxWidth: isMobile ? '100%' : 700, margin: '0 auto', padding: isMobile ? '0 16px' : '0' }}>
      <h2 style={{ fontSize: t.fontSize.h1, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 4 }}>公司設定</h2>
      <p style={{ fontSize: t.fontSize.body, color: t.color.textMuted, marginBottom: 20 }}>設定公司資訊與 Logo，將顯示在所有列印文件上</p>

      {msg && <div style={{ padding: '8px 14px', borderRadius: 8, background: msg.includes('失敗') ? '#fef2f2' : '#f0fdf4', color: msg.includes('失敗') ? t.color.error : t.color.brand, fontSize: 13, fontWeight: t.fontWeight.semibold, marginBottom: 12 }}>{msg}</div>}

      {/* Logo */}
      <div style={{ ...defaultStyles.card }}>
        <div style={{ fontSize: t.fontSize.h3, fontWeight: 700, color: t.color.textSecondary, marginBottom: 12 }}>公司 Logo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 16 : 20, flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={{ width: 120, height: 120, borderRadius: 12, border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: t.color.bgMuted, flexShrink: 0 }}>
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: 12, color: t.color.textDisabled, textAlign: 'center' }}>尚未上傳</span>
            )}
          </div>
          <div style={{ width: isMobile ? '100%' : 'auto' }}>
            <input type="file" ref={fileRef} accept="image/*" onChange={uploadLogo} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ width: isMobile ? '100%' : 'auto', padding: isMobile ? '12px 16px' : '8px 20px', borderRadius: 8, border: 'none', background: uploading ? '#94a3b8' : '#2563eb', color: t.color.bgCard, fontSize: 13, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
              {uploading ? '上傳中...' : settings.logo_url ? '更換 Logo' : '上傳 Logo'}
            </button>
            <div style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled }}>建議尺寸 300×100px，PNG/JPG，最大 2MB</div>
            <div style={{ fontSize: 11, color: t.color.textDisabled }}>Logo 將顯示在報價單、訂單、銷貨單的列印文件上</div>
          </div>
        </div>
      </div>

      {/* Company Info */}
      <div style={{ ...defaultStyles.card }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.color.textSecondary, marginBottom: 12 }}>公司資訊</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 12 }}>
          <div>
            <label style={defaultStyles.label}>公司名稱（中文）</label>
            <input style={{ ...defaultStyles.input, ...(isMobile ? S.mobile.input : {}) }} value={settings.company_name || ''} onChange={e => update('company_name', e.target.value)} placeholder="例：全球汽車零件有限公司" />
          </div>
          <div>
            <label style={defaultStyles.label}>公司名稱（英文）</label>
            <input style={{ ...defaultStyles.input, ...(isMobile ? S.mobile.input : {}) }} value={settings.company_name_en || ''} onChange={e => update('company_name_en', e.target.value)} placeholder="e.g. Global Auto Parts Co., Ltd." />
          </div>
          <div>
            <label style={defaultStyles.label}>統一編號</label>
            <input style={{ ...defaultStyles.input, ...(isMobile ? S.mobile.input : {}) }} value={settings.tax_id || ''} onChange={e => update('tax_id', e.target.value)} placeholder="12345678" />
          </div>
          <div>
            <label style={defaultStyles.label}>電話</label>
            <input style={{ ...defaultStyles.input, ...(isMobile ? S.mobile.input : {}) }} value={settings.phone || ''} onChange={e => update('phone', e.target.value)} placeholder="02-1234-5678" />
          </div>
          <div>
            <label style={defaultStyles.label}>傳真</label>
            <input style={{ ...defaultStyles.input, ...(isMobile ? S.mobile.input : {}) }} value={settings.fax || ''} onChange={e => update('fax', e.target.value)} placeholder="02-1234-5679" />
          </div>
          <div>
            <label style={defaultStyles.label}>Email</label>
            <input style={{ ...defaultStyles.input, ...(isMobile ? S.mobile.input : {}) }} value={settings.email || ''} onChange={e => update('email', e.target.value)} placeholder="info@company.com" />
          </div>
          <div style={{ gridColumn: isMobile ? '1 / -1' : '1 / -1' }}>
            <label style={defaultStyles.label}>地址</label>
            <input style={{ ...defaultStyles.input, ...(isMobile ? S.mobile.input : {}) }} value={settings.address || ''} onChange={e => update('address', e.target.value)} placeholder="台北市信義區信義路五段7號" />
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={save} disabled={saving} style={{ width: isMobile ? '100%' : 'auto', padding: isMobile ? '12px 16px' : '10px 28px', borderRadius: 8, border: 'none', background: saving ? '#94a3b8' : t.color.brand, color: t.color.bgCard, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      </div>
    </div>
  );
}
