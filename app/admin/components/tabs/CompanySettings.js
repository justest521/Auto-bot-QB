'use client';
import { useState, useEffect, useRef } from 'react';

const S = {
  input: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, width: '100%', outline: 'none', transition: 'border 0.15s' },
  label: { fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4, display: 'block' },
  card: { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f2f5', marginBottom: 16 },
};

export default function CompanySettings({ apiGet, apiPost }) {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet({ action: 'company_settings' });
        setSettings(res.settings || {});
      } catch (err) { console.error(err); }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiPost({ action: 'update_company_settings', settings });
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中...</div>;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 4 }}>公司設定</h2>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>設定公司資訊與 Logo，將顯示在所有列印文件上</p>

      {msg && <div style={{ padding: '8px 14px', borderRadius: 8, background: msg.includes('失敗') ? '#fef2f2' : '#f0fdf4', color: msg.includes('失敗') ? '#dc2626' : '#16a34a', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{msg}</div>}

      {/* Logo */}
      <div style={S.card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 12 }}>公司 Logo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 120, height: 120, borderRadius: 12, border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#f9fafb', flexShrink: 0 }}>
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>尚未上傳</span>
            )}
          </div>
          <div>
            <input type="file" ref={fileRef} accept="image/*" onChange={uploadLogo} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: uploading ? '#94a3b8' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
              {uploading ? '上傳中...' : settings.logo_url ? '更換 Logo' : '上傳 Logo'}
            </button>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>建議尺寸 300×100px，PNG/JPG，最大 2MB</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>Logo 將顯示在報價單、訂單、銷貨單的列印文件上</div>
          </div>
        </div>
      </div>

      {/* Company Info */}
      <div style={S.card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 12 }}>公司資訊</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={S.label}>公司名稱（中文）</label>
            <input style={S.input} value={settings.company_name || ''} onChange={e => update('company_name', e.target.value)} placeholder="例：全球汽車零件有限公司" />
          </div>
          <div>
            <label style={S.label}>公司名稱（英文）</label>
            <input style={S.input} value={settings.company_name_en || ''} onChange={e => update('company_name_en', e.target.value)} placeholder="e.g. Global Auto Parts Co., Ltd." />
          </div>
          <div>
            <label style={S.label}>統一編號</label>
            <input style={S.input} value={settings.tax_id || ''} onChange={e => update('tax_id', e.target.value)} placeholder="12345678" />
          </div>
          <div>
            <label style={S.label}>電話</label>
            <input style={S.input} value={settings.phone || ''} onChange={e => update('phone', e.target.value)} placeholder="02-1234-5678" />
          </div>
          <div>
            <label style={S.label}>傳真</label>
            <input style={S.input} value={settings.fax || ''} onChange={e => update('fax', e.target.value)} placeholder="02-1234-5679" />
          </div>
          <div>
            <label style={S.label}>Email</label>
            <input style={S.input} value={settings.email || ''} onChange={e => update('email', e.target.value)} placeholder="info@company.com" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={S.label}>地址</label>
            <input style={S.input} value={settings.address || ''} onChange={e => update('address', e.target.value)} placeholder="台北市信義區信義路五段7號" />
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={save} disabled={saving} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: saving ? '#94a3b8' : '#16a34a', color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      </div>
    </div>
  );
}
