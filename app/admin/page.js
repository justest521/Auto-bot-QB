'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

const API = '/api/admin';
const ADMIN_TOKEN_KEY = 'qb_admin_token';

const fmt = n => n?.toLocaleString('zh-TW') || '0';
const fmtMs = ms => !ms ? '-' : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
const fmtDate = d => d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const fmtP = n => n ? `NT$${Number(n).toLocaleString()}` : '-';

function todayInTaipei() {
  const now = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return new Date(taipei.getFullYear(), taipei.getMonth(), taipei.getDate());
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPresetDateRange(preset) {
  const today = todayInTaipei();
  const start = new Date(today);
  const end = new Date(today);

  if (preset === 'week') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
  } else if (preset === 'month') {
    start.setDate(1);
  } else if (preset === 'quarter') {
    const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(quarterStartMonth, 1);
  } else if (preset === 'year') {
    start.setMonth(0, 1);
  }

  return {
    from: toDateInputValue(start),
    to: toDateInputValue(end),
  };
}

function useViewportWidth() {
  const [width, setWidth] = useState(1400);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return width;
}

async function authFetch(url, options = {}) {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ADMIN_TOKEN_KEY) : '';

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token || '',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    throw new Error('Token 錯誤或已失效，請重新登入');
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;

    try {
      const data = await res.json();
      message = data?.error || message;
    } catch {
      try {
        message = await res.text();
      } catch {
        // Ignore response parse errors and use fallback message.
      }
    }

    throw new Error(message);
  }

  return res;
}

async function apiGet(params = {}) {
  const p = new URLSearchParams(params);
  const res = await authFetch(`${API}?${p.toString()}`);
  return res.json();
}

async function apiPost(body) {
  const res = await authFetch(API, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((value) => value.trim());
}

function parseCsvText(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

function normalizeSpreadsheetRows(rows) {
  return rows.filter((row) => Object.values(row || {}).some((value) => String(value ?? '').trim() !== ''));
}

function mapCustomerStage(customerType) {
  const text = String(customerType || '').trim();
  if (text.includes('正式')) return 'customer';
  if (['潛在', '詢價', '準客'].some((keyword) => text.includes(keyword))) return 'prospect';
  return 'lead';
}

function buildCustomerNotes(row) {
  const pairs = [
    ['電話', row['電話']],
    ['傳真', row['傳真']],
    ['職稱', row['職稱']],
    ['請款客戶', row['請款客戶']],
    ['客戶類型', row['客戶類型']],
    ['負責人', row['負責人']],
    ['客戶等級', row['客戶等級']],
    ['首次交易日', row['首次交易日']],
    ['合約起始日', row['合約起始日']],
    ['合約截止日', row['合約截止日']],
  ];
  return pairs.filter(([, value]) => value).map(([label, value]) => `${label}:${value}`).join(' | ');
}

function buildProductDescription(row) {
  return [row['品名'], row['規格一'], row['規格二']].filter(Boolean).join(' ').trim();
}

function buildProductSearchText(row) {
  return [row['品號'], row['品名'], row['規格一'], row['規格二'], row['商品分類'], row['主供應商']].filter(Boolean).join(' ').trim();
}

function mapRowsForDataset(datasetId, rows) {
  if (!rows.length) return [];

  if (datasetId === 'erp_customers') {
    return rows.map((row) => ({
      customer_code: row.customer_code ?? row['客戶代號'] ?? '',
      name: row.name ?? row['主聯絡人'] ?? row['客戶簡稱'] ?? '',
      company_name: row.company_name ?? row['客戶簡稱'] ?? '',
      phone: row.phone ?? row['手機'] ?? row['電話'] ?? '',
      email: row.email ?? '',
      tax_id: row.tax_id ?? row['統一編號'] ?? '',
      address: row.address ?? row['送貨地址'] ?? '',
      source: row.source ?? 'import',
      display_name: row.display_name ?? row['客戶簡稱'] ?? '',
      customer_stage: row.customer_stage ?? mapCustomerStage(row['客戶類型']),
      status: row.status ?? 'active',
      notes: row.notes ?? buildCustomerNotes(row),
    }));
  }

  if (datasetId === 'erp_vendors') {
    return rows.map((row) => ({
      vendor_code: row.vendor_code ?? row['廠商代號'] ?? '',
      vendor_name: row.vendor_name ?? row['廠商簡稱'] ?? '',
      phone: row.phone ?? row['電話'] ?? '',
      fax: row.fax ?? row['傳真'] ?? '',
      contact_name: row.contact_name ?? row['聯絡人'] ?? '',
      contact_title: row.contact_title ?? row['職稱'] ?? '',
      mobile: row.mobile ?? row['手機'] ?? '',
      address: row.address ?? row['營業地址'] ?? '',
      tax_id: row.tax_id ?? row['統一編號'] ?? '',
    }));
  }

  if (datasetId === 'quickbuy_products') {
    return rows.map((row) => ({
      item_number: row.item_number ?? row['品號'] ?? '',
      description: row.description ?? buildProductDescription(row),
      tw_retail_price: row.tw_retail_price ?? row['零售價'] ?? 0,
      tw_reseller_price: row.tw_reseller_price ?? row['優惠價'] ?? 0,
      product_status: row.product_status ?? 'Current',
      category: row.category ?? row['商品分類'] ?? 'other',
      replacement_model: row.replacement_model ?? '',
      weight_kg: row.weight_kg ?? row['單位淨重'] ?? 0,
      origin_country: row.origin_country ?? '',
      search_text: row.search_text ?? buildProductSearchText(row),
    }));
  }

  if (datasetId === 'erp_sales_return_summary') {
    return rows.map((row) => {
      const docNo = String(row.doc_no ?? row['單號'] ?? '');
      return {
        doc_date: row.doc_date ?? row['日期'] ?? '',
        doc_no: docNo,
        doc_type: row.doc_type ?? (docNo.startsWith('退') ? 'return' : 'sale'),
        invoice_no: row.invoice_no ?? row['發票號碼'] ?? '',
        customer_name: row.customer_name ?? row['客戶簡稱'] ?? '',
        sales_name: row.sales_name ?? row['業務姓名'] ?? '',
        amount: row.amount ?? row['合計金額'] ?? 0,
        tax_amount: row.tax_amount ?? row['稅額'] ?? 0,
        total_amount: row.total_amount ?? row['總金額'] ?? 0,
      };
    });
  }

  if (datasetId === 'erp_profit_analysis') {
    return rows.map((row) => ({
      customer_name: row.customer_name ?? row['客戶簡稱'] ?? '',
      doc_date: row.doc_date ?? row['日期'] ?? '',
      doc_no: row.doc_no ?? row['單號'] ?? '',
      sales_name: row.sales_name ?? row['業務'] ?? '',
      amount: row.amount ?? row['金額'] ?? 0,
      cost: row.cost ?? row['成本'] ?? 0,
      gross_profit: row.gross_profit ?? row['毛利'] ?? 0,
      gross_margin: row.gross_margin ?? row['毛利率'] ?? '',
    }));
  }

  if (datasetId === 'erp_quotes') {
    return rows.map((row) => ({
      quote_no: row.quote_no ?? row['報價單號'] ?? '',
      customer_code: row.customer_code ?? row['客戶代號'] ?? '',
      quote_date: row.quote_date ?? row['報價日期'] ?? row['日期'] ?? '',
      valid_until: row.valid_until ?? row['有效期限'] ?? '',
      status: row.status ?? row['狀態'] ?? 'draft',
      subtotal: row.subtotal ?? row['小計'] ?? 0,
      discount_amount: row.discount_amount ?? row['折扣金額'] ?? 0,
      shipping_fee: row.shipping_fee ?? row['運費'] ?? 0,
      tax_amount: row.tax_amount ?? row['稅額'] ?? 0,
      total_amount: row.total_amount ?? row['總額'] ?? row['合計'] ?? 0,
      remark: row.remark ?? row['備註'] ?? '',
    }));
  }

  if (datasetId === 'erp_orders') {
    return rows.map((row) => ({
      order_no: row.order_no ?? row['訂單號'] ?? '',
      customer_code: row.customer_code ?? row['客戶代號'] ?? '',
      order_date: row.order_date ?? row['訂單日期'] ?? row['日期'] ?? '',
      status: row.status ?? row['狀態'] ?? 'confirmed',
      payment_status: row.payment_status ?? row['付款狀態'] ?? 'unpaid',
      shipping_status: row.shipping_status ?? row['出貨狀態'] ?? 'pending',
      subtotal: row.subtotal ?? row['小計'] ?? 0,
      discount_amount: row.discount_amount ?? row['折扣金額'] ?? 0,
      shipping_fee: row.shipping_fee ?? row['運費'] ?? 0,
      tax_amount: row.tax_amount ?? row['稅額'] ?? 0,
      total_amount: row.total_amount ?? row['總額'] ?? row['合計'] ?? 0,
      remark: row.remark ?? row['備註'] ?? '',
    }));
  }

  if (datasetId === 'qb_sales_history') {
    return rows.map((row) => ({
      sale_date: row.sale_date ?? row['銷貨日期'] ?? row['日期'] ?? '',
      slip_number: row.slip_number ?? row['銷貨單號'] ?? row['單號'] ?? '',
      invoice_number: row.invoice_number ?? row['發票號碼'] ?? '',
      customer_name: row.customer_name ?? row['客戶簡稱'] ?? '',
      sales_person: row.sales_person ?? row['業務'] ?? row['業務姓名'] ?? '',
      subtotal: row.subtotal ?? row['未稅金額'] ?? row['小計'] ?? 0,
      tax: row.tax ?? row['稅額'] ?? 0,
      total: row.total ?? row['總額'] ?? row['合計'] ?? 0,
      cost: row.cost ?? row['成本'] ?? 0,
      gross_profit: row.gross_profit ?? row['毛利'] ?? 0,
      profit_margin: row.profit_margin ?? row['毛利率'] ?? '',
    }));
  }

  return rows;
}

async function parseImportFile(file, datasetId) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    const text = await file.text();
    return mapRowsForDataset(datasetId, parseCsvText(text));
  }

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return mapRowsForDataset(datasetId, normalizeSpreadsheetRows(rawRows));
  }

  throw new Error('目前只支援 CSV / XLSX / XLS 檔案');
}

const IMPORT_DATASETS = {
  quickbuy_products: {
    title: '商品資料',
    desc: '直接更新後台查價與 LIFF 搜尋使用的商品資料。',
    fields: 'item_number, description, tw_retail_price, tw_reseller_price...',
  },
  erp_customers: {
    title: '客戶資料',
    desc: 'merge 進正式客戶主檔，保留既有 LINE 綁定與客戶階段。',
    fields: 'customer_code, name, company_name, phone...',
  },
  erp_vendors: {
    title: '廠商資料',
    desc: '更新廠商主檔與供應商聯絡資訊。',
    fields: 'vendor_code, vendor_name, phone...',
  },
  erp_sales_return_summary: {
    title: '銷退貨彙總',
    desc: '更新銷貨/退貨摘要，供後台彙總與查詢使用。',
    fields: 'doc_date, doc_no, doc_type, customer_name...',
  },
  erp_profit_analysis: {
    title: '利潤分析',
    desc: '更新毛利分析資料，做營運統計和客戶利潤追蹤。',
    fields: 'customer_name, doc_date, doc_no, amount...',
  },
  erp_quotes: {
    title: '報價單',
    desc: '匯入 ERP 報價單抬頭資料，供報價查詢與轉單流程使用。',
    fields: 'quote_no, customer_code, quote_date, valid_until...',
  },
  erp_orders: {
    title: '訂單',
    desc: '匯入 ERP 訂單抬頭資料，供訂單追蹤與出貨流程使用。',
    fields: 'order_no, customer_code, order_date, status...',
  },
  qb_sales_history: {
    title: '銷貨單',
    desc: '匯入銷貨單抬頭資料，供銷貨單查詢與毛利檢視使用。',
    fields: 'sale_date, slip_number, invoice_number, customer_name...',
  },
};

const IMPORT_BATCH_SIZE = {
  default: 400,
  quickbuy_products: 800,
  erp_sales_return_summary: 800,
  erp_profit_analysis: 800,
  qb_sales_history: 600,
  erp_quotes: 500,
  erp_orders: 500,
  erp_vendors: 400,
  erp_customers: 300,
};

function useCsvImport(datasetId, onImported) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preparedRows, setPreparedRows] = useState([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [batchProgress, setBatchProgress] = useState(null);
  const [recentImportHint, setRecentImportHint] = useState(null);

  const loadImportHint = useCallback(async (file) => {
    try {
      const result = await apiGet({ action: 'import_history' });
      const history = result.history || [];
      const sameFile = history.find((entry) => entry.dataset === datasetId && entry.file_name === file.name);
      const sameDataset = history.find((entry) => entry.dataset === datasetId);

      if (sameFile) {
        setRecentImportHint({
          type: 'same_file',
          text: `${IMPORT_DATASETS[datasetId]?.title || datasetId} 曾於 ${fmtDate(sameFile.imported_at)} 匯入同檔案 ${file.name}，上次筆數 ${fmt(sameFile.count || 0)}。`,
        });
        return;
      }

      if (sameDataset) {
        setRecentImportHint({
          type: 'same_dataset',
          text: `${IMPORT_DATASETS[datasetId]?.title || datasetId} 最近一次匯入時間是 ${fmtDate(sameDataset.imported_at)}，檔名 ${sameDataset.file_name || '-'}。`,
        });
        return;
      }

      setRecentImportHint(null);
    } catch {
      setRecentImportHint(null);
    }
  }, [datasetId]);

  const chooseFile = useCallback(async (file) => {
    if (!file) return;

    try {
      const rows = await parseImportFile(file, datasetId);
      if (!rows.length) throw new Error('檔案沒有可匯入的資料列');
      setSelectedFile(file);
      setPreparedRows(rows);
      setPreviewCount(rows.length);
      setBatchProgress(null);
      setStatus('');
      await loadImportHint(file);
    } catch (error) {
      setSelectedFile(null);
      setPreparedRows([]);
      setPreviewCount(0);
      setBatchProgress(null);
      setRecentImportHint(null);
      setStatus(error.message || '檔案解析失敗');
    }
  }, [datasetId, loadImportHint]);

  const importSelected = useCallback(async () => {
    if (!selectedFile || !preparedRows.length) return;

    if (recentImportHint?.type === 'same_file') {
      const confirmed = typeof window === 'undefined'
        ? true
        : window.confirm(`這個檔案之前已經匯入過。\n\n${recentImportHint.text}\n\n確定還要再次匯入嗎？`);

      if (!confirmed) {
        setStatus('已取消重複匯入');
        return;
      }
    }

    if (recentImportHint?.type === 'same_dataset') {
      const confirmed = typeof window === 'undefined'
        ? true
        : window.confirm(`這個資料集最近已經匯入過。\n\n${recentImportHint.text}\n\n確定要覆蓋目前資料嗎？`);

      if (!confirmed) {
        setStatus('已取消重複匯入');
        return;
      }
    }

    setBusy(true);
    setStatus('');

    try {
      const rows = preparedRows;
      const batchSize = IMPORT_BATCH_SIZE[datasetId] || IMPORT_BATCH_SIZE.default;
      const batchTotal = Math.max(1, Math.ceil(rows.length / batchSize));
      let totalCount = 0;
      let totalInserted = 0;
      let totalUpdated = 0;

      for (let batchIndex = 0; batchIndex < batchTotal; batchIndex += 1) {
        const start = batchIndex * batchSize;
        const end = start + batchSize;
        const chunk = rows.slice(start, end);
        const processed = Math.min(end, rows.length);
        const percent = Math.min(100, Math.round((processed / rows.length) * 100));

        setBatchProgress({
          current: batchIndex + 1,
          total: batchTotal,
          processed,
          all: rows.length,
          percent,
        });
        setStatus(`${IMPORT_DATASETS[datasetId]?.title || datasetId} 匯入中，第 ${batchIndex + 1}/${batchTotal} 批...`);

        const result = await apiPost({
          action: 'import_csv_dataset',
          dataset: datasetId,
          file_name: selectedFile.name,
          rows: chunk,
          batch_index: batchIndex,
          batch_total: batchTotal,
          total_count: rows.length,
        });

        totalCount += Number(result.count || chunk.length);
        totalInserted += Number(result.inserted || 0);
        totalUpdated += Number(result.updated || 0);
      }

      const detailText = totalInserted || totalUpdated
        ? `，新增 ${fmt(totalInserted)} / 更新 ${fmt(totalUpdated)}`
        : '';
      setStatus(`${IMPORT_DATASETS[datasetId]?.title || datasetId} 匯入完成，檔案 ${selectedFile.name}，共 ${fmt(rows.length)} 筆${detailText}`);
      setSelectedFile(null);
      setPreparedRows([]);
      setPreviewCount(0);
      setBatchProgress(null);
      setRecentImportHint(null);
      if (onImported) await onImported();
    } catch (error) {
      setBatchProgress(null);
      setStatus(error.message || '匯入失敗');
    } finally {
      setBusy(false);
    }
  }, [datasetId, onImported, preparedRows, recentImportHint, selectedFile]);

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(''), 5200);
    return () => clearTimeout(timer);
  }, [status]);

  return {
    status,
    busy,
    selectedFile,
    previewCount,
    batchProgress,
    recentImportHint,
    chooseFile,
    importSelected,
    clearSelection: () => {
      setSelectedFile(null);
      setPreparedRows([]);
      setPreviewCount(0);
      setBatchProgress(null);
      setRecentImportHint(null);
    },
  };
}

