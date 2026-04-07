// app/api/cron/route.js — 排程機器人：自動通知任務
// 觸發方式：Vercel Cron (vercel.json) 或手動 curl
// 驗證：header Authorization: Bearer $CRON_SECRET

import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';
export const maxDuration = 60;

const jsonOk  = (data)    => Response.json({ ok: true,  ...data });
const jsonErr = (msg, s = 400) => Response.json({ ok: false, error: msg }, { status: s });

// LINE Broadcast 推送
async function lineBroadcast(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: 'LINE_CHANNEL_ACCESS_TOKEN not set' };
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ type: 'text', text }] }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// 寫入系統通知表
async function saveNotification(type, title, body, severity = 'info') {
  await supabase.from('erp_notifications').insert({ type, title, body, severity });
}

// ── 任務一：低庫存通知 ──────────────────────────────────────
async function taskLowStock() {
  const { data, error } = await supabase
    .from('quickbuy_products')
    .select('item_number, description, stock_qty, safety_stock')
    .gt('safety_stock', 0)
    .filter('stock_qty', 'lte', 'safety_stock')
    .not('product_status', 'eq', 'discontinued');

  if (error) return { ok: false, error: error.message };

  // 用 JS 再過濾（supabase 不支援 column 對 column 比較）
  const items = (data || []).filter(r => Number(r.stock_qty || 0) <= Number(r.safety_stock || 0));

  if (items.length === 0) return { ok: true, sent: false, message: '庫存正常，無需通知' };

  const lines = items.map(r =>
    `• ${r.item_number} ${r.description ? r.description.slice(0, 20) : ''}\n  庫存 ${r.stock_qty} / 安全水位 ${r.safety_stock}`
  ).join('\n');

  const msg = `📦 【低庫存警示】${new Date().toLocaleDateString('zh-TW')}\n共 ${items.length} 項商品低於安全庫存：\n\n${lines}\n\n請儘速安排補貨。`;

  const [lineRes] = await Promise.all([
    lineBroadcast(msg),
    saveNotification('low_stock', `低庫存警示 (${items.length} 項)`, lines, 'warning'),
  ]);

  return { ok: true, sent: true, count: items.length, lineStatus: lineRes };
}

// ── 任務二：每日銷售報表 ──────────────────────────────────────
async function taskDailyReport() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yd = yesterday.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('qb_sales_history')
    .select('total, gross_profit')
    .eq('sale_date', yd);

  if (error) return { ok: false, error: error.message };

  const rows = data || [];
  const totalAmount  = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const totalProfit  = rows.reduce((s, r) => s + Number(r.gross_profit || 0), 0);
  const count        = rows.length;
  const margin       = totalAmount > 0 ? ((totalProfit / totalAmount) * 100).toFixed(1) : '0.0';

  const fmtNT = (n) => `NT$${Math.round(n).toLocaleString()}`;
  const body  = `銷售筆數：${count} 筆\n銷售金額：${fmtNT(totalAmount)}\n毛利：${fmtNT(totalProfit)}（${margin}%）`;
  const msg   = `📊 【每日銷售報表】${yd}\n\n${body}`;

  const [lineRes] = await Promise.all([
    lineBroadcast(msg),
    saveNotification('daily_report', `${yd} 銷售報表`, body, 'info'),
  ]);

  return { ok: true, sent: true, date: yd, count, totalAmount, lineStatus: lineRes };
}

