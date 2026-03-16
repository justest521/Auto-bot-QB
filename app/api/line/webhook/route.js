import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { handleCustomerMessage } from '@/lib/ai-handler';

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

function verifySignature(body, signature) {
  const hash = crypto
    .createHmac('SHA256', LINE_CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return hash === signature;
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
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature');

    if (!verifySignature(body, signature)) {
      console.error('Invalid signature');
      return new Response('Invalid signature', { status: 401 });
    }

    const { events } = JSON.parse(body);

    for (const event of events) {
      if (event.type !== 'message' || event.message.type !== 'text') {
        if (event.replyToken && event.type === 'message') {
          await replyMessage(
            event.replyToken,
            '目前僅支援文字查詢，請輸入想查詢的工具型號或名稱 🔧'
          );
        }
        continue;
      }

      const { replyToken, source, message } = event;
      const userId = source.userId;
      const userMessage = message.text;

      console.log(`📩 [${userId}]: ${userMessage}`);

      const profile = await getUserProfile(userId);
      const displayName = profile?.displayName || '客戶';

      // 不等 DB 寫入，先處理 AI 回覆
      upsertCustomer(userId, displayName).catch(console.error);

      const { reply, matchedProducts, toolCalls, responseTimeMs, fromCache } =
        await handleCustomerMessage(userMessage, displayName);

      console.log(`🤖 (${responseTimeMs}ms${fromCache ? ' ⚡CACHE' : ''}): ${reply.slice(0, 80)}...`);

      await replyMessage(replyToken, reply);

      // 背景記錄訊息
      supabase
        .from('quickbuy_line_messages')
        .insert({
          line_user_id: userId,
          display_name: displayName,
          user_message: userMessage,
          ai_response: reply,
          matched_products: matchedProducts.length > 0 ? matchedProducts : null,
          response_time_ms: responseTimeMs,
        })
        .then(() => {})
        .catch(console.error);
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('OK', { status: 200 });
  }
}

export async function GET() {
  return new Response('Quick Buy Line Bot is running 🔧', { status: 200 });
}
