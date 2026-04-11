// app/api/pdf/route.js — 報價單 / 訂單 / 銷貨單 可列印 HTML (Print → PDF)
export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

import { supabase } from '@/lib/supabase';
import { publicLimiter } from '@/lib/security/rate-limit';
import crypto from 'crypto';

const PDF_SECRET = process.env.PDF_SIGN_SECRET || process.env.ADMIN_SECRET || 'qb-pdf-default-secret';

/** Verify HMAC signed URL token */
function verifyPdfToken(type, id, token, exp) {
  if (!token || !exp) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now > Number(exp)) return false; // expired
  const expected = crypto
    .createHmac('sha256', PDF_SECRET)
    .update(`${type}:${id}:${exp}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
}

/** Generate signed URL (called from admin API) */
export function generatePdfSignedParams(type, id, ttlSeconds = 86400) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = crypto
    .createHmac('sha256', PDF_SECRET)
    .update(`${type}:${id}:${exp}`)
    .digest('hex');
  return { token, exp: String(exp) };
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtP(n) {
  const num = Number(n || 0);
  return `NT$${num.toLocaleString()}`;
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function wrapHtml(title, body, logoUrl, companyName) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
  @page { margin: 10mm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif; color: #1c2740; font-size: 12px; line-height: 1.4; padding: 14px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 2px solid #1976f3; padding-bottom: 8px; }
  .header h1 { font-size: 18px; color: #1976f3; }
  .header .company-name { font-size: 14px; font-weight: 700; color: #1c2740; margin-bottom: 2px; }
  .header .logo { max-height: 60px; max-width: 200px; object-fit: contain; margin-bottom: 4px; }
  .header .meta { text-align: right; font-size: 11px; color: #617084; line-height: 1.5; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px; }
  .info-box { background: #f8fbff; border: 1px solid #dbe6f3; border-radius: 6px; padding: 6px 10px; }
  .info-box .label { font-size: 9px; color: #7b889b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 1px; }
  .info-box .value { font-size: 12px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #1976f3; color: #fff; font-size: 10px; font-weight: 700; padding: 5px 8px; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 4px 8px; border-bottom: 1px solid #e5eaf1; font-size: 11px; }
  tr:nth-child(even) td { background: #fafcff; }
  .totals { margin-left: auto; width: 240px; }
  .totals .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
  .totals .row.total { font-size: 14px; font-weight: 700; color: #1976f3; border-top: 2px solid #1976f3; padding-top: 6px; margin-top: 4px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; padding-top: 10px; }
  .sig-block { text-align: center; }
  .sig-block .sig-label { font-size: 11px; color: #617084; font-weight: 700; margin-bottom: 6px; }
  .sig-block .sig-line { border-bottom: 1px solid #1c2740; height: 50px; margin-bottom: 4px; }
  .sig-block .sig-hint { font-size: 9px; color: #9ca3af; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #dbe3ee; font-size: 10px; color: #7b889b; text-align: center; }
  .remark { background: #fffbeb; border: 1px solid #f7d699; border-radius: 6px; padding: 6px 10px; font-size: 11px; color: #8a5b00; margin-bottom: 10px; }
  @media print { body { padding: 0; } .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="no-print" style="text-align:center;margin-bottom:20px;display:flex;justify-content:center;gap:12px;">
  <button onclick="window.print()" style="background:#1976f3;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:700;">列印</button>
  <button id="dlBtn" style="background:#fff;color:#1976f3;border:2px solid #1976f3;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:700;">下載 PDF</button>
</div>
<div id="printArea">
${body}
<div class="footer">Auto QB ERP System — 列印時間 ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><${'/'}script>
<script>
document.getElementById('dlBtn').addEventListener('click', function() {
  var btn = this;
  btn.textContent = '產生中...';
  btn.disabled = true;
  var el = document.getElementById('printArea');
  html2pdf().set({
    margin: 10,
    filename: document.title + '.pdf',
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 1.5, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(el).save().then(function() {
    btn.textContent = '下載 PDF';
    btn.disabled = false;
  }).catch(function(err) {
    console.error('PDF error:', err);
    btn.textContent = '下載失敗，請用列印';
    btn.disabled = false;
  });
});
<${'/'}script>
</body></html>`;
}

