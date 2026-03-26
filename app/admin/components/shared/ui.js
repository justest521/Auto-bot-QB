'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, useCsvImport, IMPORT_DATASETS } from '@/lib/admin/helpers';

// ── Feature Roadmap Config (from HYM Blueprint v19) ──
export const FEATURE_ROADMAP = {
  inventory: {
    phase: '近期',
    timeline: '1-2 個月',
    features: [
      '庫存流水帳整合（inventory_movements 每筆記錄）',
      '周轉天數自動計算',
      '積壓庫存一鍵上架零件交易所',
    ],
  },
  stock_alerts: {
    phase: '近期',
    timeline: '1-2 個月',
    features: [
      '低庫存自動警示通知（LINE / Email）',
      '缺貨預警儀表板',
      '安全庫存智慧建議',
    ],
  },
  reorder: {
    phase: '中期',
    timeline: '3-6 個月',
    features: [
      '採購單自動建議（依周轉天數 + 銷售趨勢）',
      '供應商報價波動記錄與比價',
      '採購時機 AI 預測（價格波動規律）',
    ],
  },
  vendors: {
    phase: '中期',
    timeline: '3-6 個月',
    features: [
      '供應商準時率追蹤',
      '不良品率追蹤',
      '供應商評分機制（交期 / 品質 / 價格）',
    ],
  },
  crm_leads: {
    phase: '中期',
    timeline: '3-6 個月',
    features: [
      '工具客戶回訪提醒（四時機 / 四管道）',
      '客戶生命週期自動標籤',
      '設備租賃到期提醒',
    ],
  },
  promotions: {
    phase: '中期',
    timeline: '3-6 個月',
    features: [
      'Snap-on 同業團購發起',
      '團購目標達標自動鎖單',
      'ECPay 代收整合',
    ],
  },
  dealer_orders: {
    phase: '中期',
    timeline: '3-6 個月',
    features: [
      '經銷商線上叫貨單',
      '零件圖互動叫貨（PDF → SVG）',
      '跨店庫存調撥建議',
    ],
  },
  profit_analysis: {
    phase: '長期',
    timeline: '6 個月以上',
    features: [
      '需求預測 AI 模型',
      '銷售趨勢自動分析',
      '毛利率異常警示',
    ],
  },
};

// ── Coming Soon Placeholder Tabs (new features from blueprint) ──
export const COMING_SOON_TABS = {
  parts_exchange: {
    label: '零件交易所',
    code: 'PTEX',
    section: 'ERP 銷售出貨',
    phase: '中期',
    timeline: '3-6 個月',
    description: '料號開放到零件交易所（HYMMOTO），積壓庫存一鍵上架，支援清庫存 / 團購 / 求購模式。',
    features: [
      '料號同步到 HYMMOTO 零件交易所',
      '積壓庫存自動偵測（turnover_days > 60）',
      '一鍵上架刊登',
      '團購 / 求購媒合',
    ],
  },
  equipment_lease: {
    label: '設備租賃',
    code: 'LEAS',
    section: 'ERP 銷售出貨',
    phase: '中期',
    timeline: '3-6 個月',
    description: '設備租賃方案追蹤、到期提醒、續約管理，含 GPU 算力租賃。',
    features: [
      '租賃方案建立與追蹤',
      '到期自動提醒（LINE / Email）',
      '續約 / 歸還流程管理',
      'GPU 算力租賃管理',
    ],
  },
  ai_forecast: {
    label: 'AI 預測',
    code: 'AIFC',
    section: 'ERP 分析報表',
    phase: '長期',
    timeline: '6 個月以上',
    description: '需求預測 AI 模型 + 採購時機價格預測，根據歷史銷售與供應商報價自動建議最佳採購時機。',
    features: [
      '需求預測 AI 模型（銷售趨勢 + 季節性）',
      '採購時機價格預測（供應商報價波動）',
      '熱門零件預警',
      '市場情緒分析（LINE 群組意圖標籤）',
    ],
  },
};

