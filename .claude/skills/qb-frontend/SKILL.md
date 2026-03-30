---
name: qb-frontend
description: >
  QB ERP 前端 UI 機器人——專責處理所有前端介面開發、樣式修復、RWD 響應式調整、元件佈局優化。
  當使用者提到「UI」「樣式」「CSS」「排版」「版型」「間距」「圓角」「按鈕」「卡片」「sidebar」「header」
  「手機版」「桌面版」「RWD」「responsive」「元件」「component」「tab」「列表」「table」「搜尋欄」
  「字級」「顏色」「配色」「icon」「動畫」「hover」「modal」「彈窗」「表單」「form」「頁面」「畫面」
  或任何與 QB ERP 前端介面相關的關鍵字時，都應觸發此 skill。
  即使使用者只是說「這邊跑版了」「間距怪怪的」「按鈕太大」「手機版壞了」「畫面不對」「幫我改 UI」，
  只要涉及前端視覺或互動，就使用此 skill。
---

# QB ERP 前端 UI 機器人

## 你的角色

你是 QB ERP 專案的前端 UI 專家。你的職責是維護所有 56 個 tab 元件的視覺一致性、RWD 響應式正確性、以及使用者體驗品質。

## 專案技術棧

| 項目 | 內容 |
|------|------|
| 框架 | Next.js 14.2.0 (App Router) |
| React | 18.3.0 |
| 樣式方案 | CSS-in-JS，全域透過 `S` 物件管理 (`/lib/admin/styles.js`) |
| 響應式 | `useResponsive()` hook — mobile < 820px, tablet < 1180px |
| 部署 | Vercel (sin1 region) |

## 核心檔案地圖

```
/app/admin/page.js                      ← 主頁面骨架 (sidebar + header + tab router)
/app/admin/components/tabs/*.js          ← 56 個分頁元件（所有 UI 都在這裡）
/app/admin/components/shared/ui.js       ← 共用元件 (StatCard, Modal, etc.)
/lib/admin/styles.js                     ← 全域樣式常數 S 物件
```

## 全域樣式規範 (S 物件)

這是所有 UI 的基礎，修改任何樣式前必須先理解這些值：

```javascript
S.card = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '16px 18px',
  marginBottom: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  transition: 'all 0.25s ease'
}

S.btnPrimary = { background: '#16a34a', color: '#fff', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600 }
S.btnGhost   = { background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', fontSize: 13 }
S.input      = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', fontSize: 13 }
```

### 手機版覆蓋 (S.mobile.*)

手機版透過 spread `...S.mobile.*` 覆蓋基底樣式。關鍵差異：
- `S.mobile.btnPrimary`: padding 加大 `12px 16px`、`minHeight: 44`、`width: '100%'`
- `S.mobile.btnGhost`: padding `10px 14px`、`minHeight: 44`
- `S.mobile.card`: padding `12px 14px`、`borderRadius: 10`
- `S.mobile.input`: padding `10px 12px`、`fontSize: 14`、`minHeight: 44`

**⚠️ 已知地雷**：手機版的 `minHeight: 44` 和 `width: '100%'` 如果不用 `isMobile` 條件判斷就 spread，會汙染桌面版。永遠用三元判斷：
```javascript
style={{ ...S.btnGhost, ...(isMobile ? S.mobile.btnGhost : {}) }}
```

## 常見 UI 模式

### 1. 表格容器（標準寫法）

所有列表頁的表格外框應使用此模式（參考 Orders.js）：
```javascript
<div style={{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }}>
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    ...
  </table>
</div>
```

**⚠️ 禁止使用 `...S.tableScroll`**：`S.tableScroll` 包含 `margin: '0 -14px'`，會導致卡片超出父容器寬度、圓角消失。這是已知 bug 的根源。

### 2. 詳細頁面兩欄佈局

```javascript
<div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: isMobile ? 12 : 16, alignItems: 'start' }}>
  <div>{/* 主內容區 */}</div>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {/* 右側欄 cards */}
  </div>
</div>
```

### 3. 右側欄卡片樣式

```javascript
const cardStyle = { ...S.card, marginBottom: 0, padding: isMobile ? '12px 14px' : '16px' };
const labelStyle = { fontSize: isMobile ? 12 : 13, fontWeight: 700, color: '#6b7280', marginBottom: isMobile ? 6 : 8, textTransform: 'uppercase', letterSpacing: 0.5 };
```

注意 `marginBottom: 0`——右側欄使用 flex `gap: 10` 控制間距，卡片自身不需要 marginBottom。

### 4. Header 按鈕區域

使用 React Portal 將操作按鈕渲染到 header bar 右側：
```javascript
<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
  <button style={{ ...S.btnPrimary, padding: '7px 16px', fontSize: 13, fontWeight: 700 }}>主操作</button>
  <button style={{ ...S.btnGhost, padding: '7px 16px', fontSize: 13, fontWeight: 600 }}>次操作</button>
</div>
```

### 5. 搜尋列

搜尋 input 容器需要 `flex: 1` 才能撐滿剩餘空間，查詢按鈕放在最右邊：
```javascript
<div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
  <input style={{ ...S.input, flex: 1 }} placeholder="搜尋..." />
  <button style={S.btnPrimary}>查詢</button>
</div>
```

### 6. 列表頁操作按鈕

桌面版的小型操作按鈕（複製、PDF 等）不要帶 `minHeight`：
```javascript
<button style={{ ...S.btnGhost, padding: '4px 6px', fontSize: 12, whiteSpace: 'nowrap' }}>複製</button>
```

## 修改前的檢查清單

每次修改 UI 前，依序確認：

1. **讀取 `/lib/admin/styles.js`** — 確認目前的 S 物件定義
2. **讀取目標元件** — 了解現有結構
3. **讀取 Orders.js 作為參考** — 這是最標準的範本頁面
4. **確認 isMobile 條件** — 手機版和桌面版是否正確分離
5. **確認 S.tableScroll 未被使用** — 搜尋 `tableScroll` 確保沒有殘留

## 修改後的驗證步驟

1. **SWC 編譯檢查**：`npx swc compile <modified-file> --config-json '{"jsc":{"parser":{"syntax":"ecmascript","jsx":true}}}' -o /dev/null`
2. **全域搜尋影響**：確認修改不影響其他引用同一 style 的元件
3. **桌面版 + 手機版** 同時確認——不能只顧一邊

## 56 個 Tab 元件列表（需維護一致性）

所有元件位於 `/app/admin/components/tabs/`：
AIForecast, AIPrompt, AccountsReceivable, Announcements, Approvals, CRMLeads, ChatHistory, CompanySettings, Customers, Dashboard, DealerOrders, DealerUsers, EnvHealth, EquipmentLease, FinancialReport, Flowchart, FormalCustomers, ImportCenter, Inquiries, Inventory, Invoices, LineCRM, LineChat, Messages, OrderCreateModal, Orders, PSIReport, PartsExchange, PaymentMatching, PaymentRecords, Payments, PricingRules, ProcurementCenter, ProductSearch, ProfitAnalysis, Promotions, PurchaseOrders, PurchaseReturns, QuickReceive, QuoteCreateModal, Quotes, ReconciliationStatements, ReorderSuggestions, ReportCenter, Returns, SalesDocuments, SalesReturns, Shipments, StockAdjustments, StockAlerts, StockIn, Stocktake, Tickets, UserManagement, VendorPayments, Vendors
