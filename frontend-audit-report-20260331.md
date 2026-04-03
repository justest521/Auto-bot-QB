# QB ERP 前端 UI 一致性審查報告

**掃描日期：** 2026-03-31
**掃描範圍：** `app/admin/components/tabs/*.js`（共 58 個元件）

---

## 1. 樣式地雷掃描

| 檢查項目 | 結果 | 狀態 |
|----------|------|------|
| `S.tableScroll` 殘留 | 0 個 | ✅ 通過 |
| `margin: '0 -14px'` 直接使用 | 0 個 | ✅ 通過 |
| `minHeight: 44` 無 `isMobile` 條件判斷 | **15 處** | ⚠️ 需修復 |

### minHeight: 44 無 isMobile 保護的檔案清單

| 檔案 | 行號 | 按鈕文字 | 情境 |
|------|------|----------|------|
| **Quotes.js** | 406 | 保存 | 品項編輯按鈕群（桌面版也撐高） |
| **Quotes.js** | 407 | 取消 | 同上 |
| **Quotes.js** | 411 | 編輯 | 同上 |
| **Quotes.js** | 412 | 替換 | 同上 |
| **Quotes.js** | 413 | 刪除 | 同上 |
| **Payments.js** | 123 | 確認 | 列表內確認按鈕 |
| **Payments.js** | 169 | 取消 | 建立表單取消鈕 |
| **Returns.js** | 380 | 核准退貨 | 手機卡片內，但無 isMobile 判斷 |
| **Returns.js** | 455 | + 新增品項 | 建立表單內按鈕 |
| **Returns.js** | 459 | 取消 | 建立表單取消鈕 |
| **SalesDocuments.js** | 547 | 退回 | 手機展開列操作鈕 |
| **Shipments.js** | 479 | 出貨 | 手機卡片狀態按鈕 |
| **Shipments.js** | 480 | 送達 | 同上 |
| **Shipments.js** | 481 | 取消 | 同上 |
| **StockIn.js** | 350 | 確認入庫 | 手機卡片確認鈕 |

**建議修復：** 統一改為 `...(isMobile ? { minHeight: 44 } : {})`，避免桌面版按鈕不必要地撐高。

> **備註：** Shipments.js 479-481、StockIn.js 350、Returns.js 380 這幾處可能是手機卡片渲染區段內的按鈕（`width: '100%'`），如果該區段本身已在 `isMobile` 條件內渲染，則屬於安全使用。需人工確認渲染上下文。

---

## 2. 表格容器一致性

**標準模式（以 Orders.js 為基準）：**
```javascript
{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }
```

| 頁面 | 符合標準 | 差異說明 |
|------|---------|----------|
| **Orders.js** (L1414) | ✅ 基準 | — |
| **Quotes.js** (L891) | ✅ | 完全一致 |
| **SalesDocuments.js** (L552) | ✅ | 完全一致 |
| **Returns.js** (L386) | ✅ | 完全一致 |
| **PurchaseOrders.js** (L1310) | ✅ | 完全一致 |
| **StockIn.js** (L142, L357) | ⚠️ 微差 | border 用 `` `1px solid ${t.color.border}` `` 而非硬編碼 `#d1d5db`（功能正確，但不一致） |
| **Shipments.js** (L487) | ⚠️ 缺少 | 缺少 `marginBottom: 10` |
| **Inventory.js** | ⚠️ 不適用 | 使用 grid 佈局而非 `<table>`，無標準表格容器 |
| **Stocktake.js** (L50) | ⚠️ 偏離 | 用 `overflow: 'hidden'`，無 `overflowX: 'auto'`、無 `border`、無 `marginBottom` |
| **PurchaseReturns.js** | ⚠️ 偏離 | 無 `<table>` 元素，使用卡片式列表佈局，無標準表格容器 |
| **VendorPayments.js** (L189, L229) | ⚠️ 偏離 | 用 `overflow: 'auto'`（非 `overflowX`），無 `border`、無 `marginBottom` |

### 額外觀察到的非標準表格容器

