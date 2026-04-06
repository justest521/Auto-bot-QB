'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { apiGet, apiPost } from './api';

export const fmt = n => n?.toLocaleString('zh-TW') || '0';
export const fmtMs = ms => !ms ? '-' : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
export const fmtDate = d => d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
export const fmtP = n => n ? `NT$${Number(n).toLocaleString()}` : '-';

// ── CSV Export utility ──
export function exportCsv(rows, columns, filename) {
  if (!rows || rows.length === 0) { alert('沒有可匯出的資料'); return; }
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(r => columns.map(c => {
    let v = typeof c.key === 'function' ? c.key(r) : (r[c.key] ?? '');
    v = String(v).replace(/"/g, '""');
    return `"${v}"`;
  }).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'export.csv';
  a.click(); URL.revokeObjectURL(url);
}

export function todayInTaipei() {
  const now = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return new Date(taipei.getFullYear(), taipei.getMonth(), taipei.getDate());
}

export function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPresetDateRange(preset) {
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

export function useViewportWidth() {
  const [width, setWidth] = useState(1400);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return width;
}

/**
 * useResponsive — 回傳 { width, isMobile, isTablet, isDesktop }
 * 統一斷點: mobile < 820, tablet < 1180
 */
export function useResponsive() {
  const width = useViewportWidth();
  return {
    width,
    isMobile: width < 820,
    isTablet: width >= 820 && width < 1180,
    isDesktop: width >= 1180,
  };
}

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
    return rows.map((row) => {
      const mapped = {
        customer_code: row.customer_code ?? row['客戶代號'] ?? '',
        name: row.name ?? row['主聯絡人'] ?? row['客戶簡稱'] ?? '',
        company_name: row.company_name ?? row['客戶簡稱'] ?? '',
        full_name: row.full_name ?? row['客戶全名'] ?? row['客戶全稱'] ?? '',
        phone: row.phone ?? row['電話'] ?? '',
        fax: row.fax ?? row['傳真'] ?? '',
        mobile: row.mobile ?? row['手機'] ?? '',
        email: row.email ?? row['Email'] ?? row['電子信箱'] ?? '',
        tax_id: row.tax_id ?? row['統一編號'] ?? '',
        job_title: row.job_title ?? row['職稱'] ?? '',
        sales_person: row.sales_person ?? row['業務'] ?? row['業務姓名'] ?? row['負責業務'] ?? '',
        billing_customer: row.billing_customer ?? row['請款客戶'] ?? '',
        discount_percent: row.discount_percent ?? row['固定折扣'] ?? row['折扣%'] ?? '',
        stop_date: row.stop_date ?? row['停止往來日'] ?? '',
        // 發票載具
        invoice_email: row.invoice_email ?? row['發票通知Email'] ?? '',
        invoice_mobile: row.invoice_mobile ?? row['發票通知手機'] ?? '',
        carrier_type: row.carrier_type ?? row['載具類別'] ?? '',
        carrier_code: row.carrier_code ?? row['載具顯碼'] ?? row['會員載具顯碼'] ?? '',
        bank_account: row.bank_account ?? row['匯款帳號'] ?? '',
        // 結帳收款
        payment_method: row.payment_method ?? row['結帳方式'] ?? '',
        payment_days: row.payment_days ?? row['結帳天數'] ?? row['付款天數'] ?? '',
        monthly_closing_day: row.monthly_closing_day ?? row['月結日'] ?? '',
        collection_method: row.collection_method ?? row['收款方式'] ?? '',
        collection_day: row.collection_day ?? row['收款日'] ?? '',
        // 地址
        address: row.address ?? row['送貨地址'] ?? row['地址'] ?? '',
        registered_address: row.registered_address ?? row['登記地址'] ?? row['公司地址'] ?? '',
        invoice_address: row.invoice_address ?? row['發票地址'] ?? '',
        shipping_address: row.shipping_address ?? row['送貨地址'] ?? '',
        business_address: row.business_address ?? row['營業地址'] ?? '',
        // 系統
        source: row.source ?? 'import',
        display_name: row.display_name ?? row['客戶簡稱'] ?? '',
        customer_stage: row.customer_stage ?? mapCustomerStage(row['客戶類型']),
        status: row.status ?? 'active',
        notes: row.notes ?? buildCustomerNotes(row),
      };
      // 清除空字串，避免覆蓋既有資料
      Object.keys(mapped).forEach(k => { if (mapped[k] === '') delete mapped[k]; });
      // customer_code 和 company_name 必須保留
      if (!mapped.customer_code) mapped.customer_code = '';
      if (!mapped.company_name) mapped.company_name = row['客戶簡稱'] ?? '';
      return mapped;
    });
  }

  if (datasetId === 'erp_vendors') {
    return rows.map((row) => ({
      vendor_code: row.vendor_code ?? row['廠商代號'] ?? '',
      vendor_name: row.vendor_name ?? row['廠商簡稱'] ?? row['廠商全名'] ?? '',
      phone: row.phone ?? row['電話'] ?? '',
      fax: row.fax ?? row['傳真'] ?? '',
      contact_name: row.contact_name ?? row['聯絡人'] ?? '',
      contact_title: row.contact_title ?? row['職稱'] ?? '',
      mobile: row.mobile ?? row['手機'] ?? '',
      address: row.address ?? row['營業地址'] ?? row['地址'] ?? '',
      tax_id: row.tax_id ?? row['統一編號'] ?? '',
      email: row.email ?? row['Email'] ?? row['電子信箱'] ?? '',
    }));
  }

  if (datasetId === 'quickbuy_products') {
    return rows.map((row) => ({
      item_number: row.item_number ?? row['ITEM_NUMBER'] ?? row['品號'] ?? row['料號'] ?? row['ITEM_NO'] ?? row['Item Number'] ?? row['Part Number'] ?? '',
      description: row.description ?? row['DESCRIPTION'] ?? row['品名'] ?? row['商品名稱'] ?? row['Description'] ?? buildProductDescription(row),
      tw_retail_price: row.tw_retail_price ?? row['2026 台灣牌價'] ?? row['台灣牌價'] ?? row['零售價'] ?? row['牌價'] ?? row['定價'] ?? row['Retail Price'] ?? row['LIST PRICE'] ?? 0,
      tw_reseller_price: row.tw_reseller_price ?? row['2026 經銷商價'] ?? row['經銷商價'] ?? row['經銷價'] ?? row['成本價'] ?? row['進貨價'] ?? row['優惠價'] ?? row['DEALER PRICE'] ?? 0,
      us_price: row.us_price ?? row['美國牌價'] ?? row['2026 美國原價'] ?? row['美國原價'] ?? row['2026 美金價'] ?? row['美金價'] ?? row['US Price'] ?? row['US_PRICE'] ?? row['USD'] ?? row['US LIST'] ?? 0,
      product_status: row.product_status ?? row['產品狀態'] ?? row['狀態'] ?? 'Current',
      category: row.category ?? row['商品分類'] ?? row['分類'] ?? row['類別'] ?? 'other',
      replacement_model: row.replacement_model ?? row['替代型號'] ?? row['Replacement'] ?? '',
      weight_kg: row.weight_kg ?? row['WEIGHT_KG'] ?? row['單位淨重'] ?? row['重量'] ?? row['Weight'] ?? 0,
      origin_country: row.origin_country ?? row['產地'] ?? row['Origin'] ?? '',
      commodity_code: row.commodity_code ?? row['COMMODITY_CODE'] ?? '',
      stock_qty: row.stock_qty ?? row['庫存數量'] ?? row['庫存量'] ?? row['現有庫存'] ?? row['庫存'] ?? row['數量'] ?? 0,
      safety_stock: row.safety_stock ?? row['安全庫存'] ?? row['安全水位'] ?? row['安全存量'] ?? 0,
      cost_price: row.cost_price ?? row['成本'] ?? row['進貨成本'] ?? row['最近成本'] ?? row['平均成本'] ?? 0,
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

  if (datasetId === 'erp_purchase_orders') {
    return rows.map((row) => ({
      po_number: row.po_number ?? row['採購單號'] ?? row['單號'] ?? '',
      vendor_id: null, // will be resolved by backend
      _vendor_code: row.vendor_code ?? row['廠商代號'] ?? '',
      po_date: row.po_date ?? row['採購日期'] ?? row['日期'] ?? '',
      expected_date: row.expected_date ?? row['預交日期'] ?? row['交貨日期'] ?? '',
      status: row.status ?? row['狀態'] ?? 'confirmed',
      subtotal: row.subtotal ?? row['未稅金額'] ?? row['小計'] ?? 0,
      tax_amount: row.tax_amount ?? row['稅額'] ?? 0,
      total_amount: row.total_amount ?? row['總金額'] ?? row['合計'] ?? 0,
      currency: row.currency ?? row['幣別'] ?? 'TWD',
      exchange_rate: row.exchange_rate ?? row['匯率'] ?? 1,
      remark: row.remark ?? row['備註'] ?? '',
    }));
  }

  if (datasetId === 'erp_stock_ins') {
    return rows.map((row) => ({
      grn_number: row.grn_number ?? row['進貨單號'] ?? row['單號'] ?? '',
      vendor_id: null,
      _vendor_code: row.vendor_code ?? row['廠商代號'] ?? '',
      grn_date: row.grn_date ?? row['進貨日期'] ?? row['日期'] ?? '',
      po_number: row.po_number ?? row['採購單號'] ?? '',
      status: row.status ?? row['狀態'] ?? 'confirmed',
      subtotal: row.subtotal ?? row['未稅金額'] ?? row['小計'] ?? 0,
      tax_amount: row.tax_amount ?? row['稅額'] ?? 0,
      total_amount: row.total_amount ?? row['總金額'] ?? row['合計'] ?? 0,
      currency: row.currency ?? row['幣別'] ?? 'TWD',
      exchange_rate: row.exchange_rate ?? row['匯率'] ?? 1,
      remark: row.remark ?? row['備註'] ?? '',
    }));
  }

  if (datasetId === 'erp_invoices') {
    return rows.map((row) => ({
      invoice_number: row.invoice_number ?? row['發票號碼'] ?? '',
      invoice_date: row.invoice_date ?? row['發票日期'] ?? row['日期'] ?? '',
      invoice_type: row.invoice_type ?? row['發票類別'] ?? row['類別'] ?? '',
      customer_name: row.customer_name ?? row['客戶簡稱'] ?? row['客戶名稱'] ?? '',
      tax_id: row.tax_id ?? row['統一編號'] ?? '',
      amount: row.amount ?? row['未稅金額'] ?? row['銷售額'] ?? 0,
      tax_amount: row.tax_amount ?? row['稅額'] ?? 0,
      total_amount: row.total_amount ?? row['總額'] ?? row['合計'] ?? 0,
      status: row.status ?? row['狀態'] ?? 'issued',
      direction: row.direction ?? row['方向'] ?? (row['類別'] === '進項' ? 'in' : 'out'),
      remark: row.remark ?? row['備註'] ?? '',
    }));
  }

  if (datasetId === 'qb_inventory_movements') {
    return rows.map((row) => ({
      product_id: null, // will be resolved by backend
      _item_number: row.item_number ?? row['品號'] ?? '',
      movement_date: row.movement_date ?? row['異動日期'] ?? row['日期'] ?? '',
      movement_type: row.movement_type ?? row['異動類別'] ?? row['類別'] ?? '',
      quantity: row.quantity ?? row['數量'] ?? 0,
      reference_no: row.reference_no ?? row['單據號碼'] ?? row['單號'] ?? '',
      remark: row.remark ?? row['備註'] ?? '',
    }));
  }

  return rows;
}

export const IMPORT_DATASETS = {
  quickbuy_products: {
    title: '商品資料',
    desc: '直接更新後台查價與 LIFF 搜尋使用的商品資料，含庫存數量與安全庫存。',
    fields: 'item_number(品號), description(品名), tw_retail_price(台灣牌價), tw_reseller_price(經銷商價), stock_qty(庫存數量), safety_stock(安全庫存)...',
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
  erp_purchase_orders: {
    title: '採購單',
    desc: '匯入鼎新 ERP 採購單抬頭資料，追蹤採購進度。',
    fields: '採購單號, 廠商代號, 採購日期, 交貨日期, 金額...',
  },
  erp_stock_ins: {
    title: '進貨單',
    desc: '匯入鼎新 ERP 進貨驗收單，供進貨記錄追蹤。',
    fields: '進貨單號, 廠商代號, 進貨日期, 採購單號, 金額...',
  },
  erp_invoices: {
    title: '發票資料',
    desc: '匯入銷項/進項發票，供發票管理與對帳使用。',
    fields: '發票號碼, 發票日期, 客戶名稱, 金額, 稅額, 類別...',
  },
  qb_inventory_movements: {
    title: '庫存異動',
    desc: '匯入庫存進出異動明細，追蹤每筆庫存變化。',
    fields: '品號, 異動日期, 異動類別, 數量, 單據號碼...',
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
  erp_purchase_orders: 500,
  erp_stock_ins: 500,
  erp_invoices: 600,
  qb_inventory_movements: 800,
};

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
    // 正規化欄位名稱：去除多餘空格、全形空格、前後空白
    // 記錄原始欄位名稱（用於除錯）
    const rawColumns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    const normalizedRows = rawRows.map(row => {
      const newRow = {};
      for (const [key, value] of Object.entries(row)) {
        const normalizedKey = key.replace(/[\u3000]/g, ' ').replace(/\s+/g, ' ').trim();
        newRow[normalizedKey] = value;
      }
      return newRow;
    });
    const mapped = mapRowsForDataset(datasetId, normalizeSpreadsheetRows(normalizedRows));
    // 附加欄位名稱到結果（第一筆帶上原始欄位和第一行值做除錯）
    mapped._rawColumns = rawColumns;
    mapped._sampleRaw = rawRows.length > 0 ? rawRows[0] : {};
    return mapped;
  }

  throw new Error('目前只支援 CSV / XLSX / XLS 檔案');
}

export function useCsvImport(datasetId, onImported) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preparedRows, setPreparedRows] = useState([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [batchProgress, setBatchProgress] = useState(null);
  const [recentImportHint, setRecentImportHint] = useState(null);
  const [rawColumns, setRawColumns] = useState([]);

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
      setRawColumns(rows._rawColumns || []);
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
    rawColumns,
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
