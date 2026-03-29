'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = '/api/admin';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('qb_admin_token') : null;

async function apiPost(body) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() || '' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}?${qs}`, { headers: { 'x-admin-token': getToken() || '' } });
  return res.json();
}

// ── 壓縮圖片 ──
function compressImage(file, maxPx = 1600, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        const ratio = Math.min(maxPx / width, maxPx / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function MobileStockIn() {
  const [step, setStep] = useState('capture'); // capture | parsing | preview | submitting | done
  const [items, setItems] = useState([]);
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [parseMethod, setParseMethod] = useState('');
  const [authed, setAuthed] = useState(null); // null=checking, true/false
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // 認證檢查
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthed(false); return; }
    apiGet({ action: 'me' }).then(r => setAuthed(!!r.user)).catch(() => setAuthed(false));
    apiGet({ action: 'vendors', search: '', limit: 200 }).then(r => setVendors(r.vendors || [])).catch(() => {});
  }, []);

  // ── 上傳解析 ──
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setStep('parsing');
    setError('');
    try {
      // 壓縮圖片
      let uploadFile = file;
      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file);
        uploadFile = new File([compressed], file.name, { type: 'image/jpeg' });
      }

      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'x-admin-token': getToken() || '' },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Upload failed');

      const parsed = data.items || [];
      if (!parsed.length) { setError('無法辨識品項，請重新拍照'); setStep('capture'); return; }

      // 比對產品 + 記憶
      const partNos = parsed.map(i => (i.part_no || '').toUpperCase()).filter(Boolean);
      let costMap = {};
      try {
        const mem = await apiGet({ action: 'item_memory', vendor_id: selectedVendor || '', item_numbers: partNos.join(',') });
        (mem.vendor_mappings || []).forEach(m => { costMap[m.source_part_no?.toUpperCase()] = m; });
        (mem.cost_history || []).forEach(m => { if (!costMap[m.item_number?.toUpperCase()]) costMap[m.item_number?.toUpperCase()] = m; });
      } catch (_) {}

      const enriched = await Promise.all(parsed.map(async (item) => {
        const pn = (item.part_no || '').toUpperCase();
        const mem = costMap[pn];
        try {
          const r = await apiGet({ action: 'quick_receive_match', part_no: pn });
          const prod = r.product;
          return {
            ...item, part_no: pn,
            name: item.name || mem?.item_name || prod?.description || '',
            cost: item.cost || mem?.last_cost || Number(prod?.tw_reseller_price || 0) || 0,
            qty: Number(item.qty) || 1,
            matched: !!prod,
            from_memory: !item.cost && !!mem?.last_cost,
          };
        } catch {
          return { ...item, part_no: pn, name: item.name || mem?.item_name || '', cost: item.cost || mem?.last_cost || 0, qty: Number(item.qty) || 1, matched: false, from_memory: !!mem?.last_cost };
        }
      }));

      setItems(enriched);
      setCheckedItems(new Set(enriched.map((_, i) => i)));
      setParseMethod(data.method || 'ai');
      setStep('preview');
    } catch (e) {
      setError(e.message);
      setStep('capture');
    }
  }, [selectedVendor]);

  // ── 入庫 ──
  const handleStockIn = async () => {
    const selected = items.filter((_, i) => checkedItems.has(i));
    if (!selected.length) return;
    setStep('submitting');
    try {
      const res = await apiPost({
        action: 'quick_stock_in',
        items: selected.map(i => ({ part_no: i.part_no, name: i.name, qty: Number(i.qty) || 1, cost: Number(i.cost) || 0 })),
        vendor_id: selectedVendor || null,
        note: '手機進貨',
      });
      setMsg(`✅ ${res.stock_in_no}\n${res.count} 項入庫完成`);
      setStep('done');
    } catch (e) {
      setError(e.message);
      setStep('preview');
    }
  };

  const toggleCheck = (idx) => setCheckedItems(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  const updateItem = (idx, key, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  const checkedCount = [...checkedItems].filter(i => i < items.length).length;
  const totalAmt = items.filter((_, i) => checkedItems.has(i)).reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.cost) || 0), 0);

  // ── 樣式 ──
  const S = {
    page: { minHeight: '100dvh', background: '#f5f6f7', fontFamily: "'Noto Sans TC', sans-serif" },
    header: { background: '#16a34a', color: '#fff', padding: '14px 16px', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 },
    card: { background: '#fff', borderRadius: 12, margin: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    btn: { width: '100%', padding: '14px', fontSize: 16, fontWeight: 700, color: '#fff', background: '#16a34a', border: 'none', borderRadius: 12, cursor: 'pointer' },
    btnOutline: { width: '100%', padding: '14px', fontSize: 16, fontWeight: 700, color: '#16a34a', background: '#fff', border: '2px solid #16a34a', borderRadius: 12, cursor: 'pointer' },
    input: { width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', boxSizing: 'border-box' },
  };

  // ── 未認證 ──
  if (authed === false) {
    return (
      <div style={S.page}>
        <div style={S.header}>📦 手機進貨</div>
        <div style={{ ...S.card, textAlign: 'center', paddingTop: 40, paddingBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 15, color: '#6b7280', marginBottom: 20 }}>請先登入 ERP 後台</div>
          <button onClick={() => window.location.href = '/admin'} style={S.btn}>前往登入</button>
        </div>
      </div>
    );
  }
  if (authed === null) {
    return <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 14, color: '#9ca3af' }}>載入中...</div></div>;
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <span>📦 手機進貨</span>
        {step !== 'capture' && step !== 'done' && (
          <button onClick={() => { setStep('capture'); setItems([]); setError(''); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>重來</button>
        )}
      </div>

      {error && (
        <div style={{ margin: '12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#dc2626', fontSize: 13 }}>
          {error}
          <span onClick={() => setError('')} style={{ float: 'right', cursor: 'pointer' }}>✕</span>
        </div>
      )}

      {/* ══════ 拍照/上傳 ══════ */}
      {step === 'capture' && (
        <div style={S.card}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>📸</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>拍照或上傳進貨單</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>支援送貨單、發票、手寫單據</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={e => handleFile(e.target.files[0])} style={{ display: 'none' }} />
            <button onClick={() => cameraRef.current?.click()} style={{ ...S.btn, fontSize: 18, padding: 16 }}>
              📷 拍照進貨
            </button>

            <input ref={fileRef} type="file" accept="image/*,.pdf,.csv,.xlsx" onChange={e => handleFile(e.target.files[0])} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} style={S.btnOutline}>
              📁 從相簿/檔案選取
            </button>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4, display: 'block' }}>廠商（選填，可提高辨識準確度）</label>
            <select value={selectedVendor} onChange={e => setSelectedVendor(e.target.value)} style={S.input}>
              <option value="">不指定</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ══════ 解析中 ══════ */}
      {step === 'parsing' && (
        <div style={{ ...S.card, textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12, animation: 'spin 1s linear infinite' }}>⏳</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>AI 辨識中...</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>通常 5~15 秒</div>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* ══════ 預覽確認 ══════ */}
      {step === 'preview' && (
        <>
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                辨識結果 <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{checkedCount}/{items.length} 項</span>
              </div>
              <button onClick={() => {
                if (checkedItems.size === items.length) setCheckedItems(new Set());
                else setCheckedItems(new Set(items.map((_, i) => i)));
              }} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {checkedItems.size === items.length ? '全不選' : '全選'}
              </button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} onClick={() => toggleCheck(idx)} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
                borderBottom: idx < items.length - 1 ? '1px solid #f3f4f6' : 'none',
                opacity: checkedItems.has(idx) ? 1 : 0.4, transition: 'opacity 0.15s',
              }}>
                <input type="checkbox" checked={checkedItems.has(idx)} onChange={() => toggleCheck(idx)}
                  style={{ width: 20, height: 20, accentColor: '#16a34a', marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, color: item.matched ? '#2563eb' : '#374151', fontFamily: 'monospace', fontSize: 14 }}>{item.part_no || '?'}</span>
                    {!item.matched && <span style={{ fontSize: 10, color: '#f59e0b', background: '#fef3c7', padding: '1px 5px', borderRadius: 3 }}>新品</span>}
                    {item.from_memory && <span style={{ fontSize: 10, color: '#8b5cf6', background: '#f5f3ff', padding: '1px 5px', borderRadius: 3 }}>記憶</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 4 }}>
                    <input value={item.name} onChange={e => { e.stopPropagation(); updateItem(idx, 'name', e.target.value); }} onClick={e => e.stopPropagation()} placeholder="品名" style={{ ...S.input, fontSize: 13, padding: '4px 6px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ fontSize: 11, color: '#9ca3af' }}>數量</label>
                    <input type="number" value={item.qty || ''} min={1} onChange={e => { e.stopPropagation(); updateItem(idx, 'qty', Number(e.target.value) || ''); }}
                      onClick={e => e.stopPropagation()} onBlur={e => { if (!e.target.value) updateItem(idx, 'qty', 1); }}
                      style={{ ...S.input, width: 50, textAlign: 'center', padding: '4px', fontSize: 14, fontWeight: 600 }} />
                    <label style={{ fontSize: 11, color: '#9ca3af' }}>成本</label>
                    <input type="number" value={item.cost || ''} min={0} onChange={e => { e.stopPropagation(); updateItem(idx, 'cost', Number(e.target.value) || ''); }}
                      onClick={e => e.stopPropagation()} onBlur={e => { if (!e.target.value) updateItem(idx, 'cost', 0); }}
                      style={{ ...S.input, width: 80, textAlign: 'right', padding: '4px 6px', fontSize: 14, fontFamily: 'monospace' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: (Number(item.cost) || 0) === 0 ? '#a855f7' : '#10b981', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {(Number(item.cost) || 0) === 0 ? '贈品' : `$${((Number(item.qty) || 1) * (Number(item.cost) || 0)).toLocaleString()}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 合計 + 入庫按鈕 */}
          <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #e5e7eb', padding: '12px 16px', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>合計 {checkedCount} 項</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#15803d', fontFamily: 'monospace' }}>${totalAmt.toLocaleString()}</span>
            </div>
            <button onClick={handleStockIn} disabled={checkedCount === 0} style={{
              ...S.btn, fontSize: 18, padding: 16,
              background: checkedCount === 0 ? '#d1d5db' : '#16a34a',
            }}>
              確認入庫 ({checkedCount} 項)
            </button>
          </div>
        </>
      )}

      {/* ══════ 入庫中 ══════ */}
      {step === 'submitting' && (
        <div style={{ ...S.card, textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>入庫中...</div>
        </div>
      )}

      {/* ══════ 完成 ══════ */}
      {step === 'done' && (
        <div style={S.card}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#15803d', whiteSpace: 'pre-line' }}>{msg}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <button onClick={() => { setStep('capture'); setItems([]); setMsg(''); }} style={S.btn}>
              繼續進貨
            </button>
            <button onClick={() => window.location.href = '/admin'} style={S.btnOutline}>
              回 ERP 後台
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
