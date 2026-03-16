import Anthropic from '@anthropic-ai/sdk';
import { searchProducts } from './products';
import { supabase } from './supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ==========================================
// 快取邏輯
// ==========================================

// 正規化查詢：去空白、轉小寫、去掉「多少錢」等常見問句
function normalizeCacheKey(message) {
  return message
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(多少錢|價格|報價|幾塊|怎麼賣|價位|售價)/g, '')
    .replace(/[？?！!，,。.]/g, '')
    .trim();
}

async function getCache(cacheKey) {
  try {
    const { data } = await supabase
      .from('quickbuy_response_cache')
      .select('ai_response, matched_products')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (data) {
      // 更新命中次數（不等待）
      supabase
        .from('quickbuy_response_cache')
        .update({ hit_count: supabase.rpc ? undefined : 1 })
        .eq('cache_key', cacheKey)
        .then(() => {})
        .catch(() => {});

      // 用 RPC 更新 hit_count +1
      supabase.rpc('', {}).catch(() => {});
      await supabase
        .from('quickbuy_response_cache')
        .update({ hit_count: (data.hit_count || 0) + 1 })
        .eq('cache_key', cacheKey);

      return data;
    }
  } catch (e) {
    // cache miss，正常流程
  }
  return null;
}

async function setCache(cacheKey, userMessage, aiResponse, matchedProducts) {
  try {
    await supabase
      .from('quickbuy_response_cache')
      .upsert({
        cache_key: cacheKey,
        user_message_sample: userMessage,
        ai_response: aiResponse,
        matched_products: matchedProducts,
        hit_count: 1,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'cache_key' });
  } catch (e) {
    console.error('Cache write error:', e);
  }
}

// ==========================================
// 關鍵字提取（不依賴 AI，速度快）
// ==========================================

function extractSearchTerms(message) {
  const terms = [];

  // 直接型號匹配（英數混合，3字元以上）
  const models = message.match(/[A-Za-z0-9][-A-Za-z0-9]{2,}/g) || [];
  terms.push(...models);

  // 中文→英文搜尋對照
  const cnToEn = {
    '扭力扳手': 'torque wrench', '扭力板手': 'torque wrench',
    '套筒': 'socket', '棘輪': 'ratchet',
    '扳手': 'wrench', '板手': 'wrench',
    '鉗子': 'plier', '尖嘴鉗': 'plier',
    '起子': 'screwdriver', '螺絲起子': 'screwdriver',
    '工具車': 'cart', '工具箱': 'chest', '工具櫃': 'cabinet',
    '充氣機': 'tire inflat', '打氣機': 'tire inflat',
    '診斷': 'diagnostic', '燈': 'light', '工作燈': 'work light',
    '千斤頂': 'jack', '電動扳手': 'impact wrench',
    '氣動': 'air tool', '電鑽': 'drill',
    '萬用表': 'multimeter', '內視鏡': 'borescope',
    '扭力': 'torque',
  };

  for (const [cn, en] of Object.entries(cnToEn)) {
    if (message.includes(cn) && en) terms.push(en);
  }

  if (terms.length === 0) {
    const eng = message.match(/[a-zA-Z]{2,}/g) || [];
    if (eng.length > 0) terms.push(eng.join(' '));
  }

  return [...new Set(terms)];
}

// ==========================================
// System Prompt
// ==========================================

const SYSTEM_PROMPT = `你是 Quick Buy（易大立有限公司）的 Line 客服助理。
Quick Buy 是台灣的 Snap-on、Blue Point、Bahco、TRIENS 授權經銷商。

根據提供的產品搜尋結果，回覆客戶的工具需求。用專業但親切的口吻回覆。

報價規則（重要！）：
- 對外一律顯示「建議售價」（tw_retail_price）
- 每個產品後加「✨ 私訊享優惠價」
- 絕對不要說出折扣比例或計算後的價格
- 客戶追問優惠→回：「優惠價依品項不同，歡迎私訊報價 🔧」
- 不報經銷商價，除非客戶明確是同業
- 滿 NT$5,000 免運→主動提醒
- 停產品主動告知

回覆格式：
- 繁體中文，300 字內
- 產品格式：
  🔧 型號
  品名
  建議售價：NT$XX,XXX
  ✨ 私訊享優惠價
- 最多列 3-5 個最相關產品
- 結尾：「需要報優惠價或下單，歡迎直接私訊我們 🔧」`;

// ==========================================
// 主處理函數
// ==========================================

export async function handleCustomerMessage(userMessage, displayName = '') {
  const startTime = Date.now();

  // ① 查快取（<100ms）
  const cacheKey = normalizeCacheKey(userMessage);
  const cached = await getCache(cacheKey);

  if (cached) {
    console.log(`⚡ Cache HIT: "${cacheKey}" (${Date.now() - startTime}ms)`);
    return {
      reply: cached.ai_response,
      matchedProducts: cached.matched_products || [],
      toolCalls: 0,
      responseTimeMs: Date.now() - startTime,
      fromCache: true,
    };
  }

  // ② 搜尋產品（~300-500ms）
  const searchTerms = extractSearchTerms(userMessage);
  console.log(`🔍 Search terms: ${JSON.stringify(searchTerms)}`);

  let allProducts = [];
  for (const term of searchTerms.slice(0, 3)) {
    const result = await searchProducts(term, { maxResults: 5 });
    allProducts.push(...result.products);
  }

  // 去重
  const seen = new Set();
  allProducts = allProducts.filter(p => {
    if (seen.has(p.item_number)) return false;
    seen.add(p.item_number);
    return true;
  }).slice(0, 10);

  console.log(`📦 Found ${allProducts.length} products in ${Date.now() - startTime}ms`);

  // ③ 一次 AI 呼叫生成回覆（~3-5s）
  const productInfo = allProducts.length > 0
    ? `\n\n搜尋到的產品：\n${JSON.stringify(allProducts.map(p => ({
        item_number: p.item_number,
        description: p.description,
        tw_retail_price: p.tw_retail_price,
        product_status: p.product_status,
      })))}`
    : '\n\n搜尋結果：沒有找到匹配的產品。';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `客戶「${displayName}」說：${userMessage}${productInfo}`,
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const reply = textBlock?.text || '感謝您的詢問！請稍候，我們的專員會盡快回覆您 🔧';
  const trimmedReply = reply.length > 4800 ? reply.slice(0, 4800) + '\n\n...更多內容請私訊洽詢' : reply;

  const responseTimeMs = Date.now() - startTime;
  console.log(`🤖 Done in ${responseTimeMs}ms (no cache)`);

  // ④ 背景寫入快取（不阻塞回覆）
  setCache(cacheKey, userMessage, trimmedReply, allProducts.slice(0, 10)).catch(console.error);

  return {
    reply: trimmedReply,
    matchedProducts: allProducts.slice(0, 10),
    toolCalls: 0,
    responseTimeMs,
    fromCache: false,
  };
}
