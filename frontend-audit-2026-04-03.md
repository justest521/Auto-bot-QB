# QB ERP 前端 UI 一致性審查報告

**掃描日期：** 2026-04-03
**掃描範圍：** `app/admin/components/tabs/*.js`（共 60 個元件）

---

## 1. 樣式地雷掃描

| 檢查項目 | 結果 |
|---|---|
| `S.tableScroll` 殘留 | ✅ 0 個，已全數清除 |
| `margin: '0 -14px'` 直接使用 | ✅ 0 個，未發現 |
| `minHeight: 44` 無 `isMobile` 條件 | ⚠️ 14 處違規（見第 4 節） |

---

## 2. 表格容器一致性

以 Orders.js 為標準模式：
```javascript
{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }
```

### ✅ 完全符合（4 個）

- **Quotes.js** — 完全一致
- **SalesDocuments.js** — 完全一致
- **Returns.js** — 完全一致
- **PurchaseOrders.js** — 完全一致

### ⚠️ 偏差（4 個）

| 檔案 | 問題 | 建議修復 |
|---|---|---|
| **StockIn.js** | border 使用 `` `1px solid ${t.color.border}` `` 而非硬編碼 `#d1d5db` | 統一為 `'1px solid #d1d5db'` 或全專案改用 theme 變數（較佳） |
| **Shipments.js** | 缺少 `marginBottom: 10` | 補上 `marginBottom: 10` |
| **Stocktake.js** | 使用 `overflow: 'hidden'`，缺少 border 與 marginBottom | 改為 `overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10` |
| **VendorPayments.js** | 使用 `overflow: 'auto'`，缺少 border 與 marginBottom | 改為 `overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10` |

### ℹ️ 無標準表格容器（2 個）

- **Inventory.js** — 使用卡片式列表佈局，非表格
- **PurchaseReturns.js** — 使用卡片式列表佈局，非表格

---

## 3. 搜尋欄位 `flex: 1` 檢查

**整體合規率：93%**（28/30 個含搜尋的檔案已正確實作）

### ⚠️ 需注意（2 個）

| 檔案 | 狀況 |
|---|---|
| **ProcurementCenter.js** | `flex: 1` 掛在外層 wrapper 而非 input 本身（功能正常但風格不一致） |
| **PulseModule.js** | 使用 grid 佈局，input 無 flex 設定（設計意圖不同，可接受） |

---

## 4. 按鈕 `minHeight: 44` 桌面版洩漏

共 **6 個檔案、14 處** 違規——`minHeight: 44` 未包在 `isMobile` 條件中，導致桌面版按鈕過高。

### Quotes.js — 5 處

- 保存、取消、編輯、替換、刪除按鈕（報價明細操作列）
- 修復：`...(isMobile ? { minHeight: 44 } : {})`

### Returns.js — 3 處

- 核准退貨按鈕（列表卡片內）
- 新增品項按鈕（建立 modal）
- 取消按鈕（建立 modal footer）

### Shipments.js — 3 處

- 出貨、送達、取消狀態按鈕（列表卡片內）

### StockIn.js — 1 處

- 確認入庫按鈕（待入庫卡片）

### Payments.js — 1 處

- 確認按鈕（待確認收款列）

### SalesDocuments.js — 1 處

- 退回按鈕（銷貨明細操作）

---

## 5. SWC 編譯檢查

✅ **全部 60 個 tab 元件皆通過 SWC 編譯，無語法錯誤。**

---

## 總結

| 類別 | 狀態 | 問題數 |
|---|---|---|
| S.tableScroll 殘留 | ✅ 通過 | 0 |
| margin: '0 -14px' | ✅ 通過 | 0 |
| 表格容器一致性 | ⚠️ 需修 | 4 個檔案 |
| 搜尋欄位 flex: 1 | ✅ 大致通過 | 2 個可忽略 |
| minHeight: 44 桌面洩漏 | ⚠️ 需修 | 6 個檔案 / 14 處 |
| SWC 編譯 | ✅ 通過 | 0 |

**優先修復建議：**

1. **高優先** — Quotes.js、Shipments.js、Returns.js 的 `minHeight: 44` 問題，這些是列表頁最常用的操作按鈕，桌面使用者會直接看到過高的按鈕。
2. **中優先** — Stocktake.js、VendorPayments.js 的表格容器修正（`overflow: 'hidden'` 會截斷寬表格內容）。
3. **低優先** — Shipments.js 補 marginBottom、StockIn.js border 色彩統一。
