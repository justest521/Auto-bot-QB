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
  const [mode, setMode] = useState('photo');   // photo | scan | manual | hid
  const [items, setItems] = useState([]);
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [parseMethod, setParseMethod] = useState('');
  const [authed, setAuthed] = useState(null);
  const [isPWA, setIsPWA] = useState(false);
  const [showInstall, setShowInstall] = useState(false);

  // 掃碼相關
  const [scanning, setScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState([]); // 最近掃過的碼
  const [scanStatus, setScanStatus] = useState(''); // 掃碼狀態提示
  const streamRef = useRef(null);
  const lastScannedRef = useRef('');
  const lastScannedTimeRef = useRef(0);

  // 手動輸入
  const [manualInput, setManualInput] = useState('');

  // HID 掃描槍模式
  const [hidInput, setHidInput] = useState('');
  const [hidBuffer, setHidBuffer] = useState('');
  const [hidContinuous, setHidContinuous] = useState(true);
  const [hidLastScanned, setHidLastScanned] = useState(null);
  const hidInputRef = useRef(null);
  const hidBufferTimeoutRef = useRef(null);

  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // 認證檢查 + PWA 偵測
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthed(false); return; }
    apiGet({ action: 'me' }).then(r => setAuthed(!!r.user)).catch(() => setAuthed(false));
    apiGet({ action: 'vendors', search: '', limit: 200 }).then(r => setVendors(r.vendors || [])).catch(() => {});

    // 偵測是否已從主畫面安裝
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsPWA(!!standalone);
    // 如果在 LINE WebView 或一般瀏覽器裡，顯示安裝提示
    if (!standalone) {
      const dismissed = sessionStorage.getItem('pwa_install_dismissed');
      if (!dismissed) setShowInstall(true);
    }
  }, []);

  // 清理相機
  useEffect(() => {
    return () => {
      stopScanner();
      if (hidBufferTimeoutRef.current) clearTimeout(hidBufferTimeoutRef.current);
    };
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

  // ── 掃碼引擎 ──
  const detectorRef = useRef(null);
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const scanningRef = useRef(false);
  const [scanEngine, setScanEngine] = useState(''); // native | html5qr
  const [torchOn, setTorchOn] = useState(false);
  const [capturing, setCapturing] = useState(false); // 拍照解碼中

  // ── 啟動掃碼器（雙引擎：原生優先 → html5-qrcode 保底）──
  const startScanner = useCallback(async () => {
    try {
      setScanStatus('載入掃碼器...');
      getAudioCtx();

      // ── 策略 1: 嘗試原生 BarcodeDetector（iOS Safari 16.4+、Chrome 88+）──
      let useNative = false;
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes('ean_13') || formats.includes('code_128')) {
            detectorRef.current = new window.BarcodeDetector({
              formats: formats.filter(f => ['ean_13','ean_8','code_128','code_39','qr_code','upc_a','upc_e','codabar','itf'].includes(f)),
            });
            useNative = true;
          }
        } catch {}
      }

      if (useNative) {
        // ── 原生引擎：直接開相機 + requestAnimationFrame ──
        setScanEngine('native');
        setScanStatus('啟動相機（高速模式）...');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        streamRef.current = stream;

        setScanning(true);
        scanningRef.current = true;
        setStep('scanning');

        await new Promise(r => setTimeout(r, 150));
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }

        setScanStatus('對準條碼...（高速模式）');

        // requestAnimationFrame 掃描迴圈
        let busy = false;
        const scanLoop = () => {
          if (!scanningRef.current) return;
          if (video && video.readyState >= 2 && !busy) {
            busy = true;
            detectorRef.current.detect(video).then(barcodes => {
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                lookupAndAdd(barcodes[0].rawValue);
              }
              busy = false;
            }).catch(() => { busy = false; });
          }
          rafRef.current = requestAnimationFrame(scanLoop);
        };
        rafRef.current = requestAnimationFrame(scanLoop);

      } else {
        // ── 策略 2: html5-qrcode（所有瀏覽器都能用）──
        setScanEngine('html5qr');
        setScanStatus('啟動相機...');

        const mod = await import('html5-qrcode');
        const Html5Qrcode = mod.Html5Qrcode;

        setScanning(true);
        scanningRef.current = true;
        setStep('scanning');

        await new Promise(r => setTimeout(r, 200));

        const container = document.getElementById('qr-scanner-container');
        if (container) container.innerHTML = '';

        const scanner = new Html5Qrcode('qr-scanner-container', {
          verbose: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: false },
        });
        detectorRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 20,
            qrbox: (vw, vh) => {
              const w = Math.min(vw * 0.88, 380);
              const h = Math.min(vh * 0.35, 200);
              return { width: Math.max(w, 250), height: Math.max(h, 130) };
            },
            aspectRatio: 1.333,
            formatsToSupport: [0, 2, 3, 5, 8, 9, 10, 14, 15], // QR, CODABAR, CODE_39, CODE_128, ITF, EAN_13, EAN_8, UPC_A, UPC_E
          },
          (text) => { lookupAndAdd(text); },
          () => {},
        );
        setScanStatus('對準條碼...');
      }

    } catch (e) {
      const errMsg = e.message || String(e);
      if (errMsg.includes('NotAllowed') || errMsg.includes('Permission') || errMsg.includes('denied')) {
        setError('請允許相機權限後再試');
      } else {
        setError('無法開啟掃碼器：' + errMsg);
      }
      setStep('capture');
      setScanning(false);
      scanningRef.current = false;
    }
  }, [lookupAndAdd]);

  // ── 停止掃碼器 ──
  const stopScanner = useCallback(async () => {
    scanningRef.current = false;
    setScanning(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    // html5-qrcode cleanup
    if (scanEngine === 'html5qr' && detectorRef.current) {
      try { await detectorRef.current.stop(); } catch {}
      try { detectorRef.current.clear(); } catch {}
    }
    detectorRef.current = null;
    setTorchOn(false);
  }, [scanEngine]);

  // ── 手電筒開關 ──
  const toggleTorch = useCallback(async () => {
    try {
      const track = streamRef.current?.getVideoTracks()?.[0];
      if (!track) return;
      const caps = track.getCapabilities?.();
      if (!caps?.torch) { setError('此裝置不支援手電筒'); return; }
      const newVal = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: newVal }] });
      setTorchOn(newVal);
    } catch (e) {
      setError('手電筒切換失敗');
    }
  }, [torchOn]);

  // ── 拍照解碼（針對難掃條碼：擷取高解析度靜態畫面解碼）──
  const captureAndDecode = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    setCapturing(true);
    setScanStatus('📸 拍照解碼中...');

    try {
      // 從 video 擷取最高解析度畫面
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      let found = false;

      // 方法 1: 用原生 BarcodeDetector 掃描靜態圖（更精確）
      if ('BarcodeDetector' in window) {
        try {
          const detector = new window.BarcodeDetector({
            formats: ['ean_13','ean_8','code_128','code_39','qr_code','upc_a','upc_e','codabar','itf'],
          });
          const bitmap = await createImageBitmap(canvas);
          const barcodes = await detector.detect(bitmap);
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            lookupAndAdd(barcodes[0].rawValue);
            found = true;
          }
        } catch {}
      }

      // 方法 2: 用 html5-qrcode 靜態掃描
      if (!found) {
        try {
          const mod = await import('html5-qrcode');
          const Html5Qrcode = mod.Html5Qrcode;
          const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
          const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
          const result = await Html5Qrcode.scanFile(file, false);
          if (result) {
            lookupAndAdd(result);
            found = true;
          }
        } catch {}
      }

      // 方法 3: 增強對比後重試（處理深色/反光包裝）
      if (!found) {
        try {
          // 灰階 + 高對比處理
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
            const enhanced = gray > 128 ? 255 : 0; // 二值化
            data[i] = data[i+1] = data[i+2] = enhanced;
          }
          ctx.putImageData(imageData, 0, 0);

          if ('BarcodeDetector' in window) {
            const bitmap2 = await createImageBitmap(canvas);
            const detector2 = new window.BarcodeDetector({
              formats: ['ean_13','ean_8','code_128','code_39','qr_code','upc_a','upc_e','codabar','itf'],
            });
            const barcodes2 = await detector2.detect(bitmap2);
            if (barcodes2.length > 0 && barcodes2[0].rawValue) {
              lookupAndAdd(barcodes2[0].rawValue);
              found = true;
            }
          }

          if (!found) {
            const mod2 = await import('html5-qrcode');
            const blob2 = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
            const file2 = new File([blob2], 'enhanced.jpg', { type: 'image/jpeg' });
            const result2 = await mod2.Html5Qrcode.scanFile(file2, false);
            if (result2) {
              lookupAndAdd(result2);
              found = true;
            }
          }
        } catch {}
      }

      if (!found) {
        setScanStatus('❌ 未偵測到條碼，請靠近一點再試');
        vibrate([100, 50, 100]);
      }
    } catch {
      setScanStatus('❌ 拍照解碼失敗');
    }
    setCapturing(false);
  }, [lookupAndAdd]);

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

  // ── HID 掃描槍模式：鍵盤輸入監聽 ──
  const handleHidKeyDown = useCallback((e) => {
    // Enter 鍵：觸發查詢
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = hidBuffer.trim().toUpperCase();
      if (code) {
        lookupAndAdd(code);
        setHidLastScanned(code);
        setHidBuffer('');
        // 清除待機的緩衝超時
        if (hidBufferTimeoutRef.current) clearTimeout(hidBufferTimeoutRef.current);
        // 如果連續模式開啟，自動重新焦點
        if (hidContinuous && hidInputRef.current) {
          setTimeout(() => hidInputRef.current?.focus(), 50);
        }
      }
      return;
    }

    // 其他按鍵：累積到緩衝
    if (e.key.length === 1) {
      const newBuf = hidBuffer + e.key;
      setHidBuffer(newBuf);

      // 清除舊的超時
      if (hidBufferTimeoutRef.current) clearTimeout(hidBufferTimeoutRef.current);

      // 設定 100ms 的無輸入超時：如果超過 100ms 沒有新按鍵，自動按 Enter 處理
      // 但這種情況很少，主要是為了應對某些掃碼槍的特殊行為
      hidBufferTimeoutRef.current = setTimeout(() => {
        // 不自動觸發，只是準備好狀態
      }, 100);
    }
  }, [hidBuffer, hidContinuous, lookupAndAdd]);

  // HID 模式清理：移除舊的 change handler，防止重複
  const handleHidInputChange = useCallback((e) => {
    // 實際上用 onKeyDown 就夠了，但保留 onChange 作為備用
    // 防止直接粘貼導致的邏輯問題
  }, []);

  // ── 入庫 ──
  const handleStockIn = async () => {
    const selected = items.filter((_, i) => checkedItems.has(i));
    if (!selected.length) return;
    setStep('submitting');
    try {
      let noteMsg = '手機進貨';
      if (mode === 'scan') noteMsg = '條碼掃描進貨';
      else if (mode === 'hid') noteMsg = '掃描槍進貨';
      else if (mode === 'photo') noteMsg = '拍照辨識進貨';
      else if (mode === 'manual') noteMsg = '手動輸入進貨';

      const res = await apiPost({
        action: 'quick_stock_in',
        items: selected.map(i => ({ part_no: i.part_no, name: i.name, qty: Number(i.qty) || 1, cost: Number(i.cost) || 0 })),
        vendor_id: selectedVendor || null,
        note: noteMsg,
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

      {/* ══════ PWA 安裝提示 ══════ */}
      {showInstall && !isPWA && step === 'capture' && (
        <div style={{ margin: '12px', padding: '12px 14px', background: 'linear-gradient(135deg, #ecfdf5, #f0fdf4)', border: '1px solid #86efac', borderRadius: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 4 }}>⚡ 加到主畫面更快！</div>
              <div style={{ color: '#4b5563', lineHeight: 1.5 }}>
                安裝後掃碼速度提升 3-5 倍<br/>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  {/iPad|iPhone|iPod/.test(navigator?.userAgent || '')
                    ? '點底部「分享」⬆ →「加入主畫面」'
                    : '點右上選單 ⋮ →「加到主畫面」'}
                </span>
              </div>
            </div>
            <button onClick={() => { setShowInstall(false); sessionStorage.setItem('pwa_install_dismissed', '1'); }}
              style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>✕</button>
          </div>
        </div>
      )}

      {/* ══════ 拍照/掃碼/手動 選擇 ══════ */}
      {step === 'capture' && (
        <>
          {/* 模式切換 */}
          <div style={{ display: 'flex', gap: 6, margin: '12px 12px 0', background: '#fff', borderRadius: 12, padding: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexWrap: 'wrap' }}>
            <button onClick={() => setMode('scan')} style={S.modeBtn(mode === 'scan')}>📱 掃條碼</button>
            <button onClick={() => setMode('photo')} style={S.modeBtn(mode === 'photo')}>📸 拍照辨識</button>
            <button onClick={() => setMode('manual')} style={S.modeBtn(mode === 'manual')}>⌨️ 手動輸入</button>
            <button onClick={() => setMode('hid')} style={S.modeBtn(mode === 'hid')}>📡 掃描槍</button>
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

          {/* HID 外接掃描槍模式 */}
          {mode === 'hid' && (
            <div style={S.card}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 56, marginBottom: 8 }}>📡</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>外接掃描槍模式</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>連接 USB 或 Bluetooth 掃碼槍</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>掃碼槍會自動輸入並按 Enter 查詢</div>
              </div>

              {/* 掃描槍輸入框 */}
              <div style={{ marginBottom: 14 }}>
                <input
                  ref={hidInputRef}
                  type="text"
                  placeholder="掃描槍自動輸入..."
                  value={hidBuffer}
                  onChange={handleHidInputChange}
                  onKeyDown={handleHidKeyDown}
                  autoFocus
                  style={{
                    ...S.input,
                    fontSize: 18,
                    padding: '16px 14px',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    border: '2px solid #16a34a',
                    background: '#f0fdf4',
                  }}
                />
              </div>

              {/* 掃描狀態 */}
              {scanStatus && (
                <div style={{
                  padding: '10px 12px',
                  background: '#ecfdf5',
                  borderRadius: 8,
                  marginBottom: 12,
                  fontSize: 13,
                  color: '#16a34a',
                  fontWeight: 600,
                  textAlign: 'center',
                }}>
                  {scanStatus}
                </div>
              )}

              {/* 最後掃入項目 */}
              {hidLastScanned && (
                <div style={{
                  padding: '12px',
                  background: '#fefce8',
                  borderLeft: '4px solid #facc15',
                  borderRadius: 6,
                  marginBottom: 12,
                  fontSize: 13,
                }}>
                  <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 3 }}>最後掃入</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#374151' }}>{hidLastScanned}</div>
                </div>
              )}

              {/* 連續模式開關 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: '#f9fafb',
                borderRadius: 8,
                marginBottom: 12,
                border: '1px solid #e5e7eb',
              }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={hidContinuous}
                    onChange={e => setHidContinuous(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#16a34a', cursor: 'pointer' }}
                  />
                  連續模式 (掃完自動聚焦)
                </label>
              </div>

              {/* 掃碼次數 */}
              <div style={{
                fontSize: 12,
                color: '#6b7280',
                textAlign: 'center',
                padding: '8px',
                background: '#f3f4f6',
                borderRadius: 6,
                marginBottom: 12,
              }}>
                已掃 {items.length} 項
              </div>
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

          {/* HID 模式的掃碼歷史 */}
          {mode === 'hid' && scanHistory.length > 0 && (
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#374151' }}>掃碼歷史</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {scanHistory.slice(0, 10).map((code, i) => {
                  const item = items.find(it => it.barcode === code || it.part_no === code);
                  return (
                    <div key={i} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 8px',
                      background: '#f9fafb',
                      borderRadius: 6,
                      fontSize: 12,
                    }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{code}</span>
                      {item && <span style={{ color: '#10b981', fontSize: 11 }}>✓ {item.part_no}</span>}
                    </div>
                  );
                })}
                {scanHistory.length > 10 && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>... 更多掃碼記錄</div>}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════ 掃碼進行中 ══════ */}
      {step === 'scanning' && (
        <>
          {/* 掃碼視窗：原生模式顯示 video + overlay；html5-qrcode 模式顯示容器 */}
          {scanEngine === 'native' ? (
            <div style={{ position: 'relative', background: '#000', width: '100%', height: '60vh' }}>
              <video ref={videoRef} playsInline muted autoPlay
                style={{ width: '100%', height: '60vh', objectFit: 'cover', display: 'block' }} />
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: '85%', maxWidth: 360, height: 180,
                  border: '3px solid #22c55e', borderRadius: 14,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', left: 0, right: 0, height: 3,
                    background: 'linear-gradient(90deg, transparent, #22c55e, transparent)',
                    animation: 'scanline 1.2s ease-in-out infinite',
                  }} />
                </div>
              </div>
              <style>{`@keyframes scanline { 0%,100% { top: 0 } 50% { top: 177px } }`}</style>
            </div>
          ) : (
            <>
              <div id="qr-scanner-container" style={{ width: '100%', minHeight: '55vh', background: '#000' }} />
              <style>{`
                #qr-scanner-container video { width: 100% !important; height: 55vh !important; object-fit: cover !important; }
                #qr-scanner-container #qr-shaded-region { border-color: #22c55e !important; border-width: 3px !important; border-radius: 12px !important; }
                #qr-scanner-container img[alt="Info"] { display: none !important; }
              `}</style>
            </>
          )}

          {/* 掃碼狀態 */}
          <div style={{ ...S.card, padding: '10px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
              {scanStatus || '對準條碼...'}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
              <span>已掃 {items.length} 項</span>
              <span style={{ color: scanEngine === 'native' ? '#16a34a' : '#f59e0b' }}>
                {scanEngine === 'native' ? '⚡ 高速模式' : '📷 相容模式'}
              </span>
            </div>
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

          {/* 掃碼工具列（手電筒 + 拍照解碼）*/}
          {scanEngine === 'native' && (
            <div style={{ display: 'flex', gap: 10, margin: '0 12px', marginTop: -4 }}>
              <button onClick={toggleTorch} style={{
                flex: 1, padding: '10px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 10, cursor: 'pointer',
                background: torchOn ? '#fbbf24' : '#374151', color: torchOn ? '#000' : '#fff',
              }}>
                {torchOn ? '🔦 關閉手電筒' : '💡 手電筒'}
              </button>
              <button onClick={captureAndDecode} disabled={capturing} style={{
                flex: 1, padding: '10px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 10, cursor: 'pointer',
                background: capturing ? '#9ca3af' : '#2563eb', color: '#fff',
              }}>
                {capturing ? '⏳ 解碼中...' : '📸 拍照解碼'}
              </button>
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
