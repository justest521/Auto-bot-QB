export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

import { supabase } from '@/lib/supabase';
import crypto from 'crypto';

/* ── helpers ── */
const jsonOk = (d) => Response.json(d);
const jsonErr = (msg, status = 400) => Response.json({ error: msg }, { status });

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';
}

/* ── GET: vendor action (button click from email) ── */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const action = searchParams.get('action');

    if (!token || !action) {
      return new Response(renderPage('錯誤', '無效的連結，請聯繫採購人員。', 'error'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // Find token
    const { data: tokenRow, error: tErr } = await supabase
      .from('erp_po_action_tokens')
      .select('*')
      .eq('token', token)
      .eq('action', action)
      .single();

    if (tErr || !tokenRow) {
      return new Response(renderPage('連結無效', '此連結不存在或已過期，請聯繫採購人員。', 'error'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (tokenRow.used_at) {
      return new Response(renderPage('已處理', `此操作已於 ${tokenRow.used_at.slice(0, 16).replace('T', ' ')} 處理完成。`, 'info'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(renderPage('連結已過期', '此連結已超過有效期限，請聯繫採購人員。', 'error'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // Map action to PO status
    const STATUS_MAP = {
      confirm: 'confirmed',
      shipped: 'shipped',
      received: 'received',
      reject: 'rejected',
    };

    const newStatus = STATUS_MAP[action];
    if (!newStatus) {
      return new Response(renderPage('錯誤', '未知的操作。', 'error'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // Update PO status
    const { error: poErr } = await supabase
      .from('erp_purchase_orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', tokenRow.po_id);

    if (poErr) {
      return new Response(renderPage('更新失敗', '系統錯誤，請稍後再試或聯繫採購人員。', 'error'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // Mark token as used
    await supabase
      .from('erp_po_action_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);

    const ACTION_LABELS = {
      confirm: '確認接單',
      shipped: '已出貨',
      received: '已到貨',
      reject: '退回',
    };

    return new Response(
      renderPage('操作成功', `採購單狀態已更新為「${ACTION_LABELS[action] || action}」，感謝您的回覆！`, 'success'),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  } catch (e) {
    return new Response(renderPage('系統錯誤', e.message, 'error'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

/* ── POST: export & send email ── */
export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'export_po': return await handleExport(body);
      case 'send_po_email': return await handleSendEmail(body);
      default: return jsonErr('Unknown action');
    }
  } catch (e) {
    return jsonErr(e.message, 500);
  }
}

/* ── Export PO as Excel (base64) ── */
async function handleExport({ po_id }) {
  if (!po_id) return jsonErr('po_id required');

  const { data: po, error: poErr } = await supabase
    .from('erp_purchase_orders')
    .select('*')
    .eq('id', po_id)
    .single();
  if (poErr || !po) return jsonErr('找不到採購單');

  // Get items
  const { data: items } = await supabase
    .from('erp_purchase_order_items')
    .select('*')
    .eq('po_id', po_id)
    .order('created_at', { ascending: true });

  // Get vendor
  let vendor = null;
  if (po.vendor_id) {
    const { data: v } = await supabase.from('erp_vendors').select('*').eq('id', po.vendor_id).single();
    vendor = v;
  }

  // Build Excel using xlsx library
  const XLSX = (await import('xlsx')).default || await import('xlsx');

  // Header info rows
  const wsData = [
    ['採購單 Purchase Order'],
    [''],
    ['採購單號', po.po_no],
    ['日期', po.po_date],
    ['預計到貨', po.expected_date || '-'],
    ['供應商', vendor?.vendor_name || '-'],
    ['聯絡人', vendor?.contact_name || '-'],
    ['電話', vendor?.phone || '-'],
    [''],
    ['項次', '料號', '品名', '數量', '單價', '小計'],
  ];

  (items || []).forEach((item, i) => {
    wsData.push([
      i + 1,
      item.item_number || '-',
      item.description || '-',
      item.qty || 0,
      Number(item.unit_cost || 0),
      Number(item.line_total || 0),
    ]);
  });

  wsData.push([]);
  wsData.push(['', '', '', '', '合計', Number(po.total_amount || 0)]);
  if (po.remark) {
    wsData.push([]);
    wsData.push(['備註', po.remark]);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  // Column widths
  ws['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '採購單');
  const excelBuf = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  return jsonOk({
    po,
    vendor,
    items: items || [],
    excel_base64: excelBuf,
    filename: `PO_${po.po_no}.xlsx`,
  });
}

/* ── Send PO email via Resend ── */
async function handleSendEmail({ po_id, to_email, cc_email }) {
  if (!po_id) return jsonErr('po_id required');

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return jsonErr('RESEND_API_KEY 未設定，請先在 Vercel 環境變數加入');

  // Export PO data
  const exportRes = await handleExport({ po_id });
  const exportData = await exportRes.json();
  if (exportData.error) return jsonErr(exportData.error);

  const { po, vendor, items, excel_base64, filename } = exportData;
  const recipientEmail = to_email || vendor?.email;
  if (!recipientEmail) return jsonErr('找不到收件人 email，請先在廠商主檔填寫 email 或手動輸入');

  const baseUrl = getBaseUrl();

  // Create action tokens (valid 30 days)
  const actions = ['confirm', 'shipped', 'reject'];
  const tokens = {};
  for (const act of actions) {
    const token = crypto.randomBytes(32).toString('hex');
    await supabase.from('erp_po_action_tokens').insert({
      po_id: po.id,
      action: act,
      token,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    tokens[act] = token;
  }

  // Build items table HTML
  const itemRows = (items || []).map((item, i) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace">${item.item_number || '-'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.description || '-'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.qty || 0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">$${Number(item.unit_cost || 0).toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">$${Number(item.line_total || 0).toLocaleString()}</td>
    </tr>
  `).join('');

  const fromName = process.env.PO_FROM_NAME || 'Quick Buy 採購系統';
  const fromEmail = process.env.PO_FROM_EMAIL || 'noreply@resend.dev';

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:680px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

  <div style="background:linear-gradient(135deg,#1e3a5f,#2d5a8e);padding:28px 32px;color:#fff">
    <h1 style="margin:0;font-size:22px;font-weight:600">📋 採購單通知</h1>
    <p style="margin:8px 0 0;opacity:0.85;font-size:14px">Purchase Order #${po.po_no}</p>
  </div>

  <div style="padding:28px 32px">
    <table style="width:100%;font-size:14px;margin-bottom:24px">
      <tr><td style="padding:6px 0;color:#666;width:100px">採購單號</td><td style="font-weight:600;font-family:monospace">${po.po_no}</td></tr>
      <tr><td style="padding:6px 0;color:#666">日期</td><td>${po.po_date}</td></tr>
      <tr><td style="padding:6px 0;color:#666">預計到貨</td><td>${po.expected_date || '待確認'}</td></tr>
      <tr><td style="padding:6px 0;color:#666">合計金額</td><td style="font-size:18px;font-weight:700;color:#1e3a5f">NT$${Number(po.total_amount || 0).toLocaleString()}</td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px 12px;text-align:center;color:#666;font-weight:600">#</th>
          <th style="padding:10px 12px;text-align:left;color:#666;font-weight:600">料號</th>
          <th style="padding:10px 12px;text-align:left;color:#666;font-weight:600">品名</th>
          <th style="padding:10px 12px;text-align:center;color:#666;font-weight:600">數量</th>
          <th style="padding:10px 12px;text-align:right;color:#666;font-weight:600">單價</th>
          <th style="padding:10px 12px;text-align:right;color:#666;font-weight:600">小計</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr style="background:#f8fafc">
          <td colspan="5" style="padding:10px 12px;text-align:right;font-weight:600">合計</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:15px;color:#1e3a5f">NT$${Number(po.total_amount || 0).toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>

    ${po.remark ? `<p style="font-size:13px;color:#666;background:#f8fafc;padding:12px 16px;border-radius:8px">📝 備註：${po.remark}</p>` : ''}

    <div style="margin:28px 0 8px;border-top:1px solid #eee;padding-top:24px">
      <p style="font-size:14px;color:#333;margin:0 0 16px;font-weight:600">請選擇操作：</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a href="${baseUrl}/api/po?action=confirm&token=${tokens.confirm}" style="display:inline-block;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">✅ 確認接單</a>
        <a href="${baseUrl}/api/po?action=shipped&token=${tokens.shipped}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">🚚 已出貨</a>
        <a href="${baseUrl}/api/po?action=reject&token=${tokens.reject}" style="display:inline-block;padding:12px 28px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">❌ 退回</a>
      </div>
    </div>
  </div>

  <div style="background:#f8fafc;padding:16px 32px;font-size:11px;color:#999;border-top:1px solid #eee">
    此信件由 ${fromName} 自動發送。如有問題請直接回覆此信件。
  </div>
</div>
</body>
</html>`;

  // Send via Resend
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [recipientEmail],
      cc: cc_email ? [cc_email] : undefined,
      subject: `採購單 ${po.po_no} — 請確認`,
      html: emailHtml,
      attachments: [
        {
          filename,
          content: excel_base64,
        },
      ],
    }),
  });

  const resendData = await resendRes.json();
  if (!resendRes.ok) {
    return jsonErr(`Resend 發送失敗: ${resendData.message || JSON.stringify(resendData)}`, 500);
  }

  // Update PO status to 'sent'
  await supabase
    .from('erp_purchase_orders')
    .update({ status: 'sent', updated_at: new Date().toISOString() })
    .eq('id', po.id);

  return jsonOk({
    success: true,
    message: `採購單已寄送至 ${recipientEmail}`,
    email_id: resendData.id,
  });
}

/* ── HTML response page ── */
function renderPage(title, message, type = 'success') {
  const colors = {
    success: { bg: '#dcfce7', border: '#16a34a', icon: '✅' },
    error: { bg: '#fee2e2', border: '#dc2626', icon: '❌' },
    info: { bg: '#dbeafe', border: '#2563eb', icon: 'ℹ️' },
  };
  const c = colors[type] || colors.info;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="max-width:480px;width:90%;background:#fff;border-radius:16px;padding:48px 32px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="font-size:56px;margin-bottom:16px">${c.icon}</div>
    <h1 style="margin:0 0 12px;font-size:24px;color:#1e3a5f">${title}</h1>
    <p style="margin:0;font-size:15px;color:#555;line-height:1.6">${message}</p>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999">Quick Buy 採購系統</div>
  </div>
</body>
</html>`;
}
