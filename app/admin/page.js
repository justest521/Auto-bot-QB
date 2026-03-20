'use client';
import { useState, useEffect } from 'react';
import { S, ADMIN_TOKEN_KEY, apiGet } from './shared/common';

// ── Tab components (dynamic imports for code splitting) ──
import Dashboard from './tabs/Dashboard';
import ReportCenter from './tabs/ReportCenter';
import Messages from './tabs/Messages';
import FormalCustomers from './tabs/FormalCustomers';
import Customers from './tabs/Customers';
import ProductSearch from './tabs/ProductSearch';
import Quotes from './tabs/Quotes';
import Orders from './tabs/Orders';
import SalesDocuments from './tabs/SalesDocuments';
import Promotions from './tabs/Promotions';
import PricingRules from './tabs/PricingRules';
import Vendors from './tabs/Vendors';
import SalesReturns from './tabs/SalesReturns';
import ProfitAnalysis from './tabs/ProfitAnalysis';
import ImportCenter from './tabs/ImportCenter';
import AIPrompt from './tabs/AIPrompt';
import ChatHistory from './tabs/ChatHistory';

function EnvHealth({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'env_health' });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shortcuts = [
    { tab: 'customers', label: '客戶主檔' },
    { tab: 'quotes', label: '報價單' },
    { tab: 'orders', label: '訂單' },
    { tab: 'sales_documents', label: '銷貨單' },
    { tab: 'imports', label: '資料匯入' },
  ];

  return (
    <div>
      <PageLead
        eyebrow="Environment"
        title="ERP 環境檢查"
        description="這裡會直接檢查目前資料庫有哪些 ERP 表已建立、哪些模組仍未就緒。之後你不用再靠錯誤訊息猜。"
        action={<button onClick={load} style={S.btnPrimary}>重新檢查</button>}
      />
      {loading ? <Loading /> : data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
            <StatCard code="READY" label="已就緒表數" value={fmt(data.summary?.ready_count)} sub={`共 ${fmt(data.summary?.total_count)} 張表`} tone="green" />
            <StatCard code="MISS" label="未就緒表數" value={fmt((data.summary?.total_count || 0) - (data.summary?.ready_count || 0))} tone="red" />
            <StatCard code="BOOT" label="快速入口" value="ERP" sub="可直接跳到各模組檢查" tone="blue" />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            {shortcuts.map((item) => (
              <button key={item.tab} onClick={() => setTab?.(item.tab)} style={S.btnGhost}>{item.label}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {Object.entries(data.groups || {}).map(([key, group]) => (
              <div key={key} style={S.card}>
                <PanelHeader
                  title={group.label}
                  meta={group.ready ? '本區模組已基本就緒' : '本區仍有缺表，建議先補 schema'}
                  badge={<div style={S.tag(group.ready ? 'green' : 'red')}>{group.ready ? 'READY' : 'MISSING'}</div>}
                />
                <div style={{ display: 'grid', gap: 8 }}>
                  {group.items.map((item) => (
                    <div key={item.name} style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr 100px', gap: 10, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 700 }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>{item.name}</div>
                      </div>
                      <div style={{ fontSize: 12, color: item.ready ? '#617084' : '#b45309' }}>
                        {item.ready ? `可讀取，現有 ${fmt(item.count)} 筆` : item.error}
                      </div>
                      <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                        <span style={S.tag(item.ready ? 'green' : 'red')}>{item.ready ? '可用' : '缺少'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : <EmptyState text="目前無法取得環境檢查結果" />}
    </div>
  );
}


function useViewportWidth() {
  const [width, setWidth] = useState(1400);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
}

const SECTIONS = [
  {
    title: 'ERP 總覽',
    tabs: [
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
    title: 'ERP 交易作業',
    tabs: [
      { id: 'quotes', label: '報價單', code: 'QUOT' },
      { id: 'orders', label: '訂單', code: 'ORDR' },
      { id: 'sales_documents', label: '銷貨單', code: 'SALE' },
      { id: 'promotions', label: '活動管理', code: 'PRMO' },
      { id: 'pricing', label: '報價規則', code: 'PRCE' },
    ],
  },
  {
    title: 'ERP 分析報表',
    tabs: [
      { id: 'sales_returns', label: '銷退貨彙總', code: 'RETN' },
      { id: 'profit_analysis', label: '利潤分析', code: 'PFT' },
      { id: 'imports', label: '資料匯入', code: 'IMPT' },
    ],
  },
  {
    title: 'LINE 與系統',
    accent: '#06c755',
    tabs: [
      { id: 'messages', label: 'AI 對話紀錄', code: 'MSG' },
      { id: 'ai_prompt', label: 'AI Prompt 設定', code: 'AI' },
      { id: 'chat_history', label: '歷史對話', code: 'HIST' },
    ],
  },
];

const TAB_COMPONENTS = {
  env_health: EnvHealth,
  report_center: ReportCenter,
  dashboard: Dashboard,
  customers: FormalCustomers,
  line_customers: Customers,
  quotes: Quotes,
  orders: Orders,
  sales_documents: SalesDocuments,
  messages: Messages,
  products: ProductSearch,
  imports: ImportCenter,
  vendors: Vendors,
  sales_returns: SalesReturns,
  profit_analysis: ProfitAnalysis,
  promotions: Promotions,
  pricing: PricingRules,
  ai_prompt: AIPrompt,
  chat_history: ChatHistory,
};

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
  const ActiveTab = TAB_COMPONENTS[tab] || Dashboard;

  useEffect(() => {
    const saved = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (saved) {
      setToken(saved);
      setAuthLoading(true);
      apiGet({ action: 'stats' })
        .then((data) => {
          setIsAuthed(true);
          setAuthError('');
          setSidebarStats({
            products: data?.total_messages ?? '-',
            chats: data?.total_messages ?? '-',
          });
          // 取得產品數和歷史對話數
          Promise.all([
            apiGet({ action: 'products', limit: '1' }).catch(() => null),
            apiGet({ action: 'chat_history_stats' }).catch(() => null),
          ]).then(([prodRes, chatRes]) => {
            setSidebarStats({
              products: prodRes?.total ?? '-',
              chats: chatRes?.total ?? '-',
            });
          });
        })
        .catch((error) => {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          setAuthError(error.message || '登入失敗，請重新輸入 Token');
        })
        .finally(() => setAuthLoading(false));
    }
  }, []);

  const login = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setAuthLoading(true);
    setAuthError('');
    window.localStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
    try {
      await apiGet({ action: 'stats' });
      setIsAuthed(true);
    } catch (error) {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
      setAuthError(error.message || '登入失敗，請確認 Token');
      setIsAuthed(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAuthed(false);
    setToken('');
    setAuthError('');
  };

  if (!isAuthed) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #0f1729 0%, #18253a 52%, #243b5a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 460, background: 'rgba(9,14,24,0.82)', borderRadius: 18, padding: '26px 28px', color: '#fff', boxShadow: '0 28px 60px rgba(4,10,20,0.42), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
          <div style={{ color: '#27d3a2', fontWeight: 700, fontSize: 15, letterSpacing: 1.5, ...S.mono, marginBottom: 10 }}>QB ADMIN</div>
          <div style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>管理後台登入</div>
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, marginBottom: 18, lineHeight: 1.7 }}>請輸入管理後台 Token，進入查價、活動管理與對話監控介面。</div>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            placeholder="ADMIN_TOKEN"
            style={{ ...S.input, background: 'rgba(5,10,18,0.78)', borderColor: 'rgba(255,255,255,0.08)', color: '#fff' }}
          />
          {authError && <div style={{ color: '#f87171', fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>{authError}</div>}
          <button onClick={login} disabled={authLoading} style={{ ...S.btnPrimary, width: '100%', marginTop: 14, opacity: authLoading ? 0.7 : 1, cursor: authLoading ? 'wait' : 'pointer' }}>
            {authLoading ? '驗證中...' : '進入後台'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`
        html,body{background:#0f1729!important;margin:0;padding:0}
        body > div:first-child{min-height:100vh;background:#0f1729}
        *{box-sizing:border-box}
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ ...S.shell, flexDirection: isTablet ? 'column' : 'row' }}>
        <div style={{ ...S.sidebar, width: isTablet ? '100%' : S.sidebar.width, height: isTablet ? 'auto' : S.sidebar.height, position: isTablet ? 'relative' : S.sidebar.position }}>
          <div style={{ padding: '0 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #2da5ff 0%, #1f7cff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, ...S.mono }}>QB</div>
              <div>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Quick Buy</div>
                <div style={{ color: '#8fa2bd', fontSize: 11, ...S.mono }}>Admin Console v2.0</div>
              </div>
            </div>
          </div>
          {SECTIONS.map((section, si) => (
            <div key={section.title}>
              <div style={{ padding: '14px 20px 8px', borderTop: si > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', marginTop: si > 0 ? 8 : 0 }}>
                <div style={{ fontSize: 10, color: section.accent || '#70829c', ...S.mono, letterSpacing: 1.2 }}>{section.title}</div>
              </div>
              <div style={{ display: isTablet ? 'grid' : 'block', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {section.tabs.map(t => (
                <div
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '11px 20px',
                    cursor: 'pointer',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: tab === t.id ? '#ffffff' : '#9eb0c9',
                    background: tab === t.id ? 'linear-gradient(90deg, rgba(45,140,255,0.28) 0%, rgba(45,140,255,0.08) 100%)' : 'transparent',
                    borderLeft: `3px solid ${tab === t.id ? (section.accent || '#2d8cff') : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 10, color: tab === t.id ? '#8fd1ff' : '#61748f', ...S.mono, width: 40 }}>{t.code}</span>
                  {t.label}
                </div>
              ))}
              </div>
            </div>
          ))}

          <div style={{ padding: '18px 20px 0', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 14 }}>
            <div style={{ fontSize: 10, color: '#70829c', ...S.mono, marginBottom: 10 }}>SYSTEM</div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, fontSize: 11, color: '#b7c4d8' }}>
              <div style={{ padding: '4px 0' }}>產品：{sidebarStats?.products?.toLocaleString?.() ?? '載入中...'}</div>
              <div style={{ padding: '4px 0' }}>歷史對話：{sidebarStats?.chats?.toLocaleString?.() ?? '載入中...'}</div>
              <div style={{ padding: '4px 0' }}>Webhook：<span style={{ color: '#62df97' }}>ON</span></div>
              <div style={{ padding: '4px 0' }}>LIFF：<span style={{ color: '#62df97' }}>ON</span></div>
            </div>
          </div>
        </div>

        <div style={S.main}>
          <div style={S.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{ width: 12, height: 12, borderRadius: 999, background: '#2d8cff' }} />
              <div>
                <div style={{ color: '#172337', fontWeight: 700, fontSize: 15 }}>Quick Buy 管理後台</div>
                {!isMobile && <div style={{ color: '#7b889b', fontSize: 11 }}>Sales, inquiry monitoring and knowledge operations</div>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!isMobile && <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>main / {tab}</div>}
              <button onClick={logout} style={{ ...S.btnGhost, padding: '7px 12px', fontSize: 11 }}>登出</button>
            </div>
          </div>

          <div style={{ ...S.content, padding: isMobile ? '18px 14px 30px' : isTablet ? '22px 18px 34px' : S.content.padding }}>
            <ActiveTab setTab={setTab} />
          </div>
        </div>
      </div>
    </div>
  );
}

