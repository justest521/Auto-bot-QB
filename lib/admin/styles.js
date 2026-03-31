// ═══════════════════════════════════════════════════════════
//  QB ERP — 全域樣式 + Design Token + RWD 響應式支援
// ═══════════════════════════════════════════════════════════

// ── Design Tokens ──────────────────────────────────────────
// 所有頁面統一引用這些數值，不要自己硬寫！
// 用法：S.t.fontSize.body  /  S.t.radius.card  /  S.t.color.textPrimary
const t = {
  // 字體大小（px）
  fontSize: {
    h1: 20,        // 頁面主標題
    h2: 16,        // 區塊標題 / Modal 標題 (mobile 18)
    h3: 14,        // 卡片標題 / 欄位群組標題
    body: 13,      // 正文 / 表格內文 / 輸入框
    caption: 12,   // 次要文字 / 表頭 / 小按鈕
    tiny: 11,      // Label / eyebrow / 極小文字
    badge: 11,     // 狀態標籤
  },
  // 字重
  fontWeight: {
    bold: 700,
    semibold: 600,
    medium: 500,
    normal: 400,
  },
  // 間距（px）
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
  },
  // 圓角（px）
  radius: {
    sm: 4,         // Tag / Badge
    md: 8,         // Button / Input / 小元素
    lg: 12,        // Card / Panel
    xl: 14,        // Modal (desktop)
    pill: 99,      // 膠囊狀 Badge
  },
  // 色票
  color: {
    // 文字
    textPrimary: '#111827',    // 主文字
    textSecondary: '#374151',  // 次文字
    textMuted: '#6b7280',      // 淺灰文字
    textDisabled: '#9ca3af',   // 停用 / 佔位
    // 品牌
    brand: '#16a34a',          // QB 綠
    brandLight: '#dcfce7',     // 品牌淡底
    link: '#3b82f6',           // 連結 / 單號
    purple: '#8b5cf6',         // 組合單
    // 狀態
    success: '#10b981',
    successBg: '#dcfce7',
    warning: '#f59e0b',
    warningBg: '#fef3c7',
    error: '#ef4444',
    errorBg: '#fee2e2',
    info: '#3b82f6',
    infoBg: '#eff6ff',
    // 背景 / 邊框
    bg: '#f5f6f7',
    bgCard: '#ffffff',
    bgMuted: '#f9fafb',
    bgPanel: '#eeeeee',
    border: '#e5e7eb',
    borderLight: '#f0f2f5',
    // 覆蓋
    overlay: 'rgba(8,12,20,0.46)',
  },
  // Modal 寬度
  modal: {
    sm: 'min(480px, 100%)',
    md: 'min(580px, 100%)',
    lg: 'min(660px, 100%)',
  },
  // 字型
  font: {
    base: "'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
  },
};