// ── 任務三：未開發票提醒 ──────────────────────────────────────
async function taskInvoiceReminder() {
  // 找「已完成訂單」但「沒有對應發票」的
  const { data: orders, error: oErr } = await supabase
    .from('erp_orders')
    .select('id, order_no, total_amount, customer_id, created_at')
    .in('status', ['completed', 'delivered']);

  if (oErr) return { ok: false, error: oErr.message };

  if (!orders || orders.length === 0) return { ok: true, sent: false, message: '無已完成訂單' };

  const orderIds = orders.map(o => o.id);
  const { data: invoices } = await supabase
    .from('erp_invoices')
    .select('order_id')
    .in('order_id', orderIds);

  const invoicedOrderIds = new Set((invoices || []).map(i => i.order_id));
  const pending = orders.filter(o => !invoicedOrderIds.has(o.id));

  if (pending.length === 0) return { ok: true, sent: false, message: '所有訂單已開立發票' };

  const fmtNT = (n) => `NT$${Math.round(n || 0).toLocaleString()}`;
  const lines = pending.slice(0, 10).map(o =>
    `• ${o.order_no} ${fmtNT(o.total_amount)}`
  ).join('\n');
  const extra = pending.length > 10 ? `\n...等共 ${pending.length} 筆` : '';

  const body = `${lines}${extra}`;
  const msg  = `🧾 【未開發票提醒】\n共 ${pending.length} 筆已完成訂單尚未開立發票：\n\n${body}\n\n請儘速處理。`;

  const [lineRes] = await Promise.all([
    lineBroadcast(msg),
    saveNotification('invoice_reminder', `未開發票提醒 (${pending.length} 筆)`, body, 'warning'),
  ]);

  return { ok: true, sent: true, count: pending.length, lineStatus: lineRes };
}

// ── 任務四：帳款逾期提醒 ──────────────────────────────────────
async function taskOverdueReminder() {
  const today = new Date().toISOString().slice(0, 10);

  const { data: erpInv, error: e1 } = await supabase
    .from('erp_invoices')
    .select('invoice_no, buyer_name, total_amount, paid_amount, due_date, customer_id')
    .not('payment_status', 'eq', 'paid')
    .lt('due_date', today);

  if (e1) return { ok: false, error: e1.message };

  const overdue = (erpInv || []);

  if (overdue.length === 0) return { ok: true, sent: false, message: '無逾期帳款' };

  const totalOverdue = overdue.reduce((s, r) => {
    return s + (Number(r.total_amount || 0) - Number(r.paid_amount || 0));
  }, 0);

  const fmtNT = (n) => `NT$${Math.round(n).toLocaleString()}`;
  const lines = overdue.slice(0, 8).map(r => {
    const balance = Number(r.total_amount || 0) - Number(r.paid_amount || 0);
    const daysOverdue = Math.floor((new Date() - new Date(r.due_date)) / 86400000);
    return `• ${r.invoice_no} ${r.buyer_name || ''} ${fmtNT(balance)}（逾期${daysOverdue}天）`;
  }).join('\n');
  const extra = overdue.length > 8 ? `\n...等共 ${overdue.length} 筆` : '';

  const body = `逾期合計：${fmtNT(totalOverdue)}\n\n${lines}${extra}`;
  const msg  = `⚠️ 【帳款逾期提醒】\n${body}\n\n請儘速跟催。`;

  const [lineRes] = await Promise.all([
    lineBroadcast(msg),
    saveNotification('overdue_reminder', `帳款逾期提醒 (${overdue.length} 筆)`, body, 'error'),
  ]);

  return { ok: true, sent: true, count: overdue.length, totalOverdue, lineStatus: lineRes };
}

// ── 主 Handler ──────────────────────────────────────────────
export async function GET(request) {
  // 驗證 CRON_SECRET（Vercel Cron 會自動帶 Authorization header）
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    const qSecret = new URL(request.url).searchParams.get('secret') || '';
    if (auth !== `Bearer ${secret}` && qSecret !== secret) {
      return jsonErr('Unauthorized', 401);
    }
  }

  const { searchParams } = new URL(request.url);
  const task = searchParams.get('task') || 'all';

  const results = {};

  try {
    if (task === 'low_stock' || task === 'all') {
      results.low_stock = await taskLowStock();
    }
    if (task === 'daily_report' || task === 'all') {
      results.daily_report = await taskDailyReport();
    }
    if (task === 'invoice_reminder' || task === 'all') {
      results.invoice_reminder = await taskInvoiceReminder();
    }
    if (task === 'overdue_reminder' || task === 'all') {
      results.overdue_reminder = await taskOverdueReminder();
    }

    return jsonOk({ task, results, ts: new Date().toISOString() });
  } catch (e) {
    console.error('[CRON ERROR]', e);
    return jsonErr(e.message, 500);
  }
}