export function ComingSoonBanner({ tabId }) {
  const roadmap = FEATURE_ROADMAP[tabId];
  if (!roadmap) return null;
  const phaseColor = roadmap.phase === '近期' ? '#f59e0b' : roadmap.phase === '中期' ? '#3b82f6' : '#8b5cf6';
  return (
    <div style={{ background: `linear-gradient(135deg, ${phaseColor}08, ${phaseColor}04)`, border: `1px solid ${phaseColor}30`, borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>🚧</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: phaseColor }}>Coming Soon — {roadmap.phase}（{roadmap.timeline}）</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {roadmap.features.map((f, i) => (
          <span key={i} style={{
            fontSize: 12, color: '#374151', background: '#ffffff', border: '1px solid #e5e7eb',
            borderRadius: 20, padding: '4px 12px', lineHeight: 1.5,
          }}>{f}</span>
        ))}
      </div>
    </div>
  );
}

export function ComingSoonPage({ config }) {
  if (!config) return null;
  const phaseColor = config.phase === '近期' ? '#f59e0b' : config.phase === '中期' ? '#3b82f6' : '#8b5cf6';
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔮</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{config.label}</h2>
        <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: phaseColor, background: `${phaseColor}12`, border: `1px solid ${phaseColor}30`, borderRadius: 20, padding: '4px 14px', marginBottom: 16 }}>
          {config.phase} — {config.timeline}
        </div>
        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.8, marginBottom: 28 }}>{config.description}</p>
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '20px 24px', textAlign: 'left' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: 1, marginBottom: 14 }}>規劃功能</div>
          {config.features.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < config.features.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: phaseColor, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#374151' }}>{f}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>coming soon</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Loading() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div style={{ color: '#6b7280', fontSize: 13 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#16a34a', marginRight: 8, animation: 'pulse 1.5s infinite' }} />載入中...</div></div>;
}

export function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280', fontSize: 13 }}>{text}</div>;
}

