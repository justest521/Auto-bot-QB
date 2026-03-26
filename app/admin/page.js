'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { API, ADMIN_TOKEN_KEY, apiGet, apiPost } from '@/lib/admin/api';
import { useViewportWidth } from '@/lib/admin/helpers';

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
import Payments from './components/tabs/Payments';
import Shipments from './components/tabs/Shipments';
import Returns from './components/tabs/Returns';

import AIPrompt from './components/tabs/AIPrompt';
import ChatHistory from './components/tabs/ChatHistory';
import PurchaseOrders from './components/tabs/PurchaseOrders';
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

// ── SECTIONS ──
const SECTION_ICONS = {
  'ERP 總覽': '\u25C9',
  'ERP 主檔資料': '\u2630',
  'ERP 採購進貨': '\u2B07',
  'ERP 銷售出貨': '\u2B06',
  'ERP 倉儲管理': '\u2338',
  'ERP 分析報表': '\u2637',
  'CRM 客戶管線': '\u2764',
  'ERP 財務會計': '\u2696',
  'ERP 審批簽核': '\u2611',
  '客服工單': '\u260E',
  '經銷商入口': '\u263A',
  'LINE 與系統': '\u269B',
  '系統管理': '\u2699',
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
      { id: 'purchase_orders', label: '採購單', code: 'PO' },
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
      { id: 'payments', label: '收款管理', code: 'PAY' },
      { id: 'promotions', label: '活動管理', code: 'PRMO' },
      { id: 'pricing', label: '報價規則', code: 'PRCE' },
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
    ],
  },
  {
    title: '系統管理',
    accent: '#374151',
    tabs: [
      { id: 'user_management', label: '使用者管理', code: 'UMGT' },
    ],
  },
];

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
  payments: Payments,
  shipments: Shipments,
  returns: Returns,

  ai_prompt: AIPrompt,
  chat_history: ChatHistory,
  purchase_orders: PurchaseOrders,
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
  approvals: Approvals,
  tickets: Tickets,
  user_management: UserManagement,
  parts_exchange: PartsExchange,
  equipment_lease: EquipmentLease,
  ai_forecast: AIForecast,
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
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) || '{}'); } catch { return {}; }
  });
  const toggle = (title) => {
    setCollapsed((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try { window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  return { collapsed, toggle };
}

// ══════════════════════════════════════════════════════════════
//  ADMIN PAGE — Main orchestrator
// ══════════════════════════════════════════════════════════════
export default function AdminPage() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [token, setToken] = useState('');
  const [isAuthed, setIsAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState('report_center');
  const [sidebarStats, setSidebarStats] = useState(null);
  const [pendingBadges, setPendingBadges] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const { favs, toggle: toggleFav, isFav } = useFavorites();
  const { collapsed, toggle: toggleCollapsed } = useCollapsed();
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
          ]).then(([prodRes, chatRes]) => {
            setSidebarStats({ products: prodRes?.total ?? '-', chats: chatRes?.total ?? '-' });
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
        input:focus,select:focus,textarea:focus{border-color:#16a34a!important;box-shadow:0 0 0 3px rgba(22,163,74,0.08)!important}
        .qb-card-hover:hover{background:#E8F2EE!important;border-color:#E8F2EE!important;box-shadow:0 4px 16px rgba(22,163,74,0.12), 6px 6px 16px rgba(0,0,0,0.04)!important;transform:translateY(-1px)}
        .qb-card-hover{transition:all 0.25s ease;cursor:pointer}
        .qb-content>div>div[style*="border-radius"]{transition:all 0.25s ease}
        .qb-content>div>div[style*="border-radius"]:hover{background:#E8F2EE!important;border-color:#E8F2EE!important;box-shadow:0 4px 16px rgba(22,163,74,0.12)!important;transform:translateY(-1px)}
        .qb-content table tr{transition:background 0.2s ease}
        .qb-content table tbody tr:hover{background:#E8F2EE!important}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes badgeGlow{0%,100%{box-shadow:0 0 4px rgba(239,68,68,0.3)}50%{box-shadow:0 0 12px rgba(239,68,68,0.6)}}
      `}</style>
      <div style={{ ...S.shell, flexDirection: isTablet ? 'column' : 'row' }}>
        {/* ===== SIDEBAR ===== */}
        <div className="qb-sb" style={{ ...S.sidebar, width: isTablet ? '100%' : (sidebarCollapsed ? 68 : S.sidebar.width), height: isTablet ? 'auto' : S.sidebar.height, position: isTablet ? 'relative' : S.sidebar.position, transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)', overflow: isTablet ? 'visible' : 'hidden auto' }}>
          <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #F2F2F2', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
              <div style={{ width: 38, height: 38, minWidth: 38, borderRadius: 12, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, ...S.mono }}>QB</div>
              {!sidebarCollapsed && <div style={{ whiteSpace: 'nowrap' }}>
                <div style={{ color: '#111827', fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>Auto-bot QB</div>
                <div style={{ color: '#6b7280', fontSize: 11 }}>ERP Console</div>
              </div>}
            </div>
            {!isTablet && <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16, padding: '4px 6px', borderRadius: 6, transition: 'color 0.15s' }} title={sidebarCollapsed ? '展開' : '收合'}>{sidebarCollapsed ? '\u276F' : '\u276E'}</button>}
          </div>

          {!sidebarCollapsed && (
            <div style={{ padding: '4px 14px 10px' }}>
              <input className="qb-sb-search" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} placeholder="搜尋功能..." style={{ width: '100%', background: '#f3f4f6', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', color: '#111827', fontSize: 13, outline: 'none', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s, box-shadow 0.2s' }} />
            </div>
          )}

          {!sidebarCollapsed && favs.length > 0 && !sidebarSearch && (
            <div>
              <div style={{ padding: '10px 16px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#f59e0b' }}>{'\u2605'}</span>
                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, letterSpacing: 0.5 }}>我的最愛</span>
              </div>
              {SECTIONS.flatMap((s) => s.tabs).filter((t) => favs.includes(t.id) && hasTab(t.id)).map((t) => (
                <div key={`fav-${t.id}`} className="qb-sb-item" onClick={() => setTab(t.id)} style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: tab === t.id ? '#16a34a' : '#374151', background: tab === t.id ? '#dcfce7' : 'transparent', borderRadius: 8, margin: '1px 8px', transition: 'all 0.15s', fontWeight: tab === t.id ? 600 : 400 }}>
                  <span style={{ fontSize: 9, color: tab === t.id ? '#16a34a' : '#6b7280', ...S.mono, width: 34, flexShrink: 0 }}>{t.code}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                </div>
              ))}
              <div style={{ height: 1, background: '#E8F2EE', margin: '8px 16px' }} />
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
              const sectionIcon = SECTION_ICONS[section.title] || '\u25CB';
              const hasActiveTab = section.tabs.some((t) => t.id === tab);
              return (
                <div key={section.title}>
                  <div className="qb-sb-section-hdr" onClick={() => !sidebarCollapsed && toggleCollapsed(section.title)} style={{ padding: sidebarCollapsed ? '10px 0' : '10px 16px 8px 12px', borderTop: 'none', marginTop: si > 0 ? 4 : 0, cursor: sidebarCollapsed ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, transition: 'background 0.12s', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', margin: sidebarCollapsed ? 0 : '0 4px', background: hasActiveTab ? '#f3f4f6' : 'transparent' }}>
                    <span style={{ fontSize: 15, color: hasActiveTab ? (section.accent || '#16a34a') : '#6b7280', transition: 'color 0.2s', minWidth: sidebarCollapsed ? 'auto' : 18, textAlign: 'center' }}>{sectionIcon}</span>
                    {!sidebarCollapsed && <>
                      <span style={{ fontSize: 14, color: hasActiveTab ? '#111827' : '#6b7280', fontWeight: 600, letterSpacing: 0.1, flex: 1 }}>{section.title}</span>
                      {(() => { if (!isCollapsed) return null; const sectionBadge = section.tabs.reduce((s, t) => s + (pendingBadges[t.id] || 0), 0); return sectionBadge > 0 ? <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', animation: 'pulse 2s infinite' }}>{sectionBadge}</span> : null; })()}
                      <span style={{ fontSize: 10, color: '#d1d5db', transition: 'transform 0.2s', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', width: 20, textAlign: 'center', flexShrink: 0 }}>{'\u25BE'}</span>
                    </>}
                  </div>
                  {!sidebarCollapsed && !isCollapsed && (
                    <div style={{ display: isTablet ? 'grid' : 'block', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', padding: '0 8px' }}>
                      {section.tabs.map((t) => {
                        const isActive = tab === t.id;
                        return (
                        <div key={t.id} className="qb-sb-item" onClick={() => setTab(t.id)} style={{ padding: '9px 14px 9px 20px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: isActive ? '#16a34a' : '#374151', background: isActive ? '#dcfce7' : 'transparent', borderRadius: 10, margin: '1px 0', transition: 'all 0.15s', fontWeight: isActive ? 600 : 400 }}>
                          <span style={{ fontSize: 10, color: isActive ? '#6ee7b7' : '#d1d5db', flexShrink: 0 }}>{'\u2514'}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                          {pendingBadges[t.id] > 0 && (
                            <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{pendingBadges[t.id]}</span>
                          )}
                          <span className={`qb-sb-star${isFav(t.id) ? ' is-fav' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFav(t.id); }} style={{ fontSize: 11, color: '#d1d5db', cursor: 'pointer', width: 20, textAlign: 'center', flexShrink: 0 }} title={isFav(t.id) ? '取消最愛' : '加入最愛'}>{isFav(t.id) ? '\u2605' : '\u2606'}</span>
                        </div>
                        );
                      })}
                    </div>
                  )}
                  {sidebarCollapsed && section.tabs.map((t) => (
                    <div key={t.id} onClick={() => setTab(t.id)} title={t.label} style={{ padding: '8px 0', cursor: 'pointer', textAlign: 'center', color: tab === t.id ? '#16a34a' : '#6b7280', background: tab === t.id ? '#dcfce7' : 'transparent', borderRadius: 8, fontSize: 9, ...S.mono, transition: 'all 0.15s', letterSpacing: 0, position: 'relative', margin: '1px 6px' }}>{t.code}{pendingBadges[t.id] > 0 && <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />}</div>
                  ))}
                </div>
              );
            });
          })()}

          {!sidebarCollapsed && (
            <div style={{ padding: '16px 16px 0', borderTop: '1px solid #F2F2F2', marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 8, letterSpacing: 0.5 }}>SYSTEM</div>
              <div style={{ background: '#fdfdfe', border: '1px solid #F2F2F2', borderRadius: 12, padding: '12px 14px', fontSize: 12, color: '#6b7280', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>產品</span><span style={{ color: '#111827', fontWeight: 600, ...S.mono }}>{sidebarStats?.products?.toLocaleString?.() ?? '...'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>對話</span><span style={{ color: '#111827', fontWeight: 600, ...S.mono }}>{sidebarStats?.chats?.toLocaleString?.() ?? '...'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Webhook</span><span style={{ color: '#16a34a', fontWeight: 600, ...S.mono }}>ON</span></div>
              </div>
            </div>
          )}
        </div>

        {/* ===== MAIN CONTENT ===== */}
        <div style={S.main}>
          <div style={S.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div>
                <div style={{ color: '#111827', fontWeight: 700, fontSize: 16 }}>Auto-bot QB 管理後台</div>
                {!isMobile && <div style={{ color: '#6b7280', fontSize: 12 }}>ERP · CRM · LINE Bot</div>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!isMobile && <div style={{ fontSize: 11, color: '#6b7280', ...S.mono, background: '#f3f4f6', padding: '5px 12px', borderRadius: 8, fontWeight: 500 }}>{tab}</div>}
              {currentUser && !isMobile && <div style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontWeight: 600 }}>{currentUser.display_name || currentUser.username}</span><span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 6 }}>{currentUser.role_label || currentUser.role}</span></div>}
              <button onClick={logout} style={{ ...S.btnGhost, padding: '7px 14px', fontSize: 12, borderRadius: 8 }}>登出</button>
            </div>
          </div>

          <div className="qb-content" style={{ ...S.content, padding: isMobile ? '18px 14px 30px' : isTablet ? '22px 18px 34px' : S.content.padding }}>
            {hasTab(tab) ? <ActiveTab setTab={setTab} /> : (
              <div style={{ ...S.card, padding: 40, textAlign: 'center', maxWidth: 480, margin: '60px auto' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>{'\uD83D\uDD12'}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>權限不足</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>您的帳號沒有存取此功能的權限，請聯繫管理員。</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