// ── 預組合：常用元件樣式 ──────────────────────────────────
// 各頁面直接展開使用，確保一致
const presets = {
  // 狀態標籤（膠囊）
  // 用法：{...S.p.badge(color)} → 如 S.p.badge('#10b981')
  badge: (color) => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: t.radius.pill,
    fontSize: t.fontSize.badge,
    fontWeight: t.fontWeight.semibold,
    background: color + '18',
    color: color,
    lineHeight: 1.6,
  }),
  // 狀態標籤（實心）
  badgeSolid: (bg, text) => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: t.radius.pill,
    fontSize: t.fontSize.badge,
    fontWeight: t.fontWeight.semibold,
    background: bg,
    color: text || '#fff',
    lineHeight: 1.6,
  }),
  // 表格列 header
  tableHeader: {
    fontSize: t.fontSize.caption,
    fontWeight: t.fontWeight.semibold,
    color: t.color.textMuted,
    letterSpacing: 0.3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // 表格列 body cell
  tableCell: {
    fontSize: t.fontSize.body,
    color: t.color.textSecondary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // 單號文字
  docNo: {
    fontSize: t.fontSize.h3,
    fontWeight: t.fontWeight.bold,
    color: t.color.link,
    fontFamily: t.font.mono,
    letterSpacing: 0.3,
  },
  // Modal overlay（桌面）
  modalOverlay: {
    position: 'fixed', inset: 0,
    background: t.color.overlay,
    zIndex: 999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: t.spacing.xl,
  },
  // Modal body（桌面）大
  modalBody: (size = 'md') => ({
    width: t.modal[size] || t.modal.md,
    maxHeight: '90vh',
    overflowY: 'auto',
    background: t.color.bg,
    borderRadius: t.radius.xl,
    padding: `${t.spacing.lg}px ${t.spacing.lg + 2}px ${t.spacing.xl}px`,
    boxShadow: '0 24px 70px rgba(8,12,20,0.3)',
  }),
  // Modal 標題列
  modalTitle: (isMobile) => ({
    fontSize: isMobile ? 18 : t.fontSize.h2,
    fontWeight: t.fontWeight.bold,
    color: t.color.textPrimary,
  }),
  // 卡片內 label（欄位名）
  fieldLabel: {
    color: t.color.textMuted,
    fontSize: t.fontSize.tiny,
    fontWeight: t.fontWeight.semibold,
    display: 'block',
    marginBottom: t.spacing.xs,
    letterSpacing: 0.5,
  },
  // 卡片內 value
  fieldValue: {
    fontSize: t.fontSize.body,
    color: t.color.textSecondary,
  },
  // 列表卡片（點擊展開用）
  listCard: {
    padding: `10px ${t.spacing.lg}px`,
    marginBottom: 10,
    cursor: 'pointer',
  },
  // 明細行（Modal 內的 items 列表）
  detailRow: (isLast) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: isLast ? 'none' : `1px solid ${t.color.borderLight}`,
    fontSize: t.fontSize.body,
  }),
  // 表單行內 item（調整單 / 組合單明細輸入列）
  inlineItemRow: (isMobile) => ({
    background: t.color.bgMuted,
    border: `1px solid ${t.color.borderLight}`,
    borderRadius: t.radius.md,
    padding: isMobile ? '8px 10px' : '7px 10px',
    display: isMobile ? 'grid' : 'flex',
    gridTemplateColumns: isMobile ? '1fr' : 'auto',
    gap: isMobile ? 8 : 6,
    alignItems: isMobile ? 'stretch' : 'center',
  }),
  // 行內 input（小型）
  inlineInput: (isMobile) => ({
    fontSize: isMobile ? t.fontSize.body : t.fontSize.caption,
    padding: isMobile ? '10px 12px' : '4px 6px',
  }),
  // 區塊標題（卡片內的子群組標題）
  sectionTitle: {
    fontSize: t.fontSize.h3,
    fontWeight: t.fontWeight.bold,
    color: t.color.textSecondary,
    marginBottom: t.spacing.sm,
  },
  // 提示文字（如 "正數=增加, 負數=減少"）
  hint: {
    fontSize: t.fontSize.caption,
    color: t.color.textDisabled,
  },
};

