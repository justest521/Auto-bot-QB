'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import S from '@/lib/admin/styles';
import { API, ADMIN_TOKEN_KEY, apiGet, apiPost } from '@/lib/admin/api';
import { useViewportWidth } from '@/lib/admin/helpers';
import { HEADER_ACTION_PORTAL_ID } from './components/shared/ui';
import { UnsavedChangesProvider, useUnsavedGuard } from './components/shared/UnsavedChangesGuard';

// ── Tab Components ──
import EnvHealth from './components/tabs/EnvHealth';
import ReportCenter from './components/tabs/ReportCenter';
import Dashboard from './components/tabs/Dashboard';
import FormalCustomers from './components/tabs/FormalCustomers';
import Customers from './components/tabs/Customers';
import Quotes from './components/tabs/Quotes';
import Orders from './components/tabs/Orders';
import SalesDocuments from './components/tabs/SalesDocuments';
import Messages from './components/tabs/Messages';
import LineChat from './components/tabs/LineChat';
import LineCRM from './components/tabs/LineCRM';
import ProductSearch from './components/tabs/ProductSearch';
import ImportCenter from './components/tabs/ImportCenter';
import Vendors from './components/tabs/Vendors';
import SalesReturns from './components/tabs/SalesReturns';
import ProfitAnalysis from './components/tabs/ProfitAnalysis';
import Promotions from './components/tabs/Promotions';
import PricingRules from './components/tabs/PricingRules';
import Inventory from './components/tabs/Inventory';
// import Payments from './components/tabs/Payments'; // removed
import Shipments from './components/tabs/Shipments';
import Returns from './components/tabs/Returns';

import AIPrompt from './components/tabs/AIPrompt';
import ChatHistory from './components/tabs/ChatHistory';
import PurchaseOrders from './components/tabs/PurchaseOrders';
import QuickReceive from './components/tabs/QuickReceive';
import ProcurementCenter from './components/tabs/ProcurementCenter';
import StockIn from './components/tabs/StockIn';
import PurchaseReturns from './components/tabs/PurchaseReturns';
import VendorPayments from './components/tabs/VendorPayments';
import Stocktake from './components/tabs/Stocktake';
import StockAdjustments from './components/tabs/StockAdjustments';
import PSIReport from './components/tabs/PSIReport';
import FinancialReport from './components/tabs/FinancialReport';
import DealerUsers from './components/tabs/DealerUsers';
import DealerOrders from './components/tabs/DealerOrders';
import Announcements from './components/tabs/Announcements';
import CRMLeads from './components/tabs/CRMLeads';
import StockAlerts from './components/tabs/StockAlerts';
import ReorderSuggestions from './components/tabs/ReorderSuggestions';
import Invoices from './components/tabs/Invoices';
import Approvals from './components/tabs/Approvals';
import Tickets from './components/tabs/Tickets';
import UserManagement from './components/tabs/UserManagement';
import PartsExchange from './components/tabs/PartsExchange';
import EquipmentLease from './components/tabs/EquipmentLease';
import AIForecast from './components/tabs/AIForecast';
import Flowchart from './components/tabs/Flowchart';
import CompanySettings from './components/tabs/CompanySettings';
import AccountsReceivable from './components/tabs/AccountsReceivable';
import ReconciliationStatements from './components/tabs/ReconciliationStatements';
import PaymentRecords from './components/tabs/PaymentRecords';
import PaymentMatching from './components/tabs/PaymentMatching';

// ── SECTIONS ──
const SECTION_ICONS = {
  'ERP 總覽': { icon: '\u25C9', bg: '#ede9fe', fg: '#7c3aed' },
  'ERP 主檔資料': { icon: '\u2630', bg: '#e0f2fe', fg: '#0284c7' },
  'ERP 採購進貨': { icon: '\u2B07', bg: '#fef3c7', fg: '#d97706' },
  'ERP 銷售出貨': { icon: '\u2B06', bg: '#dcfce7', fg: '#16a34a' },
  'ERP 倉儲管理': { icon: '\u2338', bg: '#f3e8ff', fg: '#9333ea' },
  'ERP 分析報表': { icon: '\u2637', bg: '#fce7f3', fg: '#db2777' },
  'CRM 客戶管線': { icon: '\u2764', bg: '#fce7f3', fg: '#ec4899' },
  'ERP 財務會計': { icon: '\u2696', bg: '#ccfbf1', fg: '#0d9488' },
  'ERP 審批簽核': { icon: '\u2611', bg: '#ede9fe', fg: '#7c3aed' },
  '客服工單': { icon: '\u260E', bg: '#cffafe', fg: '#0891b2' },
  '經銷商入口': { icon: '\u263A', bg: '#ede9fe', fg: '#8b5cf6' },
  'LINE 與系統': { icon: '\u269B', bg: '#dcfce7', fg: '#06c755' },
  '系統管理': { icon: '\u2699', bg: '#f3f4f6', fg: '#374151' },
};