export function StatusBanner({ text, tone = 'neutral' }) {
  if (!text) return null;
  const toneMap = {
    success: { background: '#dcfce7', borderColor: '#a7f3d0', color: '#16a34a' },
    error: { background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' },
    info: { background: '#dcfce7', borderColor: '#a7f3d0', color: '#16a34a' },
    neutral: { background: '#fdfdfe', borderColor: '#e5e7eb', color: '#6b7280' },
  };
  return <div style={{ ...S.card, padding: '14px 16px', ...(toneMap[tone] || toneMap.neutral) }}>{text}</div>;
}

export function PageLead({ eyebrow, title, description, action }) {
  return (
    <div style={S.pageLead}>
      <div>
        {eyebrow && <div style={S.eyebrow}>{eyebrow}</div>}
        <div style={S.pageTitle}>{title}</div>
        {description && <div style={S.pageDesc}>{description}</div>}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

// ── CategoryComboBox: 分類選擇/新增（帶模糊搜尋提示） ──
export function CategoryComboBox({ value, onChange, categories = [] }) {
  const [mode, setMode] = useState('select'); // 'select' | 'input'
  const [inputVal, setInputVal] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapRef = useRef(null);

  // 點擊外部關閉建議列表
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const matches = inputVal.trim()
    ? categories.filter(c => c.toLowerCase().includes(inputVal.toLowerCase()))
    : [];

  const confirmNew = () => {
    const name = inputVal.trim();
    if (!name) return;
    // 有完全相同的就直接選
    const exact = categories.find(c => c.toLowerCase() === name.toLowerCase());
    onChange(exact || name);
    setInputVal('');
    setMode('select');
    setShowSuggestions(false);
  };

  if (mode === 'input') {
    return (
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={inputVal}
            onChange={e => { setInputVal(e.target.value); setShowSuggestions(true); }}
            placeholder="輸入分類名稱..."
            style={{ ...S.input, flex: 1 }}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') confirmNew();
              if (e.key === 'Escape') { setMode('select'); setShowSuggestions(false); }
            }}
          />
          <button onClick={confirmNew} style={{ ...S.btnPrimary, padding: '6px 10px', fontSize: 12 }}>確認</button>
          <button onClick={() => { setMode('select'); setShowSuggestions(false); }} style={{ ...S.btnGhost, padding: '6px 8px', fontSize: 12 }}>取消</button>
        </div>
        {showSuggestions && inputVal.trim() && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 60, zIndex: 300, background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
            {matches.length > 0 ? (
              <>
                <div style={{ padding: '6px 12px', fontSize: 11, color: '#9ca3af', borderBottom: '1px solid #f3f4f6' }}>已有類似分類：</div>
                {matches.map(c => (
                  <div key={c} onClick={() => { onChange(c); setInputVal(''); setMode('select'); setShowSuggestions(false); }}
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f9fafb' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    {c}
                  </div>
                ))}
                <div style={{ padding: '6px 12px', fontSize: 11, color: '#6b7280', borderTop: '1px solid #e5e7eb' }}>
                  或按「確認」建立新分類「{inputVal.trim()}」
                </div>
              </>
            ) : (
              <div style={{ padding: '8px 12px', fontSize: 12, color: '#10b981' }}>
                無類似分類，按「確認」建立「{inputVal.trim()}」
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const allCats = [...new Set([...categories, value].filter(Boolean))].sort();
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...S.input, flex: 1 }}>
        {allCats.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <button onClick={() => setMode('input')} style={{ ...S.btnGhost, padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>+ 新增</button>
    </div>
  );
}

export function ProductEditModal({ product, onClose, onSaved, categories = [] }) {
  const [form, setForm] = useState(() => ({
    description: product?.description || '',
    us_price: product?.us_price ?? '',
    tw_retail_price: product?.tw_retail_price ?? 0,
    tw_reseller_price: product?.tw_reseller_price ?? 0,
    product_status: product?.product_status || 'Current',
    category: product?.category || 'other',
    replacement_model: product?.replacement_model || '',
    weight_kg: product?.weight_kg ?? '',
    origin_country: product?.origin_country || '',
    search_text: product?.search_text || '',
    image_url: product?.image_url || '',
  }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [imagePreview, setImagePreview] = useState(product?.image_url || '');

  if (!product) return null;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiPost({
        action: 'update_product_master',
        item_number: product.item_number,
        product: form,
      });
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || '商品更新失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('圖片大小不能超過 5MB'); return; }
    setUploading(true);
    setError('');
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setImagePreview(base64);
      const res = await apiPost({
        action: 'upload_product_image',
        item_number: product.item_number,
        image_base64: base64,
        file_name: file.name,
      });
      if (res.image_url) {
        setForm(f => ({ ...f, image_url: res.image_url }));
        setImagePreview(res.image_url);
      }
    } catch (err) {
      setError(err.message || '圖片上傳失敗');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async () => {
    setUploading(true);
    try {
      await apiPost({ action: 'upload_product_image', item_number: product.item_number });
      setForm(f => ({ ...f, image_url: '' }));
      setImagePreview('');
    } catch (err) {
      setError(err.message || '刪除圖片失敗');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 240, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={S.eyebrow}>Product Master</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>編輯商品主檔</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>{product.item_number}</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {error ? <StatusBanner text={error} tone="error" /> : null}

        {/* 商品圖片區 */}
        <div style={{ marginBottom: 18, padding: 16, background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
          <label style={{ ...S.label, marginBottom: 10, display: 'block' }}>商品圖片</label>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {imagePreview ? (
              <div style={{ position: 'relative', width: 120, height: 120, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f9fafb' }}>
                <img src={imagePreview} alt={product.item_number} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                <button onClick={removeImage} disabled={uploading} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 14, lineHeight: '24px', textAlign: 'center' }}>✕</button>
              </div>
            ) : (
              <div style={{ width: 120, height: 120, borderRadius: 10, border: '2px dashed #d1d5db', background: '#f9fafb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>
                <span style={{ fontSize: 28, marginBottom: 4 }}>📷</span>
                尚無圖片
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ ...S.btnGhost, padding: '8px 16px', fontSize: 13, cursor: 'pointer', display: 'inline-block', textAlign: 'center' }}>
                {uploading ? '上傳中...' : '選擇圖片'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} style={{ display: 'none' }} disabled={uploading} />
              </label>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>支援 JPG, PNG, WebP, GIF（最大 5MB）</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>品名 / 描述</label><textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} rows={3} style={{ ...S.input, resize: 'vertical' }} /></div>
          <div><label style={S.label}>US PRICE</label><input value={form.us_price} onChange={(e) => setForm((current) => ({ ...current, us_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>牌價</label><input type="number" value={form.tw_retail_price} onChange={(e) => setForm((current) => ({ ...current, tw_retail_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>進貨價</label><input type="number" value={form.tw_reseller_price} onChange={(e) => setForm((current) => ({ ...current, tw_reseller_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>狀態</label><select value={form.product_status} onChange={(e) => setForm((current) => ({ ...current, product_status: e.target.value }))} style={S.input}>
            <option value="Current">上架中</option><option value="New Announced">新品預告</option><option value="Legacy">舊型</option><option value="Discontinued">已停產</option>
          </select></div>
          <div><label style={S.label}>分類</label>
            <CategoryComboBox value={form.category} onChange={(v) => setForm(f => ({ ...f, category: v }))} categories={categories} />
          </div>
          <div><label style={S.label}>替代型號</label><input value={form.replacement_model} onChange={(e) => setForm((current) => ({ ...current, replacement_model: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>重量(kg)</label><input value={form.weight_kg} onChange={(e) => setForm((current) => ({ ...current, weight_kg: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>產地</label><input value={form.origin_country} onChange={(e) => setForm((current) => ({ ...current, origin_country: e.target.value }))} style={S.input} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>搜尋索引</label><textarea value={form.search_text} onChange={(e) => setForm((current) => ({ ...current, search_text: e.target.value }))} rows={3} style={{ ...S.input, resize: 'vertical', ...S.mono }} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={S.btnGhost}>取消</button>
          <button onClick={save} disabled={saving} style={S.btnPrimary}>{saving ? '儲存中...' : '儲存商品'}</button>
        </div>
      </div>
    </div>
  );
}

export function ImportStatus({ status }) {
  if (!status) return null;
  const success = status.includes('完成');
  const pending = status.includes('匯入中');
  return (
    <div style={{
      ...S.panelMuted,
      background: success ? '#edf9f2' : pending ? '#dbeafe' : '#fff4f4',
      borderColor: success ? '#bdeccb' : pending ? '#93c5fd' : '#ffc7cf',
      color: success ? '#127248' : pending ? '#3b82f6' : '#ef4444',
    }}>
      {status}
    </div>
  );
}

export function CsvImportButton({ datasetId, onImported, compact = false }) {
  const { status, busy, selectedFile, previewCount, batchProgress, recentImportHint, rawColumns, chooseFile, importSelected, clearSelection } = useCsvImport(datasetId, onImported);
  const panelWidth = compact ? 248 : 360;
  const panelMinHeight = compact ? 116 : 188;
  const statusMinHeight = compact ? (status ? 48 : 0) : 72;

  return (
    <div>
      {status && <ImportStatus status={status} />}
      <div style={selectedFile ? { ...S.panelMuted, padding: '12px 14px', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' } : {}}>
          {selectedFile ? (
            <>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, ...S.mono }}>FILE_PREVIEW</div>
                <div style={{ fontSize: 12, color: '#111827', fontWeight: 700, wordBreak: 'break-word' }}>{selectedFile.name}</div>
                <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>預計匯入 {fmt(previewCount)} 筆</div>
                {rawColumns.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 600 }}>欄位：</span>{rawColumns.join('、')}
                  </div>
                )}
                {recentImportHint ? (
                  <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: '#fff8eb', border: '1px solid #f7d699', color: '#8a5b00', fontSize: 12, lineHeight: 1.6 }}>
                    {recentImportHint.text}
                  </div>
                ) : null}
                {batchProgress ? (
                  <>
                    <div style={{ fontSize: compact ? 11 : 12, color: '#3b82f6', marginTop: 8, lineHeight: 1.6 }}>
                      匯入進度 {batchProgress.current}/{batchProgress.total} 批 · {fmt(batchProgress.processed)}/{fmt(batchProgress.all)} 筆 · {batchProgress.percent}%
                    </div>
                    <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: '#dbe7f7', overflow: 'hidden' }}>
                      <div style={{ width: `${batchProgress.percent}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #2d8cff 0%, #19c767 100%)', transition: 'width 0.2s ease' }} />
                    </div>
                  </>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: compact ? 'flex-end' : 'flex-start', flexWrap: compact ? 'wrap' : 'nowrap' }}>
                <button onClick={importSelected} disabled={busy} style={{ ...S.btnPrimary, padding: compact ? '8px 14px' : S.btnPrimary.padding, fontSize: compact ? 12 : 13 }}>
                  {busy && batchProgress ? `匯入中 ${batchProgress.current}/${batchProgress.total}` : busy ? '匯入中...' : '確認匯入'}
                </button>
                <button onClick={clearSelection} disabled={busy} style={{ ...S.btnGhost, padding: compact ? '8px 12px' : S.btnGhost.padding, fontSize: compact ? 12 : 13 }}>取消</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <label style={{ ...S.btnGhost, padding: '8px 16px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  匯入
                  <input
                    type="file"
                    accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
                    style={{ display: 'none' }}
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      chooseFile(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            </>
          )}
      </div>
    </div>
  );
}

export function PanelHeader({ title, meta, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{title}</div>
        {meta ? <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>{meta}</div> : null}
      </div>
      {badge}
    </div>
  );
}

export function Pager({ page, limit, total, onPageChange, onLimitChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (limit || 20)));

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#6b7280', ...S.mono }}>每頁</span>
        <select value={limit} onChange={(e) => onLimitChange(Number(e.target.value))} style={{ ...S.input, width: 90, padding: '8px 10px' }}>
          {[20, 50, 100, 200].map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} style={S.btnGhost}>← 上一頁</button>
        <span style={{ color: '#666', fontSize: 12, ...S.mono }}>P{page} / {totalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} style={S.btnGhost}>下一頁 →</button>
      </div>
    </div>
  );
}

export function SaleDetailDrawer({ slipNumber, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !slipNumber) return;
    setLoading(true);
    setError('');
    apiGet({ action: 'sale_detail', slip_number: slipNumber })
      .then(setDetail)
      .catch((err) => setError(err.message || '讀取銷貨單失敗'))
      .finally(() => setLoading(false));
  }, [open, slipNumber]);

  if (!open) return null;

  const sale = detail?.sale;
  const invoice = detail?.invoice;
  const items = detail?.items || [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 'min(720px, 100vw)', height: '100vh', background: '#f6f9fc', boxShadow: '-18px 0 50px rgba(18,26,42,0.2)', padding: '24px 22px 28px', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={S.eyebrow}>Sales Detail</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{slipNumber}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>完整銷貨單檢視</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {loading ? <Loading /> : error ? <ImportStatus status={error} /> : sale ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={S.panelMuted}><div style={S.label}>客戶</div><div style={{ fontSize: 14, color: '#111827', fontWeight: 700 }}>{sale.customer_name || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>銷貨日期</div><div style={{ fontSize: 14, color: '#111827', ...S.mono }}>{sale.sale_date || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>業務</div><div style={{ fontSize: 14, color: '#111827' }}>{sale.sales_person || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>發票號碼</div><div style={{ fontSize: 14, color: '#111827', ...S.mono }}>{sale.invoice_number || '-'}</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div style={S.panelMuted}><div style={S.label}>未稅</div><div style={{ fontSize: 18, color: '#111827', fontWeight: 700, ...S.mono }}>{fmtP(sale.subtotal)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>稅額</div><div style={{ fontSize: 18, color: '#111827', fontWeight: 700, ...S.mono }}>{fmtP(sale.tax)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>總額</div><div style={{ fontSize: 18, color: '#10b981', fontWeight: 700, ...S.mono }}>{fmtP(sale.total)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>毛利</div><div style={{ fontSize: 18, color: '#3b82f6', fontWeight: 700, ...S.mono }}>{fmtP(sale.gross_profit)}</div></div>
            </div>
            {invoice ? (
              <div style={S.card}>
                <PanelHeader title="發票資訊" meta="來自 qb_invoices" badge={<div style={S.tag('green')}>INVOICE</div>} />
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.8 }}>
                  <div><span style={{ color: '#6b7280', ...S.mono }}>NUMBER</span> {invoice.invoice_number || '-'}</div>
                  <div><span style={{ color: '#6b7280', ...S.mono }}>TYPE</span> {invoice.invoice_type || '-'}</div>
                  <div><span style={{ color: '#6b7280', ...S.mono }}>COMPANY</span> {invoice.company_name || '-'}</div>
                  <div><span style={{ color: '#6b7280', ...S.mono }}>TAX_ID -</span> {invoice.tax_id || '-'}</div>
                  <div><span style={{ color: '#6b7280', ...S.mono }}>AMOUNT</span> {fmtP(invoice.amount)}</div>
                  <div><span style={{ color: '#6b7280', ...S.mono }}>ISSUED</span> {fmtDate(invoice.issued_at)}</div>
                </div>
              </div>
            ) : null}
            <div style={S.card}>
              <PanelHeader title="商品明細" meta="若訂單明細已進 qb_order_items，這裡會直接列出。" badge={<div style={S.tag(items.length ? 'green' : 'red')}>{items.length ? `${fmt(items.length)} 筆` : '目前無明細'}</div>} />
              {items.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0,1fr) 80px 100px 110px', gap: 12, color: '#6b7280', fontSize: 12, fontWeight: 600, ...S.mono, borderBottom: '1px solid #e6edf5', paddingBottom: 8 }}>
                    <div>品號</div><div>品名</div><div style={{ textAlign: 'right' }}>數量</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'right' }}>小計</div>
                  </div>
                  {items.map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0,1fr) 80px 100px 110px', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #eef3f8' }}>
                      <div style={{ color: '#3b82f6', fontSize: 12, fontWeight: 700, ...S.mono }}>{item.item_number || '-'}</div>
                      <div style={{ color: '#111827', fontSize: 13 }}>{item.description || '-'}</div>
                      <div style={{ color: '#374151', textAlign: 'right', ...S.mono }}>{fmt(item.quantity)}</div>
                      <div style={{ color: '#374151', textAlign: 'right', ...S.mono }}>{fmtP(item.unit_price)}</div>
                      <div style={{ color: '#10b981', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(item.subtotal)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="目前這張銷貨單還沒有對應的商品明細資料。若後續把 qb_order_items 補齊，這裡會直接顯示。" />
              )}
            </div>
          </div>
        ) : <EmptyState text="找不到這張銷貨單" />}
      </div>
    </div>
  );
}

export function MiniDonut({ value, color }) {
  const safeValue = Math.max(0, Math.min(100, value || 0));
  const degrees = Math.round((safeValue / 100) * 360);
  return (
    <div
      style={{
        width: 66,
        height: 66,
        borderRadius: '50%',
        background: `conic-gradient(${color} ${degrees}deg, #e8eef6 ${degrees}deg 360deg)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827', fontSize: 12, fontWeight: 700, ...S.mono }}>
        {safeValue}%
      </div>
    </div>
  );
}

export function buildLinePath(values, width, height) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const step = safeValues.length > 1 ? width / (safeValues.length - 1) : width;

  return safeValues
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 10) - 5;
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
}

export function TrendChart({ monthly }) {
  const messageSeries = monthly?.map((item) => item.count) || [];
  const customerSeries = monthly?.map((item) => item.customers) || [];
  const messagePath = buildLinePath(messageSeries, 640, 180);
  const customerPath = buildLinePath(customerSeries, 640, 180);
  const messageArea = `${messagePath} L640 220 L0 220 Z`;
  const customerArea = `${customerPath} L640 220 L0 220 Z`;

  return (
    <div style={{ height: 240, borderRadius: 14, background: 'linear-gradient(180deg, #f9fbff 0%, #f0f5fb 100%)', border: '1px solid #dbe6f3', padding: 16, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: '16px 16px 38px', backgroundImage: 'linear-gradient(#edf2f8 1px, transparent 1px), linear-gradient(90deg, #edf2f8 1px, transparent 1px)', backgroundSize: '100% 46px, 72px 100%', borderRadius: 10 }} />
      <svg viewBox="0 0 640 220" style={{ position: 'relative', width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id="areaBlue" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#38a8ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38a8ff" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="areaGray" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#93a4bb" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#93a4bb" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={messageArea} fill="url(#areaBlue)" />
        <path d={customerArea} fill="url(#areaGray)" />
        <path d={messagePath} fill="none" stroke="#1696f3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={customerPath} fill="none" stroke="#c2ccd8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ position: 'absolute', left: 22, right: 20, bottom: 12, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', color: '#6b7280', fontSize: 11, ...S.mono }}>
        {(monthly || []).map((item) => (
          <div key={item.label}>{item.label}</div>
        ))}
      </div>
    </div>
  );
}

export function TrendLineChart({ daily }) {
  const counts = daily?.map((item) => item.count) || [];
  const path = buildLinePath(counts, 560, 150);
  const max = Math.max(...(counts.length ? counts : [0]), 1);
  const step = counts.length > 1 ? 560 / (counts.length - 1) : 560;

  return (
    <div style={{ height: 240, borderRadius: 14, background: 'linear-gradient(180deg, #1db5d9 0%, #1798cf 100%)', padding: 18, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 18, borderRadius: 12, backgroundImage: 'linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)', backgroundSize: '100% 44px' }} />
      <svg viewBox="0 0 560 180" style={{ position: 'relative', width: '100%', height: '100%' }}>
        <path d={path} fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {counts.map((value, idx) => {
          const x = idx * step;
          const y = 150 - (value / max) * 140 - 5;
          return <circle key={idx} cx={x} cy={y} r="4.5" fill="#fff" />;
        })}
      </svg>
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 12, display: 'grid', gridTemplateColumns: `repeat(${Math.max((daily || []).length, 1)}, 1fr)`, color: 'rgba(255,255,255,0.78)', fontSize: 10, ...S.mono }}>
        {(daily || []).map((item) => (
          <div key={item.label}>{item.label}</div>
        ))}
      </div>
    </div>
  );
}

export function StatCard({ code, label, value, sub, accent, tone = 'blue' }) {
  const toneColors = {
    blue: { accent: '#16a34a', bg: '#dcfce7', light: '#6ee7b7' },
    green: { accent: '#16a34a', bg: '#dcfce7', light: '#6ee7b7' },
    yellow: { accent: '#d97706', bg: '#fffbeb', light: '#fcd34d' },
    red: { accent: '#dc2626', bg: '#fef2f2', light: '#fca5a5' },
    navy: { accent: '#4f46e5', bg: '#eef2ff', light: '#a5b4fc' },
  };
  const t = toneColors[tone] || toneColors.blue;
  return (
    <div className="qb-card-hover" style={{ minWidth: 140, padding: '16px 18px 14px', position: 'relative', overflow: 'hidden', borderRadius: 14, background: '#ffffff', border: '1px solid #F2F2F2', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', cursor: 'pointer' }}>
      <div style={{ position: 'absolute', top: 12, right: 14, width: 32, height: 32, borderRadius: 8, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: t.accent, fontWeight: 700, ...S.mono }}>{code}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent || '#111827', ...S.mono, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>{sub}</div>}
    </div>
  );
}

export function RankingPanel({ title, rows, emptyText, valueLabel }) {
  return (
    <div style={S.card}>
      <PanelHeader title={title} meta="鼎新 A1 對照分析" />
      {rows?.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row, index) => (
            <div key={`${title}-${row.name}-${index}`} style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) 130px 120px', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: 999, background: index < 3 ? '#dbeafe' : '#f3f4f6', color: index < 3 ? '#3b82f6' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, ...S.mono }}>
                {index + 1}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#111827', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
                <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>毛利 {fmtP(row.gross_profit)}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 14, color: '#10b981', fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>
              <div style={{ textAlign: 'right', fontSize: 11, color: '#6b7280', ...S.mono }}>{valueLabel}</div>
            </div>
          ))}
        </div>
      ) : <EmptyState text={emptyText} />}
    </div>
  );
}

export function ReportShortcut({ code, title, desc, onClick, tone = 'blue' }) {
  const tones = {
    blue: ['#dbeafe', '#93c5fd', '#3b82f6'],
    green: ['#edfdf3', '#bbf7d0', '#16a34a'],
    yellow: ['#fff8eb', '#f7d699', '#d97706'],
    red: ['#fff1f2', '#fecdd3', '#e11d48'],
  };
  const [bg, border, color] = tones[tone] || tones.blue;
  return (
    <button onClick={onClick} style={{ ...S.card, width: '100%', textAlign: 'left', cursor: 'pointer', background: bg, borderColor: border, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color, ...S.mono }}>{code}</div>
          <div style={{ fontSize: 18, color: '#111827', fontWeight: 700, marginTop: 8 }}>{title}</div>
          <div style={{ fontSize: 12, color: '#374151', marginTop: 8, lineHeight: 1.7 }}>{desc}</div>
        </div>
        <div style={{ ...S.tag(''), color }}>{'前往'}</div>
      </div>
    </button>
  );
}
