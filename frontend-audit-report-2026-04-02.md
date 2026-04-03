# QB ERP 前端 UI 一致性審查報告

**掃描日期**: 2026-04-02
**掃描範圍**: `app/admin/components/tabs/*.js`（共 58 個元件）

---

## 1. 樣式地雷掃描

| 檢查項目 | 結果 | 狀態 |
|----------|------|------|
| `S.tableScroll` 殘留 | 0 個 | ✅ 通過 |
| `margin: '0 -14px'` 直接使用 | 0 個 | ✅ 通過 |

**結論**: 樣式地雷已全部清除，無殘留問題。

---

## 2. 表格容器一致性

以 Orders.js 標準模式為基準：
```js
{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }
```

| 檔案 | 狀態 | 差異說明 |
|------|------|----------|
| Orders.js | ✅ 標準 | 參考基準 |
| Quotes.js | ✅ 一致 | — |
| SalesDocuments.js | ✅ 一致 | — |
| Returns.js | ✅ 一致 | — |
| PurchaseOrders.js | ✅ 一致 | — |
| StockIn.js | ⚠️ 微差 | border 使用 `t.color.border` 而非硬編碼 `#d1d5db` |
| Shipments.js | ⚠️ 微差 | 缺少 `marginBottom: 10` |
| Inventory.js | ❌ 偏離 | 使用 `overflow: 'hidden'` + 巢狀 div，無 border、無 marginBottom |
| Stocktake.js | ❌ 偏離 | 使用 `overflow: 'hidden'` + 巢狀 div，無 border、無 marginBottom |
| PurchaseReturns.js | ❌ 偏離 | 使用 `{ ...S.card, marginBottom: 10 }`，無標準表格容器模式 |
| VendorPayments.js | ❌ 偏離 | 使用 `overflow: 'auto'` 而非 `overflowX: 'auto'`，無 border、無 marginBottom |

**通過率**: 5/11（45%）
**需修正**: 4 個顯著偏離 + 2 個微差

### 建議修復

**Inventory.js / Stocktake.js**: 將表格外層容器改為標準模式，移除巢狀 overflow div。

**Shipments.js**: 補上 `marginBottom: 10`。

**VendorPayments.js**: 將 `overflow: 'auto'` 改為 `overflowX: 'auto'`，加上 `border: '1px solid #d1d5db'` 與 `marginBottom: 10`。

**PurchaseReturns.js**: 加入標準表格容器包裝。

**StockIn.js**: 非必要修正——使用 theme token 比硬編碼更好，但與其他頁面不一致。可考慮統一為 theme token。

---

## 3. 搜尋欄位 `flex: 1` 檢查

共 33 個含搜尋功能的頁面，其中 3 個有問題：

| 檔案 | 問題 | 建議 |
|------|------|------|
| Tickets.js (L142) | `flex: isMobile ? 0 : 1` — 手機版搜尋框不會撐滿 | 改為 `flex: 1` |
| LineChat.js | 使用 `width: '100%'` 無 flex 屬性 | 加上 `flex: 1` |
| SalesReturns.js | `flex: isMobile ? 1 : 1` — 冗餘條件判斷 | 簡化為 `flex: 1` |

**通過率**: 30/33（91%）

---

## 4. 按鈕 `minHeight: 44` 桌面版洩漏檢查

以下按鈕在桌面版也會套用 `minHeight: 44`（缺少 `isMobile` 條件判斷）：

| 檔案 | 行號 | 按鈕文字 | 說明 |
|------|------|----------|------|
| Quotes.js | 406-413 | 保存/取消/編輯/替換/刪除 | 報價單品項操作按鈕，5 個都硬編碼 minHeight: 44 |
| SalesDocuments.js | 547 | 退回 | 銷售文件退回按鈕 |
| Returns.js | 380 | 核准退貨 | 手機卡片內按鈕（可能在 isMobile 區塊內，需確認） |
| Returns.js | 455 | + 新增品項 | 建立退貨表單中的按鈕 |
| Returns.js | 459 | 取消 | 建立退貨表單取消按鈕 |
| StockIn.js | 350 | 確認入庫 | 手機卡片內按鈕（在 isMobile 區塊中，實際無問題） |
| Shipments.js | 479-481 | 出貨/送達/取消 | 出貨狀態操作按鈕，3 個都硬編碼 |
| Payments.js | 123 | 確認 | 收款確認按鈕 |
| Payments.js | 169 | 取消 | 建立收款取消按鈕 |

**注意**: 部分按鈕可能位於已有 `isMobile` 條件渲染的區塊內（如手機版卡片），需逐一確認上下文。明確有問題的是 Quotes.js（5 個按鈕）、Shipments.js（3 個按鈕）、Payments.js（2 個按鈕）。

**建議修復**: 將硬編碼的 `minHeight: 44` 改為 `...(isMobile ? { minHeight: 44 } : {})`。

---

## 5. SWC 編譯檢查

對全部 58 個 tab 元件執行 SWC 編譯：

**結果: ✅ 全部通過**

所有檔案均無語法錯誤，可正常編譯。

---

## 總結

| 檢查項目 | 結果 |
|----------|------|
| 樣式地雷（S.tableScroll / margin 0 -14px） | ✅ 全部清除 |
| 表格容器一致性 | ⚠️ 4 個偏離 + 2 個微差 |
| 搜尋欄位 flex: 1 | ⚠️ 3 個問題 |
| 按鈕 minHeight: 44 桌面洩漏 | ⚠️ ~10 個按鈕需加 isMobile 判斷 |
| SWC 編譯 | ✅ 全部通過 |

### 優先修復建議

1. **高優先**: Inventory.js、Stocktake.js、VendorPayments.js 表格容器統一為標準模式
2. **中優先**: Quotes.js、Shipments.js、Payments.js 按鈕加上 isMobile 條件
3. **低優先**: Tickets.js 搜尋框 flex 修正、SalesReturns.js 冗餘條件簡化、Shipments.js 補 marginBottom
