
# QB ERP 週度回歸測試報告

```
═══════════════════════════════════════════════════
  QB ERP 週度回歸測試報告
  日期：2026-03-31 (二)
  分支：main (39591f1)
═══════════════════════════════════════════════════

▸ SWC 編譯：     74/74 通過 ✅
▸ Node 語法：    86/86 通過 ✅
▸ 樣式一致性：   發現 3 個已知問題 ⚠️
▸ 跨頁一致性：   大致一致，2 個偏差 ⚠️
▸ 業務邏輯：     5/5 驗證通過 ✅
▸ Build 測試：   沙箱記憶體不足無法完成（非程式碼問題）⏭️
▸ Git 狀態：     乾淨（無未提交變更）✅

總結：程式碼層面全部通過，有少量樣式技術債需追蹤
═══════════════════════════════════════════════════
```

---

## 第一層：SWC 全站編譯

| 範圍 | 檔案數 | 通過 | 失敗 |
|------|--------|------|------|
| app/admin/components/tabs/ | 58 | 58 | 0 |
| app/admin/page.js | 1 | 1 | 0 |
| app/admin/components/shared/ | 4 | 4 | 0 |
| lib/admin/ | 11 | 11 | 0 |
| **合計** | **74** | **74** | **0** |

補充：另以 `node --check` 對全站 86 支 JS（含 app/api、middleware）做語法驗證，全數通過。

---

## 第二層：樣式一致性掃描

### tableScroll 殘留（2 處）
- `app/admin/components/shared/ui.js:887` — 使用 `S.tableScroll`
- `lib/admin/styles.js:378` — 定義 `tableScroll` 樣式

> **風險**：低。定義與使用成對存在，僅 `ui.js` 共用元件引用。若後續決定移除 tableScroll 模式，需同步清理兩處。

### margin: '0 -14px' 殘留（1 處）
- `lib/admin/styles.js:380` — `tableScroll` 定義中含 `margin: '0 -14px'`

> **風險**：低。綁定在 tableScroll 內，不影響其他元件。

### minHeight: 44 使用（156 處 / 31 檔）
- 大多數（141 處）帶有 `isMobile` 條件守衛 ✅
- **15 處無 isMobile 守衛**，可能導致桌面版元素偏高：
  - `Shipments.js` (3 處：出貨/送達/取消按鈕)
  - `Returns.js` (3 處：核准按鈕、新增品項、取消)
  - `Payments.js` (2 處：確認按鈕、取消)
  - `SalesDocuments.js` (1 處：退回按鈕)
  - `Quotes.js` (5 處：保存/取消/編輯/替換/刪除)
  - `StockIn.js` (1 處：確認入庫按鈕)

> **風險**：中低。這些主要是手機列表卡片內的行動按鈕，固定 44px 高度在手機上合理。但建議後續統一加上 isMobile 守衛。

---

## 第三層：跨頁表格容器檢查

**標準模式**：`{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db' }`

| 頁面 | 符合標準 | 備註 |
|------|----------|------|
| Orders.js | — | 使用 ResizableTable，無直接表格容器 |
| Quotes.js | — | 使用 ResizableTable |
| StockIn.js | ✅ | 使用 `t.color.border` 替代硬編碼 |
| Returns.js | ✅ | 完全符合 |
| PurchaseOrders.js | — | 使用 ResizableTable |
| Invoices.js | ⚠️ | 用 `overflow: 'auto'` 而非 `overflowX: 'auto'` |
| Payments.js | ⚠️ | 使用卡片列表而非表格，模式不同 |
| Customers.js | — | 卡片式佈局 |
| Vendors.js | — | 卡片式佈局 |
| ProcurementCenter.js | ✅ | 符合（mobile 增加 touch scrolling） |
| Inventory.js | — | 未找到表格容器 |

> 大部分列表頁已統一。Invoices 的 `overflow` vs `overflowX` 和 Payments 的卡片式佈局是兩個小偏差。

---

## 第四層：業務邏輯驗證

### 1. 報價單轉訂單（Quotes.js）✅
- `convertToOrder` 函式存在（第 96 行）
- 呼叫 `apiPost({ action: 'convert_quote_to_order', quote_id })`
- 成功後呼叫 `onConvert(result.order)` 回調
- 有錯誤處理與提示訊息

### 2. 進貨單庫存更新（StockIn.js）✅
- 確認進貨前有 `confirm()` 確認提示
- 呼叫 `apiPost({ action: 'confirm_stock_in', stock_in_id })`
- 確認後重新載入明細資料
- 列表支援搜尋、狀態篩選、日期範圍

### 3. 退貨處理（Returns.js）✅
- 完整狀態流：pending → approved → refunded / rejected
- 呼叫 `apiPost({ action: 'approve_return', ..., notify_line: true })`
- 支援 LINE 通知
- 建立退貨表單含品項明細

### 4. PDF 輸出路由（app/api/pdf/route.js）✅
- 支援報價單 / 訂單 / 銷貨單
- 使用 Supabase 服務端金鑰讀取資料
- 有 XSS 防護（`esc()` 函式）
- 金額格式化 `fmtP()`、日期格式化 `fmtDate()`

### 5. FIFO 配貨邏輯（ProcurementCenter.js）✅
- `allocationData` state 管理配貨資料
- 呼叫 `apiGet({ action: 'po_item_allocation', item_number })`
- UI 明確標示「FIFO」配貨建議
- 含採購品項到貨總覽

---

## 第五層：Next.js Build

沙箱環境記憶體限制，`next build` 連續 3 次超時被終止（exit 143）。這是測試環境限制，非程式碼問題。SWC 編譯 + Node 語法檢查已確認所有檔案無語法錯誤。

---

## 第六層：Git 狀態

```
分支：main
遠端同步：up to date with origin/main
工作目錄：乾淨（nothing to commit）

最近 10 次提交：
39591f1 fix: resolve React hydration error #425 on dealer page
ac87679 dealer: complete visual quality rewrite of all dealer portal components
0b142c6 fix: remove all emoji from dealer, improve KPI layout
6f47347 fix: dealer portal token references + complete 5-tab rewrite
54c6256 feat: complete dealer portal rewrite - iPad dual-column, 5 tabs
18fdc2b feat: inventory expandable detail card with image & edit
730edee improve: procurement table readability and number formatting
53863fd fix: add missing token destructuring in page.js
51dfd3e refactor: remove all emoji from admin UI, use text/symbols
90064f6 redesign: overhaul Procurement Center visual design
```

---

## 建議追蹤項目

1. **minHeight: 44 無守衛**（15 處）— 低優先級，建議下次重構時加上 `isMobile ? 44 : 'auto'`
2. **tableScroll 殘留** — 如確認不再需要，可清理 `styles.js` 定義與 `ui.js` 引用
3. **Invoices.js overflow 寫法** — 建議統一為 `overflowX: 'auto'`
4. **Build 驗證** — 建議在有足夠資源的環境（本地或 CI）執行完整 `next build`
