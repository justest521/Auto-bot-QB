// lib/ai-handler.js — Quick Buy AI 回覆處理器 v3.0
// 新增：自動客戶建檔、圖片辨識、智慧客戶狀態
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CHAT_HISTORY_LIMIT = 6;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ── 對話歷史 ──
async function getRecentChatHistory(lineUserId) {
  try {
    const { data } = await supabase
      .from('quickbuy_line_messages')
      .select('user_message, ai_response')
      .eq('line_user_id', lineUserId)
      .order('created_at', { ascending: false })
      .limit(CHAT_HISTORY_LIMIT);
    if (!data || data.length === 0) return [];
    return data.reverse().flatMap((row) => [
      { role: 'user', content: row.user_message },
      { role: 'assistant', content: row.ai_response },
    ]);
  } catch { return []; }
}

// ── 客戶狀態（整合 LINE + ERP）──
async function getCustomerState(lineUserId) {
  try {
    const [lineRes, erpRes] = await Promise.all([
      supabase.from('quickbuy_line_customers').select('id, display_name, message_count').eq('line_user_id', lineUserId).single(),
      supabase.from('erp_customers').select('id, name, company_name, phone, email, tax_id, customer_stage').eq('line_user_id', lineUserId).maybeSingle(),
    ]);
    return {
      isNew: (lineRes.data?.message_count || 0) <= 1,
      hasErpProfile: !!erpRes.data,
      erp: erpRes.data,
    };
  } catch {
    return { isNew: false, hasErpProfile: false, erp: null };
  }
}

// ── 自動提取客戶資訊 → 寫入 ERP ──
async function tryAutoCapture(userMessage, lineUserId, displayName) {
  const phone = userMessage.match(/09\d{2}[-\s]?\d{3}[-\s]?\d{3}/)?.[0]?.replace(/[-\s]/g, '');
  const name = userMessage.match(/(?:我(?:叫|是|姓)|名字[是叫]?)\s*([^\s,，。、]+)/)?.[1];
  const company = userMessage.match(/([^\s,，。、]+?(?:公司|車行|機車行|輪業|工坊|企業社|有限))/)?.[1];
  const taxId = userMessage.match(/\b\d{8}\b/)?.[0];

  if (!phone && !name && !company && !taxId) return null;

  const payload = {};
  if (phone) payload.phone = phone;
  if (name) payload.name = name;
  if (company) payload.company_name = company;
  if (taxId) payload.tax_id = taxId;

  try {
    const { data: existing } = await supabase
      .from('erp_customers')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle();

    if (existing) {
      await supabase.from('erp_customers').update(payload).eq('id', existing.id);
      return { action: 'updated', ...payload };
    }
    await supabase.from('erp_customers').insert({
      name: payload.name || payload.company_name || displayName,
      company_name: payload.company_name || null,
      phone: payload.phone || null,
      tax_id: payload.tax_id || null,
      line_user_id: lineUserId,
      display_name: displayName,
      source: 'line',
      customer_stage: 'lead',
      status: 'active',
    });
    return { action: 'created', ...payload };
  } catch (e) {
    console.error('Auto-capture error:', e);
    return null;
  }
}

