// lib/line-stock-in.js — LINE Bot 進貨功能
import { supabase } from '@/lib/supabase';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ── 檢查是否為進貨管理員 ──
export async function isStockInAdmin(lineUserId) {
  try {
    const { data } = await supabase
      .from('quickbuy_config')
      .select('value')
      .eq('key', 'stock_in_admin_line_ids')
      .maybeSingle();
    const ids = Array.isArray(data?.value) ? data.value : [];
    return ids.includes(lineUserId);
  } catch {
    return false;
  }
}

// ── 解析進貨圖片 ──
export async function parseStockInImage(imageUrl) {
  // 1. 從 LINE 下載圖片
  const imageRes = await fetch(imageUrl, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!imageRes.ok) throw new Error('圖片下載失敗');

  const buf = await imageRes.arrayBuffer();
  const base64 = Buffer.from(buf).toString('base64');
  const mime = imageRes.headers.get('content-type') || 'image/jpeg';

  // 2. 計算 hash 查快取
  const crypto = await import('crypto');
  const fileHash = crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');

  const { data: cached } = await supabase
    .from('receive_parse_cache')
    .select('items')
    .eq('file_hash', fileHash)
    .maybeSingle();

  if (cached?.items?.length) {
    return { items: cached.items, method: 'cache' };
  }

  // 3. AI 辨識
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
          { type: 'text', text: '這是進貨單、送貨單或發票，請辨識所有品項。回傳 JSON 陣列格式：[{"part_no":"料號","name":"品名","qty":"數量","cost":"單價"}]。只回傳 JSON，不要其他文字。如果無法辨識任何品項就回傳 []。' },
        ],
      }],
    }),
  });

  const aiData = await aiRes.json();
  if (aiData.error) throw new Error(aiData.error.message);

  const text = (aiData.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
  let items = JSON.parse(text);
  if (!Array.isArray(items)) items = [];

  // 4. 寫快取
  if (fileHash && items.length > 0) {
    try {
      await supabase.from('receive_parse_cache').upsert({
        file_hash: fileHash, mime_type: mime, items, hit_count: 0,
      }, { onConflict: 'file_hash' });
    } catch (_) {}
  }

  return { items, method: 'ai-vision' };
}