const S = {
  // ── Tokens 與 Presets（各頁面引用入口）──
  t,
  p: presets,

  // ── 基底 ──
  page: { minHeight: '100vh', background: t.color.bg, color: t.color.textPrimary, fontFamily: t.font.base },
  shell: { display: 'flex', minHeight: '100vh' },
  sidebar: { width: 250, background: t.color.bgCard, color: t.color.textMuted, padding: '16px 0 12px', borderRight: `1px solid ${t.color.border}`, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: t.color.bg },
  header: { minHeight: 52, background: t.color.bgCard, borderBottom: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `6px ${t.spacing.xxl}px`, position: 'sticky', top: 0, zIndex: 100 },
  content: { flex: 1, padding: `${t.spacing.xl}px ${t.spacing.xxl}px 32px`, minHeight: 'calc(100vh - 52px)' },

  // ── 卡片與面板 ──
  card: { background: t.color.bgCard, border: `1px solid ${t.color.border}`, borderRadius: t.radius.lg, padding: `${t.spacing.lg}px ${t.spacing.lg + 2}px`, marginBottom: t.spacing.md, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.25s ease' },
  panelMuted: { background: t.color.bgPanel, border: `1px solid ${t.color.border}`, borderRadius: 10, padding: '10px 14px' },

  // ── 表單元素 ──
  input: { background: t.color.bgCard, border: `1px solid ${t.color.border}`, borderRadius: t.radius.md, padding: '7px 12px', color: t.color.textPrimary, fontSize: t.fontSize.body, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: t.font.base, transition: 'border-color 0.2s, box-shadow 0.2s' },
  btnPrimary: { background: t.color.brand, color: '#fff', border: 'none', borderRadius: t.radius.md, padding: '7px 16px', fontWeight: t.fontWeight.semibold, cursor: 'pointer', fontSize: t.fontSize.body, fontFamily: t.font.base, letterSpacing: 0.2, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background 0.15s, box-shadow 0.15s' },
  btnGhost: { background: t.color.bgCard, color: t.color.textSecondary, border: `1px solid ${t.color.border}`, borderRadius: t.radius.md, padding: '6px 14px', cursor: 'pointer', fontSize: t.fontSize.body, fontFamily: t.font.base, transition: 'border-color 0.15s, background 0.15s' },
  btnLine: { background: '#06c755', color: '#fff', border: 'none', borderRadius: t.radius.md, padding: '7px 16px', fontWeight: t.fontWeight.semibold, cursor: 'pointer', fontSize: t.fontSize.body, boxShadow: '0 1px 3px rgba(6,199,85,0.3)' },
  label: { ...presets.fieldLabel },
  mono: { fontFamily: t.font.mono, letterSpacing: 0.3 },

  // ── 頁面結構 ──
  pageLead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: t.spacing.lg },
  pageTitle: { fontSize: t.fontSize.h1, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, letterSpacing: -0.3, marginBottom: 2 },
  pageDesc: { fontSize: t.fontSize.body, color: t.color.textMuted, lineHeight: 1.6, maxWidth: 760 },
  eyebrow: { fontSize: t.fontSize.tiny, color: t.color.brand, fontWeight: t.fontWeight.semibold, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: t.spacing.xs, fontFamily: t.font.mono },

  // ── Grid ──
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: t.spacing.md, marginBottom: t.spacing.lg },
  twoCol: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: t.spacing.md, alignItems: 'start' },

  // ── Tag（舊版保留向下相容，新頁面請用 S.p.badge）──
  tag: (color) => ({ display: 'inline-block', fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, padding: '2px 8px', borderRadius: t.radius.sm, background: color === 'green' ? t.color.successBg : color === 'red' ? t.color.errorBg : color === 'line' ? t.color.brandLight : color === 'gray' ? t.color.bgMuted : '#f3f4f6', color: color === 'green' ? t.color.brand : color === 'red' ? t.color.error : color === 'line' ? t.color.brand : color === 'gray' ? '#b0b7c3' : t.color.textSecondary, border: 'none' }),

  // ═══════════════════════════════════════════════════════════
  //  RWD 響應式工具
  // ═══════════════════════════════════════════════════════════

  mobile: {
    header: { padding: '6px 14px', minHeight: 48 },
    content: { padding: '14px 12px 90px' },
    card: { padding: '12px 14px', borderRadius: 10 },
    input: { padding: '10px 12px', fontSize: t.fontSize.h3, minHeight: 44 },
    btnPrimary: { padding: '12px 16px', fontSize: t.fontSize.h3, minHeight: 44, width: '100%' },
    btnGhost: { padding: '10px 14px', fontSize: t.fontSize.h3, minHeight: 44 },
    statGrid: { gridTemplateColumns: 'repeat(2, 1fr)', gap: t.spacing.sm },
    twoCol: { gridTemplateColumns: '1fr' },
    pageLead: { flexDirection: 'column', gap: 10 },
  },

  tablet: {
    header: { padding: '6px 18px' },
    content: { padding: '18px 16px 32px' },
    statGrid: { gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' },
    twoCol: { gridTemplateColumns: '1fr 1fr' },
  },

  // ── 響應式合併工具函式 ──
  r: (base, condition, override) => condition ? { ...base, ...override } : base,

  responsive: (base, { isMobile, isTablet } = {}) => {
    const key = Object.keys(S).find(k => S[k] === base);
    if (!key) return base;
    if (isMobile && S.mobile?.[key]) return { ...base, ...S.mobile[key] };
    if (isTablet && S.tablet?.[key]) return { ...base, ...S.tablet[key] };
    return base;
  },

  // ── 底部導航列 ──
  bottomNav: {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
    background: t.color.bgCard, borderTop: `1px solid ${t.color.border}`,
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    padding: '4px 0 calc(4px + env(safe-area-inset-bottom))',
    boxShadow: '0 -2px 10px rgba(0,0,0,0.06)',
  },
  bottomNavItem: (active) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '6px 12px', cursor: 'pointer', fontSize: 10, fontWeight: active ? t.fontWeight.bold : t.fontWeight.normal,
    color: active ? t.color.brand : t.color.textDisabled, background: 'none', border: 'none',
    minWidth: 56, transition: 'color 0.15s',
  }),
  bottomNavIcon: (active) => ({
    fontSize: 20, lineHeight: 1, color: active ? t.color.brand : t.color.textDisabled,
  }),

  // ── 手機抽屜式 sidebar ──
  mobileDrawer: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
    display: 'flex', flexDirection: 'column',
  },
  mobileDrawerBackdrop: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.4)', zIndex: 10000,
  },
  mobileDrawerPanel: {
    position: 'fixed', top: 0, left: 0, bottom: 0, width: '85%', maxWidth: 320,
    background: t.color.bgCard, zIndex: 10001, overflowY: 'auto',
    boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
    padding: '16px 0 12px',
    transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
  },

  // ── 手機版表格→卡片 ──
  mobileCard: {
    background: t.color.bgCard, border: `1px solid ${t.color.border}`, borderRadius: 10,
    padding: '12px 14px', marginBottom: t.spacing.sm,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  mobileCardRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '3px 0', fontSize: t.fontSize.body,
  },
  mobileCardLabel: { color: t.color.textMuted, fontSize: t.fontSize.caption, flexShrink: 0, minWidth: 60 },
  mobileCardValue: { color: t.color.textPrimary, fontWeight: t.fontWeight.medium, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  // ── 手機版 Modal ──
  mobileModal: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: t.color.bg, zIndex: 10000, overflowY: 'auto',
    display: 'flex', flexDirection: 'column',
  },
  mobileModalHeader: {
    position: 'sticky', top: 0, zIndex: 10,
    background: t.color.bgCard, borderBottom: `1px solid ${t.color.border}`,
    padding: '12px 16px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', minHeight: 48,
  },
  mobileModalBody: { flex: 1, padding: '16px 14px 90px', overflowY: 'auto' },
  mobileModalFooter: {
    position: 'sticky', bottom: 0, background: t.color.bgCard,
    borderTop: `1px solid ${t.color.border}`, padding: '12px 16px',
    paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
  },

  // ── 底部抽屜 ──
  bottomSheet: {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10001,
    background: t.color.bgCard, borderRadius: '16px 16px 0 0',
    boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
    maxHeight: '85vh', overflowY: 'auto',
    paddingBottom: 'env(safe-area-inset-bottom)',
    transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
  },
  bottomSheetHandle: {
    width: 40, height: 4, borderRadius: 2, background: '#d1d5db',
    margin: '8px auto 4px',
  },

  // ── 表格橫向可滑動容器 ──
  tableScroll: {
    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
    margin: '0 -14px', padding: '0 14px',
  },
};

export default S;