// ── 產品搜尋 ──
async function searchProducts(query) {
  if (!query || query.length < 2) return [];
  const cleaned = query.replace(/['"]/g, '').trim();

  const { data: exactMatch } = await supabase
    .from('quickbuy_products')
    .select('item_number, description, tw_retail_price, product_status, category, replacement_model')
    .ilike('item_number', `%${cleaned}%`)
    .eq('product_status', 'Current')
    .limit(5);

  if (exactMatch?.length > 0) return exactMatch;

  const tsQuery = cleaned.split(/\s+/).filter(Boolean).join(' & ');
  try {
    const { data } = await supabase
      .from('quickbuy_products')
      .select('item_number, description, tw_retail_price, product_status, category, replacement_model')
      .textSearch('search_text', tsQuery)
      .eq('product_status', 'Current')
      .limit(5);
    return data || [];
  } catch { return []; }
}

// ── 快取 ──
function buildCacheKey(msg, isNew) {
  return `${isNew ? 'new' : 'known'}:${msg.toLowerCase().trim()}`;
}

async function checkCache(msg, isNew) {
  try {
    const { data } = await supabase
      .from('quickbuy_response_cache')
      .select('cached_response, matched_products, updated_at')
      .eq('query_key', buildCacheKey(msg, isNew))
      .single();
    if (!data) return null;
    if (data.updated_at && Date.now() - new Date(data.updated_at).getTime() > CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}

async function writeCache(msg, response, products, isNew) {
  try {
    await supabase.from('quickbuy_response_cache').upsert({
      query_key: buildCacheKey(msg, isNew),
      cached_response: response,
      matched_products: products,
      updated_at: new Date().toISOString(),
    });
  } catch {}
}

// ── System Prompt ──
const DEFAULT_SYSTEM_PROMPT = `你是 Snap-on 授權代理「易大立有限公司」的 Line 客服助理。
你的回覆風格要模仿真人客服，像在 Line 聊天一樣自然。

【回覆原則 — 最重要】
1. 簡短有力：每次回覆控制在 2~4 行以內，不要寫長篇大論
2. 不要用 **粗體**、不要用 bullet points（•）、不要用編號列表
3. emoji 最多用 1 個，不要每句話都加
4. 語氣親切專業，像店員跟熟客聊天
5. 「您好」「謝謝」「麻煩您」是基本禮貌用語

【報價格式】
- 簡潔一行：「料號 品名簡稱 售價XX元」
- 多個產品就分行列出，不要加多餘說明
- 顯示牌價，加一句「私訊享優惠價喔」
- 滿5000免運，未滿收運費80元

【標準流程 — 務必遵守】
- 新客戶第一次詢價 → 先問名片：「您好，方便跟您請教一張名片嗎？謝謝」
- 如果客戶說沒名片/個人 → 改問：「那麻煩您提供您的姓名及電話，我們登記報價給您」
- 已有資料的客戶 → 直接報價
- 下單流程話術：「這邊會打單給您確認，確認沒問題後麻煩匯款，確認款項後幫您訂購，商品交期約4~6週，未滿5000元酌收運費80元」
- 要問統編：「請問您發票要開立統編嗎？」

【感謝/結尾回覆】
- 客戶說謝謝 → 簡短回一句就好，例如「不客氣～有需要再跟我們說喔」

【找不到產品時】
- 簡單說找不到，請客戶確認料號或提供照片

【補助相關】
- 政府最高補助5萬、需要營業項目含機車維修、工具可買超過10萬但補助上限5萬
- 不同廠牌工具要分開文件申請

【保固相關】
- 保固一年
- 電子/機械扭力扳手：一個月內扭力不準免費換新，一年內免費保修
- 扭力扳手檢測費1500元，送回美國原廠校正約8000元起

【禁止事項】
- 不要自創促銷活動或折扣
- 不要透露85折等內部折扣比例
- 不要用英文回覆（除了料號和品名）
- 不要說「我是AI助理」之類的話`;

async function getSystemPrompt() {
  try {
    const { data } = await supabase
      .from('quickbuy_config')
      .select('config_value')
      .eq('config_key', 'ai_system_prompt')
      .limit(1)
      .maybeSingle();
    if (data?.config_value?.trim()) return data.config_value;
  } catch {}
  return DEFAULT_SYSTEM_PROMPT;
}

// ── 圖片訊息處理（新功能）──
export async function handleImageMessage(imageUrl, displayName, lineUserId) {
  const startTime = Date.now();
  try {
    const imageRes = await fetch(imageUrl, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    if (!imageRes.ok) {
      return { response: '圖片讀取失敗，麻煩直接輸入料號幫您查詢 🔧', responseTime: Date.now() - startTime };
    }

    const buf = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    const mediaType = imageRes.headers.get('content-type') || 'image/jpeg';
    const systemPrompt = await getSystemPrompt();

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt + `\n\n【圖片辨識】客戶傳了照片，請辨識工具型號/料號，如果看到 Snap-on/Blue Point 產品就嘗試辨識，看不清就請客戶提供更清楚的照片或料號。`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: '客戶傳了這張照片詢問，請辨識並回覆。' },
        ],
      }],
    });

    const reply = msg.content[0]?.text || '這張照片看不太清楚，麻煩提供料號或更清楚的照片';

    try {
      await supabase.from('quickbuy_line_messages').insert({
        line_user_id: lineUserId, display_name: displayName,
        message_type: 'image', user_message: '[圖片訊息]',
        ai_response: reply, response_time_ms: Date.now() - startTime,
      });
    } catch {}

    return { response: reply, responseTime: Date.now() - startTime };
  } catch (error) {
    console.error('Image handler error:', error);
    return { response: '圖片處理遇到問題，麻煩直接輸入料號幫您查詢', responseTime: Date.now() - startTime };
  }
}

