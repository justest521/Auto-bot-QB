// lib/ai-handler.js — Quick Buy AI 回覆處理器 v2.0
// 基於 86,261 則歷史對話分析，學習真人客服回覆風格
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 新客戶判斷 ──
async function isNewCustomer(lineUserId) {
  try {
    const { count } = await supabase
      .from('quickbuy_line_messages')
      .select('*', { count: 'exact', head: true })
      .eq('line_user_id', lineUserId);
    return (count || 0) <= 1; // 第一則訊息 = 新客戶
  } catch {
    return false;
  }
}

// ── 查詢產品（最多 5 筆）──
async function searchProducts(query) {
  if (!query || query.length < 2) return [];

  const cleaned = query.replace(/['"]/g, '').trim();

  // 1. 先嘗試精確料號匹配
  const { data: exactMatch } = await supabase
    .from('quickbuy_products')
    .select('item_number, description, tw_retail_price, product_status, category, replacement_model')
    .ilike('item_number', `%${cleaned}%`)
    .eq('product_status', 'Current')
    .limit(5);

  if (exactMatch && exactMatch.length > 0) return exactMatch;

  // 2. 全文搜尋
  const tsQuery = cleaned.split(/\s+/).filter(Boolean).join(' & ');
  try {
    const { data: ftsMatch } = await supabase
      .from('quickbuy_products')
      .select('item_number, description, tw_retail_price, product_status, category, replacement_model')
      .textSearch('search_text', tsQuery)
      .eq('product_status', 'Current')
      .limit(5);
    return ftsMatch || [];
  } catch {
    return [];
  }
}

function buildCacheKey(userMessage, isNewCustomer) {
  const normalized = userMessage.toLowerCase().trim();
  return `${isNewCustomer ? 'new' : 'known'}:${normalized}`;
}

// ── 快取檢查 ──
async function checkCache(userMessage, isNewCustomer) {
  try {
    const { data } = await supabase
      .from('quickbuy_response_cache')
      .select('cached_response, matched_products')
      .eq('query_key', buildCacheKey(userMessage, isNewCustomer))
      .single();
    return data || null;
  } catch {
    return null;
  }
}

// ── 快取寫入 ──
async function writeCache(userMessage, response, products, isNewCustomer) {
  try {
    await supabase.from('quickbuy_response_cache').upsert({
      query_key: buildCacheKey(userMessage, isNewCustomer),
      cached_response: response,
      matched_products: products,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // 快取失敗不影響主流程
  }
}

// ── System Prompt（學習自 86K 歷史對話）──
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
- 不要回一大段感謝文

【找不到產品時】
- 簡單說找不到，請客戶確認料號或提供照片
- 不要列出一堆可能的替代品

【補助相關】
- 要給具體資訊：政府最高補助5萬、需要營業項目含機車維修、工具可買超過10萬但補助上限5萬
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

    if (data?.config_value?.trim()) {
      return data.config_value;
    }
  } catch {
    // Fallback to the bundled prompt if config lookup fails.
  }

  return DEFAULT_SYSTEM_PROMPT;
}

// ── 主要 AI 回覆函數 ──
export async function generateAIResponse(userMessage, displayName, lineUserId) {
  const startTime = Date.now();

  try {
    // 1. 新客戶判斷
    const isNew = await isNewCustomer(lineUserId);

    // 2. 快取檢查
    const cached = await checkCache(userMessage, isNew);
    if (cached) {
      return {
        response: cached.cached_response,
        products: cached.matched_products,
        responseTime: Date.now() - startTime,
        fromCache: true,
      };
    }

    // 3. 從訊息中提取可能的產品查詢
    const products = await searchProducts(userMessage);

    // 4. 讀取可配置 prompt
    const systemPrompt = await getSystemPrompt();

    // 5. 組合 context
    let context = '';
    if (isNew) {
      context += `【新客戶】這是此客戶第一次來訊息，請按照SOP先索取名片或姓名電話。\n`;
    }
    if (products.length > 0) {
      context += `\n查到以下產品：\n`;
      products.forEach((p) => {
        const price = p.tw_retail_price
          ? `$${Number(p.tw_retail_price).toLocaleString()}`
          : '洽詢';
        context += `${p.item_number} — ${p.description} — 牌價 ${price}\n`;
      });
      context += `\n請根據以上產品資訊回覆客戶。`;
    } else if (
      userMessage.match(/多少錢|價格|報價|費用|售價|price|how much/i)
    ) {
      context += `\n系統找不到符合的產品，請請客戶提供更精確的料號或照片。`;
    }

    // 6. 呼叫 Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500, // 控制回覆長度，避免太長
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${context}\n\n客戶訊息：「${userMessage}」\n\n請用繁體中文回覆，簡短有力像 Line 聊天。`,
        },
      ],
    });

    const aiResponse =
      message.content[0]?.text || '您好，請稍候，將由專人為您服務！';

    // 7. 寫入快取
    if (products.length > 0) {
      await writeCache(userMessage, aiResponse, products, isNew);
    }

    // 8. 記錄到 DB
    try {
      await supabase.from('quickbuy_line_messages').insert({
        line_user_id: lineUserId,
        display_name: displayName,
        message_type: 'text',
        user_message: userMessage,
        ai_response: aiResponse,
        matched_products: products.length > 0 ? products : null,
        response_time_ms: Date.now() - startTime,
      });
    } catch {
      // 記錄失敗不影響回覆
    }

    return {
      response: aiResponse,
      products,
      responseTime: Date.now() - startTime,
      fromCache: false,
    };
  } catch (error) {
    console.error('AI Handler Error:', error);

    // Fallback 回覆
    return {
      response: '您好，目前系統忙碌中，將由專人為您服務！請稍候～',
      products: [],
      responseTime: Date.now() - startTime,
      fromCache: false,
      error: error.message,
    };
  }
}

export async function handleCustomerMessage(userMessage, displayName, lineUserId) {
  const result = await generateAIResponse(userMessage, displayName, lineUserId);

  return {
    reply: result.response,
    matchedProducts: result.products || [],
    responseTimeMs: result.responseTime,
    fromCache: result.fromCache,
    error: result.error,
  };
}

export default { generateAIResponse };
