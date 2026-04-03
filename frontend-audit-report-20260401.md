# QB ERP 前端 UI 審查報告

**掃描日期：** 2026-04-01
**掃描範圍：** `app/admin/components/tabs/*.js`（共 60 個元件）

---

## 1. 樣式地雷掃描

| 檢查項目 | 結果 | 說明 |
|----------|------|------|
| `S.tableScroll` 殘留 | ✅ 0 個 | 已全數清除 |
| `margin: '0 -14px'` 直接使用 | ✅ 0 個 | 無殘留 |
| `minHeight: 44` 未用 `isMobile` 保護 | ✅ 0 個 | 所有使用均在 isMobile 區塊或手機 modal 內 |

**結論：樣式地雷已全數排除，無待修項目。**

---

## 2. 表格容器一致性

以 Orders.js（line 1414）為標準模式：
```javascript
{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db', marginBottom: 10 }
```

### 完全一致（4 個）

| 頁面 | 行號 |
|------|------|
| Quotes.js | 891 |
| SalesDocuments.js | 552 |
| Returns.js | 386 |
| PurchaseOrders.js | 1310 |

### 部分偏差（3 個）

| 頁面 | 行號 | 偏差說明 | 建議修復 |
|------|------|----------|----------|
| **StockIn.js** | 142, 357 | border 使用 `` `1px solid ${t.color.border}` `` 取代硬編碼 `#d1d5db` | 改為 `'1px solid #d1d5db'` 或將標準模式統一改用 theme token（推薦後者） |
| **Shipments.js** | 487 | 缺少 `marginBottom: 10` | 補上 `marginBottom: 10` |
| **VendorPayments.js** | 189, 229 | 使用 `overflow: 'auto'` 取代 `overflowX: 'auto'`；缺少 `border` 和 `marginBottom` | 改為標準模式 |

### 架構不同（3 個）——可接受

| 頁面 | 說明 |
|------|------|
| **Inventory.js** | 使用卡片式展開清單，非資料表格，模式不同屬合理 |
| **Stocktake.js** | 使用 `overflow: 'hidden'` + 巢狀滾動容器的 modal 架構 |
| **PurchaseReturns.js** | 清單式卡片佈局，無集中式表格容器 |

---

## 3. 搜尋欄位檢查

**檢查結果：✅ 全數通過**

所有包含搜尋功能的頁面（共 12 個）search input 均已設定 `flex: 1`：

Orders.js, Quotes.js, SalesDocuments.js, Returns.js, StockIn.js, PurchaseOrders.js, Shipments.js, Inventory.js, PurchaseReturns.js, VendorPayments.js, Customers.js, ChatHistory.js

> **備註：** PurchaseOrders.js 有一個廠商選擇器 modal 內的搜尋框（line 1015）未設 `flex: 1`，因為它是 modal 內的次要搜尋，非主搜尋列，屬可接受範圍。Stocktake.js 無搜尋列。

---

## 4. 按鈕尺寸檢查

**檢查結果：✅ 全數通過**

所有 `minHeight: 44` 的使用案例均符合以下正確模式之一：

- 位於 `isMobile ? ( ... ) : ( ... )` 的手機分支內
- 位於手機版 modal/dialog（`isMobile ? S.mobileModal`）內
- 搭配 `...(isMobile ? { minHeight: 44 } : {})` 三元運算式

未發現桌面版列表操作按鈕（複製、PDF、編輯等）帶有未保護的 `minHeight: 44`。

---

## 5. SWC 編譯驗證

**檢查結果：✅ 全數通過**

60 個 tab 元件全部透過 SWC 編譯（使用專案 `.swcrc` 設定，syntax: ecmascript + jsx），零語法錯誤。

---

## 6. 總結

| 檢查類別 | 狀態 | 待修數量 |
|----------|------|----------|
| 樣式地雷（S.tableScroll / margin / minHeight） | ✅ 通過 | 0 |
| 表格容器一致性 | ⚠️ 部分偏差 | **3 個檔案** |
| 搜尋欄位 flex:1 | ✅ 通過 | 0 |
| 按鈕尺寸保護 | ✅ 通過 | 0 |
| SWC 編譯 | ✅ 通過 | 0 |

### 建議修復清單（優先級排序）

1. **VendorPayments.js**（lines 189, 229）— 偏差最大，缺少 border、marginBottom，overflow 寫法不同
2. **Shipments.js**（line 487）— 僅缺 `marginBottom: 10`，一行修復
3. **StockIn.js**（lines 142, 357）— border 使用 theme token 而非硬編碼值；建議考慮將標準模式統一改用 `t.color.border`（StockIn 的做法反而更正確，可作為未來重構方向）

### 架構建議

StockIn.js 使用 `t.color.border` 作為 border 色值，這在主題化架構下其實比硬編碼 `#d1d5db` 更佳。建議未來統一將標準模式的 border 改為 `` `1px solid ${t.color.border}` ``，並以此為新標準。
