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

// ── 音效管理器（全域單例，避免 WebView 限制）──
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  // iOS/LINE WebView 可能 suspend，嘗試 resume
  if (_audioCtx?.state === 'suspended') _audioCtx.resume().catch(() => {});
  return _audioCtx;
}

// ── 震動反饋 ──
function vibrate(pattern = 100) {
  try { navigator.vibrate?.(pattern); } catch {}
}

// ── 嗶聲（使用全域 AudioContext）──
function beep(freq = 1200, duration = 180) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration / 1000);
  } catch {}
}

// ── 成功掃碼音效（兩聲短嗶）──
function beepSuccess() {
  beep(1200, 80);
  setTimeout(() => beep(1600, 120), 100);
  vibrate([50, 30, 80]);
}

export default function MobileStockIn() {
  const [step, setStep] = useState('capture'); // capture | scanning | parsing | preview | submitting | done
  const [mode, setMode] = useState('photo');   // photo | scan | manual
  const [items, setItems] = useState([]);
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [parseMethod, setParseMethod] = useState('');
  const [authed, setAuthed] = useState(null);

  // 掃碼相關
  const [scanning, setScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState([]); // 最近掃過的碼
  const [scanStatus, setScanStatus] = useState(''); // 掃碼狀態提示
  const streamRef = useRef(null);
  const lastScannedRef = useRef('');
  const lastScannedTimeRef = useRef(0);

  // 手動輸入
  const [manualInput, setManualInput] = useState('');

  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // 認證檢查
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthed(false); return; }
    apiGet({ action: 'me' }).then(r => setAuthed(!!r.user)).catch(() => setAuthed(false));
    apiGet({ action: 'vendors', search: '', limit: 200 }).then(r => setVendors(r.vendors || [])).catch(() => {});
  }, []);

  // 清理相機
  useEffect(() => {
    return () => stopScanner();
  }, []);

  // ── 條碼查詢並加入清單 ──
  const lookupAndAdd = useCallback(async (code) => {
    if (!code) return;
    // 防止重複掃（同一碼 1.2 秒內不重複）
    const now = Date.now();
    if (code === lastScannedRef.current && now - lastScannedTimeRef.current < 1200) return;
    lastScannedRef.current = code;
    lastScannedTimeRef.current = now;

    beepSuccess();
    setScanStatus(`查詢 ${code}...`);
    setScanHistory(prev => [code, ...prev.filter(c => c !== code)].slice(0, 20));

    try {
      const res = await apiGet({ action: 'barcode_lookup', code });
      const prod = res.product;
      const mem = res.memory;

      const newItem = {
        part_no: prod?.item_number || code,
        name: prod?.description || '',
        cost: mem?.last_cost || Number(prod?.tw_reseller_price || 0) || 0,
        qty: 1,
        matched: !!prod && !prod.fuzzy_match,
        fuzzy: !!prod?.fuzzy_match,
        from_memory: !!mem?.last_cost,
        barcode: code,
      };

      // 如果已有同料號，+1 數量
      setItems(prev => {
        const existIdx = prev.findIndex(i => i.part_no.toUpperCase() === newItem.part_no.toUpperCase());
        if (existIdx >= 0) {
          const updated = [...prev];
          updated[existIdx] = { ...updated[existIdx], qty: updated[existIdx].qty + 1 };
          setScanStatus(`${newItem.part_no} 數量 +1 → ${updated[existIdx].qty}`);
          return updated;
        }
        setScanStatus(`✓ ${newItem.part_no}${newItem.name ? ' ' + newItem.name : ''}`);
        return [...prev, newItem];
      });

      // 確保新加入的自動勾選
      setCheckedItems(prev => {
        const n = new Set(prev);
        setItems(cur => { n.add(cur.length - 1); return cur; });
        return n;
      });
      // 用更可靠的方式：在 items 更新後同步 checked
      setTimeout(() => {
        setItems(cur => {
          setCheckedItems(new Set(cur.map((_, i) => i)));
          return cur;
        });
      }, 50);

    } catch (e) {
      setScanStatus(`❌ ${code} 查詢失敗`);
    }
  }, []);

  // ── html5-qrcode ──
  const scannerInstanceRef = useRef(null);
  const Html5QrCodeRef = useRef(null);

  // ── 啟動掃碼器 ──
  const startScanner = useCallback(async () => {
    try {
      setScanStatus('載入掃碼器...');

      // 在用戶點擊時初始化 AudioContext（WebView 要求）
      getAudioCtx();

      // 動態 import（Next.js 會打包進 bundle）
      if (!Html5QrCodeRef.current) {
        const mod = await import('html5-qrcode');
        Html5QrCodeRef.current = mod.Html5Qrcode;
      }

      setScanning(true);
      setStep('scanning');
      setScanStatus('啟動相機...');

      // 等 DOM 渲染
      await new Promise(r => setTimeout(r, 200));

      const scannerId = 'qr-scanner-container';
      if (scannerInstanceRef.current) {
        try { await scannerInstanceRef.current.stop(); } catch {}
        scannerInstanceRef.current = null;
      }

      const html5QrCode = new Html5QrCodeRef.current(scannerId, {
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      scannerInstanceRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 30,
          qrbox: (vw, vh) => {
            const w = Math.min(vw * 0.9, 400);
            const h = Math.min(vh * 0.4, 220);
            return { width: Math.max(w, 280), height: Math.max(h, 150) };
          },
          aspectRatio: 1.333,
          disableFlip: false,
          formatsToSupport: [
            0,  // QR_CODE
            5,  // CODE_128
            9,  // EAN_13
            10, // EAN_8
            3,  // CODE_39
          ],
        },
        (decodedText) => {
          // 成功掃到條碼
          lookupAndAdd(decodedText);
        },
        () => {
          // 每幀掃不到時不做事
        }
      );

      setScanStatus('對準條碼...');

    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setError('請允許相機權限後再試');
      } else {
        setError('無法開啟掃碼器：' + msg);
      }
      setStep('capture');
      setScanning(false);
    }
  }, [lookupAndAdd]);

  // ── 停止掃碼器 ──
  const stopScanner = useCallback(async () => {
    setScanning(false);
    if (scannerInstanceRef.current) {
      try { await scannerInstanceRef.current.stop(); } catch {}
      try { scannerInstanceRef.current.clear(); } catch {}
      scannerInstanceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── 上傳解析（拍照模式）──
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setStep('parsing');
    setError('');
    try {
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

      setItems(prev => [...prev, ...enriched]);
      // 設定新增的也勾選
      setItems(cur => {
        setCheckedItems(new Set(cur.map((_, i) => i)));
        return cur;
      });
      setParseMethod(data.method || 'ai');
      setStep('preview');
    } catch (e) {
      setError(e.message);
      setStep('capture');
    }
  }, [selectedVendor]);

  // ── 手動加入品項 ──
  const handleManualAdd = useCallback(async () => {
    const code = manualInput.trim().toUpperCase();
    if (!code) return;
    setManualInput('');
    await lookupAndAdd(code);
    // 如果還在 capture，跳到 preview
    setStep('preview');
  }, [manualInput, lookupAndAdd]);

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
        note: mode === 'scan' ? '條碼掃描進貨' : '手機進貨',
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
  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setCheckedItems(prev => {
      const n = new Set();
      prev.forEach(i => { if (i < idx) n.add(i); else if (i > idx) n.add(i - 1); });
      return n;
    });
  };
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
    modeBtn: (active) => ({
      flex: 1, padding: '10px 8px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
      background: active ? '#16a34a' : '#f3f4f6', color: active ? '#fff' : '#6b7280',
      transition: 'all 0.2s',
    }),
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
        <div style={{ display: 'flex', gap: 6 }}>
          {items.length > 0 && step !== 'done' && (
            <button onClick={() => { stopScanner(); setStep('preview'); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
              清單 ({items.length})
            </button>
          )}
          {step !== 'capture' && step !== 'done' && (
            <button onClick={() => { stopScanner(); setStep('capture'); setItems([]); setError(''); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>重來</button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ margin: '12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#dc2626', fontSize: 13 }}>
          {error}
          <span onClick={() => setError('')} style={{ float: 'right', cursor: 'pointer' }}>✕</span>
        </div>
      )}

      {/* ══════ 拍照/掃碼/手動 選擇 ══════ */}
      {step === 'capture' && (
        <>
          {/* 模式切換 */}
          <div style={{ display: 'flex', gap: 6, margin: '12px 12px 0', background: '#fff', borderRadius: 12, padding: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <button onClick={() => setMode('scan')} style={S.modeBtn(mode === 'scan')}>📱 掃條碼</button>
            <button onClick={() => setMode('photo')} style={S.modeBtn(mode === 'photo')}>📸 拍照辨識</button>
            <button onClick={() => setMode('manual')} style={S.modeBtn(mode === 'manual')}>⌨️ 手動輸入</button>
          </div>

          {/* 掃碼模式 */}
          {mode === 'scan' && (
            <div style={S.card}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 56, marginBottom: 8 }}>📱</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>連續掃描條碼</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>支援 EAN-13、Code128、QR Code 等</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>同料號重複掃會自動 +1</div>
              </div>
              <button onClick={startScanner} style={{ ...S.btn, fontSize: 18, padding: 16 }}>
                開始掃碼
              </button>
            </div>
          )}

          {/* 拍照模式 */}
          {mode === 'photo' && (
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
            </div>
          )}

          {/* 手動輸入模式 */}
          {mode === 'manual' && (
            <div style={S.card}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 56, marginBottom: 8 }}>⌨️</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>輸入料號查詢</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>輸入料號或條碼自動查詢產品</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={manualInput} onChange={e => setManualInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleManualAdd()}
                  placeholder="輸入料號 / EAN 條碼"
                  style={{ ...S.input, flex: 1, fontSize: 16, padding: '12px' }}
                  autoFocus
                />
                <button onClick={handleManualAdd} style={{ ...S.btn, width: 'auto', padding: '12px 20px', whiteSpace: 'nowrap' }}>加入</button>
              </div>
              {scanStatus && <div style={{ fontSize: 13, color: '#16a34a', textAlign: 'center', marginTop: 4 }}>{scanStatus}</div>}
            </div>
          )}

          {/* 廠商選擇 */}
          <div style={S.card}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4, display: 'block' }}>廠商（選填，可提高辨識準確度）</label>
            <select value={selectedVendor} onChange={e => setSelectedVendor(e.target.value)} style={S.input}>
              <option value="">不指定</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
          </div>

          {/* 已掃入的品項預覽 */}
          {items.length > 0 && (
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>已加入 {items.length} 項</span>
                <button onClick={() => setStep('preview')} style={{ fontSize: 13, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  查看清單 →
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {items.slice(-3).map((it, i) => (
                  <div key={i} style={{ padding: '2px 0' }}>{it.part_no} × {it.qty}</div>
                ))}
                {items.length > 3 && <div>... 還有 {items.length - 3} 項</div>}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════ 掃碼進行中 ══════ */}
      {step === 'scanning' && (
        <>
          <div id="qr-scanner-container" style={{ width: '100%', minHeight: '55vh', background: '#000' }} />
          <style>{`
            #qr-scanner-container { position: relative; }
            #qr-scanner-container video { width: 100% !important; height: 55vh !important; object-fit: cover !important; border-radius: 0 !important; }
            #qr-scanner-container #qr-shaded-region { border-color: #22c55e !important; border-width: 3px !important; border-radius: 12px !important; }
            #qr-scanner-container img[alt="Info"] { display: none !important; }
            #qr-scanner-container > div:first-child { min-height: 55vh !important; }
          `}</style>

          {/* 掃碼狀態 */}
          <div style={{ ...S.card, padding: '10px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
              {scanStatus || '對準條碼...'}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>已掃 {items.length} 項</div>
          </div>

          {/* 最近掃入清單 */}
          {items.length > 0 && (
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>已掃入品項</div>
              {items.slice().reverse().slice(0, 8).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontFamily: 'monospace', color: item.matched ? '#2563eb' : '#374151' }}>{item.part_no}</span>
                    {item.name && <span style={{ color: '#6b7280', marginLeft: 6 }}>{item.name.substring(0, 15)}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>×{item.qty}</span>
                    <span style={{ color: item.cost === 0 ? '#a855f7' : '#10b981', fontFamily: 'monospace', fontWeight: 600 }}>
                      {item.cost === 0 ? '贈品' : `$${item.cost}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 掃碼底部工具列 */}
          <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', gap: 10 }}>
            <button onClick={() => { stopScanner(); setStep('capture'); }} style={{ ...S.btnOutline, flex: 1, padding: 12 }}>
              ← 返回
            </button>
            <button onClick={() => { stopScanner(); setStep('preview'); }} disabled={items.length === 0} style={{
              ...S.btn, flex: 2, padding: 12,
              background: items.length === 0 ? '#d1d5db' : '#16a34a',
            }}>
              完成掃碼 → 確認清單 ({items.length})
            </button>
          </div>
        </>
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
                進貨清單 <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{checkedCount}/{items.length} 項</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => {
                  if (checkedItems.size === items.length) setCheckedItems(new Set());
                  else setCheckedItems(new Set(items.map((_, i) => i)));
                }} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  {checkedItems.size === items.length ? '全不選' : '全選'}
                </button>
                <button onClick={() => { stopScanner(); setStep('capture'); }} style={{ fontSize: 12, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  + 繼續加
                </button>
              </div>
            </div>

            {items.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: 13 }}>
                還沒有品項，回去掃碼或拍照加入
              </div>
            )}

            {items.map((item, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
                borderBottom: idx < items.length - 1 ? '1px solid #f3f4f6' : 'none',
                opacity: checkedItems.has(idx) ? 1 : 0.4, transition: 'opacity 0.15s',
              }}>
                <input type="checkbox" checked={checkedItems.has(idx)} onChange={() => toggleCheck(idx)}
                  style={{ width: 20, height: 20, accentColor: '#16a34a', marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => toggleCheck(idx)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, color: item.matched ? '#2563eb' : '#374151', fontFamily: 'monospace', fontSize: 14 }}>{item.part_no || '?'}</span>
                    {!item.matched && !item.fuzzy && <span style={{ fontSize: 10, color: '#f59e0b', background: '#fef3c7', padding: '1px 5px', borderRadius: 3 }}>新品</span>}
                    {item.fuzzy && <span style={{ fontSize: 10, color: '#f97316', background: '#fff7ed', padding: '1px 5px', borderRadius: 3 }}>模糊</span>}
                    {item.from_memory && <span style={{ fontSize: 10, color: '#8b5cf6', background: '#f5f3ff', padding: '1px 5px', borderRadius: 3 }}>記憶</span>}
                    {item.barcode && <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>{item.barcode.length > 10 ? 'EAN' : 'BC'}</span>}
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
                <button onClick={(e) => { e.stopPropagation(); removeItem(idx); }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 18, cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>✕</button>
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
            <button onClick={() => { setStep('capture'); setItems([]); setMsg(''); setCheckedItems(new Set()); }} style={S.btn}>
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