/* ========================================= STYLES ========================================= */
const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg, #e9eef5 0%, #f5f7fb 220px)', color: '#192434', fontFamily: "'Noto Sans TC', 'SF Mono', monospace, sans-serif" },
  shell: { display: 'flex', minHeight: '100vh' },
  sidebar: { width: 248, background: 'linear-gradient(180deg, #1d2636 0%, #101723 100%)', color: '#c6d0df', padding: '18px 0 20px', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04)', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  header: { height: 64, background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid #d8e0ea', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' },
  content: { flex: 1, padding: '26px 28px 40px', minHeight: 'calc(100vh - 64px)' },
  card: { background: '#ffffff', border: '1px solid #dbe3ee', borderRadius: 14, padding: '18px 20px', marginBottom: 18, boxShadow: '0 10px 28px rgba(20, 35, 60, 0.06)' },
  panelMuted: { background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 12, padding: '14px 16px' },
  input: { background: '#fff', border: '1px solid #ccd6e3', borderRadius: 10, padding: '10px 14px', color: '#152033', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s, box-shadow 0.2s', boxShadow: 'inset 0 1px 2px rgba(17,24,39,0.04)' },
  btnPrimary: { background: 'linear-gradient(180deg, #2d8cff 0%, #1976f3 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: 0.2, boxShadow: '0 8px 18px rgba(25,118,243,0.22)' },
  btnGhost: { background: '#fff', color: '#5b6779', border: '1px solid #ccd6e3', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif" },
  btnLine: { background: 'linear-gradient(180deg, #19c767 0%, #06b755 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13, boxShadow: '0 8px 18px rgba(6,183,85,0.2)' },
  label: { color: '#6d7a8b', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.9, textTransform: 'uppercase' },
  mono: { fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: 0.5 },
  pageLead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 18 },
  pageTitle: { fontSize: 28, fontWeight: 700, color: '#172337', letterSpacing: -0.6, marginBottom: 6 },
  pageDesc: { fontSize: 13, color: '#718096', lineHeight: 1.7, maxWidth: 760 },
  eyebrow: { fontSize: 11, color: '#1976f3', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, ...{ fontFamily: "'SF Mono', 'Fira Code', monospace" } },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 },
  twoCol: { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' },
  tag: (color) => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: color === 'green' ? '#ddf7ea' : color === 'red' ? '#ffe3e6' : color === 'line' ? '#def8ea' : '#edf2f7', color: color === 'green' ? '#129c59' : color === 'red' ? '#d1435b' : color === 'line' ? '#06a14d' : '#63758a', border: `1px solid ${color === 'green' ? '#bdeccb' : color === 'red' ? '#ffc7cf' : color === 'line' ? '#bcefd2' : '#d9e2ec'}` }),
};

