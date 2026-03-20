'use client';
import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { apiPost } from './api';

export function parseCsvLine(line) {
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

export function parseCsvText(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

export function normalizeSpreadsheetRows(rows) {
  return rows.filter((row) => Object.values(row || {}).some((value) => String(value ?? '').trim() !== ''));
}

export function mapCustomerStage(customerType) {
  const text = String(customerType || '').trim();
  if (text.includes('正式')) return 'customer';
  if (['潛在', '詢價', '準客'].some((keyword) => text.includes(keyword))) return 'prospect';
  return 'lead';
}

export function buildCustomerNotes(row) {
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

export function buildProductDescription(row) {
  return [row['品名'], row['規格一'], row['規格二']].filter(Boolean).join(' ').trim();
}

export function buildProductSearchText(row) {
  return [row['品號'], row['品名'], row['規格一'], row['規格二'], row['商品分類'], row['主供應商']].filter(Boolean).join(' ').trim();
}

export function mapRowsForDataset(datasetId, rows) {
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

export const IMPORT_DATASETS = {
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

export const IMPORT_BATCH_SIZE = {
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

export function useCsvImport(datasetId, onImported) {
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