const SECTIONS = [
  {
    title: 'ERP 總覽',
    tabs: [
      { id: 'flowchart', label: '系統流程圖', code: 'FLOW' },
      { id: 'env_health', label: '環境檢查', code: 'HEAL' },
      { id: 'report_center', label: '進銷存報表', code: 'A1' },
      { id: 'dashboard', label: '儀表板', code: 'DASH' },
    ],
  },
  {
    title: 'ERP 主檔資料',
    tabs: [
      { id: 'customers', label: '客戶主檔', code: 'CUST' },
      { id: 'products', label: '產品查價', code: 'SRCH' },
      { id: 'vendors', label: '廠商主檔', code: 'VNDR' },
      { id: 'line_customers', label: 'LINE 客戶', code: 'LINE' },
    ],
  },
  {
    title: 'ERP 採購進貨',
    tabs: [
      { id: 'quick_receive', label: '快速進貨', code: 'RCIV' },
      { id: 'purchase_orders', label: '採購單', code: 'PO' },
      { id: 'procurement_center', label: '採購中心', code: 'PC' },
      { id: 'stock_in', label: '進貨單', code: 'SI' },
      { id: 'purchase_returns', label: '進貨退出', code: 'PRTN' },
      { id: 'vendor_payments', label: '付款單', code: 'VP' },
    ],
  },
  {
    title: 'ERP 銷售出貨',
    tabs: [

      { id: 'quotes', label: '報價單', code: 'QUOT' },
      { id: 'orders', label: '訂單', code: 'ORDR' },
      { id: 'sales_documents', label: '銷貨單', code: 'SALE' },
      { id: 'shipments', label: '出貨管理', code: 'SHIP' },
      { id: 'returns', label: '退貨管理', code: 'RTN' },
      { id: 'parts_exchange', label: '🔮 零件交易所', code: 'PTEX' },
      { id: 'equipment_lease', label: '🔮 設備租賃', code: 'LEAS' },
    ],
  },
  {
    title: 'ERP 倉儲管理',
    tabs: [
      { id: 'inventory', label: '庫存總覽', code: 'INVT' },
      { id: 'stock_alerts', label: '庫存警示', code: 'ALRT' },
      { id: 'reorder', label: '補貨建議', code: 'REOD' },
      { id: 'stocktake', label: '盤點作業', code: 'STTK' },
      { id: 'stock_adjustments', label: '調整單', code: 'ADJ' },
    ],
  },
  {
    title: 'ERP 分析報表',
    tabs: [
      { id: 'psi_report', label: '進銷存報表', code: 'PSI' },
      { id: 'financial_report', label: '財務報表', code: 'FIN' },
      { id: 'sales_returns', label: '銷退貨彙總', code: 'RETN' },
      { id: 'profit_analysis', label: '利潤分析', code: 'PFT' },
      { id: 'ai_forecast', label: '🔮 AI 預測', code: 'AIFC' },
      { id: 'imports', label: '資料匯入', code: 'IMPT' },
    ],
  },
  {
    title: 'CRM 客戶管線',
    accent: '#ec4899',
    tabs: [
      { id: 'crm_leads', label: '商機管線', code: 'CRM' },
    ],
  },
  {
    title: 'ERP 財務會計',
    accent: '#0d9488',
    tabs: [
      { id: 'invoices', label: '發票管理', code: 'INV' },
      { id: 'accounts_receivable', label: '應收帳款', code: 'AR' },
      { id: 'reconciliation', label: '對帳單', code: 'RCON' },
      { id: 'payment_records', label: '收款登錄', code: 'RCPT' },
      { id: 'payment_matching', label: '沖帳配對', code: 'MTCH' },
    ],
  },
  {
    title: 'ERP 審批簽核',
    accent: '#7c3aed',
    tabs: [
      { id: 'approvals', label: '簽核審批', code: 'APPR' },
    ],
  },
  {
    title: '客服工單',
    accent: '#0891b2',
    tabs: [
      { id: 'tickets', label: '工單管理', code: 'TCKT' },
    ],
  },
  {
    title: '經銷商入口',
    accent: '#8b5cf6',
    tabs: [
      { id: 'dealer_users', label: '帳號管理', code: 'DUSR' },
      { id: 'dealer_orders', label: '經銷商訂單', code: 'DORD' },
      { id: 'announcements', label: '公告管理', code: 'ANN' },
    ],
  },
  {
    title: 'LINE 與系統',
    accent: '#06c755',
    tabs: [
      { id: 'line_chat', label: '聊天視窗', code: 'CHAT' },
      { id: 'line_crm', label: '客戶標籤', code: 'TAG' },
      { id: 'messages', label: 'AI 對話紀錄', code: 'MSG' },
      { id: 'ai_prompt', label: 'AI Prompt 設定', code: 'AI' },
      { id: 'chat_history', label: '歷史對話', code: 'HIST' },
      { id: 'promotions', label: '活動管理', code: 'PRMO' },
      { id: 'pricing', label: '報價規則', code: 'PRCE' },
    ],
  },
  {
    title: '系統管理',
    accent: '#374151',
    tabs: [
      { id: 'user_management', label: '使用者管理', code: 'UMGT' },
      { id: 'company_settings', label: '公司設定', code: 'CSET' },
    ],
  },
];

