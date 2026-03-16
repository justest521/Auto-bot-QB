import Anthropic from '@anthropic-ai/sdk';
import { searchProducts } from './products';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `你是 Quick Buy（易大立有限公司）的 Line 客服助理。
Quick Buy 是台灣的 Snap-on、Blue Point、Bahco、TRIENS 授權經銷商。

你的工作：
1. 理解客戶的工具需求（可能用中文或英文問）
2. 從產品資料庫搜尋匹配的產品並報價
3. 用專業但親切的口吻回覆

報價規則（重要！）：
- 對外一律顯示「建議售價」（tw_retail_price，即台灣牌價）
- 在每個產品報價後加上「✨ 私訊享優惠價」
- 絕對不要在 Line 上直接說出折扣比例（85折）或計算後的價格
- 如果客戶追問「優惠多少」「實際價格」「折扣」，回覆：「優惠價格依品項不同，歡迎直接私訊我們報價，會有專人為您服務 🔧」
- 不要主動報經銷商價（tw_reseller_price），除非客戶明確表示是同業
- 滿 NT$5,000 免運費 → 可以主動提醒客戶
- 停產產品要主動告知，並建議替代品
- 如果找不到產品，引導客戶提供更多資訊（型號、用途、規格）

回覆格式規則：
- 一律用繁體中文回覆
- 回覆控制在 300 字以內，Line 訊息不宜太長
- 列出產品時格式範例：
  🔧 ATECH3FR250B
  扭力扳手 250 ft-lb
  建議售價：NT$57,236
  ✨ 私訊享優惠價
- 結尾引導：「需要報優惠價或下單，歡迎直接私訊我們 🔧」
- 如果查詢金額合計超過 NT$5,000，提醒「滿 $5,000 免運費」

你可以使用 search_products 工具搜尋產品資料庫。

搜尋技巧：
- 客戶說「扭力扳手」→ 搜 "torque wrench"
- 客戶說「套筒」→ 搜 "socket"
- 客戶說「棘輪」→ 搜 "ratchet"
- 客戶說「工具車」→ 搜 "cart" 或 "cabinet"
- 客戶給型號如「ATECH3FR250B」→ 直接搜型號
- 客戶說「鉗子」→ 搜 "plier"
- 客戶說「起子」→ 搜 "screwdriver"
- 客戶說「充氣機」→ 搜 "inflat" 或 "TPGDL"
- 如果關鍵字搜不到，試拆開搜（例如 "torque" + "wrench" 分開搜）`;

const TOOLS = [
  {
    name: 'search_products',
    description: '搜尋 Snap-on / Blue Point 產品資料庫。輸入型號、英文產品名稱或關鍵字。',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜尋關鍵字（英文產品名稱、型號、或產品類型）',
        },
        status_filter: {
          type: 'string',
          enum: ['Current', 'New Announced', null],
          description: '產品狀態篩選，null 表示搜全部',
        },
      },
      required: ['query'],
    },
  },
];

export async function handleCustomerMessage(userMessage, displayName = '') {
  const startTime = Date.now();
  let matchedProducts = [];
  let toolCalls = 0;

  const messages = [
    { role: 'user', content: `客戶「${displayName}」傳來訊息：\n${userMessage}` },
  ];

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages,
  });

  // tool_use 迴圈（最多 3 輪搜尋）
  while (response.stop_reason === 'tool_use' && toolCalls < 3) {
    const toolUseBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolUseBlock) break;

    toolCalls++;
    const { query, status_filter } = toolUseBlock.input;
    console.log(`🔍 AI search: "${query}" (filter: ${status_filter})`);

    const result = await searchProducts(query, {
      statusFilter: status_filter || null,
      maxResults: 10,
    });

    matchedProducts = [...matchedProducts, ...result.products];

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseBlock.id,
        content: JSON.stringify({
          type: result.type,
          count: result.products.length,
          products: result.products.slice(0, 10).map(p => ({
            item_number: p.item_number,
            description: p.description,
            tw_retail_price: p.tw_retail_price,
            tw_reseller_price: p.tw_reseller_price,
            product_status: p.product_status,
            origin_country: p.origin_country,
          })),
        }),
      }],
    });

    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });
  }

  const textBlock = response.content.find(b => b.type === 'text');
  const reply = textBlock?.text || '感謝您的詢問！請稍候，我們的專員會盡快回覆您 🔧';
  const trimmedReply = reply.length > 4800 ? reply.slice(0, 4800) + '\n\n...更多內容請私訊洽詢' : reply;

  return {
    reply: trimmedReply,
    matchedProducts: matchedProducts.slice(0, 10),
    toolCalls,
    responseTimeMs: Date.now() - startTime,
  };
}