/* ========================================= SHARED ========================================= */
function Loading() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div style={{ color: '#7e8a9b', fontSize: 12, ...S.mono }}><span style={{ color: '#1976f3' }}>●</span> loading...</div></div>;
}
function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', padding: '40px 0', color: '#8a96a8', fontSize: 12, ...S.mono }}>{text}</div>;
}
function StatusBanner({ text, tone = 'neutral' }) {
  if (!text) return null;
  const toneMap = {
    success: { background: '#edf9f2', borderColor: '#bdeccb', color: '#127248' },
    error: { background: '#fff4f4', borderColor: '#ffc7cf', color: '#d1435b' },
    info: { background: '#edf5ff', borderColor: '#94c3ff', color: '#1976f3' },
    neutral: { background: '#f8fbff', borderColor: '#dbe6f3', color: '#617084' },
  };
  return <div style={{ ...S.card, padding: '14px 16px', ...(toneMap[tone] || toneMap.neutral) }}>{text}</div>;
}
function PageLead({ eyebrow, title, description, action }) {
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

function EnvHealth({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'env_health' });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shortcuts = [
    { tab: 'customers', label: '客戶主檔' },
    { tab: 'quotes', label: '報價單' },
    { tab: 'orders', label: '訂單' },
    { tab: 'sales_documents', label: '銷貨單' },
    { tab: 'imports', label: '資料匯入' },
  ];

  return (
    <div>
      <PageLead
        eyebrow="Environment"
        title="ERP 環境檢查"
        description="這裡會直接檢查目前資料庫有哪些 ERP 表已建立、哪些模組仍未就緒。之後你不用再靠錯誤訊息猜。"
        action={<button onClick={load} style={S.btnPrimary}>重新檢查</button>}
      />
      {loading ? <Loading /> : data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
            <StatCard code="READY" label="已就緒表數" value={fmt(data.summary?.ready_count)} sub={`共 ${fmt(data.summary?.total_count)} 張表`} tone="green" />
            <StatCard code="MISS" label="未就緒表數" value={fmt((data.summary?.total_count || 0) - (data.summary?.ready_count || 0))} tone="red" />
            <StatCard code="BOOT" label="快速入口" value="ERP" sub="可直接跳到各模組檢查" tone="blue" />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            {shortcuts.map((item) => (
              <button key={item.tab} onClick={() => setTab?.(item.tab)} style={S.btnGhost}>{item.label}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {Object.entries(data.groups || {}).map(([key, group]) => (
              <div key={key} style={S.card}>
                <PanelHeader
                  title={group.label}
                  meta={group.ready ? '本區模組已基本就緒' : '本區仍有缺表，建議先補 schema'}
                  badge={<div style={S.tag(group.ready ? 'green' : 'red')}>{group.ready ? 'READY' : 'MISSING'}</div>}
                />
                <div style={{ display: 'grid', gap: 8 }}>
                  {group.items.map((item) => (
                    <div key={item.name} style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr 100px', gap: 10, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 700 }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>{item.name}</div>
                      </div>
                      <div style={{ fontSize: 12, color: item.ready ? '#617084' : '#b45309' }}>
                        {item.ready ? `可讀取，現有 ${fmt(item.count)} 筆` : item.error}
                      </div>
                      <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                        <span style={S.tag(item.ready ? 'green' : 'red')}>{item.ready ? '可用' : '缺少'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : <EmptyState text="目前無法取得環境檢查結果" />}
    </div>
  );
}

function ProductEditModal({ product, onClose, onSaved }) {
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
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 240, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={S.eyebrow}>Product Master</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1c2740' }}>編輯商品主檔</div>
            <div style={{ fontSize: 12, color: '#7b889b', marginTop: 6 }}>{product.item_number}</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {error ? <StatusBanner text={error} tone="error" /> : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>品名 / 描述</label><textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} rows={3} style={{ ...S.input, resize: 'vertical' }} /></div>
          <div><label style={S.label}>US PRICE</label><input value={form.us_price} onChange={(e) => setForm((current) => ({ ...current, us_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>牌價</label><input type="number" value={form.tw_retail_price} onChange={(e) => setForm((current) => ({ ...current, tw_retail_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>經銷價</label><input type="number" value={form.tw_reseller_price} onChange={(e) => setForm((current) => ({ ...current, tw_reseller_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>狀態</label><input value={form.product_status} onChange={(e) => setForm((current) => ({ ...current, product_status: e.target.value }))} style={S.input} /></div>
          <div><label style={S.label}>分類</label><input value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))} style={S.input} /></div>
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
function ImportStatus({ status }) {
  if (!status) return null;
  const success = status.includes('完成');
  const pending = status.includes('匯入中');
  return (
    <div style={{
      ...S.panelMuted,
      background: success ? '#edf9f2' : pending ? '#edf5ff' : '#fff4f4',
      borderColor: success ? '#bdeccb' : pending ? '#94c3ff' : '#ffc7cf',
      color: success ? '#127248' : pending ? '#1976f3' : '#d1435b',
    }}>
      {status}
    </div>
  );
}
function CsvImportButton({ datasetId, onImported, compact = false }) {
  const { status, busy, selectedFile, previewCount, batchProgress, recentImportHint, chooseFile, importSelected, clearSelection } = useCsvImport(datasetId, onImported);
  const panelWidth = compact ? 248 : 360;
  const panelMinHeight = compact ? 116 : 188;
  const statusMinHeight = compact ? (status ? 48 : 0) : 72;

  return (
    <div style={{ width: '100%', maxWidth: panelWidth, minWidth: compact ? 220 : 320 }}>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'stretch' }}>
        <div style={{ minHeight: statusMinHeight }}>
          <ImportStatus status={status} />
        </div>
        <div style={{ ...S.panelMuted, minHeight: panelMinHeight, padding: compact ? '12px 14px' : S.panelMuted.padding, textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {selectedFile ? (
            <>
              <div>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>FILE_PREVIEW</div>
                <div style={{ fontSize: 12, color: '#1c2740', fontWeight: 700, wordBreak: 'break-word' }}>{selectedFile.name}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>預計匯入 {fmt(previewCount)} 筆</div>
                {recentImportHint ? (
                  <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: '#fff8eb', border: '1px solid #f7d699', color: '#8a5b00', fontSize: 12, lineHeight: 1.6 }}>
                    {recentImportHint.text}
                  </div>
                ) : null}
                {batchProgress ? (
                  <>
                    <div style={{ fontSize: compact ? 11 : 12, color: '#1976f3', marginTop: 8, lineHeight: 1.6 }}>
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
              <div>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>FILE_PREVIEW</div>
                <div style={{ fontSize: 12, color: '#94a1b2', lineHeight: 1.7 }}>尚未選擇檔案</div>
              </div>
              <div style={{ display: 'flex', justifyContent: compact ? 'flex-end' : 'flex-start' }}>
                <label style={{ ...(compact ? { ...S.btnGhost, padding: '8px 14px', fontSize: 12 } : S.btnPrimary), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  選擇檔案
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
    </div>
  );
}
function PanelHeader({ title, meta, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1c2740' }}>{title}</div>
        {meta ? <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b' }}>{meta}</div> : null}
      </div>
      {badge}
    </div>
  );
}
function Pager({ page, limit, total, onPageChange, onLimitChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (limit || 20)));

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>每頁</span>
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
function SaleDetailDrawer({ slipNumber, open, onClose }) {
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
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1c2740' }}>{slipNumber}</div>
            <div style={{ fontSize: 12, color: '#7b889b', marginTop: 6 }}>完整銷貨單檢視</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {loading ? <Loading /> : error ? <ImportStatus status={error} /> : sale ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={S.panelMuted}><div style={S.label}>客戶</div><div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{sale.customer_name || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>銷貨日期</div><div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{sale.sale_date || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>業務</div><div style={{ fontSize: 14, color: '#1c2740' }}>{sale.sales_person || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>發票號碼</div><div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{sale.invoice_number || '-'}</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div style={S.panelMuted}><div style={S.label}>未稅</div><div style={{ fontSize: 18, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmtP(sale.subtotal)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>稅額</div><div style={{ fontSize: 18, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmtP(sale.tax)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>總額</div><div style={{ fontSize: 18, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(sale.total)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>毛利</div><div style={{ fontSize: 18, color: '#1976f3', fontWeight: 700, ...S.mono }}>{fmtP(sale.gross_profit)}</div></div>
            </div>
            {invoice ? (
              <div style={S.card}>
                <PanelHeader title="發票資訊" meta="來自 qb_invoices" badge={<div style={S.tag('green')}>INVOICE</div>} />
                <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.8 }}>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>NUMBER</span> {invoice.invoice_number || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>TYPE</span> {invoice.invoice_type || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>COMPANY</span> {invoice.company_name || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>TAX_ID</span> {invoice.tax_id || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>AMOUNT</span> {fmtP(invoice.amount)}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>ISSUED</span> {fmtDate(invoice.issued_at)}</div>
                </div>
              </div>
            ) : null}
            <div style={S.card}>
              <PanelHeader title="商品明細" meta="若訂單明細已進 qb_order_items，這裡會直接列出。" badge={<div style={S.tag(items.length ? 'green' : 'red')}>{items.length ? `${fmt(items.length)} 筆` : '目前無明細'}</div>} />
              {items.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0,1fr) 80px 100px 110px', gap: 12, color: '#7b889b', fontSize: 10, ...S.mono, borderBottom: '1px solid #e6edf5', paddingBottom: 8 }}>
                    <div>品號</div><div>品名</div><div style={{ textAlign: 'right' }}>數量</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'right' }}>小計</div>
                  </div>
                  {items.map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0,1fr) 80px 100px 110px', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #eef3f8' }}>
                      <div style={{ color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{item.item_number || '-'}</div>
                      <div style={{ color: '#1c2740', fontSize: 13 }}>{item.description || '-'}</div>
                      <div style={{ color: '#617084', textAlign: 'right', ...S.mono }}>{fmt(item.quantity)}</div>
                      <div style={{ color: '#617084', textAlign: 'right', ...S.mono }}>{fmtP(item.unit_price)}</div>
                      <div style={{ color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(item.subtotal)}</div>
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
function MiniDonut({ value, color }) {
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
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1c2740', fontSize: 12, fontWeight: 700, ...S.mono }}>
        {safeValue}%
      </div>
    </div>
  );
}
function buildLinePath(values, width, height) {
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

function TrendChart({ monthly }) {
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
      <div style={{ position: 'absolute', left: 22, right: 20, bottom: 12, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', color: '#8090a5', fontSize: 11, ...S.mono }}>
        {(monthly || []).map((item) => (
          <div key={item.label}>{item.label}</div>
        ))}
      </div>
    </div>
  );
}
function TrendLineChart({ daily }) {
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
function StatCard({ code, label, value, sub, accent, tone = 'blue' }) {
  const palette = {
    blue: ['#16a7d8', '#0c8bc2'],
    green: ['#31c764', '#18a74d'],
    yellow: ['#f1be19', '#dea000'],
    red: ['#ef4764', '#d52f54'],
    navy: ['#4d6fff', '#2f4dde'],
  };
  const [start, end] = palette[tone] || palette.blue;
  return (
    <div style={{ minWidth: 165, padding: '18px 18px 16px', position: 'relative', overflow: 'hidden', borderRadius: 14, background: `linear-gradient(135deg, ${start} 0%, ${end} 100%)`, color: '#fff', boxShadow: '0 16px 34px rgba(20,35,60,0.12)' }}>
      <div style={{ position: 'absolute', top: 14, right: 16, fontSize: 10, color: 'rgba(255,255,255,0.55)', ...S.mono }}>{code}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.76)', marginBottom: 10, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent || '#fff', ...S.mono, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.86)', marginTop: 8 }}>{sub}</div>}
      <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.16)', fontSize: 11, color: 'rgba(255,255,255,0.88)', fontWeight: 600 }}>More info</div>
    </div>
  );
}

/* ========================================= DASHBOARD ========================================= */
function Dashboard() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet({ action: 'stats' }).then(setStats).finally(() => setLoading(false)); }, []);
  if (loading) return <Loading />;
  const interaction = stats?.interaction_breakdown || {};
  const summaryItems = [
    [
      'AI 回覆效率',
      `最近樣本平均回覆時間約 ${fmtMs(stats?.avg_response_ms)}，${(interaction.fast_reply_rate || 0) >= 70 ? '整體反應偏快' : '仍有再優化空間'}`,
    ],
    [
      '產品命中情況',
      `近期查詢中有 ${interaction.matched_rate || 0}% 能直接命中產品資料，熱門料號集中在前十名排行。`,
    ],
    [
      '客戶回流比例',
      `最近互動客戶中約 ${interaction.repeat_customer_rate || 0}% 有重複詢價，適合追蹤高意圖名單。`,
    ],
  ];
  const actionItems = [
    {
      title: '確認今日查詢流量',
      desc: `今日累積 ${fmt(stats?.today_messages)} 筆查詢，檢查是否與預期流量一致。`,
      color: '#1976f3',
    },
    {
      title: '追蹤本週互動節奏',
      desc: `本週已有 ${fmt(stats?.week_messages)} 筆訊息，留意是否出現異常尖峰或回落。`,
      color: '#25c66f',
    },
    {
      title: '檢視熱門詢價產品',
      desc: stats?.top_products?.[0]
        ? `目前查詢最多的是 ${stats.top_products[0].item_number}，可優先準備對應銷售話術。`
        : '目前尚未累積足夠熱門產品資料，可待更多互動後再觀察。',
      color: '#ef4764',
    },
    {
      title: '確認後台與 webhook 狀態',
      desc: '部署後建議持續抽查 admin 登入與 LINE webhook 是否皆可正常使用。',
      color: '#f1be19',
    },
  ];
  return (
    <div>
      <PageLead
        eyebrow="Dashboard"
        title="營運儀表板"
        description="集中查看 Quick Buy Bot 的查詢量、客戶互動與熱門產品，整體結構參考經典 admin dashboard 的高資訊密度佈局。"
      />
      <div style={{ ...S.statGrid, gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : S.statGrid.gridTemplateColumns }}>
        <StatCard code="MSG_TD" label="今日查詢" value={fmt(stats?.today_messages)} sub="New orders" tone="blue" />
        <StatCard code="MSG_WK" label="本週查詢" value={fmt(stats?.week_messages)} sub="7-day volume" tone="green" />
        <StatCard code="USR" label="客戶數" value={fmt(stats?.total_customers)} sub="Unique contacts" tone="yellow" />
        <StatCard code="PERF" label="平均回覆" value={fmtMs(stats?.avg_response_ms)} sub="Response time" tone="red" />
      </div>
      <div style={{ ...S.twoCol, gridTemplateColumns: isTablet ? '1fr' : S.twoCol.gridTemplateColumns }}>
        <div style={S.card}>
          <PanelHeader title="熱門查詢產品" meta="最近互動中最常被詢問的產品料號" badge={<div style={{ ...S.tag('green') }}>TOP 10</div>} />
          {stats?.top_products?.length > 0 ? stats.top_products.map((p, i) => (
            <div key={p.item_number} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 100px', alignItems: 'center', padding: '11px 0', borderTop: i > 0 ? '1px solid #e6edf5' : 'none' }}>
              <div style={{ fontSize: 12, color: i < 3 ? '#1976f3' : '#95a2b3', fontWeight: 700, ...S.mono }}>#{i + 1}</div>
              <div style={{ fontSize: 13, color: '#203047', ...S.mono }}>{p.item_number}</div>
              <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{p.count}次</div>
            </div>
          )) : <EmptyState text="等待客戶使用 Line Bot 後將顯示數據" />}
        </div>
        <div style={S.card}>
          <PanelHeader title="系統概況" meta="目前部署與營運摘要" badge={<div style={{ ...S.tag('line') }}>LIVE</div>} />
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>TOTAL_MESSAGES</div>
              <div style={{ fontSize: 28, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmt(stats?.total_messages)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>WEBHOOK</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#129c59' }}>Operational</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>ADMIN</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1976f3' }}>Protected</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ ...S.twoCol, marginTop: 18, gridTemplateColumns: isTablet ? '1fr' : S.twoCol.gridTemplateColumns }}>
        <div style={S.card}>
          <PanelHeader title="查詢趨勢" meta="模擬營運視圖，呈現近期查詢量與客戶互動波動" badge={<div style={{ ...S.tag('') }}>TREND</div>} />
          <TrendChart monthly={stats?.trend_monthly} />
        </div>
        <div style={S.card}>
          <PanelHeader title="互動概況" meta="以 dashboard 模組方式呈現主要互動指標" badge={<div style={{ ...S.tag('green') }}>LIVE</div>} />
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
              <div>
                <MiniDonut value={interaction.matched_rate} color="#25c66f" />
                <div style={{ marginTop: 8, fontSize: 11, color: '#7b889b', ...S.mono }}>MATCHED</div>
              </div>
              <div>
                <MiniDonut value={interaction.repeat_customer_rate} color="#f1be19" />
                <div style={{ marginTop: 8, fontSize: 11, color: '#7b889b', ...S.mono }}>REPEAT</div>
              </div>
              <div>
                <MiniDonut value={interaction.fast_reply_rate} color="#ef4764" />
                <div style={{ marginTop: 8, fontSize: 11, color: '#7b889b', ...S.mono }}>FAST</div>
              </div>
            </div>
            <div style={{ ...S.panelMuted, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #dbe6f3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1c2740' }}>最近摘要</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b' }}>快速檢視目前營運狀態</div>
                </div>
                <div style={{ ...S.tag('line') }}>STATUS</div>
              </div>
              <div style={{ padding: '8px 16px' }}>
                {summaryItems.map(([title, desc], idx) => (
                  <div key={title} style={{ padding: '10px 0', borderTop: idx > 0 ? '1px solid #e6edf5' : 'none' }}>
                    <div style={{ fontSize: 13, color: '#1f2b41', fontWeight: 700 }}>{title}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b', lineHeight: 1.7 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ ...S.twoCol, marginTop: 18, gridTemplateColumns: isTablet ? '1fr' : S.twoCol.gridTemplateColumns }}>
        <div style={S.card}>
          <PanelHeader title="成長曲線" meta="以高密度圖表模塊補齊參考圖的 dashboard 視覺語言" badge={<div style={{ ...S.tag('') }}>REPORT</div>} />
          <TrendLineChart daily={stats?.trend_daily} />
        </div>
        <div style={S.card}>
          <PanelHeader title="待辦與提醒" meta="用於追蹤上線後的營運維護工作" badge={<div style={{ ...S.tag('red') }}>ACTION</div>} />
          <div style={{ display: 'grid', gap: 10 }}>
            {actionItems.map(({ title, desc, color }) => (
              <div key={title} style={{ ...S.panelMuted, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: color, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 700 }}>{title}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b', lineHeight: 1.7 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================= ERP REPORT CENTER ========================================= */
function RankingPanel({ title, rows, emptyText, valueLabel }) {
  return (
    <div style={S.card}>
      <PanelHeader title={title} meta="鼎新 A1 對照分析" />
      {rows?.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row, index) => (
            <div key={`${title}-${row.name}-${index}`} style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) 130px 120px', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: 999, background: index < 3 ? '#edf5ff' : '#f4f7fb', color: index < 3 ? '#1976f3' : '#7b889b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, ...S.mono }}>
                {index + 1}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>毛利 {fmtP(row.gross_profit)}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>
              <div style={{ textAlign: 'right', fontSize: 11, color: '#7b889b', ...S.mono }}>{valueLabel}</div>
            </div>
          ))}
        </div>
      ) : <EmptyState text={emptyText} />}
    </div>
  );
}

function ReportShortcut({ code, title, desc, onClick, tone = 'blue' }) {
  const tones = {
    blue: ['#edf5ff', '#94c3ff', '#1976f3'],
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
          <div style={{ fontSize: 18, color: '#1c2740', fontWeight: 700, marginTop: 8 }}>{title}</div>
          <div style={{ fontSize: 12, color: '#617084', marginTop: 8, lineHeight: 1.7 }}>{desc}</div>
        </div>
        <div style={{ ...S.tag(''), color }}>{'前往'}</div>
      </div>
    </button>
  );
}

function ReportCenter({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet({ action: 'report_center' })
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const counts = data?.counts || {};
  const rankings = data?.rankings || {};
  const returns = data?.returns || {};

  return (
    <div>
      <PageLead
        eyebrow="A1 Mapping"
        title="進銷存報表中心"
        description="用鼎新 A1 的邏輯整理我們現在的 ERP 模組，讓客戶、供應商、銷退貨、利潤與排行報表都能直接對應到現有系統。"
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="CUST" label="客戶主檔" value={fmt(counts.customers)} tone="blue" />
        <StatCard code="VNDR" label="供應商主檔" value={fmt(counts.vendors)} tone="green" />
        <StatCard code="RETN" label="銷退貨單" value={fmt(counts.sales_returns)} tone="yellow" />
        <StatCard code="PFT" label="利潤資料" value={fmt(counts.profit_rows)} tone="red" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={S.card}>
          <PanelHeader title="銷售報表" meta="鼎新 A1：銷售 / 銷退 / 利潤" />
          <div style={{ display: 'grid', gap: 10 }}>
            <ReportShortcut code="QUOT" title="報價明細表" desc={`目前 ${fmt(counts.quotes)} 筆報價，可查詢與轉單。`} onClick={() => setTab?.('quotes')} tone="blue" />
            <ReportShortcut code="ORDR" title="訂單明細表" desc={`目前 ${fmt(counts.orders)} 筆訂單，可接續出貨與銷貨。`} onClick={() => setTab?.('orders')} tone="green" />
            <ReportShortcut code="SALE" title="銷貨明細表" desc={`目前 ${fmt(counts.sales_documents)} 筆銷貨單，可點單號看內容。`} onClick={() => setTab?.('sales_documents')} tone="yellow" />
            <ReportShortcut code="RETN" title="銷退貨彙總表" desc={`銷貨 ${fmt(returns.saleCount)} 筆 / 退貨 ${fmt(returns.returnCount)} 筆。`} onClick={() => setTab?.('sales_returns')} tone="red" />
            <ReportShortcut code="PFT" title="銷售利潤分析表" desc="對應現有利潤分析頁，可看毛利與日期區間。" onClick={() => setTab?.('profit_analysis')} tone="blue" />
          </div>
        </div>

        <div style={S.card}>
          <PanelHeader title="基本資料" meta="鼎新 A1：客戶 / 供應商 / 商品" />
          <div style={{ display: 'grid', gap: 10 }}>
            <ReportShortcut code="CUST" title="客戶主檔" desc={`目前 ${fmt(counts.customers)} 位正式客戶。`} onClick={() => setTab?.('customers')} tone="blue" />
            <ReportShortcut code="VNDR" title="供應商主檔" desc={`目前 ${fmt(counts.vendors)} 家供應商。`} onClick={() => setTab?.('vendors')} tone="green" />
            <ReportShortcut code="ITEM" title="商品主檔 / 查價" desc="目前先對應產品查價頁，後續可升級成完整商品主檔。" onClick={() => setTab?.('products')} tone="yellow" />
            <ReportShortcut code="LINE" title="LINE 客戶對照" desc="把 LINE 詢價名單綁到正式客戶，對應 CRM/客服入口。" onClick={() => setTab?.('line_customers')} tone="red" />
          </div>
        </div>

        <div style={S.card}>
          <PanelHeader title="分析圖表" meta="鼎新 A1：十大客戶 / 業務銷售 / 排行" />
          <div style={{ display: 'grid', gap: 10 }}>
            <ReportShortcut code="DASH" title="儀表板" desc="綜合 KPI、趨勢、互動概況。" onClick={() => setTab?.('dashboard')} tone="blue" />
            <ReportShortcut code="IMPT" title="資料匯入中心" desc="CSV / XLSX 對應匯入客戶、供應商、報價、訂單、銷貨與報表資料。" onClick={() => setTab?.('imports')} tone="green" />
            <ReportShortcut code="MSG" title="客服/AI 對話紀錄" desc="雖然不是鼎新 A1 原生模組，但可對應客服紀錄與詢價來源。" onClick={() => setTab?.('messages')} tone="yellow" />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        <RankingPanel title="十大客戶分析圖" rows={rankings.top_customers} emptyText="目前還沒有足夠的銷貨資料來排行客戶" valueLabel="銷售額" />
        <RankingPanel title="業務銷售排名表" rows={rankings.top_sales_people} emptyText="目前還沒有足夠的業務銷貨資料" valueLabel="銷售額" />
      </div>
    </div>
  );
}

/* ========================================= MESSAGES (AI Bot) ========================================= */
function Messages() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ messages: [], total: 0, page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const load = useCallback((page = 1, q = search) => {
    setLoading(true);
    apiGet({ action: 'messages', page: String(page), search: q }).then(setData).finally(() => setLoading(false));
  }, [search]);
  useEffect(() => { load(); }, []);
  return (
    <div>
      <PageLead eyebrow="Messages" title="AI 對話紀錄" description="集中檢視客戶提問、AI 回覆內容與回覆速度，適合追蹤 bot 的實際對話表現。" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, search)} placeholder="搜尋訊息內容、客戶名稱..." style={{ ...S.input, flex: 1 }} onFocus={e => e.target.style.borderColor = '#1976f3'} onBlur={e => e.target.style.borderColor = '#ccd6e3'} />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>共 {data.total} 筆紀錄</div>
      {loading ? <Loading /> : data.messages.map(msg => (
        <div key={msg.id} onClick={() => setExpanded(expanded === msg.id ? null : msg.id)} style={{ ...S.card, cursor: 'pointer', padding: '14px 18px', transition: 'border-color 0.2s, transform 0.2s', borderColor: expanded === msg.id ? '#94c3ff' : '#dbe3ee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={S.tag('green')}>{msg.display_name || '客戶'}</span>
              <span style={{ color: '#7b889b', fontSize: 11, ...S.mono }}>{fmtDate(msg.created_at)}</span>
            </div>
            <span style={{ color: '#7b889b', fontSize: 11, ...S.mono }}>{fmtMs(msg.response_time_ms)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#203047' }}><span style={{ color: '#7b889b' }}>Q: </span>{msg.user_message}</div>
          {expanded === msg.id && (
            <div style={{ background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 10, padding: '14px 16px', marginTop: 10, fontSize: 12, color: '#617084', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              <span style={{ color: '#1976f3', fontSize: 11, ...S.mono }}>AI_RESPONSE</span>
              <div style={{ marginTop: 6, color: '#263246' }}>{msg.ai_response}</div>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
        {data.page > 1 && <button onClick={() => load(data.page - 1)} style={S.btnGhost}>← 上一頁</button>}
        <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{data.page}</span>
        {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={S.btnGhost}>下一頁 →</button>}
      </div>
    </div>
  );
}

/* ========================================= CUSTOMERS ========================================= */
function FormalCustomers() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ customers: [], total: 0, page: 1, limit: 50, erp_ready: true, customer_stage_ready: false, latest_import: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'formal_customers', page: String(page), search: q, limit: String(limit) });
      setData(result);
      const existingSelection = (result.customers || []).find((customer) => customer.id === selectedCustomerId);
      if (!existingSelection && result.customers?.[0]?.id) {
        setSelectedCustomerId(result.customers[0].id);
      }
      if (!result.customers?.length) {
        setSelectedCustomerId('');
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, selectedCustomerId]);

  useEffect(() => { load(); }, []);

  const loadDetail = useCallback(async (erpCustomerId) => {
    if (!erpCustomerId) return;
    setDetailLoading(true);
    try {
      const result = await apiGet({ action: 'formal_customer_detail', erp_customer_id: erpCustomerId });
      setDetail(result);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      loadDetail(selectedCustomerId);
    }
  }, [selectedCustomerId, loadDetail]);

  const stageMeta = {
    lead: { label: '詢問名單', color: '' },
    prospect: { label: '潛在客戶', color: 'yellow' },
    customer: { label: '正式客戶', color: 'green' },
    vip: { label: 'VIP', color: 'red' },
  };
  const detailCustomer = detail?.customer;
  const summary = detail?.summary || {};

  const listPane = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={S.panelMuted}>
          <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>DB_CUSTOMERS</div>
          <div style={{ fontSize: 28, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmt(data.total)}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#617084' }}>目前 `erp_customers` 實際筆數</div>
        </div>
        <div style={S.panelMuted}>
          <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>LATEST_IMPORT</div>
          <div style={{ fontSize: 20, color: '#1976f3', fontWeight: 700, ...S.mono }}>{fmt(data.latest_import?.count || 0)}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#617084' }}>
            {data.latest_import ? `最近匯入 ${fmtDate(data.latest_import.imported_at)} · ${data.latest_import.file_name || '-'}` : '目前還沒有客戶匯入紀錄'}
          </div>
        </div>
        <div style={S.panelMuted}>
          <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>CHECKPOINT</div>
          <div style={{ fontSize: 14, color: data.latest_import?.count === data.total ? '#129c59' : '#f59e0b', fontWeight: 700 }}>
            {data.latest_import?.count === data.total ? '匯入筆數與資料庫一致' : '匯入筆數與目前資料庫不同步'}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#617084' }}>
            {data.latest_import ? `匯入 ${fmt(data.latest_import.count)} 筆 / 目前 ${fmt(data.total)} 筆` : '可用來快速確認客戶是否完整匯入'}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>共 {fmt(data.total)} 位正式客戶</div>
      {loading ? <Loading /> : data.customers.length === 0 ? <EmptyState text="目前沒有符合條件的正式客戶資料" /> : (
        isMobile ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                style={{ ...S.card, padding: '14px 16px', marginBottom: 0, textAlign: 'left', cursor: 'pointer', background: selectedCustomerId === customer.id ? '#f0f7ff' : '#fff', borderColor: selectedCustomerId === customer.id ? '#94c3ff' : '#dbe3ee' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: '#1c2740', fontWeight: 700 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#617084', lineHeight: 1.7 }}>
                      <div><span style={{ color: '#7b889b', ...S.mono }}>CODE</span> {customer.customer_code || '-'}</div>
                      <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {customer.name || '-'}</div>
                      <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {customer.phone || '-'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                    <span style={S.tag(stageMeta[customer.customer_stage]?.color || '')}>{stageMeta[customer.customer_stage]?.label || '詢問名單'}</span>
                    {customer.line_user_id ? <span style={S.tag('line')}>LINE 已連通</span> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '110px minmax(0,1.1fr) 120px 110px' : '130px minmax(0,1.3fr) 140px 180px 130px 120px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
              <div>客戶代號</div>
              <div>客戶資料</div>
              {!isTablet && <div>聯絡人</div>}
              <div>電話</div>
              <div>階段</div>
              <div>渠道</div>
            </div>
            {data.customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                style={{ display: 'grid', gridTemplateColumns: isTablet ? '110px minmax(0,1.1fr) 120px 110px' : '130px minmax(0,1.3fr) 140px 180px 130px 120px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: selectedCustomerId === customer.id ? '#f0f7ff' : '#fff', border: 0, textAlign: 'left', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{customer.customer_code || '-'}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                  <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {customer.email || customer.tax_id || customer.address || '-'}
                  </div>
                </div>
                {!isTablet && <div style={{ fontSize: 12, color: '#617084' }}>{customer.name || '-'}</div>}
                <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{customer.phone || '-'}</div>
                <div><span style={S.tag(stageMeta[customer.customer_stage]?.color || '')}>{stageMeta[customer.customer_stage]?.label || '詢問名單'}</span></div>
                <div>{customer.line_user_id ? <span style={S.tag('line')}>LINE</span> : <span style={S.tag('')}>ERP</span>}</div>
              </button>
            ))}
          </div>
        )
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => {
          setPageSize(nextLimit);
          load(1, search, nextLimit);
        }}
      />
    </>
  );

  return (
    <div>
      <PageLead
        eyebrow="Customers"
        title="客戶主檔"
        description="這裡顯示全部正式 ERP 客戶，不限是否來自 LINE。適合查看你匯入的一千多筆正式客戶資料。"
        action={<CsvImportButton datasetId="erp_customers" onImported={() => load(1, search, pageSize)} compact />}
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize)}
          placeholder="搜尋客戶代號、姓名、公司、電話或 Email..."
          style={{ ...S.input, flex: 1 }}
        />
        <button onClick={() => load(1, search, pageSize)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.erp_ready && (
        <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>
          目前還找不到 `erp_customers` 資料表，請先建立 ERP 客戶主檔。
        </div>
      )}
      {isMobile ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {listPane}
          <div style={S.card}>
            {detailLoading ? <Loading /> : !detailCustomer ? <EmptyState text="請先選擇一位正式客戶" /> : (
              <div style={{ display: 'grid', gap: 16 }}>
                <PanelHeader title={detailCustomer.company_name || detailCustomer.name || '客戶檔案'} meta={detailCustomer.customer_code || 'ERP customer'} badge={<div style={S.tag(stageMeta[detailCustomer.customer_stage]?.color || '')}>{stageMeta[detailCustomer.customer_stage]?.label || '詢問名單'}</div>} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <StatCard code="QUOTE" label="報價" value={fmt(summary.quote_count)} tone="blue" />
                  <StatCard code="ORDER" label="訂單" value={fmt(summary.order_count)} tone="yellow" />
                  <StatCard code="SALE" label="銷貨" value={fmt(summary.sale_count)} tone="green" />
                  <StatCard code="MSG" label="LINE 互動" value={fmt(summary.line_message_count)} tone="red" />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={S.twoCol}>
          <div>{listPane}</div>
          <div style={{ position: 'sticky', top: 84 }}>
            <div style={S.card}>
              {detailLoading ? <Loading /> : !detailCustomer ? <EmptyState text="請先選擇一位正式客戶" /> : (
                <div style={{ display: 'grid', gap: 16 }}>
                  <PanelHeader
                    title={detailCustomer.company_name || detailCustomer.name || '客戶檔案'}
                    meta={detailCustomer.customer_code || 'ERP customer'}
                    badge={<div style={S.tag(stageMeta[detailCustomer.customer_stage]?.color || '')}>{stageMeta[detailCustomer.customer_stage]?.label || '詢問名單'}</div>}
                  />
                  <div style={{ fontSize: 13, color: '#617084', lineHeight: 1.8 }}>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {detailCustomer.name || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {detailCustomer.phone || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>EMAIL</span> {detailCustomer.email || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>TAX_ID</span> {detailCustomer.tax_id || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>ADDRESS</span> {detailCustomer.address || '-'}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {detailCustomer.line_user_id ? <span style={S.tag('line')}>LINE 已連通</span> : <span style={S.tag('')}>ERP only</span>}
                      {detail?.line_profile ? <span style={S.tag('green')}>{detail.line_profile.display_name || 'LINE 客戶'}</span> : null}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <StatCard code="QUOTE" label="報價筆數" value={fmt(summary.quote_count)} sub={fmtP(summary.quote_total)} tone="blue" />
                    <StatCard code="ORDER" label="訂單筆數" value={fmt(summary.order_count)} sub={fmtP(summary.order_total)} tone="yellow" />
                    <StatCard code="SALE" label="銷貨筆數" value={fmt(summary.sale_count)} sub={fmtP(summary.sales_total)} tone="green" />
                    <StatCard code="GP" label="毛利" value={fmtP(summary.gross_profit_total)} sub={`訊息 ${fmt(summary.line_message_count)} 筆`} tone="red" />
                  </div>
                  <div style={S.panelMuted}>
                    <PanelHeader title="最近報價" meta="最近 5 張報價單" badge={<div style={S.tag('')}>{fmt(detail?.recent_quotes?.length || 0)} 筆</div>} />
                    {detail?.recent_quotes?.length ? detail.recent_quotes.map((row) => (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 10, padding: '8px 0', borderTop: '1px solid #e6edf5', alignItems: 'center' }}>
                        <div style={{ color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{row.quote_no || '-'}</div>
                        <div style={{ color: '#617084', fontSize: 12 }}>{row.quote_date || '-'} · {row.status || 'draft'}</div>
                        <div style={{ textAlign: 'right', color: '#1c2740', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
                      </div>
                    )) : <EmptyState text="目前沒有報價單資料" />}
                  </div>
                  <div style={S.panelMuted}>
                    <PanelHeader title="最近訂單" meta="最近 5 張訂單" badge={<div style={S.tag('')}>{fmt(detail?.recent_orders?.length || 0)} 筆</div>} />
                    {detail?.recent_orders?.length ? detail.recent_orders.map((row) => (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 10, padding: '8px 0', borderTop: '1px solid #e6edf5', alignItems: 'center' }}>
                        <div style={{ color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{row.order_no || '-'}</div>
                        <div style={{ color: '#617084', fontSize: 12 }}>{row.order_date || '-'} · {row.status || 'draft'}</div>
                        <div style={{ textAlign: 'right', color: '#1c2740', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
                      </div>
                    )) : <EmptyState text="目前沒有訂單資料" />}
                  </div>
                  <div style={S.panelMuted}>
                    <PanelHeader title="最近銷貨" meta="從 qb_sales_history 對應最近單據" badge={<div style={S.tag('green')}>{fmt(detail?.recent_sales?.length || 0)} 筆</div>} />
                    {detail?.recent_sales?.length ? detail.recent_sales.map((row) => (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px 90px', gap: 10, padding: '8px 0', borderTop: '1px solid #e6edf5', alignItems: 'center' }}>
                        <button onClick={() => setSelectedSlipNumber(row.slip_number)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: '#1976f3', fontSize: 12, fontWeight: 700, cursor: 'pointer', ...S.mono }}>{row.slip_number || '-'}</button>
                        <div style={{ color: '#617084', fontSize: 12 }}>{row.sale_date || '-'} · {row.sales_person || '-'}</div>
                        <div style={{ textAlign: 'right', color: '#129c59', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>
                        <div style={{ textAlign: 'right', color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.gross_profit)}</div>
                      </div>
                    )) : <EmptyState text="目前沒有銷貨資料" />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}

function Customers() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [data, setData] = useState({ customers: [], total: 0, page: 1, limit: 20, erp_ready: true, customer_stage_ready: false });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedLineId, setSelectedLineId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bindingLineId, setBindingLineId] = useState('');
  const [lookupKeyword, setLookupKeyword] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupError, setLookupError] = useState('');
  const [bindLoadingId, setBindLoadingId] = useState('');
  const [bindMessage, setBindMessage] = useState('');
  const [stageSaving, setStageSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    company_name: '',
    phone: '',
    email: '',
    tax_id: '',
    address: '',
    notes: '',
  });

  const load = useCallback(async (page = 1, q = search) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'customers', page: String(page), search: q });
      setData(result);

      const existingSelection = (result.customers || []).find((customer) => customer.line_user_id === selectedLineId);
      if (!existingSelection && result.customers?.[0]?.line_user_id) {
        setSelectedLineId(result.customers[0].line_user_id);
      }
      if (!result.customers?.length) {
        setSelectedLineId('');
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [search, selectedLineId]);

  useEffect(() => { load(); }, []);

  const loadDetail = useCallback(async (lineUserId) => {
    if (!lineUserId) return;
    setDetailLoading(true);
    try {
      const result = await apiGet({ action: 'customer_detail', line_user_id: lineUserId });
      setDetail(result);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLineId) {
      loadDetail(selectedLineId);
    }
  }, [selectedLineId, loadDetail]);

  useEffect(() => {
    const linked = detail?.customer?.linked_customer;
    setProfileForm({
      name: linked?.name || '',
      company_name: linked?.company_name || '',
      phone: linked?.phone || '',
      email: linked?.email || '',
      tax_id: linked?.tax_id || '',
      address: linked?.address || '',
      notes: linked?.notes || '',
    });
    setEditingProfile(false);
  }, [detail]);

  useEffect(() => {
    if (!bindMessage) return undefined;
    const timer = setTimeout(() => setBindMessage(''), 2400);
    return () => clearTimeout(timer);
  }, [bindMessage]);

  const openBinder = (customer) => {
    setBindingLineId(customer.line_user_id || '');
    setLookupKeyword(customer.display_name || '');
    setLookupResults([]);
    setLookupError('');
    setBindMessage('');
  };

  const closeBinder = () => {
    setBindingLineId('');
    setLookupKeyword('');
    setLookupResults([]);
    setLookupError('');
  };

  const lookupErpCustomers = async () => {
    const keyword = lookupKeyword.trim();
    if (!keyword) {
      setLookupError('請先輸入正式客戶姓名、公司或電話');
      setLookupResults([]);
      return;
    }

    setLookupLoading(true);
    setLookupError('');
    setBindMessage('');

    try {
      const result = await apiGet({ action: 'erp_customer_lookup', search: keyword });
      if (!result.erp_ready) {
        setLookupResults([]);
        setLookupError('尚未建立 erp_customers 資料表，請先執行 ERP schema。');
        return;
      }

      setLookupResults(result.customers || []);
      if (!result.customers?.length) {
        setLookupError('找不到符合的正式客戶，請換姓名、公司名或電話再試一次。');
      }
    } catch (error) {
      setLookupResults([]);
      setLookupError(error.message || '正式客戶查詢失敗');
    } finally {
      setLookupLoading(false);
    }
  };

  const bindCustomer = async (customer, erpCustomer) => {
    setBindLoadingId(customer.line_user_id || '');
    setLookupError('');
    setBindMessage('');

    try {
      await apiPost({
        action: 'link_line_customer',
        line_user_id: customer.line_user_id,
        display_name: customer.display_name,
        erp_customer_id: erpCustomer.id,
      });
      setBindMessage(`已綁定到正式客戶：${erpCustomer.company_name || erpCustomer.name || '未命名客戶'}`);
      closeBinder();
      await load(data.page, search);
      await loadDetail(customer.line_user_id);
    } catch (error) {
      setLookupError(error.message || '綁定失敗');
    } finally {
      setBindLoadingId('');
    }
  };

  const hasErpProfile = (customer) => Boolean(customer?.linked_customer);
  const getCustomerStage = (customer) => customer?.linked_customer?.customer_stage || 'lead';
  const stageMeta = {
    lead: { label: '詢問名單', color: 'red' },
    prospect: { label: '潛在客戶', color: '' },
    customer: { label: '正式客戶', color: 'green' },
    vip: { label: 'VIP 客戶', color: 'line' },
  };
  const isFormalCustomerBound = (customer) => {
    const linked = customer?.linked_customer;
    if (!linked) return false;

    if (linked.customer_stage) {
      return linked.customer_stage === 'customer' || linked.customer_stage === 'vip';
    }

    const hasBusinessData = Boolean(
      linked.company_name ||
      linked.phone ||
      linked.email ||
      linked.tax_id
    );

    return hasBusinessData || (linked.source && linked.source !== 'line');
  };

  const updateCustomerStage = async (customerStage) => {
    const erpCustomerId = detailCustomer?.linked_customer?.id;
    if (!erpCustomerId) return;

    setStageSaving(true);
    try {
      await apiPost({
        action: 'update_customer_stage',
        erp_customer_id: erpCustomerId,
        customer_stage: customerStage,
      });
      await load(data.page, search);
      await loadDetail(detailCustomer.line_user_id);
      setBindMessage(`已更新客戶階段：${stageMeta[customerStage]?.label || customerStage}`);
    } catch (error) {
      setLookupError(error.message || '更新客戶階段失敗');
    } finally {
      setStageSaving(false);
    }
  };

  const saveCustomerProfile = async () => {
    const erpCustomerId = detailCustomer?.linked_customer?.id;
    if (!erpCustomerId) return;

    setProfileSaving(true);
    setEditingProfile(false);
    setBindMessage('已更新正式客戶資料');
    setDetail((prev) => prev ? {
      ...prev,
      customer: {
        ...prev.customer,
        linked_customer: {
          ...prev.customer.linked_customer,
          ...profileForm,
        },
      },
    } : prev);
    try {
      await apiPost({
        action: 'update_customer_profile',
        erp_customer_id: erpCustomerId,
        profile: profileForm,
      });
      await load(data.page, search);
      await loadDetail(detailCustomer.line_user_id);
    } catch (error) {
      setLookupError(error.message || '更新客戶資料失敗');
      setEditingProfile(true);
    } finally {
      setProfileSaving(false);
    }
  };

  const selectedCustomer = data.customers.find((customer) => customer.line_user_id === selectedLineId) || data.customers[0] || null;
  const detailCustomer = detail?.customer || selectedCustomer;
  const detailSummary = detail?.summary || { message_count: 0, quote_count: 0, order_count: 0, sale_count: 0, sales_total: 0 };
  const formalProfileComplete = detail?.formal_profile_complete ?? (detailCustomer ? isFormalCustomerBound(detailCustomer) : false);
  const currentStage = getCustomerStage(detailCustomer);
  const detailPanel = (
    <div style={{ ...S.card, padding: '16px 18px', position: isTablet ? 'relative' : 'sticky', top: isTablet ? 'auto' : 84 }}>
      {!detailCustomer ? (
        <EmptyState text="選一位客戶後，這裡會顯示客戶檔案與互動摘要" />
      ) : detailLoading ? (
        <Loading />
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1c2740' }}>{detailCustomer.display_name || '未命名客戶'}</div>
              <span style={S.tag('green')}>LINE</span>
              {detailCustomer.linked_customer
                ? <span style={S.tag(stageMeta[currentStage]?.color || '')}>{stageMeta[currentStage]?.label || '詢問名單'}</span>
                : <span style={S.tag('red')}>未綁定</span>}
            </div>
            <div style={{ fontSize: 13, color: '#617084', lineHeight: 1.7 }}>
              {detailCustomer.linked_customer
                ? `${detailCustomer.linked_customer.company_name || detailCustomer.linked_customer.name || '已建立 ERP 客戶'}`
                : '目前尚未建立正式客戶連結'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#7b889b', marginBottom: 6, ...S.mono }}>MSG</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1976f3', ...S.mono }}>{fmt(detailSummary.message_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#7b889b', marginBottom: 6, ...S.mono }}>QUOTE</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(detailSummary.quote_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#7b889b', marginBottom: 6, ...S.mono }}>ORDER</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(detailSummary.order_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#7b889b', marginBottom: 6, ...S.mono }}>SALE</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(detailSummary.sale_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#7b889b', marginBottom: 6, ...S.mono }}>REVENUE</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#129c59', ...S.mono }}>{fmtP(detailSummary.sales_total)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ ...S.panelMuted, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>CUSTOMER_PROFILE</div>
              <div style={{ fontSize: 12, color: '#4f6178', lineHeight: 1.8 }}>
                <div><span style={{ color: '#7b889b', ...S.mono }}>LAST_CONTACT</span> {fmtDate(detailCustomer.last_contact_at || detailCustomer.created_at)}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>STATUS</span> {(detailCustomer.message_count || 0) > 1 ? '既有客戶' : '新客戶'}</div>
              </div>
            </div>

            {detailCustomer.linked_customer ? (
              <div style={{ ...S.panelMuted, background: '#f2fbf6', borderColor: '#c9edd7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#129c59', marginBottom: 8, ...S.mono }}>ERP_PROFILE</div>
                    <div style={{ fontSize: 15, color: '#1c2740', fontWeight: 700 }}>
                      {detailCustomer.linked_customer.company_name || detailCustomer.linked_customer.name || '未命名客戶'}
                    </div>
                  </div>
                  <button onClick={() => setEditingProfile(!editingProfile)} style={S.btnGhost}>
                    {editingProfile ? '取消編輯' : '編輯客戶資料'}
                  </button>
                </div>
                {editingProfile ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                      <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="聯絡人姓名" style={S.input} />
                      <input value={profileForm.company_name} onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })} placeholder="公司名稱" style={S.input} />
                      <input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="電話" style={S.input} />
                      <input value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="Email" style={S.input} />
                      <input value={profileForm.tax_id} onChange={(e) => setProfileForm({ ...profileForm, tax_id: e.target.value })} placeholder="統編" style={S.input} />
                      <input value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} placeholder="地址" style={S.input} />
                    </div>
                    <textarea
                      value={profileForm.notes}
                      onChange={(e) => setProfileForm({ ...profileForm, notes: e.target.value })}
                      placeholder="備註"
                      rows={3}
                      style={{ ...S.input, resize: 'vertical', lineHeight: 1.6 }}
                    />
                    <button onClick={saveCustomerProfile} style={S.btnPrimary} disabled={profileSaving}>
                      {profileSaving ? '儲存中...' : '儲存客戶資料'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.8 }}>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {detailCustomer.linked_customer.name || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {detailCustomer.linked_customer.phone || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>EMAIL</span> {detailCustomer.linked_customer.email || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>TAX_ID</span> {detailCustomer.linked_customer.tax_id || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>ADDRESS</span> {detailCustomer.linked_customer.address || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>NOTES</span> {detailCustomer.linked_customer.notes || '-'}</div>
                  </div>
                )}
                {detail?.customer_stage_ready ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 8, ...S.mono }}>CUSTOMER_STAGE</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {Object.entries(stageMeta).map(([value, meta]) => (
                        <button
                          key={value}
                          onClick={() => updateCustomerStage(value)}
                          disabled={stageSaving}
                          style={{
                            ...S.btnGhost,
                            padding: '7px 12px',
                            fontSize: 12,
                            background: currentStage === value ? '#edf5ff' : '#fff',
                            borderColor: currentStage === value ? '#94c3ff' : '#dbe3ee',
                            color: currentStage === value ? '#1976f3' : '#5b6779',
                          }}
                        >
                          {meta.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#617084', lineHeight: 1.7 }}>
                    目前資料庫還沒有 customer_stage 欄位，若要改用明確階段判定，請先補欄位 migration。
                  </div>
                )}
                {!formalProfileComplete && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#617084', lineHeight: 1.7 }}>
                    目前這筆還不是正式客戶。若要視為正式客戶，可把階段改成「正式客戶 / VIP」，並補齊公司、電話、Email 或統編。
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...S.panelMuted, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>ERP_BINDING</div>
                    <div style={{ fontSize: 13, color: '#4f6178', lineHeight: 1.7 }}>
                      目前尚未綁定正式客戶。綁定後，這位 LINE 客戶就能連到 ERP 客戶主檔、報價、訂單與銷貨資料。
                    </div>
                  </div>
                  <button onClick={() => bindingLineId === detailCustomer.line_user_id ? closeBinder() : openBinder(detailCustomer)} style={S.btnPrimary} disabled={!data.erp_ready}>
                    {bindingLineId === detailCustomer.line_user_id ? '收起綁定面板' : '綁定正式客戶'}
                  </button>
                </div>
                {bindingLineId === detailCustomer.line_user_id && (
                  <div style={{ ...S.panelMuted, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                      <input
                        value={lookupKeyword}
                        onChange={(e) => setLookupKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && lookupErpCustomers()}
                        placeholder="輸入正式客戶姓名、公司或電話..."
                        style={{ ...S.input, flex: 1 }}
                      />
                      <button onClick={lookupErpCustomers} style={S.btnGhost} disabled={lookupLoading}>
                        {lookupLoading ? '查詢中...' : '查 ERP 客戶'}
                      </button>
                    </div>
                    {lookupError && <div style={{ fontSize: 12, color: '#d1435b', lineHeight: 1.7 }}>{lookupError}</div>}
                    {lookupResults.length > 0 && (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {lookupResults.map((erpCustomer) => (
                          <div key={erpCustomer.id} style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                            <div>
                              <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>
                                {erpCustomer.company_name || erpCustomer.name || '未命名客戶'}
                              </div>
                      <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.8, marginTop: 4 }}>
                        <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {erpCustomer.name || '-'}</div>
                        <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {erpCustomer.phone || '-'}</div>
                        <div><span style={{ color: '#7b889b', ...S.mono }}>TAX_ID</span> {erpCustomer.tax_id || '-'}</div>
                        {erpCustomer.customer_stage && <div><span style={{ color: '#7b889b', ...S.mono }}>STAGE</span> {stageMeta[erpCustomer.customer_stage]?.label || erpCustomer.customer_stage}</div>}
                      </div>
                    </div>
                    <button onClick={() => bindCustomer(detailCustomer, erpCustomer)} style={S.btnPrimary} disabled={bindLoadingId === detailCustomer.line_user_id}>
                              {bindLoadingId === detailCustomer.line_user_id ? '綁定中...' : '綁定這位客戶'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={S.panelMuted}>
              <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 8, ...S.mono }}>RECENT_MESSAGES</div>
              {detail?.recent_messages?.length ? detail.recent_messages.map((message) => (
                <div key={message.id} style={{ padding: '8px 0', borderTop: '1px solid #e6edf5' }}>
                  <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 4, ...S.mono }}>{fmtDate(message.created_at)}</div>
                  <div style={{ fontSize: 12, color: '#1c2740', lineHeight: 1.6 }}>{message.user_message}</div>
                </div>
              )) : <EmptyState text="目前還沒有可顯示的最近訊息" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageLead
        eyebrow="LINE"
        title="LINE 客戶"
        description="這裡專門看來自 LINE 官方帳號的客戶名單，方便做人工綁定、查訊息和對應正式客戶。"
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1, search)}
          placeholder="搜尋客戶名稱或 LINE ID..."
          style={{ ...S.input, flex: 1 }}
          onFocus={(e) => e.target.style.borderColor = '#1976f3'}
          onBlur={(e) => e.target.style.borderColor = '#ccd6e3'}
        />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.erp_ready && (
        <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00', padding: '14px 16px' }}>
          目前還找不到 erp_customers 資料表，人工綁定功能需要先把 docs/erp-schema-v1.sql 跑進 Supabase。
        </div>
      )}
      {bindMessage && (
        <div style={{ ...S.card, background: '#edf9f2', borderColor: '#bdeccb', color: '#127248', padding: '14px 16px' }}>
          {bindMessage}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>共 {data.total} 位客戶</div>
      {loading ? <Loading /> : data.customers.length === 0 ? <EmptyState text="目前沒有符合條件的客戶資料" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1.25fr) minmax(340px, 0.9fr)', gap: 16, alignItems: 'start' }}>
          <div style={S.card}>
            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) 110px 150px 110px', gap: 12, padding: '0 10px 10px', borderBottom: '1px solid #e6edf5', marginBottom: 8, color: '#7b889b', fontSize: 10, ...S.mono }}>
                <div>客戶</div>
                <div>狀態</div>
                <div>ERP</div>
                <div style={{ textAlign: 'right' }}>訊息數</div>
              </div>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {data.customers.map((customer) => {
                const selected = customer.line_user_id === selectedLineId;
                return (
                  <button
                    key={customer.id || customer.line_user_id}
                    onClick={() => setSelectedLineId(customer.line_user_id || '')}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: selected ? '#edf5ff' : '#fff',
                      border: `1px solid ${selected ? '#94c3ff' : '#dbe3ee'}`,
                      borderRadius: 12,
                      padding: '12px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : 'minmax(0, 1.6fr) 110px 150px 110px', gap: 12, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 15, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {customer.display_name || '未命名客戶'}
                          </span>
                          <span style={S.tag('green')}>LINE</span>
                        </div>
                      <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.6 }}>
                          {customer.linked_customer
                            ? `${customer.linked_customer.company_name || customer.linked_customer.name || '已建立 ERP 客戶'}`
                            : '尚未綁定正式客戶'}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: (customer.message_count || 0) > 1 ? '#129c59' : '#f59e0b', fontWeight: 700 }}>
                        {(customer.message_count || 0) > 1 ? '既有客戶' : '新客戶'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {hasErpProfile(customer)
                          ? <span style={S.tag(stageMeta[getCustomerStage(customer)]?.color || '')}>
                              {stageMeta[getCustomerStage(customer)]?.label || '詢問名單'}
                            </span>
                          : <span style={S.tag('red')}>未綁定</span>}
                      </div>
                      <div style={{ textAlign: isMobile ? 'left' : 'right', fontSize: 16, color: '#1976f3', fontWeight: 700, ...S.mono }}>
                        {fmt(customer.message_count)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          {detailPanel}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
        {data.page > 1 && <button onClick={() => load(data.page - 1)} style={S.btnGhost}>← 上一頁</button>}
        <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{data.page}</span>
        {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={S.btnGhost}>下一頁 →</button>}
      </div>
    </div>
  );
}

/* ========================================= PRODUCT SEARCH ========================================= */
function ProductSearch() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const CATS = { all: '全部', wrench: '扳手', socket: '套筒', ratchet: '棘輪', screwdriver: '螺絲起子', plier: '鉗子', power_tool: '電動工具', torque_wrench: '扭力扳手', storage: '工具車/收納', light: '照明', diagnostic: '診斷', battery: '電池', tester: '測試儀', borescope: '內視鏡', jack_lift: '千斤頂', torque_multiplier: '扭力倍增器', tire_inflator: '打氣機', other: '其他' };
  const STATUS_OPTIONS = ['all', 'Current', 'Legacy', 'Discontinued'];
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState({ total_products: 0, current_products: 0, replacement_products: 0, category_count: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const PAGE_SIZE = 25;

  const doSearch = useCallback(async (q, cat, status, pg = 0) => {
    setLoading(true);
    const data = await apiGet({
      action: 'products',
      q: q || '',
      category: cat || 'all',
      status: status || 'all',
      page: String(pg),
      limit: String(PAGE_SIZE),
    });
    setProducts(data.products || []);
    setTotal(data.total || 0);
    setSummary(data.summary || { total_products: 0, current_products: 0, replacement_products: 0, category_count: 0 });
    setLoading(false);
  }, []);

  useEffect(() => { const timer = setTimeout(() => { setPage(0); doSearch(search, category, statusFilter, 0); }, 300); return () => clearTimeout(timer); }, [search, category, statusFilter, doSearch]);
  const goPage = (pg) => { setPage(pg); doSearch(search, category, statusFilter, pg); };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageLead
        eyebrow="Product Master"
        title="商品主檔"
        description="這裡是正式 ERP 商品主檔，不只是查價，也用來維護商品狀態、分類、替代型號與價格。"
        action={<CsvImportButton datasetId="quickbuy_products" onImported={() => doSearch(search, category, statusFilter, page)} compact />}
      />
      {saveMessage ? <StatusBanner text={saveMessage} tone="success" /> : null}
      <div style={{ ...S.statGrid, marginBottom: 18 }}>
        <div style={S.panelMuted}><div style={S.label}>TOTAL_PRODUCTS</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(summary.total_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>CURRENT</div><div style={{ fontSize: 26, fontWeight: 700, color: '#129c59', ...S.mono }}>{fmt(summary.current_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>WITH_REPLACEMENT</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1976f3', ...S.mono }}>{fmt(summary.replacement_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>CATEGORIES</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(summary.category_count)}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋料號或關鍵字... (例: FDX71, wrench)" style={{ ...S.input, flex: 1, ...S.mono }} onFocus={e => e.target.style.borderColor = '#1976f3'} onBlur={e => e.target.style.borderColor = '#ccd6e3'} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, width: isMobile ? '100%' : 150 }}>
          {STATUS_OPTIONS.map((value) => <option key={value} value={value}>{value === 'all' ? '全部狀態' : value}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {Object.entries(CATS).map(([key, label]) => (
          <button key={key} onClick={() => setCategory(key)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, color: category === key ? '#1976f3' : '#66768a', borderColor: category === key ? '#94c3ff' : '#d6deea', background: category === key ? '#edf5ff' : '#fff' }}>{label}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>主檔共 {fmt(total)} 筆 {totalPages > 1 && `· P${page + 1}/${totalPages}`}</div>
      {loading ? <Loading /> : products.length === 0 ? <EmptyState text={search ? '找不到符合的產品' : '輸入料號或關鍵字開始搜尋'} /> : (
        <>
          {!isMobile && <div style={{ display: 'flex', padding: '8px 16px', fontSize: 10, color: '#7b889b', ...S.mono, borderBottom: '1px solid #dbe3ee', marginBottom: 4 }}>
            <div style={{ width: 150 }}>ITEM_NO</div><div style={{ flex: 1 }}>DESCRIPTION</div><div style={{ width: 90, textAlign: 'right' }}>分類</div><div style={{ width: 110, textAlign: 'right' }}>狀態</div><div style={{ width: 100, textAlign: 'right' }}>牌價</div><div style={{ width: 100, textAlign: 'right' }}>經銷價</div><div style={{ width: 96, textAlign: 'right' }}>操作</div>
          </div>}
          {products.map(p => (
            <div key={p.item_number}>
              <div onClick={() => setExpanded(expanded === p.item_number ? null : p.item_number)} style={{ ...S.card, cursor: 'pointer', padding: '10px 16px', marginBottom: 2, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0, borderColor: expanded === p.item_number ? '#94c3ff' : '#dbe3ee' }}>
                <div style={{ width: isMobile ? '100%' : 150, fontWeight: 700, color: '#1976f3', fontSize: 13, ...S.mono }}>{p.item_number}</div>
                <div style={{ flex: 1, width: isMobile ? '100%' : 'auto', fontSize: 12, color: '#5f6f83', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>{p.description}</div>
                <div style={{ width: isMobile ? '100%' : 90, textAlign: isMobile ? 'left' : 'right' }}>{p.category && p.category !== 'other' && <span style={{ ...S.tag(''), fontSize: 10 }}>{CATS[p.category] || p.category}</span>}</div>
                <div style={{ width: isMobile ? '100%' : 110, textAlign: isMobile ? 'left' : 'right' }}><span style={S.tag(String(p.product_status || '').toLowerCase() === 'current' ? 'green' : '')}>{p.product_status || '-'}</span></div>
                <div style={{ width: isMobile ? '100%' : 100, textAlign: isMobile ? 'left' : 'right', fontSize: 13, color: '#273346', ...S.mono }}>{isMobile ? `牌價 ${fmtP(p.tw_retail_price)}` : fmtP(p.tw_retail_price)}</div>
                <div style={{ width: isMobile ? '100%' : 100, textAlign: isMobile ? 'left' : 'right', fontSize: 13, color: '#129c59', fontWeight: 700, ...S.mono }}>{isMobile ? `經銷價 ${fmtP(p.tw_reseller_price)}` : fmtP(p.tw_reseller_price)}</div>
                <div style={{ width: isMobile ? '100%' : 96, textAlign: isMobile ? 'left' : 'right' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingProduct(p); }}
                    style={{ ...S.btnGhost, padding: '6px 10px', fontSize: 12 }}
                  >
                    編輯
                  </button>
                </div>
              </div>
              {expanded === p.item_number && (
                <div style={{ background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 10, padding: '14px 20px', marginBottom: 8, marginTop: -2, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  <div><div style={S.label}>US PRICE</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.us_price ? `$${Number(p.us_price).toFixed(2)}` : '-'}</div></div>
                  <div><div style={S.label}>牌價</div><div style={{ color: '#273346', fontSize: 13, ...S.mono }}>{fmtP(p.tw_retail_price)}</div></div>
                  <div><div style={S.label}>經銷價</div><div style={{ color: '#129c59', fontSize: 13, fontWeight: 700, ...S.mono }}>{fmtP(p.tw_reseller_price)}</div></div>
                  <div><div style={S.label}>狀態</div><div style={{ color: '#5f6f83', fontSize: 13 }}>{p.product_status || '-'}</div></div>
                  <div><div style={S.label}>重量</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.weight_kg ? `${p.weight_kg} kg` : '-'}</div></div>
                  <div><div style={S.label}>產地</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.origin_country || '-'}</div></div>
                  <div><div style={S.label}>替代型號</div><div style={{ color: p.replacement_model ? '#1976f3' : '#8a96a8', fontSize: 13, ...S.mono }}>{p.replacement_model || '-'}</div></div>
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
            {page > 0 && <button onClick={() => goPage(page - 1)} style={S.btnGhost}>← 上一頁</button>}
            <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page + 1}/{totalPages}</span>
            {page < totalPages - 1 && <button onClick={() => goPage(page + 1)} style={S.btnGhost}>下一頁 →</button>}
          </div>
        </>
      )}
      <ProductEditModal
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSaved={async () => {
          setSaveMessage(`商品 ${editingProduct?.item_number || ''} 已更新`);
          await doSearch(search, category, statusFilter, page);
          setTimeout(() => setSaveMessage(''), 3000);
        }}
      />
    </div>
  );
}

/* ========================================= QUOTES ========================================= */
function QuoteCreateModal({ open, onClose, onCreated, tableReady = true }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [productLoading, setProductLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => {
    const today = getPresetDateRange('today').from;
    const validUntil = toDateInputValue(new Date(todayInTaipei().getTime() + 7 * 86400000));
    return {
      quote_date: today,
      valid_until: validUntil,
      status: 'draft',
      remark: '',
      discount_amount: 0,
      shipping_fee: 0,
      items: [],
    };
  });

  useEffect(() => {
    if (!open) return;
    setError('');
  }, [open]);

  const searchCustomers = async () => {
    if (!customerSearch.trim()) return;
    setCustomerLoading(true);
    try {
      const result = await apiGet({ action: 'formal_customers', page: '1', limit: '10', search: customerSearch.trim() });
      setCustomerResults(result.customers || []);
    } finally {
      setCustomerLoading(false);
    }
  };

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch('');
    setCustomerResults([]);
  };

  const searchProducts = async () => {
    if (!productSearch.trim()) return;
    setProductLoading(true);
    try {
      const result = await apiGet({ action: 'products', q: productSearch.trim(), category: 'all', page: '0', limit: '10' });
      setProductResults(result.products || []);
    } finally {
      setProductLoading(false);
    }
  };

  const addProduct = (product) => {
    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          product_id: null,
          item_number_snapshot: product.item_number || '',
          description_snapshot: product.description || '',
          qty: 1,
          unit_price: Number(product.tw_reseller_price || product.tw_retail_price || 0),
        },
      ],
    }));
    setProductSearch('');
    setProductResults([]);
  };

  const updateItem = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  };

  const removeItem = (index) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.unit_price || 0)), 0);
  const taxableBase = Math.max(0, subtotal - Number(form.discount_amount || 0) + Number(form.shipping_fee || 0));
  const taxAmount = Math.round(taxableBase * 0.05);
  const totalAmount = taxableBase + taxAmount;

  const submit = async () => {
    if (!tableReady) {
      setError('目前尚未建立 erp_quotes / erp_quote_items，請先執行 ERP schema。');
      return;
    }
    if (!selectedCustomer?.id) {
      setError('請先選擇正式客戶');
      return;
    }
    if (!form.items.length) {
      setError('請至少加入一筆商品');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiPost({
        action: 'create_quote',
        customer_id: selectedCustomer.id,
        quote_date: form.quote_date,
        valid_until: form.valid_until,
        status: form.status,
        remark: form.remark,
        discount_amount: Number(form.discount_amount || 0),
        shipping_fee: Number(form.shipping_fee || 0),
        items: form.items,
      });
      onCreated?.();
      onClose?.();
    } catch (err) {
      setError(err.message || '建立報價單失敗');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 'min(1100px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={S.eyebrow}>Create Quote</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1c2740' }}>建立報價單</div>
            <div style={{ fontSize: 12, color: '#7b889b', marginTop: 6 }}>先建立基本報價單，之後就能往訂單與銷貨流程接。</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {error ? <div style={{ ...S.card, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 14 }}>{error}</div> : null}
        {!tableReady ? (
          <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00', marginBottom: 14 }}>
            目前尚未建立 `erp_quotes` / `erp_quote_items`，請先跑 [`/Users/tungyiwu/Desktop/AI/Auto QB/Auto-bot-QB/docs/erp-schema-v1.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-schema-v1.sql)。
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={S.card}>
              <PanelHeader title="選擇客戶" meta="先綁正式客戶，再建立報價。" badge={selectedCustomer ? <div style={S.tag('green')}>已選客戶</div> : null} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCustomers()} placeholder="搜尋公司、聯絡人或電話..." style={{ ...S.input, flex: 1 }} />
                <button onClick={searchCustomers} style={S.btnPrimary}>搜尋</button>
              </div>
              {customerLoading ? <Loading /> : customerResults.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, maxHeight: 230, overflowY: 'auto', paddingRight: 4 }}>
                  {customerResults.map((customer) => (
                    <button key={customer.id} onClick={() => selectCustomer(customer)} style={{ ...S.panelMuted, width: '100%', textAlign: 'left', cursor: 'pointer', border: `1px solid ${selectedCustomer?.id === customer.id ? '#94c3ff' : '#dbe3ee'}`, background: selectedCustomer?.id === customer.id ? '#edf5ff' : '#fff' }}>
                      <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                      <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>{customer.customer_code || '-'} · {customer.phone || '-'}</div>
                    </button>
                  ))}
                </div>
              ) : selectedCustomer ? (
                <div style={{ ...S.panelMuted, borderColor: '#bde6c9', background: '#f4fbf6', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#129c59', fontWeight: 700, ...S.mono }}>SELECTED CUSTOMER</div>
                      <div style={{ fontSize: 16, color: '#1c2740', fontWeight: 700, marginTop: 6 }}>{selectedCustomer.company_name || selectedCustomer.name || '未命名客戶'}</div>
                    </div>
                    <button onClick={() => setSelectedCustomer(null)} style={{ ...S.btnGhost, padding: '6px 10px', fontSize: 12 }}>更換客戶</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#617084' }}>
                    {selectedCustomer.customer_code || '-'} · {selectedCustomer.phone || '-'}
                  </div>
                </div>
              ) : <div style={{ fontSize: 12, color: '#7b889b' }}>輸入關鍵字後搜尋正式客戶</div>}
            </div>

            <div style={S.card}>
              <PanelHeader title="報價明細" meta="用商品搜尋快速加入明細，或直接調整數量與單價。" badge={<div style={S.tag('')}>{fmt(form.items.length)} 項</div>} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchProducts()} placeholder="搜尋料號或品名..." style={{ ...S.input, flex: 1, ...S.mono }} />
                <button onClick={searchProducts} style={S.btnPrimary}>找商品</button>
              </div>
              {productLoading ? <Loading /> : productResults.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  {productResults.map((product) => (
                    <button key={product.item_number} onClick={() => addProduct(product)} style={{ ...S.panelMuted, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                      <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{product.item_number}</div>
                      <div style={{ fontSize: 13, color: '#1c2740', marginTop: 4 }}>{product.description || '-'}</div>
                      <div style={{ fontSize: 12, color: '#129c59', marginTop: 4, ...S.mono }}>{fmtP(product.tw_reseller_price || product.tw_retail_price)}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              {form.items.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {form.items.map((item, index) => (
                    <div key={`${item.item_number_snapshot}-${index}`} style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 120px 100px', gap: 10, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{item.item_number_snapshot || '-'}</div>
                        <div style={{ fontSize: 13, color: '#1c2740', marginTop: 4 }}>{item.description_snapshot || '-'}</div>
                      </div>
                      <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(index, 'qty', Number(e.target.value || 1))} style={{ ...S.input, textAlign: 'center', ...S.mono }} />
                      <input type="number" min="0" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', Number(e.target.value || 0))} style={{ ...S.input, textAlign: 'right', ...S.mono }} />
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{fmtP(Number(item.qty || 0) * Number(item.unit_price || 0))}</div>
                        <button onClick={() => removeItem(index)} style={{ ...S.btnGhost, color: '#e24d4d', borderColor: '#ffd5d5', padding: '6px 10px', fontSize: 12 }}>移除</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState text="目前還沒有商品明細，先搜尋商品加入。" />}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div style={S.card}>
              <PanelHeader title="報價抬頭" meta="設定日期、狀態與補充備註。" />
              <div style={{ display: 'grid', gap: 12 }}>
                <div><label style={S.label}>報價日期</label><input type="date" value={form.quote_date} onChange={(e) => setForm((current) => ({ ...current, quote_date: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>有效期限</label><input type="date" value={form.valid_until} onChange={(e) => setForm((current) => ({ ...current, valid_until: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>狀態</label><select value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))} style={S.input}><option value="draft">draft</option><option value="sent">sent</option><option value="approved">approved</option></select></div>
                <div><label style={S.label}>備註</label><textarea value={form.remark} onChange={(e) => setForm((current) => ({ ...current, remark: e.target.value }))} rows={4} style={{ ...S.input, resize: 'vertical' }} /></div>
              </div>
            </div>
            <div style={S.card}>
              <PanelHeader title="金額摘要" meta="系統會自動算小計、稅額與總額。" />
              <div style={{ display: 'grid', gap: 12 }}>
                <div><label style={S.label}>折扣金額</label><input type="number" min="0" value={form.discount_amount} onChange={(e) => setForm((current) => ({ ...current, discount_amount: Number(e.target.value || 0) }))} style={{ ...S.input, ...S.mono }} /></div>
                <div><label style={S.label}>運費</label><input type="number" min="0" value={form.shipping_fee} onChange={(e) => setForm((current) => ({ ...current, shipping_fee: Number(e.target.value || 0) }))} style={{ ...S.input, ...S.mono }} /></div>
                <div style={{ ...S.panelMuted, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>小計</span><strong style={S.mono}>{fmtP(subtotal)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>稅額 (5%)</span><strong style={S.mono}>{fmtP(taxAmount)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#129c59', fontWeight: 700 }}><span>總額</span><strong style={S.mono}>{fmtP(totalAmount)}</strong></div>
                </div>
                <button onClick={submit} disabled={saving || !tableReady} style={{ ...S.btnPrimary, width: '100%', opacity: saving || !tableReady ? 0.7 : 1 }}>{saving ? '建立中...' : '建立報價單'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Quotes() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total_amount: 0, open_count: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [showCreate, setShowCreate] = useState(false);
  const [convertingId, setConvertingId] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'quotes', page: String(page), limit: String(limit), search: q });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize]);

  useEffect(() => { load(); }, []);

  const convertToOrder = async (quote) => {
    setConvertingId(quote.id);
    setActionMessage('');
    try {
      const result = await apiPost({ action: 'convert_quote_to_order', quote_id: quote.id });
      setActionMessage(`已轉成訂單 ${result.order?.order_no || ''}`.trim());
      await load(1, search, pageSize);
    } catch (error) {
      setActionMessage(error.message || '報價轉訂單失敗');
    } finally {
      setConvertingId('');
    }
  };

  return (
    <div>
      <PageLead eyebrow="Quotes" title="報價單" description="查看 ERP 報價單、客戶、有效期限與總金額，作為詢價轉單前的作業入口。" action={<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><CsvImportButton datasetId="erp_quotes" onImported={() => load(1, search, pageSize)} compact /><button onClick={() => data.table_ready && setShowCreate(true)} disabled={!data.table_ready} style={{ ...S.btnPrimary, opacity: data.table_ready ? 1 : 0.6, cursor: data.table_ready ? 'pointer' : 'not-allowed' }}>+ 建立報價單</button></div>} />
      {actionMessage ? (
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 14 }}>
          {actionMessage}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize)} placeholder="搜尋報價單號、狀態或備註..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(1, search, pageSize)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_quotes` 資料表，請先跑 [`docs/erp-schema-v1.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-schema-v1.sql)。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="QTOT" label="報價總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="OPEN" label="待處理" value={fmt(data.summary?.open_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有報價單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '140px minmax(0,1.2fr) 110px 130px 120px' : '160px minmax(0,1.3fr) 110px 130px 120px 140px 120px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>報價單號</div>
            <div>客戶</div>
            <div>日期</div>
            <div>狀態</div>
            {!isTablet && <div>有效期限</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            <div style={{ textAlign: isTablet ? 'left' : 'right' }}>操作</div>
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '140px minmax(0,1.2fr) 110px 130px 120px' : '160px minmax(0,1.3fr) 110px 130px 120px 140px 120px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.quote_no || '-'}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>{row.remark || row.customer?.phone || '-'}</div>
              </div>
              <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.quote_date || '-'}</div>
              <div><span style={S.tag(String(row.status || '').toLowerCase().includes('approved') ? 'green' : '')}>{row.status || 'draft'}</span></div>
              {!isTablet && <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.valid_until || '-'}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>}
              <div style={{ textAlign: isTablet ? 'left' : 'right' }}>
                {String(row.status || '').toLowerCase() === 'converted' ? (
                  <span style={S.tag('green')}>已轉單</span>
                ) : (
                  <button onClick={() => convertToOrder(row)} disabled={convertingId === row.id} style={{ ...S.btnGhost, padding: '7px 10px', fontSize: 12, opacity: convertingId === row.id ? 0.7 : 1 }}>
                    {convertingId === row.id ? '轉單中...' : '轉訂單'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => { setPageSize(nextLimit); load(1, search, nextLimit); }}
      />
      <QuoteCreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => load(1, search, pageSize)} tableReady={data.table_ready} />
    </div>
  );
}

/* ========================================= ORDERS ========================================= */
function Orders() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total_amount: 0, pending_count: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [convertingId, setConvertingId] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'orders', page: String(page), limit: String(limit), search: q });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize]);

  useEffect(() => { load(); }, []);

  const convertToSale = async (order) => {
    setConvertingId(order.id);
    setActionMessage('');
    try {
      const result = await apiPost({ action: 'convert_order_to_sale', order_id: order.id });
      setActionMessage(`已轉成銷貨單 ${result.sale?.slip_number || ''}`.trim());
      await load(1, search, pageSize);
    } catch (error) {
      setActionMessage(error.message || '訂單轉銷貨失敗');
    } finally {
      setConvertingId('');
    }
  };

  return (
    <div>
      <PageLead eyebrow="Orders" title="訂單" description="查看 ERP 訂單、付款與出貨狀態，作為報價轉單後的作業中心。" action={<CsvImportButton datasetId="erp_orders" onImported={() => load(1, search, pageSize)} compact />} />
      {actionMessage ? (
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 14 }}>
          {actionMessage}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize)} placeholder="搜尋訂單號、狀態、付款或出貨..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(1, search, pageSize)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_orders` 資料表，請先跑 [`docs/erp-schema-v1.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-schema-v1.sql)。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="OTOT" label="訂單總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="PEND" label="未完成" value={fmt(data.summary?.pending_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有訂單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '140px minmax(0,1.2fr) 110px 130px 120px' : '160px minmax(0,1.3fr) 110px 120px 120px 140px 120px 140px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>訂單號</div>
            <div>客戶</div>
            <div>日期</div>
            <div>訂單狀態</div>
            {!isTablet && <div>付款</div>}
            {!isTablet && <div>出貨</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            <div style={{ textAlign: isTablet ? 'left' : 'right' }}>操作</div>
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '140px minmax(0,1.2fr) 110px 130px 120px' : '160px minmax(0,1.3fr) 110px 120px 120px 140px 120px 140px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.order_no || '-'}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>{row.remark || '-'}</div>
              </div>
              <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.order_date || '-'}</div>
              <div><span style={S.tag('')}>{row.status || 'draft'}</span></div>
              {!isTablet && <div><span style={S.tag(String(row.payment_status || '').toLowerCase().includes('paid') ? 'green' : '')}>{row.payment_status || '-'}</span></div>}
              {!isTablet && <div><span style={S.tag(String(row.shipping_status || '').toLowerCase().includes('shipped') ? 'green' : '')}>{row.shipping_status || '-'}</span></div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>}
              <div style={{ textAlign: isTablet ? 'left' : 'right' }}>
                {String(row.shipping_status || '').toLowerCase().includes('shipped') ? (
                  <span style={S.tag('green')}>已轉銷貨</span>
                ) : (
                  <button onClick={() => convertToSale(row)} disabled={convertingId === row.id} style={{ ...S.btnGhost, padding: '7px 10px', fontSize: 12, opacity: convertingId === row.id ? 0.7 : 1 }}>
                    {convertingId === row.id ? '轉銷中...' : '轉銷貨'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => { setPageSize(nextLimit); load(1, search, nextLimit); }}
      />
    </div>
  );
}

/* ========================================= SALES DOCUMENTS ========================================= */
function SalesDocuments() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total: 0, gross_profit: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'sales_documents', page: String(page), limit: String(limit), search: q });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize]);

  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageLead eyebrow="Sales" title="銷貨單" description="查看實際銷貨單、發票號碼與毛利，並可點單號查看完整銷貨單內容。" action={<CsvImportButton datasetId="qb_sales_history" onImported={() => load(1, search, pageSize)} compact />} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize)} placeholder="搜尋銷貨單號、客戶、業務或發票..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(1, search, pageSize)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `qb_sales_history` 或目前資料不可讀。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="STOT" label="銷貨筆數" value={fmt(data.total)} tone="blue" />
        <StatCard code="REV" label="本頁營收" value={fmtP(data.summary?.total)} tone="green" />
        <StatCard code="GP" label="本頁毛利" value={fmtP(data.summary?.gross_profit)} tone="yellow" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有銷貨單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '160px minmax(0,1.2fr) 110px 110px' : '170px minmax(0,1.3fr) 120px 120px 120px 120px 120px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>銷貨單號</div>
            <div>客戶 / 發票</div>
            <div>日期</div>
            <div>業務</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>未稅</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>毛利</div>}
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '160px minmax(0,1.2fr) 110px 110px' : '170px minmax(0,1.3fr) 120px 120px 120px 120px 120px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <button onClick={() => setSelectedSlipNumber(row.slip_number)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', fontSize: 12, color: '#1976f3', fontWeight: 700, cursor: 'pointer', ...S.mono }}>
                {row.slip_number || '-'}
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.6 }}>
                  <span style={{ color: '#7b889b', ...S.mono }}>INV</span> {row.invoice_number || '-'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.sale_date || '-'}</div>
              <div style={{ fontSize: 12, color: '#617084' }}>{row.sales_person || '-'}</div>
              {!isTablet && <div style={{ fontSize: 13, color: '#1c2740', textAlign: 'right', ...S.mono }}>{fmtP(row.subtotal)}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#1976f3', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.gross_profit)}</div>}
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => { setPageSize(nextLimit); load(1, search, nextLimit); }}
      />
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}

/* ========================================= PROMOTIONS ========================================= */
function Promotions() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', note: '', items: '' });
  const load = () => { apiGet({ action: 'promotions' }).then(d => setPromos(d.promotions || [])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const submit = async () => {
    const items = form.items.split('\n').filter(Boolean).map(line => {
      const match = line.match(/^([A-Za-z0-9-]+)\s*[→=:]\s*(?:NT\$?)([\d,]+)(?:\s*[（(](.+)[)）])?/);
      if (!match) return null;
      return { item_number: match[1].toUpperCase(), promo_price: parseInt(match[2].replace(/,/g, '')), promo_note: match[3] || null };
    }).filter(Boolean);
    const res = await apiPost({ action: 'create_promotion', ...form, items });
    if (!res.error) { setShowForm(false); setForm({ name: '', start_date: '', end_date: '', note: '', items: '' }); load(); }
  };
  const toggle = async (id, active) => { await apiPost({ action: 'toggle_promotion', id, is_active: !active }); load(); };
  return (
    <div>
      <PageLead eyebrow="Campaigns" title="活動管理" description="建立與切換促銷活動，集中管理優惠商品與檔期資訊。" action={<button onClick={() => setShowForm(!showForm)} style={S.btnPrimary}>{showForm ? '取消' : '+ 新增活動'}</button>} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>共 {promos.length} 個活動</div>
      </div>
      {showForm && (
        <div style={{ ...S.card, borderColor: '#10b98130', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', marginBottom: 18 }}>NEW_PROMOTION</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label style={S.label}>活動名稱</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="四月工具月" style={S.input} /></div>
            <div><label style={S.label}>備註</label><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="滿 10,000 免運" style={S.input} /></div>
            <div><label style={S.label}>開始日期</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={S.input} /></div>
            <div><label style={S.label}>結束日期</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={S.input} /></div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={S.label}>活動商品（每行格式：型號 → 價格（備註））</label>
            <textarea value={form.items} onChange={e => setForm({ ...form, items: e.target.value })} placeholder={`ATECH3FR250B → 28000\nTPGDL2000 → 8500（買一送充氣嘴組）`} rows={5} style={{ ...S.input, resize: 'vertical', ...S.mono, fontSize: 12, lineHeight: 1.6 }} />
          </div>
          <button onClick={submit} style={S.btnPrimary}>建立活動</button>
        </div>
      )}
      {loading ? <Loading /> : promos.map(p => (
        <div key={p.id} style={{ ...S.card, borderColor: p.is_active ? '#bdeccb' : '#dbe3ee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1c2740' }}>{p.name}</span>
              <span style={S.tag(p.is_active ? 'green' : 'red')}>{p.is_active ? 'ACTIVE' : 'CLOSED'}</span>
            </div>
            <button onClick={() => toggle(p.id, p.is_active)} style={{ ...S.btnGhost, color: p.is_active ? '#f87171' : '#4ade80', borderColor: p.is_active ? '#ef444425' : '#22c55e25', fontSize: 12 }}>{p.is_active ? '關閉' : '啟用'}</button>
          </div>
          <div style={{ color: '#6f7d90', fontSize: 12, marginTop: 6, ...S.mono }}>{p.start_date} → {p.end_date}{p.note ? ` · ${p.note}` : ''}</div>
          {p.quickbuy_promotion_items?.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #e6edf5', paddingTop: 10 }}>
              {p.quickbuy_promotion_items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', fontSize: 12 }}>
                  <span style={{ color: '#1976f3', ...S.mono, width: 140 }}>{item.item_number}</span>
                  <span style={{ color: '#129c59', ...S.mono }}>NT${fmt(item.promo_price)}</span>
                  {item.promo_note && <span style={{ color: '#77859a' }}>({item.promo_note})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {!loading && promos.length === 0 && !showForm && <EmptyState text="尚無活動，點「+ 新增活動」建立" />}
    </div>
  );
}

/* ========================================= PRICING RULES ========================================= */
function PricingRules() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => { apiGet({ action: 'pricing' }).then(d => setRules(d.rules)).finally(() => setLoading(false)); }, []);
  const save = async () => { await apiPost({ action: 'update_pricing', rules }); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  if (loading || !rules) return <Loading />;
  return (
    <div style={{ maxWidth: 560, width: '100%' }}>
      <PageLead eyebrow="Pricing" title="報價規則" description="維護後台內部報價參數，快速調整折扣、免運門檻與提示文字。" />
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', marginBottom: 20, ...S.mono }}>PRICING_CONFIG</div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>預設折扣比例</label><div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}><input type="number" step="0.01" min="0" max="1" value={rules.default_discount} onChange={e => setRules({ ...rules, default_discount: parseFloat(e.target.value) })} style={{ ...S.input, width: isMobile ? '100%' : 120, textAlign: 'center', ...S.mono }} /><span style={{ color: '#6f7d90', fontSize: 12 }}>= {Math.round(rules.default_discount * 100)} 折（內部參考）</span></div></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>免運門檻 (NT$)</label><input type="number" step="100" value={rules.free_shipping_threshold} onChange={e => setRules({ ...rules, free_shipping_threshold: parseInt(e.target.value) })} style={{ ...S.input, width: 160, ...S.mono }} /></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>優惠提示文字</label><input value={rules.promo_hint_text || '✨ 私訊享優惠價'} onChange={e => setRules({ ...rules, promo_hint_text: e.target.value })} style={S.input} /></div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
          <label style={{ color: '#617084', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={rules.show_retail_price} onChange={e => setRules({ ...rules, show_retail_price: e.target.checked })} style={{ accentColor: '#1976f3' }} />顯示建議售價</label>
          <label style={{ color: '#617084', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={rules.show_promo_hint} onChange={e => setRules({ ...rules, show_promo_hint: e.target.checked })} style={{ accentColor: '#1976f3' }} />顯示優惠提示</label>
        </div>
        <button onClick={save} style={{ ...S.btnPrimary, background: saved ? '#129c59' : 'linear-gradient(180deg, #2d8cff 0%, #1976f3 100%)', transition: 'background 0.3s', width: '100%', padding: '11px 0', fontSize: 14 }}>{saved ? '✓ SAVED' : '儲存設定'}</button>
      </div>
    </div>
  );
}

/* ========================================= VENDORS ========================================= */
function Vendors() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ vendors: [], total: 0, page: 1, limit: 20, table_ready: true });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  return (
    <div>
      <PageLead
        eyebrow="Vendors"
        title="廠商主檔"
        description="查看供應商主檔、聯絡窗口與統編資訊，後續可接採購與補貨流程。"
        action={<CsvImportButton datasetId="erp_vendors" onImported={() => load(1, search)} compact />}
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search)} placeholder="搜尋廠商名稱、代號或聯絡人..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_vendors` 資料表，請先跑 [`docs/erp-auxiliary-tables.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-auxiliary-tables.sql) 後再匯入廠商資料。</div>}
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>共 {fmt(data.total)} 筆廠商</div>
      {loading ? <Loading /> : data.vendors.length === 0 ? <EmptyState text="目前沒有廠商資料" /> : data.vendors.map((vendor) => (
        <div key={vendor.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '160px minmax(0, 1fr) 160px', gap: 12, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>VENDOR_CODE</div>
              <div style={{ fontSize: 14, color: '#1976f3', fontWeight: 700, ...S.mono }}>{vendor.vendor_code || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: 15, color: '#1c2740', fontWeight: 700 }}>{vendor.vendor_name || '未命名廠商'}</div>
              <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.8, marginTop: 6 }}>
                <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {vendor.contact_name || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {vendor.phone || vendor.mobile || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>ADDRESS</span> {vendor.address || '-'}</div>
              </div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>TAX_ID</div>
              <div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{vendor.tax_id || '-'}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ========================================= SALES RETURNS ========================================= */
function SalesReturns() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const initialRange = getPresetDateRange('today');
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { amount: 0, tax: 0, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [rangePreset, setRangePreset] = useState('today');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, from = dateFrom, to = dateTo, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({
        action: 'sales_returns',
        page: String(page),
        limit: String(limit),
        search: q,
        date_from: from,
        date_to: to,
      });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, pageSize]);

  useEffect(() => { load(); }, []);

  const applyPreset = (preset) => {
    if (preset === 'custom') {
      setRangePreset('custom');
      return;
    }
    const range = getPresetDateRange(preset);
    setRangePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    load(1, search, range.from, range.to, pageSize);
  };

  return (
    <div>
      <PageLead
        eyebrow="Returns"
        title="銷退貨彙總"
        description="查看銷貨與退貨單據彙總，快速掌握單號、客戶與發票資訊。"
        action={<CsvImportButton datasetId="erp_sales_return_summary" onImported={() => load(1, search, dateFrom, dateTo, pageSize)} compact />}
      />
      <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, dateFrom, dateTo, pageSize)} placeholder="搜尋單號、客戶、業務或發票..." style={{ ...S.input, flex: 1 }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={S.btnPrimary}>搜尋</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['today', '今日'],
            ['week', '週'],
            ['month', '月'],
            ['quarter', '季'],
            ['year', '年'],
            ['custom', '自選'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => applyPreset(value)}
              style={{
                ...S.btnGhost,
                padding: '6px 12px',
                fontSize: 12,
                background: rangePreset === value ? '#edf5ff' : '#fff',
                borderColor: rangePreset === value ? '#94c3ff' : '#dbe3ee',
                color: rangePreset === value ? '#1976f3' : '#5b6779',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input type="date" value={dateFrom} onChange={(e) => { setRangePreset('custom'); setDateFrom(e.target.value); }} style={{ ...S.input, maxWidth: isMobile ? '100%' : 180 }} />
          <input type="date" value={dateTo} onChange={(e) => { setRangePreset('custom'); setDateTo(e.target.value); }} style={{ ...S.input, maxWidth: isMobile ? '100%' : 180 }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={S.btnGhost}>套用區間</button>
          <button onClick={() => applyPreset('today')} style={S.btnGhost}>回到今日</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_sales_return_summary` 資料表，請先跑 [`docs/erp-auxiliary-tables.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-auxiliary-tables.sql) 再匯入銷退貨 CSV。</div>}
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>
        共 {fmt(data.total)} 筆單據{dateFrom || dateTo ? ` · ${dateFrom || '...'} → ${dateTo || '...'}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="AMT" label="未稅金額" value={fmtP(data.summary?.amount)} tone="blue" />
        <StatCard code="TAX" label="稅額" value={fmtP(data.summary?.tax)} tone="yellow" />
        <StatCard code="TOTAL" label="總金額" value={fmtP(data.summary?.total)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有銷退貨資料" /> : isMobile ? data.rows.map((row) => (
        <div key={row.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'center' }}>
            <div>
              {row.doc_type === 'return' ? (
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.doc_no}</div>
              ) : (
                <button
                  onClick={() => setSelectedSlipNumber(row.doc_no)}
                  style={{ background: 'none', border: 0, padding: 0, fontSize: 12, color: '#1976f3', fontWeight: 700, cursor: 'pointer', ...S.mono }}
                >
                  {row.doc_no}
                </button>
              )}
              <div style={{ marginTop: 6 }}>{row.doc_type === 'return' ? <span style={S.tag('red')}>退貨</span> : <span style={S.tag('green')}>銷貨</span>}</div>
            </div>
            <div>
              <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{row.customer_name || '未命名客戶'}</div>
              <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.7 }}>
                <div><span style={{ color: '#7b889b', ...S.mono }}>DATE</span> {row.doc_date || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>SALES</span> {row.sales_name || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>INVOICE</span> {row.invoice_no || '-'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>AMOUNT</div>
                <div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{fmtP(row.amount)}</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>TOTAL</div>
                <div style={{ fontSize: 14, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
              </div>
            </div>
          </div>
        </div>
      )) : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '96px 150px minmax(0,1fr) 110px 120px' : '96px 160px minmax(0,1.2fr) 110px 150px 130px 130px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>單別</div>
            <div>單號</div>
            <div>客戶 / 發票</div>
            <div>日期</div>
            <div>業務</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>未稅金額</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總金額</div>}
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '96px 150px minmax(0,1fr) 110px 120px' : '96px 160px minmax(0,1.2fr) 110px 150px 130px 130px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <div>{row.doc_type === 'return' ? <span style={S.tag('red')}>退貨</span> : <span style={S.tag('green')}>銷貨</span>}</div>
              {row.doc_type === 'return' ? (
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.doc_no}</div>
              ) : (
                <button
                  onClick={() => setSelectedSlipNumber(row.doc_no)}
                  style={{ background: 'none', border: 0, padding: 0, fontSize: 12, color: '#1976f3', fontWeight: 700, textAlign: 'left', cursor: 'pointer', ...S.mono }}
                >
                  {row.doc_no}
                </button>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.6 }}>
                  <span style={{ color: '#7b889b', ...S.mono }}>INVOICE</span> {row.invoice_no || '-'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.doc_date || '-'}</div>
              <div style={{ fontSize: 12, color: '#617084' }}>{row.sales_name || '-'}</div>
              {!isTablet && <div style={{ fontSize: 13, color: '#1c2740', textAlign: 'right', ...S.mono }}>{fmtP(row.amount)}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{fmtP(row.total_amount)}</div>}
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, dateFrom, dateTo, pageSize)}
        onLimitChange={(nextLimit) => {
          setPageSize(nextLimit);
          load(1, search, dateFrom, dateTo, nextLimit);
        }}
      />
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}

/* ========================================= PROFIT ANALYSIS ========================================= */
function ProfitAnalysis() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const initialRange = getPresetDateRange('today');
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { amount: 0, cost: 0, gross_profit: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [rangePreset, setRangePreset] = useState('today');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, from = dateFrom, to = dateTo, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({
        action: 'profit_analysis',
        page: String(page),
        limit: String(limit),
        search: q,
        date_from: from,
        date_to: to,
      });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, pageSize]);

  useEffect(() => { load(); }, []);
  const applyPreset = (preset) => {
    if (preset === 'custom') {
      setRangePreset('custom');
      return;
    }
    const range = getPresetDateRange(preset);
    setRangePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    load(1, search, range.from, range.to, pageSize);
  };

  const marginPct = data.summary?.amount ? `${((data.summary.gross_profit / data.summary.amount) * 100).toFixed(1)}%` : '-';

  return (
    <div>
      <PageLead
        eyebrow="Profit"
        title="利潤分析"
        description="查看銷貨利潤彙總、成本與毛利，方便先做營運分析與排行基礎。"
        action={<CsvImportButton datasetId="erp_profit_analysis" onImported={() => load(1, search, dateFrom, dateTo, pageSize)} compact />}
      />
      <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, dateFrom, dateTo, pageSize)} placeholder="搜尋客戶、單號或業務..." style={{ ...S.input, flex: 1 }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={S.btnPrimary}>搜尋</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['today', '今日'],
            ['week', '週'],
            ['month', '月'],
            ['quarter', '季'],
            ['year', '年'],
            ['custom', '自選'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => applyPreset(value)}
              style={{
                ...S.btnGhost,
                padding: '6px 12px',
                fontSize: 12,
                background: rangePreset === value ? '#edf5ff' : '#fff',
                borderColor: rangePreset === value ? '#94c3ff' : '#dbe3ee',
                color: rangePreset === value ? '#1976f3' : '#5b6779',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input type="date" value={dateFrom} onChange={(e) => { setRangePreset('custom'); setDateFrom(e.target.value); }} style={{ ...S.input, maxWidth: isMobile ? '100%' : 180 }} />
          <input type="date" value={dateTo} onChange={(e) => { setRangePreset('custom'); setDateTo(e.target.value); }} style={{ ...S.input, maxWidth: isMobile ? '100%' : 180 }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={S.btnGhost}>套用區間</button>
          <button onClick={() => applyPreset('today')} style={S.btnGhost}>回到今日</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_profit_analysis` 資料表，請先跑 [`docs/erp-auxiliary-tables.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-auxiliary-tables.sql) 再匯入利潤分析 CSV。</div>}
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>
        共 {fmt(data.total)} 筆分析資料{dateFrom || dateTo ? ` · ${dateFrom || '...'} → ${dateTo || '...'}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="SALES" label="銷貨金額" value={fmtP(data.summary?.amount)} tone="blue" />
        <StatCard code="COST" label="成本" value={fmtP(data.summary?.cost)} tone="yellow" />
        <StatCard code="GP" label="毛利" value={fmtP(data.summary?.gross_profit)} tone="green" />
        <StatCard code="GM" label="毛利率" value={marginPct} tone="red" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有利潤分析資料" /> : isMobile ? data.rows.map((row) => (
        <div key={row.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{row.customer_name || '未命名客戶'}</div>
              <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.7 }}>
                <div>
                  <span style={{ color: '#7b889b', ...S.mono }}>DOC</span>{' '}
                  {row.doc_no ? (
                    <button
                      onClick={() => setSelectedSlipNumber(row.doc_no)}
                      style={{ background: 'none', border: 0, padding: 0, color: '#1976f3', fontWeight: 700, cursor: 'pointer', ...S.mono }}
                    >
                      {row.doc_no}
                    </button>
                  ) : '-'}
                </div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>DATE</span> {row.doc_date || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>SALES</span> {row.sales_name || '-'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>AMOUNT</div>
                <div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{fmtP(row.amount)}</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>COST</div>
                <div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{fmtP(row.cost)}</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>GROSS</div>
                <div style={{ fontSize: 14, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(row.gross_profit)}</div>
              </div>
            </div>
          </div>
        </div>
      )) : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1.2fr) 120px 120px 120px' : 'minmax(0,1.4fr) 110px 140px 140px 140px 120px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>客戶 / 單號</div>
            {!isTablet && <div>日期</div>}
            {!isTablet && <div>業務</div>}
            <div style={{ textAlign: 'right' }}>銷貨金額</div>
            <div style={{ textAlign: 'right' }}>成本</div>
            <div style={{ textAlign: 'right' }}>毛利</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>毛利率</div>}
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1.2fr) 120px 120px 120px' : 'minmax(0,1.4fr) 110px 140px 140px 140px 120px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.6 }}>
                  <span style={{ color: '#7b889b', ...S.mono }}>DOC</span>{' '}
                  {row.doc_no ? (
                    <button
                      onClick={() => setSelectedSlipNumber(row.doc_no)}
                      style={{ background: 'none', border: 0, padding: 0, color: '#1976f3', fontWeight: 700, cursor: 'pointer', ...S.mono }}
                    >
                      {row.doc_no}
                    </button>
                  ) : '-'}
                  {isTablet ? ` · ${row.doc_date || '-'}` : ''}
                </div>
              </div>
              {!isTablet && <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.doc_date || '-'}</div>}
              {!isTablet && <div style={{ fontSize: 12, color: '#617084' }}>{row.sales_name || '-'}</div>}
              <div style={{ fontSize: 13, color: '#1c2740', textAlign: 'right', ...S.mono }}>{fmtP(row.amount)}</div>
              <div style={{ fontSize: 13, color: '#1c2740', textAlign: 'right', ...S.mono }}>{fmtP(row.cost)}</div>
              <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{fmtP(row.gross_profit)}</div>
              {!isTablet && <div style={{ fontSize: 12, color: '#617084', textAlign: 'right', ...S.mono }}>{row.gross_margin || '-'}</div>}
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, dateFrom, dateTo, pageSize)}
        onLimitChange={(nextLimit) => {
          setPageSize(nextLimit);
          load(1, search, dateFrom, dateTo, nextLimit);
        }}
      />
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}

/* ========================================= IMPORT CENTER ========================================= */
function ImportCenter() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'import_history' });
      setHistory(result.history || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const resetBusinessData = useCallback(async () => {
    const confirmation = typeof window === 'undefined'
      ? ''
      : window.prompt('這會清空 ERP 主資料、交易資料、銷貨/報表資料，但保留 LINE 與系統設定。\n\n請輸入 RESET ERP 確認：', '');

    if (confirmation !== 'RESET ERP') {
      setResetStatus('已取消清空作業');
      return;
    }

    setResetting(true);
    setResetStatus('');

    try {
      const result = await apiPost({ action: 'reset_erp_business_data', confirmation });
      setResetStatus(`已清空 ${fmt((result.cleared_tables || []).length)} 張 ERP 業務資料表`);
      await loadHistory();
    } catch (error) {
      setResetStatus(error.message || '清空作業失敗');
    } finally {
      setResetting(false);
    }
  }, [loadHistory]);

  return (
    <div>
      <PageLead eyebrow="Import" title="資料匯入" description="直接從後台匯入 CSV 或 Excel，不用再進 Supabase Table Editor。支援我們整理好的 import-ready CSV，也支援原始 .xlsx 檔案。" />
      <div style={{ ...S.card, marginBottom: 18, background: '#fff8eb', borderColor: '#f7d699' }}>
        <PanelHeader title="安全重置" meta="交付新店或重新初始化前，可先清空 ERP 業務資料。這個動作會保留 LINE 客戶、訊息、系統設定與匯入歷史。" badge={<div style={S.tag('red')}>Danger Zone</div>} />
        {resetStatus ? (
          <div style={{ ...S.panelMuted, marginBottom: 12, background: resetStatus.includes('已清空') ? '#edf9f2' : '#fff4f4', borderColor: resetStatus.includes('已清空') ? '#bdeccb' : '#ffc7cf', color: resetStatus.includes('已清空') ? '#127248' : '#d1435b' }}>
            {resetStatus}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: '#8a5b00', lineHeight: 1.8 }}>
            清空範圍：商品、正式客戶、廠商、報價、訂單、銷貨、銷退貨、利潤分析。
            <br />
            保留範圍：LINE 客戶、LINE 訊息、系統設定、AI Prompt、匯入歷史。
          </div>
          <button onClick={resetBusinessData} disabled={resetting} style={{ ...S.btnGhost, borderColor: '#f0b86d', color: '#8a5b00', background: '#fff' }}>
            {resetting ? '清空中...' : '清空 ERP 業務資料'}
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        {Object.entries(IMPORT_DATASETS).map(([datasetId, dataset]) => (
          <div key={datasetId} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 16, color: '#1c2740', fontWeight: 700 }}>{dataset.title}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 6, lineHeight: 1.7 }}>{dataset.desc}</div>
                <div style={{ fontSize: 11, color: '#7b889b', marginTop: 8, ...S.mono }}>{dataset.fields}</div>
              </div>
              <div style={{ minWidth: 150, textAlign: 'right' }}>
                <CsvImportButton datasetId={datasetId} onImported={loadHistory} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginTop: 18 }}>
        <PanelHeader title="匯入歷史" meta="保留最近的資料更換紀錄，方便回查誰在什麼時候換過哪一包資料。" badge={<div style={{ ...S.tag('') }}>{fmt(history.length)} 筆</div>} />
        {loading ? <Loading /> : history.length === 0 ? <EmptyState text="目前還沒有匯入紀錄" /> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {history.map((entry, index) => {
              const dataset = IMPORT_DATASETS[entry.dataset];
              return (
                <div key={`${entry.imported_at || 'history'}-${index}`} style={{ ...S.panelMuted, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 700 }}>
                      {dataset?.title || entry.dataset || '未知資料集'}
                    </div>
                    <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>{fmtDate(entry.imported_at)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.7 }}>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>FILE</span> {entry.file_name || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>ROWS</span> {fmt(entry.count || 0)} 筆</div>
                    {'inserted' in entry || 'updated' in entry ? (
                      <div><span style={{ color: '#7b889b', ...S.mono }}>DETAIL</span> 新增 {fmt(entry.inserted || 0)} / 更新 {fmt(entry.updated || 0)}</div>
                    ) : null}
                    <div><span style={{ color: '#7b889b', ...S.mono }}>BY</span> {entry.imported_by || 'admin'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================================= AI PROMPT 設定 ========================================= */
function AIPrompt() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiGet({ action: 'ai_prompt' })
      .then((data) => { setPrompt(data.prompt || ''); })
      .finally(() => setLoading(false));
    Promise.all([
      apiGet({ action: 'chat_history_stats' }),
      apiGet({ action: 'stats' }),
    ]).then(([history, dashboard]) => {
      setStats({
        chatHistory: history.total || 0,
        aiMessages: dashboard.total_messages || 0,
      });
    });
  }, []);

  const save = async () => {
    await apiPost({ action: 'update_ai_prompt', prompt });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <Loading />;
  return (
    <div>
      <PageLead eyebrow="Prompt" title="AI Prompt 設定" description="調整 Bot 的回覆風格與客服 SOP，這裡的內容會直接影響下一次對話生成。" />

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard code="HIST" label="歷史對話" value={fmt(stats.chatHistory)} sub="匯入的 Line 對話" accent="#06c755" />
          <StatCard code="AI" label="AI 回覆" value={fmt(stats.aiMessages)} sub="Bot 自動回覆" accent="#10b981" />
        </div>
      )}

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>AI_SYSTEM_PROMPT</div>
          <div style={{ ...S.tag('green') }}>Claude Sonnet</div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={S.label}>AI 回覆的 System Prompt — 控制 Bot 的回覆風格和行為</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={20}
            style={{ ...S.input, resize: 'vertical', ...S.mono, fontSize: 12, lineHeight: 1.8 }}
            placeholder="輸入 AI 的 system prompt..."
          />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row' }}>
          <button onClick={save} style={{ ...S.btnPrimary, flex: 1, background: saved ? '#22c55e' : '#10b981', transition: 'background 0.3s', padding: '11px 0', fontSize: 14 }}>{saved ? '✓ SAVED' : '儲存 Prompt'}</button>
          <div style={{ fontSize: 11, color: '#6f7d90', ...S.mono }}>{prompt.length} 字</div>
        </div>
      </div>

      <div style={{ ...S.card, borderColor: '#dbe3ee' }}>
        <div style={{ color: '#6f7d90', fontSize: 11, lineHeight: 1.9, ...S.mono }}>
          <span style={{ color: '#4f6178' }}>// 使用說明</span><br/>
          // 修改後立即生效，AI 下次回覆就會套用新 prompt<br/>
          // 建議包含：角色設定、回覆風格、報價格式、SOP 流程<br/>
          // 可從「歷史對話」分頁參考真人客服的回覆方式<br/>
          // prompt 越精確，AI 回覆品質越好
        </div>
      </div>
    </div>
  );
}

/* ========================================= LINE 歷史對話 ========================================= */
function ChatHistory() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState(null);
  const PAGE_SIZE = 30;

  const load = useCallback(async (q = search, pg = 0) => {
    setLoading(true);
    const data = await apiGet({
      action: 'chat_history',
      search: q,
      page: String(pg),
      limit: String(PAGE_SIZE),
    });
    setMessages(data.messages || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    load();
    apiGet({ action: 'chat_history_stats' }).then(setStats);
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const goPage = (pg) => { setPage(pg); load(search, pg); };

  return (
    <div>
      <PageLead eyebrow="LINE Archive" title="歷史對話" description="檢視匯入的 LINE 對話資料，方便回顧真人客服風格與客戶常見需求。" />

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard code="TOTAL" label="總訊息數" value={fmt(stats.total)} sub="all messages" accent="#06c755" />
          <StatCard code="USER" label="客戶訊息" value={fmt(stats.user)} sub="from customers" accent="#06c755" />
          <StatCard code="ACCT" label="官方回覆" value={fmt(stats.account)} sub="from staff" accent="#06c755" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(0); load(search, 0); } }} placeholder="搜尋對話內容、客戶名稱、客服名稱..." style={{ ...S.input, flex: 1 }} onFocus={e => e.target.style.borderColor = '#06c755'} onBlur={e => e.target.style.borderColor = '#ccd6e3'} />
        <button onClick={() => { setPage(0); load(search, 0); }} style={S.btnLine}>搜尋</button>
      </div>

      <div style={{ fontSize: 11, color: '#6f7d90', marginBottom: 12, ...S.mono }}>共 {fmt(total)} 筆 {totalPages > 1 && `· P${page + 1}/${totalPages}`}</div>

      {loading ? <Loading /> : messages.length === 0 ? <EmptyState text="沒有找到對話記錄" /> : messages.map(msg => (
        <div key={msg.id} style={{ ...S.card, padding: '12px 18px', marginBottom: 6, borderLeftColor: msg.sender_type === 'User' ? '#3b82f6' : '#06c755', borderLeftWidth: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 6, flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={S.tag(msg.sender_type === 'User' ? '' : 'line')}>{msg.sender_type === 'User' ? '客戶' : '客服'}</span>
              <span style={{ fontSize: 12, color: '#2b3750' }}>{msg.display_name}</span>
              {msg.sender_name && msg.sender_type === 'Account' && <span style={{ fontSize: 11, color: '#7c899b' }}>({msg.sender_name})</span>}
            </div>
            <span style={{ color: '#7b889b', fontSize: 11, ...S.mono }}>{msg.message_date} {msg.message_time}</span>
          </div>
          <div style={{ fontSize: 13, color: msg.sender_type === 'User' ? '#2b3750' : '#129c59', lineHeight: 1.6 }}>{msg.content}</div>
        </div>
      ))}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
          {page > 0 && <button onClick={() => goPage(page - 1)} style={S.btnGhost}>← 上一頁</button>}
          <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page + 1}/{totalPages}</span>
          {page < totalPages - 1 && <button onClick={() => goPage(page + 1)} style={S.btnGhost}>下一頁 →</button>}
        </div>
      )}
    </div>
  );
}

/* ========================================= SIDEBAR & LAYOUT ========================================= */
const SECTIONS = [
  {
    title: 'ERP 總覽',
    tabs: [
      { id: 'env_health', label: '環境檢查', code: 'HEAL' },
      { id: 'report_center', label: '進銷存報表', code: 'A1' },
      { id: 'dashboard', label: '儀表板', code: 'DASH' },
    ],
  },
  {
    title: 'ERP 主檔資料',
    tabs: [
      { id: 'customers', label: '客戶主檔', code: 'CUST' },
      { id: 'products', label: '產品查價', code: 'SRCH' },
      { id: 'vendors', label: '廠商主檔', code: 'VNDR' },
      { id: 'line_customers', label: 'LINE 客戶', code: 'LINE' },
    ],
  },
  {
    title: 'ERP 交易作業',
    tabs: [
      { id: 'quotes', label: '報價單', code: 'QUOT' },
      { id: 'orders', label: '訂單', code: 'ORDR' },
      { id: 'sales_documents', label: '銷貨單', code: 'SALE' },
      { id: 'promotions', label: '活動管理', code: 'PRMO' },
      { id: 'pricing', label: '報價規則', code: 'PRCE' },
    ],
  },
  {
    title: 'ERP 分析報表',
    tabs: [
      { id: 'sales_returns', label: '銷退貨彙總', code: 'RETN' },
      { id: 'profit_analysis', label: '利潤分析', code: 'PFT' },
      { id: 'imports', label: '資料匯入', code: 'IMPT' },
    ],
  },
  {
    title: 'LINE 與系統',
    accent: '#06c755',
    tabs: [
      { id: 'messages', label: 'AI 對話紀錄', code: 'MSG' },
      { id: 'ai_prompt', label: 'AI Prompt 設定', code: 'AI' },
      { id: 'chat_history', label: '歷史對話', code: 'HIST' },
    ],
  },
];

const TAB_COMPONENTS = {
  env_health: EnvHealth,
  report_center: ReportCenter,
  dashboard: Dashboard,
  customers: FormalCustomers,
  line_customers: Customers,
  quotes: Quotes,
  orders: Orders,
  sales_documents: SalesDocuments,
  messages: Messages,
  products: ProductSearch,
  imports: ImportCenter,
  vendors: Vendors,
  sales_returns: SalesReturns,
  profit_analysis: ProfitAnalysis,
  promotions: Promotions,
  pricing: PricingRules,
  ai_prompt: AIPrompt,
  chat_history: ChatHistory,
};

export default function AdminPage() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [token, setToken] = useState('');
  const [isAuthed, setIsAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState('report_center');
  const ActiveTab = TAB_COMPONENTS[tab] || Dashboard;

  useEffect(() => {
    const saved = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (saved) {
      setToken(saved);
      setAuthLoading(true);
      apiGet({ action: 'stats' })
        .then(() => {
          setIsAuthed(true);
          setAuthError('');
        })
        .catch((error) => {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          setAuthError(error.message || '登入失敗，請重新輸入 Token');
        })
        .finally(() => setAuthLoading(false));
    }
  }, []);

  const login = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setAuthLoading(true);
    setAuthError('');
    window.localStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
    try {
      await apiGet({ action: 'stats' });
      setIsAuthed(true);
    } catch (error) {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
      setAuthError(error.message || '登入失敗，請確認 Token');
      setIsAuthed(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAuthed(false);
    setToken('');
    setAuthError('');
  };

  if (!isAuthed) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #0f1729 0%, #18253a 52%, #243b5a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 460, background: 'rgba(9,14,24,0.82)', borderRadius: 18, padding: '26px 28px', color: '#fff', boxShadow: '0 28px 60px rgba(4,10,20,0.42), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
          <div style={{ color: '#27d3a2', fontWeight: 700, fontSize: 15, letterSpacing: 1.5, ...S.mono, marginBottom: 10 }}>QB ADMIN</div>
          <div style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>管理後台登入</div>
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, marginBottom: 18, lineHeight: 1.7 }}>請輸入管理後台 Token，進入查價、活動管理與對話監控介面。</div>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            placeholder="ADMIN_TOKEN"
            style={{ ...S.input, background: 'rgba(5,10,18,0.78)', borderColor: 'rgba(255,255,255,0.08)', color: '#fff' }}
          />
          {authError && <div style={{ color: '#f87171', fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>{authError}</div>}
          <button onClick={login} disabled={authLoading} style={{ ...S.btnPrimary, width: '100%', marginTop: 14, opacity: authLoading ? 0.7 : 1, cursor: authLoading ? 'wait' : 'pointer' }}>
            {authLoading ? '驗證中...' : '進入後台'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`
        html,body{background:#0f1729!important;margin:0;padding:0}
        body > div:first-child{min-height:100vh;background:#0f1729}
        *{box-sizing:border-box}
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ ...S.shell, flexDirection: isTablet ? 'column' : 'row' }}>
        <div style={{ ...S.sidebar, width: isTablet ? '100%' : S.sidebar.width, height: isTablet ? 'auto' : S.sidebar.height, position: isTablet ? 'relative' : S.sidebar.position }}>
          <div style={{ padding: '0 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #2da5ff 0%, #1f7cff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, ...S.mono }}>QB</div>
              <div>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Quick Buy</div>
                <div style={{ color: '#8fa2bd', fontSize: 11, ...S.mono }}>Admin Console v2.0</div>
              </div>
            </div>
          </div>
          {SECTIONS.map((section, si) => (
            <div key={section.title}>
              <div style={{ padding: '14px 20px 8px', borderTop: si > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', marginTop: si > 0 ? 8 : 0 }}>
                <div style={{ fontSize: 10, color: section.accent || '#70829c', ...S.mono, letterSpacing: 1.2 }}>{section.title}</div>
              </div>
              <div style={{ display: isTablet ? 'grid' : 'block', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {section.tabs.map(t => (
                <div
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '11px 20px',
                    cursor: 'pointer',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: tab === t.id ? '#ffffff' : '#9eb0c9',
                    background: tab === t.id ? 'linear-gradient(90deg, rgba(45,140,255,0.28) 0%, rgba(45,140,255,0.08) 100%)' : 'transparent',
                    borderLeft: `3px solid ${tab === t.id ? (section.accent || '#2d8cff') : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 10, color: tab === t.id ? '#8fd1ff' : '#61748f', ...S.mono, width: 40 }}>{t.code}</span>
                  {t.label}
                </div>
              ))}
              </div>
            </div>
          ))}

          <div style={{ padding: '18px 20px 0', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 14 }}>
            <div style={{ fontSize: 10, color: '#70829c', ...S.mono, marginBottom: 10 }}>SYSTEM</div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, fontSize: 11, color: '#b7c4d8' }}>
              <div style={{ padding: '4px 0' }}>產品：120,956</div>
              <div style={{ padding: '4px 0' }}>歷史對話：86,261</div>
              <div style={{ padding: '4px 0' }}>Webhook：<span style={{ color: '#62df97' }}>ON</span></div>
              <div style={{ padding: '4px 0' }}>LIFF：<span style={{ color: '#62df97' }}>ON</span></div>
            </div>
          </div>
        </div>

        <div style={S.main}>
          <div style={S.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{ width: 12, height: 12, borderRadius: 999, background: '#2d8cff' }} />
              <div>
                <div style={{ color: '#172337', fontWeight: 700, fontSize: 15 }}>Quick Buy 管理後台</div>
                {!isMobile && <div style={{ color: '#7b889b', fontSize: 11 }}>Sales, inquiry monitoring and knowledge operations</div>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!isMobile && <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>main / {tab}</div>}
              <button onClick={logout} style={{ ...S.btnGhost, padding: '7px 12px', fontSize: 11 }}>登出</button>
            </div>
          </div>

          <div style={{ ...S.content, padding: isMobile ? '18px 14px 30px' : isTablet ? '22px 18px 34px' : S.content.padding }}>
            <ActiveTab setTab={setTab} />
          </div>
        </div>
      </div>
    </div>
  );
}