export async function GET(req) {
  const rl = publicLimiter(req);
  if (!rl.ok) return rl.response;

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('token');
  const exp = url.searchParams.get('exp');

  if (!type || !id) {
    return new Response('Missing type or id', { status: 400 });
  }

  // Verify HMAC signed token
  if (!verifyPdfToken(type, id, token, exp)) {
    return new Response('Unauthorized: invalid or expired link', { status: 403 });
  }

  try {
    // Fetch company settings (logo, name, etc.)
    const { data: configRow } = await supabase.from('quickbuy_config').select('value').eq('key', 'company_settings').maybeSingle();
    const cs = configRow?.value || {};
    const logoUrl = cs.logo_url || '';

    if (type === 'quote') {
      const { data: quote } = await supabase.from('erp_quotes').select('*').eq('id', id).single();
      if (!quote) return new Response('Quote not found', { status: 404 });

      const { data: items } = await supabase.from('erp_quote_items').select('*').eq('quote_id', id).order('id');
      const { data: customer } = quote.customer_id
        ? await supabase.from('erp_customers').select('name,company_name,phone,email,address,tax_id').eq('id', quote.customer_id).maybeSingle()
        : { data: null };

      const html = wrapHtml(`報價單 ${quote.quote_no}`, `
        <div class="header">
          <div>${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" crossorigin="anonymous" alt="Logo" onerror="this.style.display='none'" />` : ''}${cs.company_name ? `<div class="company-name">${esc(cs.company_name)}</div>` : ''}${cs.address ? `<div style="font-size:10px;color:#617084;">${esc(cs.address)}</div>` : ''}${cs.phone ? `<div style="font-size:10px;color:#617084;">Tel: ${esc(cs.phone)}</div>` : ''}<h1>報價單</h1><div style="font-size:12px;color:#617084;margin-top:4px;">Quotation</div></div>
          <div class="meta">
            <div style="font-size:16px;font-weight:700;color:#1c2740;">${esc(quote.quote_no)}</div>
            <div>報價日期：${fmtDate(quote.quote_date)}</div>
            <div>有效期限：${fmtDate(quote.valid_until)}</div>
            <div>狀態：${esc(quote.status)}</div>
            ${quote.sales_person ? `<div>負責業務：${esc(quote.sales_person)}</div>` : ''}
          </div>
        </div>
        ${customer ? `<div class="info-grid">
          <div class="info-box"><div class="label">客戶名稱</div><div class="value">${esc(customer.company_name || customer.name)}</div></div>
          <div class="info-box"><div class="label">統一編號</div><div class="value">${esc(customer.tax_id || '-')}</div></div>
          <div class="info-box"><div class="label">聯絡電話</div><div class="value">${esc(customer.phone || '-')}</div></div>
          <div class="info-box"><div class="label">聯絡人</div><div class="value">${esc(customer.name || '-')}</div></div>
          <div class="info-box"><div class="label">Email</div><div class="value">${esc(customer.email || '-')}</div></div>
          <div class="info-box"><div class="label">地址</div><div class="value">${esc(customer.address || '-')}</div></div>
        </div>` : ''}
        ${quote.remark ? `<div class="remark">備註：${esc(quote.remark)}</div>` : ''}
        <table>
          <thead><tr><th>#</th><th>料號</th><th>品名</th><th>數量</th><th>單價</th><th>折扣</th><th>小計</th></tr></thead>
          <tbody>${(items || []).map((it, i) => `<tr>
            <td>${i + 1}</td><td>${esc(it.item_number_snapshot)}</td><td>${esc(it.description_snapshot)}</td>
            <td style="text-align:right">${it.qty}</td><td style="text-align:right">${fmtP(it.unit_price)}</td>
            <td style="text-align:right">${it.discount_rate ? (Number(it.discount_rate) * 100).toFixed(0) + '%' : '-'}</td>
            <td style="text-align:right">${fmtP(it.line_total)}</td>
          </tr>`).join('')}</tbody>
        </table>
        <div class="totals">
          <div class="row"><span>小計</span><span>${fmtP(quote.subtotal)}</span></div>
          ${Number(quote.discount_amount) > 0 ? `<div class="row"><span>折扣</span><span>-${fmtP(quote.discount_amount)}</span></div>` : ''}
          ${Number(quote.shipping_fee) > 0 ? `<div class="row"><span>運費</span><span>${fmtP(quote.shipping_fee)}</span></div>` : ''}
          ${Number(quote.tax_amount) > 0 ? `<div class="row"><span>稅額 (${Number(quote.tax_rate || 5)}%)</span><span>${fmtP(quote.tax_amount)}</span></div>` : ''}
          <div class="row total"><span>合計</span><span>${fmtP(quote.total_amount)}</span></div>
        </div>
        <div class="signatures">
          <div class="sig-block">
            <div class="sig-label">賣方簽章</div>
            <div class="sig-line"></div>
            <div class="sig-hint">${esc(cs.company_name || '')} / 負責人簽名</div>
          </div>
          <div class="sig-block">
            <div class="sig-label">客戶回簽</div>
            <div class="sig-line"></div>
            <div class="sig-hint">確認同意本報價內容</div>
          </div>
        </div>
      `, logoUrl, cs.company_name);

      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (type === 'order') {
      const { data: order } = await supabase.from('erp_orders').select('*').eq('id', id).single();
      if (!order) return new Response('Order not found', { status: 404 });

      const { data: items } = await supabase.from('erp_order_items').select('*').eq('order_id', id).order('id');
      const { data: customer } = order.customer_id
        ? await supabase.from('erp_customers').select('name,company_name,phone,email,address,tax_id').eq('id', order.customer_id).maybeSingle()
        : { data: null };

      const html = wrapHtml(`訂單 ${order.order_no}`, `
        <div class="header">
          <div>${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" crossorigin="anonymous" alt="Logo" onerror="this.style.display='none'" />` : ''}${cs.company_name ? `<div class="company-name">${esc(cs.company_name)}</div>` : ''}${cs.address ? `<div style="font-size:10px;color:#617084;">${esc(cs.address)}</div>` : ''}${cs.phone ? `<div style="font-size:10px;color:#617084;">Tel: ${esc(cs.phone)}</div>` : ''}<h1>訂購單</h1><div style="font-size:12px;color:#617084;margin-top:4px;">Sales Order</div></div>
          <div class="meta">
            <div style="font-size:16px;font-weight:700;color:#1c2740;">${esc(order.order_no)}</div>
            <div>訂單日期：${fmtDate(order.order_date)}</div>
            <div>付款狀態：${{unpaid:'未付款',partial:'部分付款',paid:'已付款'}[order.payment_status] || esc(order.payment_status)}</div>
            <div>出貨狀態：${{pending:'待出貨',shipped:'已出貨',delivered:'已送達',partial:'部分出貨'}[order.shipping_status] || esc(order.shipping_status)}</div>
            ${order.sales_person ? `<div>負責業務：${esc(order.sales_person)}</div>` : ''}
          </div>
        </div>
        ${customer ? `<div class="info-grid">
          <div class="info-box"><div class="label">客戶名稱</div><div class="value">${esc(customer.company_name || customer.name)}</div></div>
          <div class="info-box"><div class="label">統一編號</div><div class="value">${esc(customer.tax_id || '-')}</div></div>
          <div class="info-box"><div class="label">聯絡電話</div><div class="value">${esc(customer.phone || '-')}</div></div>
          <div class="info-box"><div class="label">聯絡人</div><div class="value">${esc(customer.name || '-')}</div></div>
          <div class="info-box"><div class="label">Email</div><div class="value">${esc(customer.email || '-')}</div></div>
          <div class="info-box"><div class="label">地址</div><div class="value">${esc(customer.address || '-')}</div></div>
        </div>` : ''}
        ${order.remark ? `<div class="remark">備註：${esc(order.remark)}</div>` : ''}
        <table>
          <thead><tr><th>#</th><th>料號</th><th>品名</th><th>數量</th><th>單價</th><th>小計</th></tr></thead>
          <tbody>${(items || []).map((it, i) => `<tr>
            <td>${i + 1}</td><td>${esc(it.item_number_snapshot)}</td><td>${esc(it.description_snapshot)}</td>
            <td style="text-align:right">${it.qty}</td><td style="text-align:right">${fmtP(it.unit_price)}</td>
            <td style="text-align:right">${fmtP(it.line_total)}</td>
          </tr>`).join('')}</tbody>
        </table>
        <div class="totals">
          <div class="row"><span>小計</span><span>${fmtP(order.subtotal)}</span></div>
          ${Number(order.discount_amount) > 0 ? `<div class="row"><span>折扣</span><span>-${fmtP(order.discount_amount)}</span></div>` : ''}
          ${Number(order.shipping_fee) > 0 ? `<div class="row"><span>運費</span><span>${fmtP(order.shipping_fee)}</span></div>` : ''}
          ${Number(order.tax_amount) > 0 ? `<div class="row"><span>稅額</span><span>${fmtP(order.tax_amount)}</span></div>` : ''}
          <div class="row total"><span>合計</span><span>${fmtP(order.total_amount)}</span></div>
        </div>
        <div class="signatures">
          <div class="sig-block">
            <div class="sig-label">賣方簽章</div>
            <div class="sig-line"></div>
            <div class="sig-hint">${esc(cs.company_name || '')} / 負責人簽名</div>
          </div>
          <div class="sig-block">
            <div class="sig-label">客戶回簽</div>
            <div class="sig-line"></div>
            <div class="sig-hint">確認同意本訂單內容</div>
          </div>
        </div>
      `, logoUrl, cs.company_name);

      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (type === 'sale') {
      const { data: sale } = await supabase.from('qb_sales_history').select('*').eq('id', id).single();
      if (!sale) return new Response('Sale not found', { status: 404 });

      let items = [];
      let customer = null;

      // 1. 優先從 erp_order_items 取品項（source_id = erp_orders.id）
      if (sale.source_id) {
        const { data: erpItems } = await supabase.from('erp_order_items').select('*').eq('order_id', sale.source_id).order('id');
        if (erpItems?.length) {
          items = erpItems.map(i => ({
            item_number: i.item_number_snapshot,
            description: i.description_snapshot,
            quantity: i.qty,
            unit_price: i.unit_price,
            subtotal: i.line_total,
            discount_rate: i.discount_rate,
          }));
        }
        // 取客戶資料
        const { data: orderRow } = await supabase.from('erp_orders').select('customer_id').eq('id', sale.source_id).maybeSingle();
        if (orderRow?.customer_id) {
          const { data: cust } = await supabase.from('erp_customers').select('name,company_name,phone,email,address,tax_id').eq('id', orderRow.customer_id).maybeSingle();
          customer = cust;
        }
      }

      // 2. Fallback：透過 qb_invoices → qb_order_items
      if (items.length === 0 && sale.invoice_number) {
        const { data: inv } = await supabase.from('qb_invoices').select('*').eq('invoice_number', sale.invoice_number).maybeSingle();
        if (inv?.order_id) {
          const { data: itms } = await supabase.from('qb_order_items').select('*').eq('order_id', inv.order_id).order('id');
          items = (itms || []).map(i => ({ item_number: i.item_number, description: i.description, quantity: i.quantity, unit_price: i.unit_price, subtotal: i.subtotal }));
        }
      }

      // 取發票日期
      let invoiceDate = '';
      if (sale.invoice_number) {
        const { data: invRow } = await supabase.from('erp_invoices').select('invoice_date').eq('invoice_no', sale.invoice_number).limit(1).maybeSingle();
        invoiceDate = invRow?.invoice_date || '';
      }

      // 公司資訊（header 右欄）
      const companyBlock = `
        ${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" crossorigin="anonymous" alt="Logo" onerror="this.style.display='none'" />` : ''}
        ${cs.company_name ? `<div class="company-name">${esc(cs.company_name)}</div>` : ''}
        ${cs.address ? `<div style="font-size:10px;color:#617084;">${esc(cs.address)}</div>` : ''}
        ${cs.phone ? `<div style="font-size:10px;color:#617084;">Tel: ${esc(cs.phone)}</div>` : ''}
        ${cs.tax_id ? `<div style="font-size:10px;color:#617084;">統編: ${esc(cs.tax_id)}</div>` : ''}
      `;

      const html = wrapHtml(`銷貨單 ${sale.slip_number}`, `
        <div class="header">
          <div>
            ${companyBlock}
            <h1>銷貨單</h1>
            <div style="font-size:12px;color:#617084;margin-top:4px;">Sales Invoice</div>
          </div>
          <div class="meta">
            <div style="font-size:16px;font-weight:700;color:#1c2740;">${esc(sale.slip_number)}</div>
            <div>銷貨日期：${fmtDate(sale.sale_date)}</div>
            ${sale.invoice_number ? `<div>發票號碼：${esc(sale.invoice_number)}</div>` : ''}
            ${invoiceDate ? `<div>發票日期：${fmtDate(invoiceDate)}</div>` : ''}
            <div>負責業務：${esc(sale.sales_person || '-')}</div>
          </div>
        </div>
        <div class="info-grid" style="grid-template-columns:1fr 1fr 1fr;">
          <div class="info-box"><div class="label">客戶名稱</div><div class="value">${esc(customer?.company_name || customer?.name || sale.customer_name)}</div></div>
          <div class="info-box"><div class="label">統一編號</div><div class="value">${esc(customer?.tax_id || '-')}</div></div>
          <div class="info-box"><div class="label">聯絡電話</div><div class="value">${esc(customer?.phone || '-')}</div></div>
          ${customer?.address ? `<div class="info-box" style="grid-column:span 2"><div class="label">地址</div><div class="value">${esc(customer.address)}</div></div>` : ''}
          ${customer?.email ? `<div class="info-box"><div class="label">Email</div><div class="value">${esc(customer.email)}</div></div>` : ''}
        </div>
        ${items.length > 0 ? `<table>
          <thead><tr><th>#</th><th>料號</th><th>品名</th><th>數量</th><th>單價</th><th>小計</th></tr></thead>
          <tbody>${items.map((it, i) => `<tr>
            <td>${i + 1}</td><td>${esc(it.item_number)}</td><td>${esc(it.description)}</td>
            <td style="text-align:right">${it.quantity}</td><td style="text-align:right">${fmtP(it.unit_price)}</td>
            <td style="text-align:right">${fmtP(it.subtotal)}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<div style="padding:16px;text-align:center;color:#9ca3af;border:1px dashed #e5e7eb;border-radius:6px;margin-bottom:10px;">（無品項資料）</div>'}
        <div class="totals">
          <div class="row"><span>小計</span><span>${fmtP(sale.subtotal)}</span></div>
          ${Number(sale.discount_amount) > 0 ? `<div class="row"><span>折扣</span><span>-${fmtP(sale.discount_amount)}</span></div>` : ''}
          ${Number(sale.shipping_fee) > 0 ? `<div class="row"><span>運費</span><span>${fmtP(sale.shipping_fee)}</span></div>` : ''}
          ${Number(sale.tax) > 0 ? `<div class="row"><span>稅額</span><span>${fmtP(sale.tax)}</span></div>` : ''}
          <div class="row total"><span>合計</span><span>${fmtP(sale.total)}</span></div>
        </div>
        <div class="signatures">
          <div class="sig-block">
            <div class="sig-label">賣方簽章</div>
            <div class="sig-line"></div>
            <div class="sig-hint">${esc(cs.company_name || '')} / 負責人簽名</div>
          </div>
          <div class="sig-block">
            <div class="sig-label">客戶確認</div>
            <div class="sig-line"></div>
            <div class="sig-hint">確認同意本銷貨內容</div>
          </div>
        </div>
      `, logoUrl, cs.company_name);

      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return new Response('Unknown type. Use: quote, order, sale', { status: 400 });
  } catch (err) {
    console.error('PDF route error:', err.message);
    return new Response('Internal server error', { status: 500 });
  }
}
