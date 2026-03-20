// app/api/pdf/route.js — 報價單 / 訂單 / 銷貨單 可列印 HTML (Print → PDF)
export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

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

function wrapHtml(title, body) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
  @page { margin: 15mm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif; color: #1c2740; font-size: 13px; line-height: 1.6; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 3px solid #1976f3; padding-bottom: 16px; }
  .header h1 { font-size: 22px; color: #1976f3; }
  .header .meta { text-align: right; font-size: 12px; color: #617084; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .info-box { background: #f8fbff; border: 1px solid #dbe6f3; border-radius: 8px; padding: 12px 14px; }
  .info-box .label { font-size: 10px; color: #7b889b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
  .info-box .value { font-size: 13px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #1976f3; color: #fff; font-size: 11px; font-weight: 700; padding: 10px 12px; text-align: left; text-transform: uppercase; letter-spacing: 0.6px; }
  td { padding: 9px 12px; border-bottom: 1px solid #e5eaf1; font-size: 12px; }
  tr:nth-child(even) td { background: #fafcff; }
  .totals { margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .totals .row.total { font-size: 16px; font-weight: 700; color: #1976f3; border-top: 2px solid #1976f3; padding-top: 10px; margin-top: 6px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #dbe3ee; font-size: 11px; color: #7b889b; text-align: center; }
  .remark { background: #fffbeb; border: 1px solid #f7d699; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #8a5b00; margin-bottom: 16px; }
  @media print { body { padding: 0; } .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="no-print" style="text-align:center;margin-bottom:20px;">
  <button onclick="window.print()" style="background:#1976f3;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:700;">列印 / 儲存 PDF</button>
</div>
${body}
<div class="footer">Auto QB ERP System — 列印時間 ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>
</body></html>`;
}

export async function GET(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');

  if (!type || !id) {
    return new Response('Missing type or id', { status: 400 });
  }

  try {
    if (type === 'quote') {
      const { data: quote } = await supabase.from('erp_quotes').select('*').eq('id', id).single();
      if (!quote) return new Response('Quote not found', { status: 404 });

      const { data: items } = await supabase.from('erp_quote_items').select('*').eq('quote_id', id).order('id');
      const { data: customer } = quote.customer_id
        ? await supabase.from('erp_customers').select('name,company_name,phone,email,address,tax_id').eq('id', quote.customer_id).maybeSingle()
        : { data: null };

      const html = wrapHtml(`報價單 ${quote.quote_no}`, `
        <div class="header">
          <div><h1>報價單</h1><div style="font-size:12px;color:#617084;margin-top:4px;">Quotation</div></div>
          <div class="meta">
            <div style="font-size:16px;font-weight:700;color:#1c2740;">${esc(quote.quote_no)}</div>
            <div>報價日期：${fmtDate(quote.quote_date)}</div>
            <div>有效期限：${fmtDate(quote.valid_until)}</div>
            <div>狀態：${esc(quote.status)}</div>
          </div>
        </div>
        ${customer ? `<div class="info-grid">
          <div class="info-box"><div class="label">客戶名稱</div><div class="value">${esc(customer.company_name || customer.name)}</div></div>
          <div class="info-box"><div class="label">統一編號</div><div class="value">${esc(customer.tax_id || '-')}</div></div>
          <div class="info-box"><div class="label">聯絡電話</div><div class="value">${esc(customer.phone || '-')}</div></div>
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
          <div class="row"><span>折扣</span><span>-${fmtP(quote.discount_amount)}</span></div>
          <div class="row"><span>運費</span><span>${fmtP(quote.shipping_fee)}</span></div>
          <div class="row"><span>稅額 (5%)</span><span>${fmtP(quote.tax_amount)}</span></div>
          <div class="row total"><span>合計</span><span>${fmtP(quote.total_amount)}</span></div>
        </div>
      `);

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
          <div><h1>訂購單</h1><div style="font-size:12px;color:#617084;margin-top:4px;">Sales Order</div></div>
          <div class="meta">
            <div style="font-size:16px;font-weight:700;color:#1c2740;">${esc(order.order_no)}</div>
            <div>訂單日期：${fmtDate(order.order_date)}</div>
            <div>付款狀態：${esc(order.payment_status)}</div>
            <div>出貨狀態：${esc(order.shipping_status)}</div>
          </div>
        </div>
        ${customer ? `<div class="info-grid">
          <div class="info-box"><div class="label">客戶名稱</div><div class="value">${esc(customer.company_name || customer.name)}</div></div>
          <div class="info-box"><div class="label">統一編號</div><div class="value">${esc(customer.tax_id || '-')}</div></div>
          <div class="info-box"><div class="label">聯絡電話</div><div class="value">${esc(customer.phone || '-')}</div></div>
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
          <div class="row"><span>折扣</span><span>-${fmtP(order.discount_amount)}</span></div>
          <div class="row"><span>運費</span><span>${fmtP(order.shipping_fee)}</span></div>
          <div class="row"><span>稅額</span><span>${fmtP(order.tax_amount)}</span></div>
          <div class="row total"><span>合計</span><span>${fmtP(order.total_amount)}</span></div>
        </div>
      `);

      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (type === 'sale') {
      const { data: sale } = await supabase.from('qb_sales_history').select('*').eq('id', id).single();
      if (!sale) return new Response('Sale not found', { status: 404 });

      let invoice = null;
      let items = [];
      if (sale.invoice_number) {
        const { data: inv } = await supabase.from('qb_invoices').select('*').eq('invoice_number', sale.invoice_number).maybeSingle();
        invoice = inv;
        if (inv?.order_id) {
          const { data: itms } = await supabase.from('qb_order_items').select('*').eq('order_id', inv.order_id).order('id');
          items = itms || [];
        }
      }

      const html = wrapHtml(`銷貨單 ${sale.slip_number}`, `
        <div class="header">
          <div><h1>銷貨單</h1><div style="font-size:12px;color:#617084;margin-top:4px;">Sales Invoice</div></div>
          <div class="meta">
            <div style="font-size:16px;font-weight:700;color:#1c2740;">${esc(sale.slip_number)}</div>
            <div>銷貨日期：${fmtDate(sale.sale_date)}</div>
            ${sale.invoice_number ? `<div>發票號碼：${esc(sale.invoice_number)}</div>` : ''}
            <div>業務人員：${esc(sale.sales_person || '-')}</div>
          </div>
        </div>
        <div class="info-grid">
          <div class="info-box"><div class="label">客戶名稱</div><div class="value">${esc(sale.customer_name)}</div></div>
          ${invoice ? `<div class="info-box"><div class="label">統一編號</div><div class="value">${esc(invoice.tax_id || '-')}</div></div>` : '<div></div>'}
        </div>
        ${items.length > 0 ? `<table>
          <thead><tr><th>#</th><th>料號</th><th>品名</th><th>數量</th><th>單價</th><th>小計</th></tr></thead>
          <tbody>${items.map((it, i) => `<tr>
            <td>${i + 1}</td><td>${esc(it.item_number)}</td><td>${esc(it.description)}</td>
            <td style="text-align:right">${it.quantity}</td><td style="text-align:right">${fmtP(it.unit_price)}</td>
            <td style="text-align:right">${fmtP(it.subtotal)}</td>
          </tr>`).join('')}</tbody>
        </table>` : ''}
        <div class="totals">
          <div class="row"><span>小計</span><span>${fmtP(sale.subtotal)}</span></div>
          <div class="row"><span>稅額</span><span>${fmtP(sale.tax)}</span></div>
          <div class="row total"><span>合計</span><span>${fmtP(sale.total)}</span></div>
          ${sale.cost ? `<div class="row"><span>成本</span><span>${fmtP(sale.cost)}</span></div>` : ''}
          ${sale.gross_profit ? `<div class="row"><span>毛利</span><span>${fmtP(sale.gross_profit)} (${esc(sale.profit_margin || '')})</span></div>` : ''}
        </div>
      `);

      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return new Response('Unknown type. Use: quote, order, sale', { status: 400 });
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