// ── 建立待確認進貨 ──
export async function createPendingStockIn(lineUserId, displayName, items, method) {
  // 先清除此用戶之前的 pending
  await supabase
    .from('line_pending_stock_in')
    .update({ status: 'expired' })
    .eq('line_user_id', lineUserId)
    .eq('status', 'pending');

  const { data, error } = await supabase
    .from('line_pending_stock_in')
    .insert({
      line_user_id: lineUserId,
      display_name: displayName,
      items,
      parse_method: method,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── 取得待確認進貨 ──
export async function getPendingStockIn(lineUserId) {
  const { data } = await supabase
    .from('line_pending_stock_in')
    .select('*')
    .eq('line_user_id', lineUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// ── 確認進貨 → 執行入庫 ──
export async function confirmStockIn(pendingRecord) {
  const items = pendingRecord.items || [];
  if (!items.length) throw new Error('無品項');

  const siNo = `LRCV${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
  const totalAmt = items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.cost) || 0), 0);

  // 1. 建立進貨單
  const { data: si, error: siErr } = await supabase
    .from('erp_stock_ins')
    .insert({
      stock_in_no: siNo,
      vendor_id: pendingRecord.vendor_id || null,
      status: 'confirmed',
      total_amount: totalAmt,
      remark: `LINE 進貨 (${pendingRecord.display_name || ''})`,
    })
    .select()
    .single();
  if (siErr) throw siErr;

  // 2. 建立明細
  const itemPayload = items.map(i => ({
    stock_in_id: si.id,
    item_number: (i.part_no || '').toUpperCase(),
    description: i.name || '',
    qty_received: Number(i.qty) || 1,
    unit_cost: Number(i.cost) || 0,
    line_total: (Number(i.qty) || 1) * (Number(i.cost) || 0),
  }));
  await supabase.from('erp_stock_in_items').insert(itemPayload);

  // 3. 庫存異動
  for (const i of items) {
    const itemNumber = (i.part_no || '').toUpperCase();
    const qty = Number(i.qty) || 1;
    if (!itemNumber) continue;

    await supabase.from('qb_inventory_movements').insert({
      item_number: itemNumber, movement_type: 'in', quantity: qty,
      reference_type: 'stock_in', notes: `LINE 進貨 ${siNo}`, created_by: 'line_bot',
    });

    const { data: prod } = await supabase
      .from('quickbuy_products')
      .select('stock_qty')
      .eq('item_number', itemNumber)
      .maybeSingle();
    if (prod) {
      await supabase.from('quickbuy_products')
        .update({ stock_qty: Math.max(0, (Number(prod.stock_qty) || 0) + qty) })
        .eq('item_number', itemNumber);
    }
  }

  // 4. 品項記憶
  try {
    for (const i of items) {
      const itemNumber = (i.part_no || '').toUpperCase();
      const cost = Number(i.cost) || 0;
      if (!itemNumber) continue;

      const { data: existing } = await supabase.from('item_cost_history').select('*').eq('item_number', itemNumber).maybeSingle();
      if (existing) {
        const total = existing.total_entries || 1;
        const newAvg = Math.round(((existing.avg_cost || 0) * total + cost) / (total + 1));
        await supabase.from('item_cost_history').update({
          item_name: i.name || existing.item_name, last_cost: cost, avg_cost: newAvg,
          min_cost: Math.min(existing.min_cost || cost, cost),
          max_cost: Math.max(existing.max_cost || cost, cost),
          total_entries: total + 1, updated_at: new Date().toISOString(),
        }).eq('item_number', itemNumber);
      } else if (cost > 0) {
        await supabase.from('item_cost_history').insert({
          item_number: itemNumber, item_name: i.name || '',
          last_cost: cost, avg_cost: cost, min_cost: cost, max_cost: cost, total_entries: 1,
        });
      }
    }
  } catch (_) {}

  // 5. 更新 pending 狀態
  await supabase
    .from('line_pending_stock_in')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), stock_in_id: si.id })
    .eq('id', pendingRecord.id);

  return { stock_in_no: siNo, count: itemPayload.length, total: totalAmt };
}

// ── 格式化品項清單給 LINE 回覆 ──
export function formatItemsForLine(items) {
  if (!items.length) return '無法辨識品項，請重新拍照或手動進貨。';

  const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 1), 0);
  const totalAmt = items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.cost) || 0), 0);

  let msg = `📦 辨識到 ${items.length} 項 / ${totalQty} 件\n`;
  msg += `━━━━━━━━━━━━━━\n`;

  items.forEach((item, idx) => {
    const qty = Number(item.qty) || 1;
    const cost = Number(item.cost) || 0;
    const sub = qty * cost;
    msg += `${idx + 1}. ${item.part_no || '?'}`;
    if (item.name) msg += ` ${item.name}`;
    msg += `\n   ${qty}個`;
    if (cost > 0) msg += ` × $${cost.toLocaleString()} = $${sub.toLocaleString()}`;
    else msg += `（贈品）`;
    msg += `\n`;
  });

  msg += `━━━━━━━━━━━━━━\n`;
  if (totalAmt > 0) msg += `合計 $${totalAmt.toLocaleString()}\n`;
  msg += `\n回覆「確認進貨」入庫\n回覆「取消」放棄`;

  return msg;
}

// ── 取消進貨 ──
export async function cancelPendingStockIn(lineUserId) {
  await supabase
    .from('line_pending_stock_in')
    .update({ status: 'cancelled' })
    .eq('line_user_id', lineUserId)
    .eq('status', 'pending');
}
