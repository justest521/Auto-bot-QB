import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { handleCustomerMessage, handleImageMessage } from '@/lib/ai-handler';
import { webhookLimiter } from '@/lib/security/rate-limit';
import {
  isStockInAdmin, parseStockInImage, createPendingStockIn,
  getPendingStockIn, confirmStockIn, cancelPendingStockIn, formatItemsForLine,
} from '@/lib/line-stock-in';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

function verifySignature(body, signature) {
  if (!signature || !LINE_CHANNEL_SECRET) return false;
  const hash = crypto
    .createHmac('SHA256', LINE_CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  try {
    const a = Buffer.from(hash, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function replyMessage(replyToken, text) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) console.error('Line Reply failed:', await res.text());
  return res.ok;
}

async function getUserProfile(userId) {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error('getUserProfile error:', e);
  }
  return null;
}

async function upsertCustomer(lineUserId, displayName) {
  const { data: existing } = await supabase
    .from('quickbuy_line_customers')
    .select('id, message_count')
    .eq('line_user_id', lineUserId)
    .single();

  if (existing) {
    await supabase
      .from('quickbuy_line_customers')
      .update({
        display_name: displayName,
        last_contact_at: new Date().toISOString(),
        message_count: (existing.message_count || 0) + 1,
      })
      .eq('line_user_id', lineUserId);
  } else {
    await supabase.from('quickbuy_line_customers').insert({
      line_user_id: lineUserId,
      display_name: displayName,
      message_count: 1,
    });
  }
}

export async function POST(request) {
  const rl = webhookLimiter(request);
  if (!rl.ok) return rl.response;

  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature');

    if (!verifySignature(body, signature)) {
      console.error('Invalid signature');
      return new Response('Invalid signature', { status: 401 });
    }

    const { events } = JSON.parse(body);

    // 平行處理所有 events，避免 replyToken 30 秒超時
    async function handleEvent(event) {
      try {
        if (event.type !== 'message') return;

        const { replyToken, source, message } = event;
        const userId = source.userId;

        const profile = await getUserProfile(userId);
        const displayName = profile?.displayName || '客戶';
        upsertCustomer(userId, displayName).catch(console.error);

        // ── 檢查是否為進貨管理員 ──
        const isAdmin = await isStockInAdmin(userId);

        // ══════ 進貨管理員：圖片 → 辨識進貨單 ══════
        if (isAdmin && message.type === 'image') {
          console.log(`📦📷 [ADMIN ${displayName}]: stock-in image`);
          const imageUrl = `https://api-data.line.me/v2/bot/message/${message.id}/content`;
          try {
            const { items, method } = await parseStockInImage(imageUrl);
            if (!items.length) {
              await replyMessage(replyToken, '無法辨識品項，請重新拍更清楚的照片 📸');
              return;
            }
            const pending = await createPendingStockIn(userId, displayName, items, method);
            const reply = formatItemsForLine(items);
            console.log(`📦 Parsed ${items.length} items (${method}), pending: ${pending.id}`);
            await replyMessage(replyToken, reply);
          } catch (e) {
            console.error('Stock-in image error:', e);
            await replyMessage(replyToken, '解析失敗：' + (e.message || '未知錯誤'));
          }
          return;
        }

        // ══════ 進貨管理員：文字指令 ══════
        if (isAdmin && message.type === 'text') {
          const text = message.text.trim();

          // 確認進貨
          if (/^(確認進貨|確認|入庫|OK|ok)$/.test(text)) {
            const pending = await getPendingStockIn(userId);
            if (!pending) {
              await replyMessage(replyToken, '目前沒有待確認的進貨，請先拍照上傳進貨單 📸');
              return;
            }
            try {
              const result = await confirmStockIn(pending);
              await replyMessage(replyToken, `✅ 入庫完成！\n進貨單號：${result.stock_in_no}\n共 ${result.count} 項，合計 $${result.total.toLocaleString()}`);
              console.log(`📦✅ [ADMIN] Stock-in confirmed: ${result.stock_in_no}`);
            } catch (e) {
              console.error('Stock-in confirm error:', e);
              await replyMessage(replyToken, '入庫失敗：' + (e.message || '未知錯誤'));
            }
            return;
          }

          // 取消進貨
          if (/^(取消|取消進貨|cancel)$/i.test(text)) {
            await cancelPendingStockIn(userId);
            await replyMessage(replyToken, '已取消 👌');
            return;
          }

          // 進貨指令說明
          if (/^(進貨|stock.?in|幫助|help)$/i.test(text)) {
            await replyMessage(replyToken, '📦 LINE 進貨使用方式：\n1️⃣ 拍照或上傳進貨單圖片\n2️⃣ 系統自動辨識品項\n3️⃣ 回覆「確認進貨」入庫\n\n也可以回覆「取消」放棄');
            return;
          }

          // 非進貨指令 → 走正常客服流程
        }

        // ══════ 一般客戶：圖片 → 工具辨識 ══════
        if (message.type === 'image') {
          console.log(`📷 [${userId}]: [image]`);
          const imageUrl = `https://api-data.line.me/v2/bot/message/${message.id}/content`;
          const { response, responseTime } = await handleImageMessage(imageUrl, displayName, userId);
          console.log(`🤖 (${responseTime}ms 📷): ${response.slice(0, 80)}...`);
          await replyMessage(replyToken, response);
          return;
        }

        // ══════ 一般客戶：文字 → AI 客服 ══════
        if (message.type === 'text') {
          const userMessage = message.text;
          console.log(`📩 [${userId}]: ${userMessage}`);
          const { reply, responseTimeMs, fromCache } =
            await handleCustomerMessage(userMessage, displayName, userId);
          console.log(`🤖 (${responseTimeMs}ms${fromCache ? ' ⚡CACHE' : ''}): ${reply.slice(0, 80)}...`);
          await replyMessage(replyToken, reply);
          return;
        }

        // ── 其他（貼圖、影片等）──
        await replyMessage(replyToken, '收到！如果要查工具，直接輸入料號或拍照給我就可以囉 🔧');
      } catch (e) {
        console.error('Event handler error:', e);
      }
    }

    await Promise.all(events.map(handleEvent));

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Webhook error', { status: 500 });
  }
}

export async function GET() {
  return new Response('Quick Buy Line Bot is running 🔧', { status: 200 });
}