// Tab metadata for header display (eyebrow + title + description)
const TAB_META = {
  flowchart: { eyebrow: 'Flowchart', title: '系統流程圖' },
  env_health: { eyebrow: 'Environment', title: 'ERP 環境檢查', desc: '檢查資料庫表與模組就緒狀態。' },
  report_center: { eyebrow: 'A1 Mapping', title: '進銷存報表中心', desc: '用鼎新 A1 邏輯整理 ERP 模組報表。' },
  dashboard: { eyebrow: 'Dashboard', title: '營運儀表板', desc: '查詢量、客戶互動與熱門產品。' },
  customers: { eyebrow: 'Customers', title: '正式客戶', desc: '正式客戶主檔，支援編輯與銷售記錄。' },
  products: { eyebrow: 'Product Master', title: '商品主檔', desc: '維護商品狀態、分類、替代型號與價格。' },
  vendors: { eyebrow: 'Vendors', title: '廠商主檔', desc: '供應商主檔、聯絡窗口與統編資訊。' },
  line_customers: { eyebrow: 'Customers', title: '客戶綜合管理', desc: 'LINE 客戶與正式客戶綜合查看。' },
  quick_receive: { eyebrow: 'Quick Receive', title: '快速進貨', desc: '上傳 CSV、拍照或手打料號，一鍵完成入庫並推進等待訂單。' },
  purchase_orders: { eyebrow: 'Purchase Orders', title: '採購單', desc: '建立對廠商的採購訂單，確認後可轉進貨單入庫。' },
  procurement_center: { eyebrow: 'Procurement Center', title: '採購中心', desc: '所有採購品項到貨進度、配貨建議總覽。' },
  stock_in: { eyebrow: 'Stock In', title: '進貨單', desc: '記錄廠商進貨入庫，確認後自動增加庫存。' },
  purchase_returns: { eyebrow: 'Purchase Returns', title: '進貨退出', desc: '將已進貨商品退回廠商，自動扣減庫存。' },
  vendor_payments: { eyebrow: 'Vendor Payments', title: '付款單', desc: '管理對廠商的付款記錄。' },
  quotes: { eyebrow: 'Quotes', title: '報價單', desc: '管理報價單，確認後可轉為訂單。' },
  orders: { eyebrow: 'Orders', title: '訂單', desc: '自動比對庫存，有貨可轉銷貨，缺貨可轉採購。' },
  sales_documents: { eyebrow: 'Sales', title: '銷貨單', desc: '查看銷貨單、發票號碼與毛利。' },
  shipments: { eyebrow: 'Shipments', title: '出貨管理', desc: '追蹤訂單出貨進度與物流資訊。' },
  returns: { eyebrow: 'Returns', title: '退貨管理', desc: '管理客戶退貨申請、審核與庫存回補。' },
  promotions: { eyebrow: 'Campaigns', title: '活動管理', desc: '建立促銷活動與優惠檔期。' },
  pricing: { eyebrow: 'Pricing', title: '報價規則', desc: '調整折扣、免運門檻與提示文字。' },
  parts_exchange: { eyebrow: 'Parts Exchange', title: '零件交易所' },
  equipment_lease: { eyebrow: 'Equipment Lease', title: '設備租賃' },
  inventory: { eyebrow: 'Inventory', title: '庫存管理', desc: '即時掌握庫存量與安全庫存水位。' },
  stock_alerts: { eyebrow: 'Stock Alerts', title: '庫存警示', desc: '低於安全庫存的商品一覽。' },
  reorder: { eyebrow: 'Reorder', title: '補貨建議', desc: '根據安全庫存自動產生補貨建議。' },
  stocktake: { eyebrow: 'Stocktake', title: '盤點精靈', desc: '建立盤點單並調整庫存差異。' },
  stock_adjustments: { eyebrow: 'Adjustments', title: '調整單', desc: '手動調整商品庫存數量。' },
  psi_report: { eyebrow: 'PSI Report', title: '進銷存報表', desc: '銷貨、進貨、退貨金額彙總。' },
  financial_report: { eyebrow: 'Financial', title: '財務報表', desc: '應收帳款、應付帳款與淨現金流。' },
  sales_returns: { eyebrow: 'Returns', title: '銷退貨彙總', desc: '銷貨與退貨單據彙總。' },
  profit_analysis: { eyebrow: 'Profit', title: '利潤分析', desc: '銷貨利潤、成本與毛利分析。' },
  ai_forecast: { eyebrow: 'AI Forecast', title: 'AI 預測' },
  imports: { eyebrow: 'Import', title: '資料匯入', desc: '匯入 CSV 或 Excel 資料。' },
  crm_leads: { eyebrow: 'CRM Pipeline', title: '商機管線', desc: '追蹤線索到成交的完整流程。' },
  invoices: { eyebrow: 'Invoices', title: '發票管理', desc: '管理發票開立與付款狀態追蹤。' },
  accounts_receivable: { eyebrow: 'Accounts Receivable', title: '應收帳款', desc: '追蹤客戶應收帳款餘額與帳齡分析。' },
  reconciliation: { eyebrow: 'Reconciliation', title: '對帳單', desc: '產生客戶對帳單，核對銷貨與收款紀錄。' },
  payment_records: { eyebrow: 'Payment Records', title: '收款登錄', desc: '登錄客戶匯款、現金、支票等收款資訊。' },
  payment_matching: { eyebrow: 'Payment Matching', title: '沖帳配對', desc: '將收款單與應收帳款配對沖銷。' },
  approvals: { eyebrow: 'Approvals', title: '簽核審批', desc: '集中管理文件的核准流程。' },
  tickets: { eyebrow: 'Helpdesk', title: '客服工單', desc: '客服工單管理。' },
  dealer_users: { eyebrow: 'Dealer Users', title: '經銷商帳號', desc: '管理帳號、角色與權限。' },
  dealer_orders: { eyebrow: 'Dealer Orders', title: '經銷商訂單', desc: '經銷商訂單管理。' },
  announcements: { eyebrow: 'Announcements', title: '公告管理', desc: '發布公告給經銷商/業務/技師。' },
  line_chat: { eyebrow: 'LINE Chat', title: '聊天視窗' },
  line_crm: { eyebrow: 'LINE CRM', title: '客戶標籤管理', desc: '管理 LINE 客戶標籤與自動分類。' },
  messages: { eyebrow: 'Messages', title: 'AI 對話紀錄', desc: '檢視客戶提問與 AI 回覆表現。' },
  ai_prompt: { eyebrow: 'Prompt', title: 'AI Prompt 設定', desc: '調整 Bot 回覆風格與客服 SOP。' },
  chat_history: { eyebrow: 'LINE Archive', title: '歷史對話', desc: '檢視匯入的 LINE 對話資料。' },
  user_management: { eyebrow: 'Users', title: '使用者管理', desc: '管理後台使用者帳號與權限。' },
  company_settings: { eyebrow: 'Settings', title: '公司設定', desc: '設定公司資訊與 Logo。' },
};

const TAB_COMPONENTS = {
  flowchart: Flowchart,
  env_health: EnvHealth,
  report_center: ReportCenter,
  dashboard: Dashboard,
  customers: FormalCustomers,
  line_customers: Customers,
  quotes: Quotes,
  orders: Orders,
  sales_documents: SalesDocuments,
  messages: Messages,
  line_chat: LineChat,
  line_crm: LineCRM,
  products: ProductSearch,
  imports: ImportCenter,
  vendors: Vendors,
  sales_returns: SalesReturns,
  profit_analysis: ProfitAnalysis,
  promotions: Promotions,
  pricing: PricingRules,
  inventory: Inventory,
  shipments: Shipments,
  returns: Returns,

  ai_prompt: AIPrompt,
  chat_history: ChatHistory,
  quick_receive: QuickReceive,
  purchase_orders: PurchaseOrders,
  procurement_center: ProcurementCenter,
  stock_in: StockIn,
  purchase_returns: PurchaseReturns,
  vendor_payments: VendorPayments,
  stocktake: Stocktake,
  stock_adjustments: StockAdjustments,
  psi_report: PSIReport,
  financial_report: FinancialReport,
  dealer_users: DealerUsers,
  dealer_orders: DealerOrders,
  announcements: Announcements,
  crm_leads: CRMLeads,
  stock_alerts: StockAlerts,
  reorder: ReorderSuggestions,
  invoices: Invoices,
  accounts_receivable: AccountsReceivable,
  reconciliation: ReconciliationStatements,
  payment_records: PaymentRecords,
  payment_matching: PaymentMatching,
  approvals: Approvals,
  tickets: Tickets,
  user_management: UserManagement,
  parts_exchange: PartsExchange,
  equipment_lease: EquipmentLease,
  ai_forecast: AIForecast,
  company_settings: CompanySettings,
};