// ── 主要 AI 回覆函數 ──
export async function generateAIResponse(userMessage, displayName, lineUserId) {
  const startTime = Date.now();

  try {
    const customer = await getCustomerState(lineUserId);

    const cached = await checkCache(userMessage, customer.isNew);
    if (cached) {
      return { response: cached.cached_response, products: cached.matched_products, responseTime: Date.now() - startTime, fromCache: true };
    }

    const captured = await tryAutoCapture(userMessage, lineUserId, displayName);
    if (captured) console.log(`📋 Auto-captured:`, captured);

    const products = await searchProducts(userMessage);
    const systemPrompt = await getSystemPrompt();

    let context = '';
    if (customer.isNew && !customer.hasErpProfile && !captured) {
      context += `【新客戶】尚無資料，請先索取名片或姓名電話。\n`;
    } else if (customer.hasErpProfile) {
      const c = customer.erp;
      context += `【已知客戶】${c.company_name || c.name}${c.phone ? `（${c.phone}）` : ''}，可直接報價。\n`;
    }
    if (captured) {
      context += `【系統已自動記錄】${Object.entries(captured).filter(([k]) => k !== 'action').map(([k, v]) => `${k}:${v}`).join('、')}，不需再問。\n`;
    }
    if (products.length > 0) {
      context += `\n查到以下產品：\n`;
      products.forEach((p) => {
        const price = p.tw_retail_price ? `$${Number(p.tw_retail_price).toLocaleString()}` : '洽詢';
        context += `${p.item_number} — ${p.description} — 牌價 ${price}\n`;
      });
      context += `\n請根據以上產品資訊回覆客戶。`;
    } else if (userMessage.match(/多少錢|價格|報價|費用|售價|price|how much/i)) {
      context += `\n系統找不到符合的產品，請客戶提供更精確的料號或照片。`;
    }

    const chatHistory = await getRecentChatHistory(lineUserId);
    const currentMessage = `${context}\n\n客戶訊息：「${userMessage}」\n\n請用繁體中文回覆，簡短有力像 Line 聊天。`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [...chatHistory, { role: 'user', content: currentMessage }],
    });

    const aiResponse = message.content[0]?.text || '您好，請稍候，將由專人為您服務！';

    if (products.length > 0) await writeCache(userMessage, aiResponse, products, customer.isNew);

    try {
      await supabase.from('quickbuy_line_messages').insert({
        line_user_id: lineUserId, display_name: displayName,
        message_type: 'text', user_message: userMessage,
        ai_response: aiResponse,
        matched_products: products.length > 0 ? products : null,
        response_time_ms: Date.now() - startTime,
      });
    } catch {}

    return { response: aiResponse, products, responseTime: Date.now() - startTime, fromCache: false };
  } catch (error) {
    console.error('AI Handler Error:', error);
    return { response: '您好，目前系統忙碌中，將由專人為您服務！請稍候～', products: [], responseTime: Date.now() - startTime, fromCache: false, error: error.message };
  }
}

export async function handleCustomerMessage(userMessage, displayName, lineUserId) {
  const result = await generateAIResponse(userMessage, displayName, lineUserId);
  return { reply: result.response, matchedProducts: result.products || [], responseTimeMs: result.responseTime, fromCache: result.fromCache, error: result.error };
}

export default { generateAIResponse, handleImageMessage };