| 頁面 | 差異 |
|------|------|
| **SalesReturns.js** (L149) | 缺少 `marginBottom: 10`，border 用 theme token |
| **StockAlerts.js** (L47) | ✅ 完全一致 |
| **ReorderSuggestions.js** (L49) | border 用 theme token |
| **Invoices.js** (L167) | 用 `overflow: 'auto'` 非 `overflowX`，border 用 theme token |
| **ReconciliationStatements.js** (L179) | 用 `overflow: 'auto'`，無 `marginBottom` |
| **PaymentRecords.js** (L218) | 用 `overflow: 'auto'`，border 用 theme token |
| **AccountsReceivable.js** (L224) | 用 `overflow: 'auto'`，無 `marginBottom` |

**建議：** 全面統一使用 `overflowX: 'auto'`，並加上 `border: '1px solid #d1d5db', marginBottom: 10`（或統一改用 `` `1px solid ${t.color.border}` ``，但需一致）。

---

## 3. 搜尋欄位檢查

所有含搜尋功能的頁面搜尋 `<input>` 均已包含 `flex: 1`。 ✅ 通過

已確認的頁面包括：Orders, Quotes, SalesDocuments, Returns, StockIn, PurchaseOrders, Shipments, Inventory, PurchaseReturns, VendorPayments, Payments, ChatHistory, Messages, ProfitAnalysis, Customers, ProductSearch, AccountsReceivable, DealerOrders, Vendors, Inquiries, FormalCustomers, SalesReturns。

---

## 4. 按鈕尺寸檢查（桌面版 minHeight: 44）

同第 1 節結果。共 **15 處**按鈕在桌面版也帶有 `minHeight: 44`。

重點檔案：

- **Quotes.js**（5 處）：品項行內操作按鈕（保存/取消/編輯/替換/刪除），這些 12px 的小按鈕被撐到 44px 高，桌面版視覺不協調。
- **Payments.js**（2 處）：列表確認鈕和表單取消鈕。
- **Returns.js**（3 處）：核准退貨、新增品項、取消。
- **Shipments.js**（3 處）：狀態操作按鈕（出貨/送達/取消）。
- **SalesDocuments.js**（1 處）：退回按鈕。
- **StockIn.js**（1 處）：確認入庫。

---

## 5. SWC 編譯檢查

| 項目 | 結果 |
|------|------|
| 總檔案數 | 58 |
| 編譯通過 | **58** |
| 編譯失敗 | **0** |

✅ 全部語法正確，無編譯錯誤。

---

## 6. 總結

| 檢查項目 | 狀態 | 問題數 |
|----------|------|--------|
| S.tableScroll 殘留 | ✅ 通過 | 0 |
| margin: '0 -14px' | ✅ 通過 | 0 |
| minHeight: 44 無 isMobile 保護 | ⚠️ 需注意 | 15 處 |
| 表格容器一致性 | ⚠️ 需統一 | 6 頁偏離標準 |
| 搜尋欄位 flex: 1 | ✅ 通過 | 0 |
| SWC 編譯 | ✅ 通過 | 0/58 |

### 優先修復建議

1. **P1 — Quotes.js 品項按鈕群（L406-413）：** 5 個按鈕都硬編碼 `minHeight: 44`，桌面版 12px 字體配 44px 高度視覺嚴重失調。建議改為 `...(isMobile ? { minHeight: 44 } : {})`。

2. **P2 — 表格容器統一：** VendorPayments、Stocktake 應對齊 Orders.js 標準模式。Shipments 補上 `marginBottom: 10`。

3. **P3 — border 寫法統一：** 部分用硬編碼 `#d1d5db`，部分用 `t.color.border`。建議統一使用 theme token `` `1px solid ${t.color.border}` `` 以支持未來主題切換。

4. **P3 — overflow 寫法統一：** 部分用 `overflow: 'auto'`，部分用 `overflowX: 'auto'`。建議統一用 `overflowX: 'auto'` 避免垂直方向非預期滾動。