// ── Sidebar Hooks ──
const FAV_STORAGE_KEY = 'qb_admin_favorites';
const COLLAPSED_STORAGE_KEY = 'qb_admin_collapsed';

function useFavorites() {
  const [favs, setFavs] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(FAV_STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const toggle = (tabId) => {
    setFavs((prev) => {
      const next = prev.includes(tabId) ? prev.filter((id) => id !== tabId) : [...prev, tabId];
      try { window.localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  return { favs, toggle, isFav: (id) => favs.includes(id) };
}

function useCollapsed() {
  // Accordion mode: default all collapsed; only one section open at a time
  const allCollapsed = Object.fromEntries(SECTIONS.map(s => [s.title, true]));
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) || '{}');
      // Migrate: ensure all sections default to collapsed
      const merged = { ...allCollapsed };
      for (const k of Object.keys(saved)) { if (k in merged) merged[k] = saved[k]; }
      return merged;
    } catch { return allCollapsed; }
  });
  const toggle = (title) => {
    setCollapsed((prev) => {
      const wasCollapsed = prev[title];
      // Accordion: close all, then open the clicked one (if it was closed)
      const next = { ...allCollapsed, [title]: !wasCollapsed };
      try { window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const collapseAll = () => {
    setCollapsed(() => {
      try { window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(allCollapsed)); } catch {}
      return allCollapsed;
    });
  };
  const expandSection = (title) => {
    setCollapsed(() => {
      const next = { ...allCollapsed, [title]: false };
      try { window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  return { collapsed, toggle, collapseAll, expandSection };
}

// ══════════════════════════════════════════════════════════════
//  ADMIN PAGE — Main orchestrator
// ══════════════════════════════════════════════════════════════
export default function AdminPage() {
  return (
    <UnsavedChangesProvider>
      <AdminPageInner />
    </UnsavedChangesProvider>
  );
}

function AdminPageInner() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [token, setToken] = useState('');
  const [isAuthed, setIsAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [tab, setTabRaw] = useState('report_center');
  const [sidebarStats, setSidebarStats] = useState(null);
  const [pendingBadges, setPendingBadges] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarPopup, setSidebarPopup] = useState(null); // section title when popup is open
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 }); // portal popup position
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false); // 手機版抽屜 sidebar
  const sectionRefs = useRef({});
  const [companySettings, setCompanySettings] = useState(null);
  // headerAction is rendered via portal from PageLead into HEADER_ACTION_PORTAL_ID div
  const { favs, toggle: toggleFav, isFav } = useFavorites();
  const { collapsed, toggle: toggleCollapsed, collapseAll, expandSection } = useCollapsed();
  // Unsaved changes guard
  const { confirmIfDirty } = useUnsavedGuard();
  // Wrapped setTab: auto-expand the parent section (accordion) + unsaved guard
  const setTab = useCallback((tabId) => {
    confirmIfDirty(() => {
      setTabRaw(tabId);
      const parentSection = SECTIONS.find(s => s.tabs.some(t => t.id === tabId));
      if (parentSection) expandSection(parentSection.title);
    });
  }, [expandSection, confirmIfDirty]);
  // On mount: expand the section of the default tab
  useEffect(() => {
    const parentSection = SECTIONS.find(s => s.tabs.some(t => t.id === tab));
    if (parentSection) expandSection(parentSection.title);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Close sidebar popup on click outside
  useEffect(() => {
    if (!sidebarPopup) return;
    const handler = () => setSidebarPopup(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [sidebarPopup]);
  const ActiveTab = TAB_COMPONENTS[tab] || Dashboard;

  // ── New auth states ──
  const [loginStep, setLoginStep] = useState('credentials');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpUserId, setOtpUserId] = useState('');
  const [otpMaskedEmail, setOtpMaskedEmail] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (saved) {
      setToken(saved);
      setAuthLoading(true);
      apiGet({ action: 'me' })
        .then((data) => {
          setIsAuthed(true);
          setAuthError('');
          setCurrentUser(data.user || null);
          setUserPermissions(data.permissions || []);
          return apiGet({ action: 'stats' });
        })
        .then((data) => {
          setSidebarStats({ products: data?.total_messages ?? '-', chats: data?.total_messages ?? '-' });
          Promise.all([
            apiGet({ action: 'products', limit: '1' }).catch(() => null),
            apiGet({ action: 'chat_history_stats' }).catch(() => null),
            apiGet({ action: 'company_settings' }).catch(() => null),
          ]).then(([prodRes, chatRes, csRes]) => {
            setSidebarStats({ products: prodRes?.total ?? '-', chats: chatRes?.total ?? '-' });
            if (csRes?.settings) setCompanySettings(csRes.settings);
          });
        })
        .catch((error) => {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          setAuthError(error.message || '登入失敗，請重新登入');
        })
        .finally(() => setAuthLoading(false));
    }
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    const fetchBadges = () => {
      apiGet({ action: 'pending_badges' }).then((res) => setPendingBadges(res || {})).catch(() => {});
    };
    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [isAuthed, tab]);

  const handleLoginStep1 = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login_step1', username: loginUsername.trim(), password: loginPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登入失敗');
      setOtpUserId(data.userId);
      setOtpMaskedEmail(data.maskedEmail);
      setLoginStep('otp');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginStep2 = async () => {
    if (!otpCode.trim()) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login_step2', userId: otpUserId, otpCode: otpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '驗證失敗');
      window.localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setToken(data.token);
      setCurrentUser(data.user || null);
      setUserPermissions(data.permissions || []);
      setIsAuthed(true);
      setLoginStep('credentials');
      setLoginPassword('');
      setOtpCode('');
      apiGet({ action: 'company_settings' }).then(r => { if (r?.settings) setCompanySettings(r.settings); }).catch(() => {});
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const loginLegacy = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setAuthLoading(true);
    setAuthError('');
    window.localStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
    try {
      const data = await apiGet({ action: 'me' });
      setCurrentUser(data.user || null);
      setUserPermissions(data.permissions || []);
      setIsAuthed(true);
    } catch (error) {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
      setAuthError(error.message || '登入失敗，請確認 Token');
      setIsAuthed(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    try { await apiPost({ action: 'logout' }); } catch {}
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAuthed(false);
    setToken('');
    setCurrentUser(null);
    setUserPermissions([]);
    setAuthError('');
    setLoginStep('credentials');
    setLoginUsername('');
    setLoginPassword('');
    setOtpCode('');
  };

  const hasTab = (tabCode) => {
    if (currentUser?.role === 'admin' || userPermissions.length === 0) return true;
    return userPermissions.includes(tabCode);
  };

  // ── LOGIN PAGE ──
  if (!isAuthed) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #dcfce7 0%, #f5f6f7 50%, #dcfce7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 440, background: '#ffffff', borderRadius: 20, padding: '36px 32px', color: '#111827', boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, ...S.mono }}>QB</div>
            <div>
              <div style={{ color: '#111827', fontSize: 18, fontWeight: 700 }}>Auto-bot QB</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>管理後台登入</div>
            </div>
          </div>

          {loginStep === 'credentials' && (
            <>
              <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>輸入帳號密碼登入，系統會寄驗證碼到你的 Email。</div>
              <div style={{ display: 'grid', gap: 12 }}>
                <input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && document.getElementById('qb-pw')?.focus()} placeholder="帳號或 Email" autoComplete="username" style={{ ...S.input }} />
                <input id="qb-pw" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLoginStep1()} placeholder="密碼" autoComplete="current-password" style={{ ...S.input }} />
              </div>
              {authError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>{authError}</div>}
              <button onClick={handleLoginStep1} disabled={authLoading} style={{ ...S.btnPrimary, width: '100%', marginTop: 16, padding: '12px 20px', fontSize: 14, opacity: authLoading ? 0.7 : 1 }}>{authLoading ? '驗證中...' : '下一步'}</button>
              <button onClick={() => setLoginStep('legacy')} style={{ ...S.btnGhost, width: '100%', marginTop: 8, padding: '10px 20px', fontSize: 12, color: '#6b7280' }}>使用 Token 登入（舊版）</button>
            </>
          )}

          {loginStep === 'otp' && (
            <>
              <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>驗證碼已寄到 <span style={{ color: '#111827', fontWeight: 600 }}>{otpMaskedEmail}</span>，請輸入 6 位數驗證碼。</div>
              <input value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && handleLoginStep2()} placeholder="000000" maxLength={6} autoFocus style={{ ...S.input, textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: 700, ...S.mono }} />
              {authError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>{authError}</div>}
              <button onClick={handleLoginStep2} disabled={authLoading || otpCode.length < 6} style={{ ...S.btnPrimary, width: '100%', marginTop: 16, padding: '12px 20px', fontSize: 14, opacity: (authLoading || otpCode.length < 6) ? 0.7 : 1 }}>{authLoading ? '驗證中...' : '登入'}</button>
              <button onClick={() => { setLoginStep('credentials'); setAuthError(''); setOtpCode(''); }} style={{ ...S.btnGhost, width: '100%', marginTop: 8, padding: '10px 20px', fontSize: 12, color: '#6b7280' }}>返回</button>
            </>
          )}

          {loginStep === 'legacy' && (
            <>
              <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>請輸入管理後台 Token（舊版登入方式）。</div>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loginLegacy()} placeholder="ADMIN_TOKEN" style={{ ...S.input }} />
              {authError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>{authError}</div>}
              <button onClick={loginLegacy} disabled={authLoading} style={{ ...S.btnPrimary, width: '100%', marginTop: 16, padding: '12px 20px', fontSize: 14, opacity: authLoading ? 0.7 : 1 }}>{authLoading ? '驗證中...' : '進入後台'}</button>
              <button onClick={() => { setLoginStep('credentials'); setAuthError(''); }} style={{ ...S.btnGhost, width: '100%', marginTop: 8, padding: '10px 20px', fontSize: 12, color: '#6b7280' }}>使用帳密登入</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── MAIN LAYOUT ──
  return (
    <div style={S.page}>
      <style>{`
        html,body{background:#fdfdfe!important;margin:0;padding:0}
        body > div:first-child{min-height:100vh;background:#fdfdfe}
        *{box-sizing:border-box}
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <style>{`
        .qb-sb-item{transition:all 0.2s ease}
        .qb-sb-item:hover{background:rgba(22,163,74,0.06)!important;backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(22,163,74,0.08), inset 0 1px 0 rgba(255,255,255,0.7);border-color:rgba(22,163,74,0.1)!important}
        .qb-sb-star{opacity:0;transition:opacity 0.15s}
        .qb-sb-item:hover .qb-sb-star{opacity:1}
        .qb-sb-star.is-fav{opacity:1;color:#f59e0b!important}
        .qb-sb-section-hdr{transition:all 0.2s ease}
        .qb-sb-section-hdr:hover{background:rgba(22,163,74,0.04);backdrop-filter:blur(8px);box-shadow:0 1px 8px rgba(22,163,74,0.06), inset 0 1px 0 rgba(255,255,255,0.6)}
        .qb-sb-search:focus{border-color:#16a34a!important;box-shadow:0 0 0 3px rgba(22,163,74,0.1)!important}
        .qb-sb::-webkit-scrollbar{width:3px}
        .qb-sb::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
        .qb-sb::-webkit-scrollbar-track{background:transparent}
        .qb-sb-section-hdr:hover{background:#f3f4f6!important}
        .qb-sb-item:hover{background:#f3f4f6!important}
        input:focus,select:focus,textarea:focus{border-color:#16a34a!important;box-shadow:0 0 0 3px rgba(22,163,74,0.08)!important}
        .qb-card-hover:hover{background:#E8F2EE!important;border-color:#E8F2EE!important;box-shadow:0 4px 16px rgba(22,163,74,0.12), 6px 6px 16px rgba(0,0,0,0.04)!important;transform:translateY(-1px)}
        .qb-card-hover{transition:all 0.25s ease;cursor:pointer}
        .qb-content>div>div[style*="border-radius"]{transition:all 0.25s ease}
        .qb-content>div>div[style*="border-radius"]:hover{background:#E8F2EE!important;border-color:#E8F2EE!important;box-shadow:0 4px 16px rgba(22,163,74,0.12)!important;transform:translateY(-1px)}
        .qb-content table tr{transition:background 0.2s ease}
        .qb-content table tbody tr:hover{background:#E8F2EE!important}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes badgeGlow{0%,100%{box-shadow:0 0 4px rgba(239,68,68,0.3)}50%{box-shadow:0 0 12px rgba(239,68,68,0.6)}}
        @media(max-width:820px){
          .qb-content>div>div[style*="border-radius"]:hover{transform:none!important}
          .qb-card-hover:hover{transform:none!important}
        }
      `}</style>
      <div style={{ ...S.shell, flexDirection: isMobile ? 'column' : isTablet ? 'column' : 'row' }}>

        {/* ===== MOBILE DRAWER SIDEBAR ===== */}
        {isMobile && mobileDrawerOpen && createPortal(
          <>
            <div style={S.mobileDrawerBackdrop} onClick={() => setMobileDrawerOpen(false)} />
            <div className="qb-sb" style={S.mobileDrawerPanel}>
              <div style={{ padding: '0 14px 12px', borderBottom: '1px solid #e5e7eb', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {companySettings?.logo_url ? (
                    <img src={companySettings.logo_url} alt="Logo" style={{ width: 34, height: 34, borderRadius: 10, objectFit: 'contain', background: '#f3f4f6' }} />
                  ) : (
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, ...S.mono }}>QB</div>
                  )}
                  <div>
                    <div style={{ color: '#111827', fontSize: 14, fontWeight: 700 }}>{companySettings?.company_name || 'Auto-bot QB'}</div>
                    <div style={{ color: '#9ca3af', fontSize: 10 }}>ERP Console</div>
                  </div>
                </div>
                <button onClick={() => setMobileDrawerOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer', padding: 4 }}>✕</button>
              </div>
              <div style={{ padding: '4px 14px 8px' }}>
                <input className="qb-sb-search" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} placeholder="🔍 搜尋功能..." style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', color: '#111827', fontSize: 14, outline: 'none', fontFamily: "'Noto Sans TC', sans-serif" }} />
              </div>
              {(() => {
                const sq = sidebarSearch.trim().toLowerCase();
                const permSections = SECTIONS.map((s) => ({ ...s, tabs: s.tabs.filter((t) => hasTab(t.id)) })).filter((s) => s.tabs.length > 0);
                const filteredSections = sq
                  ? permSections.map((s) => ({ ...s, tabs: s.tabs.filter((t) => t.label.toLowerCase().includes(sq) || t.code.toLowerCase().includes(sq)) })).filter((s) => s.tabs.length > 0)
                  : permSections;
                return filteredSections.map((section) => {
                  const isCollapsed = !sq && collapsed[section.title];
                  const iconCfg = SECTION_ICONS[section.title] || { icon: '○', bg: '#f3f4f6', fg: '#6b7280' };
                  const hasActiveTab = section.tabs.some((t) => t.id === tab);
                  return (
                    <div key={section.title}>
                      <div className="qb-sb-section-hdr" onClick={() => { if (isCollapsed) { expandSection(section.title); } else { toggleCollapsed(section.title); } }} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8, margin: '1px 8px', background: hasActiveTab ? '#f0fdf4' : 'transparent' }}>
                        <span style={{ width: 28, height: 28, minWidth: 28, borderRadius: 8, background: hasActiveTab ? iconCfg.bg : '#f3f4f6', color: hasActiveTab ? iconCfg.fg : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{iconCfg.icon}</span>
                        <span style={{ fontSize: 14, color: hasActiveTab ? '#111827' : '#6b7280', fontWeight: 600, flex: 1 }}>{section.title.replace(/^(ERP|CRM)\s/, '')}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af', display: 'inline-block', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }}>›</span>
                      </div>
                      {!isCollapsed && (
                        <div style={{ padding: '2px 8px 4px' }}>
                          {section.tabs.map((t) => {
                            const isActive = tab === t.id;
                            return (
                              <div key={t.id} className="qb-sb-item" onClick={() => { setTab(t.id); setMobileDrawerOpen(false); setSidebarSearch(''); }} style={{ padding: '10px 12px 10px 42px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: isActive ? '#16a34a' : '#4b5563', background: isActive ? '#dcfce7' : 'transparent', borderRadius: 8, margin: '1px 0', fontWeight: isActive ? 600 : 400, borderLeft: isActive ? '3px solid #16a34a' : '3px solid transparent', minHeight: 44 }}>
                                <span style={{ flex: 1 }}>{t.label}</span>
                                {pendingBadges[t.id] > 0 && <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{pendingBadges[t.id]}</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              {currentUser && (
                <div style={{ padding: '12px 14px', borderTop: '1px solid #e5e7eb', marginTop: 8 }}>
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{currentUser.display_name || currentUser.username}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{currentUser.role_label || currentUser.role}</div>
                    </div>
                    <button onClick={logout} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>登出</button>
                  </div>
                </div>
              )}
            </div>
          </>,
          document.body
        )}

        {/* ===== DESKTOP/TABLET SIDEBAR ===== */}
        {!isMobile && (<div className="qb-sb" style={{ ...S.sidebar, width: isTablet ? '100%' : (sidebarCollapsed ? 76 : S.sidebar.width), height: isTablet ? 'auto' : S.sidebar.height, position: isTablet ? 'relative' : S.sidebar.position, transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)', overflow: isTablet ? 'visible' : 'hidden auto' }}>
          <div style={{ padding: sidebarCollapsed ? '0 6px 10px' : '0 14px 12px', borderBottom: '1px solid #e5e7eb', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', width: sidebarCollapsed ? '100%' : 'auto' }}>
              {companySettings?.logo_url ? (
                <img src={companySettings.logo_url} alt="Logo" onClick={() => { collapseAll(); setSidebarPopup(null); }} style={{ width: sidebarCollapsed ? 38 : 34, height: sidebarCollapsed ? 38 : 34, minWidth: sidebarCollapsed ? 38 : 34, borderRadius: 10, objectFit: 'contain', background: '#f3f4f6', cursor: 'pointer' }} title="收合全部" />
              ) : (
                <div onClick={() => { collapseAll(); setSidebarPopup(null); }} style={{ width: sidebarCollapsed ? 38 : 34, height: sidebarCollapsed ? 38 : 34, minWidth: sidebarCollapsed ? 38 : 34, borderRadius: 10, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', ...S.mono }} title="收合全部">QB</div>
              )}
              {!sidebarCollapsed && <div style={{ whiteSpace: 'nowrap', minWidth: 0 }}>
                <div style={{ color: '#111827', fontSize: 14, fontWeight: 700, letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{companySettings?.company_name || 'Auto-bot QB'}</div>
                <div style={{ color: '#9ca3af', fontSize: 10 }}>ERP Console</div>
              </div>}
            </div>
            {!isTablet && <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16, padding: '4px 6px', borderRadius: 6, transition: 'color 0.15s', lineHeight: 1 }} title={sidebarCollapsed ? '展開' : '收合'}>{sidebarCollapsed ? '›' : '‹'}</button>}
          </div>

          {!sidebarCollapsed && (
            <div style={{ padding: '4px 14px 8px' }}>
              <input className="qb-sb-search" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} placeholder="🔍 搜尋功能..." style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', color: '#111827', fontSize: 12, outline: 'none', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s, box-shadow 0.2s' }} />
            </div>
          )}

          {!sidebarCollapsed && favs.length > 0 && !sidebarSearch && (
            <div>
              <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#f59e0b' }}>{'\u2605'}</span>
                <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>我的最愛</span>
              </div>
              {SECTIONS.flatMap((s) => s.tabs).filter((t) => favs.includes(t.id) && hasTab(t.id)).map((t) => (
                <div key={`fav-${t.id}`} className="qb-sb-item" onClick={() => setTab(t.id)} style={{ padding: '7px 12px 7px 20px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: tab === t.id ? '#16a34a' : '#4b5563', background: tab === t.id ? '#dcfce7' : 'transparent', borderRadius: 8, margin: '1px 8px', transition: 'all 0.15s', fontWeight: tab === t.id ? 600 : 400 }}>
                  <span style={{ fontSize: 9, color: tab === t.id ? '#16a34a' : '#9ca3af', ...S.mono, width: 30, flexShrink: 0 }}>{t.code}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                </div>
              ))}
              <div style={{ height: 1, background: '#e5e7eb', margin: '6px 16px' }} />
            </div>
          )}

          {(() => {
            const sq = sidebarSearch.trim().toLowerCase();
            const permSections = SECTIONS.map((s) => ({ ...s, tabs: s.tabs.filter((t) => hasTab(t.id)) })).filter((s) => s.tabs.length > 0);
            const filteredSections = sq
              ? permSections.map((s) => ({ ...s, tabs: s.tabs.filter((t) => t.label.toLowerCase().includes(sq) || t.code.toLowerCase().includes(sq)) })).filter((s) => s.tabs.length > 0)
              : permSections;
            return filteredSections.map((section, si) => {
              const isCollapsed = !sq && collapsed[section.title];
              const iconCfg = SECTION_ICONS[section.title] || { icon: '○', bg: '#f3f4f6', fg: '#6b7280' };
              const hasActiveTab = section.tabs.some((t) => t.id === tab);
              return (
                <div key={section.title}>
                  <div className="qb-sb-section-hdr" ref={(el) => { sectionRefs.current[section.title] = el; }} onClick={() => { if (sidebarCollapsed) { if (sidebarPopup === section.title) { setSidebarPopup(null); } else { const el = sectionRefs.current[section.title]; if (el) { const rect = el.getBoundingClientRect(); setPopupPos({ top: rect.top, left: rect.right + 6 }); } setSidebarPopup(section.title); } return; } if (isCollapsed) { setTab(section.tabs[0].id); } else { toggleCollapsed(section.title); } }} style={{ padding: sidebarCollapsed ? '6px 0 4px' : '8px 12px', cursor: 'pointer', display: 'flex', flexDirection: sidebarCollapsed ? 'column' : 'row', alignItems: 'center', gap: sidebarCollapsed ? 2 : 10, borderRadius: 8, transition: 'background 0.15s', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', margin: sidebarCollapsed ? '0 4px' : '1px 8px', background: hasActiveTab ? '#f0fdf4' : (sidebarPopup === section.title ? '#f3f4f6' : 'transparent'), position: 'relative' }}>
                    <span style={{ width: sidebarCollapsed ? 36 : 28, height: sidebarCollapsed ? 36 : 28, minWidth: sidebarCollapsed ? 36 : 28, borderRadius: 8, background: hasActiveTab ? iconCfg.bg : '#f3f4f6', color: hasActiveTab ? iconCfg.fg : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: sidebarCollapsed ? 16 : 14, transition: 'all 0.2s', position: 'relative' }}>
                      {iconCfg.icon}
                      {sidebarCollapsed && (() => { const sectionBadge = section.tabs.reduce((s, t) => s + (pendingBadges[t.id] || 0), 0); return sectionBadge > 0 ? <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> : null; })()}
                    </span>
                    {sidebarCollapsed && <span style={{ fontSize: 9, color: hasActiveTab ? '#16a34a' : '#9ca3af', fontWeight: hasActiveTab ? 600 : 500, lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 56 }}>{section.title.replace(/^(ERP|CRM)\s/, '')}</span>}
                    {sidebarCollapsed && sidebarPopup === section.title && createPortal(
                      <div style={{ position: 'fixed', top: popupPos.top, left: popupPos.left, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '6px 0', minWidth: 180, zIndex: 99999 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: '6px 14px 8px', fontSize: 12, fontWeight: 700, color: '#111827', borderBottom: '1px solid #f3f4f6' }}>{section.title.replace(/^(ERP|CRM)\s/, '')}</div>
                        {section.tabs.map((t) => {
                          const isActive = tab === t.id;
                          return (
                            <div key={t.id} className="qb-sb-item" onClick={() => { setTab(t.id); setSidebarPopup(null); }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: isActive ? '#16a34a' : '#374151', background: isActive ? '#dcfce7' : 'transparent', fontWeight: isActive ? 600 : 400, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, transition: 'background 0.1s' }}>
                              <span>{t.label}</span>
                              {pendingBadges[t.id] > 0 && <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{pendingBadges[t.id]}</span>}
                            </div>
                          );
                        })}
                      </div>,
                      document.body
                    )}
                    {!sidebarCollapsed && <>
                      <span style={{ fontSize: 13, color: hasActiveTab ? '#111827' : '#6b7280', fontWeight: 600, letterSpacing: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{section.title.replace(/^(ERP|CRM)\s/, '')}</span>
                      {(() => { if (!isCollapsed) return null; const sectionBadge = section.tabs.reduce((s, t) => s + (pendingBadges[t.id] || 0), 0); return sectionBadge > 0 ? <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', animation: 'pulse 2s infinite' }}>{sectionBadge}</span> : null; })()}
                      <span style={{ fontSize: 11, color: '#9ca3af', transition: 'transform 0.2s', display: 'inline-block', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', width: 16, textAlign: 'center', flexShrink: 0 }}>›</span>
                    </>}
                  </div>
                  {!sidebarCollapsed && !isCollapsed && (
                    <div style={{ display: isTablet ? 'grid' : 'block', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', padding: '2px 8px 4px' }}>
                      {section.tabs.map((t) => {
                        const isActive = tab === t.id;
                        return (
                        <div key={t.id} className="qb-sb-item" onClick={() => setTab(t.id)} style={{ padding: '7px 12px 7px 42px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: isActive ? '#16a34a' : '#4b5563', background: isActive ? '#dcfce7' : 'transparent', borderRadius: 8, margin: '1px 0', transition: 'all 0.15s', fontWeight: isActive ? 600 : 400, borderLeft: isActive ? '3px solid #16a34a' : '3px solid transparent' }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                          {pendingBadges[t.id] > 0 && (
                            <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{pendingBadges[t.id]}</span>
                          )}
                          <span className={`qb-sb-star${isFav(t.id) ? ' is-fav' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFav(t.id); }} style={{ fontSize: 11, color: '#d1d5db', cursor: 'pointer', width: 18, textAlign: 'center', flexShrink: 0 }} title={isFav(t.id) ? '取消最愛' : '加入最愛'}>{isFav(t.id) ? '\u2605' : '\u2606'}</span>
                        </div>
                        );
                      })}
                    </div>
                  )}
                  {/* collapsed: no per-tab items, only section icon shown above */}
                </div>
              );
            });
          })()}

          {!sidebarCollapsed && (
            <div style={{ padding: '12px 14px 0', borderTop: '1px solid #e5e7eb', marginTop: 6 }}>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 11, color: '#6b7280', display: 'grid', gap: 5, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>產品</span><span style={{ color: '#111827', fontWeight: 600, ...S.mono }}>{sidebarStats?.products?.toLocaleString?.() ?? '...'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>對話</span><span style={{ color: '#111827', fontWeight: 600, ...S.mono }}>{sidebarStats?.chats?.toLocaleString?.() ?? '...'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Webhook</span><span style={{ color: '#16a34a', fontWeight: 600, ...S.mono }}>ON</span></div>
              </div>
              {currentUser && (
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.display_name || currentUser.username}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{currentUser.role_label || currentUser.role}</div>
                  </div>
                  <button onClick={logout} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#6b7280'; }}>登出</button>
                </div>
              )}
            </div>
          )}
          {sidebarCollapsed && currentUser && (
            <div style={{ padding: '8px 6px', borderTop: '1px solid #F2F2F2', marginTop: 8, textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', cursor: 'pointer' }} title={`${currentUser.display_name || currentUser.username} — 點擊登出`} onClick={logout}>{(currentUser.display_name || currentUser.username || '?')[0].toUpperCase()}</div>
            </div>
          )}
        </div>)}

        {/* ===== MAIN CONTENT ===== */}
        <div style={S.main}>
          <div style={{ ...S.header, ...(isMobile ? S.mobile.header : {}) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, minWidth: 0, flex: 1 }}>
              {/* 手機版漢堡按鈕 */}
              {isMobile && (
                <button onClick={() => setMobileDrawerOpen(true)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#374151', cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>☰</button>
              )}
              <div style={{ minWidth: 0 }}>
                {TAB_META[tab]?.eyebrow && <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', ...S.mono, marginBottom: 2 }}>{TAB_META[tab].eyebrow}</div>}
                <div style={{ color: '#111827', fontWeight: 700, fontSize: 17, letterSpacing: -0.3 }}>{TAB_META[tab]?.title || tab}</div>
                {!isMobile && TAB_META[tab]?.desc && <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{TAB_META[tab].desc}</div>}
              </div>
            </div>
            <div id={HEADER_ACTION_PORTAL_ID} style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }} />
          </div>

          <div className="qb-content" style={{ ...S.content, padding: isMobile ? '14px 12px 90px' : isTablet ? '22px 18px 34px' : S.content.padding }}>
            {hasTab(tab) ? <ActiveTab setTab={setTab} apiGet={apiGet} apiPost={apiPost} /> : (
              <div style={{ ...S.card, padding: 40, textAlign: 'center', maxWidth: 480, margin: '60px auto' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>{'\uD83D\uDD12'}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>權限不足</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>您的帳號沒有存取此功能的權限，請聯繫管理員。</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== MOBILE BOTTOM NAV ===== */}
      {isMobile && (
        <nav style={S.bottomNav}>
          {[
            { id: 'dashboard', icon: '◉', label: '總覽' },
            { id: 'orders', icon: '⬆', label: '訂單' },
            { id: 'quick_receive', icon: '⬇', label: '進貨' },
            { id: 'inventory', icon: '⊞', label: '庫存' },
            { id: '_more', icon: '☰', label: '更多' },
          ].map(nav => (
            <button
              key={nav.id}
              onClick={() => {
                if (nav.id === '_more') { setMobileDrawerOpen(true); }
                else { setTab(nav.id); }
              }}
              style={S.bottomNavItem(nav.id !== '_more' && tab === nav.id)}
            >
              <span style={S.bottomNavIcon(nav.id !== '_more' && tab === nav.id)}>{nav.icon}</span>
              <span>{nav.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
