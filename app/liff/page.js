'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Category labels ──
const CATEGORIES = {
  all: '全部',
  wrench: '扳手',
  socket: '套筒',
  ratchet: '棘輪',
  screwdriver: '螺絲起子',
  plier: '鉗子',
  power_tool: '電動工具',
  torque_wrench: '扭力扳手',
  storage: '工具車/收納',
  light: '照明',
  diagnostic: '診斷工具',
  battery: '電池',
  tester: '測試儀',
  borescope: '內視鏡',
  jack_lift: '千斤頂',
  torque_multiplier: '扭力倍增器',
  tire_inflator: '打氣機',
  other: '其他',
};

// ── Product query helper ──
async function queryProducts({ search, category, offset = 0, limit = 20 }) {
  const page = Math.floor(offset / limit);
  const params = new URLSearchParams({
    q: search || '',
    category: category || 'all',
    page: String(page),
    limit: String(limit),
  });

  const res = await fetch(`/api/products?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Product query failed');
  }

  const data = await res.json();
  return {
    data: Array.isArray(data.products) ? data.products : [],
    total: data.total || 0,
  };
}

// ── Format price ──
function formatPrice(price) {
  if (!price) return '洽詢';
  return `NT$ ${Number(price).toLocaleString()}`;
}

// ── Main LIFF Page Component ──
export default function LiffSearchPage() {
  const [liff, setLiff] = useState(null);
  const [liffReady, setLiffReady] = useState(false);
  const [profile, setProfile] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(null);
  const [toast, setToast] = useState('');

  const searchTimeout = useRef(null);
  const PAGE_SIZE = 20;

  // ── Init LIFF ──
  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      console.warn('NEXT_PUBLIC_LIFF_ID not set, running in standalone mode');
      setLiffReady(true);
      return;
    }
    import('@line/liff')
      .then((mod) => mod.default)
      .then(async (liffObj) => {
        await liffObj.init({ liffId });
        setLiff(liffObj);
        setLiffReady(true);
        if (liffObj.isLoggedIn()) {
          const p = await liffObj.getProfile();
          setProfile(p);
        }
      })
      .catch((e) => {
        console.error('LIFF init error:', e);
        setLiffReady(true);
      });
  }, []);

  // ── Search products ──
  const doSearch = useCallback(
    async (searchVal, cat, pageNum = 0, append = false) => {
      setLoading(true);
      try {
        const { data, total: t } = await queryProducts({
          search: searchVal,
          category: cat,
          offset: pageNum * PAGE_SIZE,
          limit: PAGE_SIZE,
        });
        if (append) {
          setProducts((prev) => [...prev, ...data]);
        } else {
          setProducts(data);
        }
        setTotal(t);
        setHasMore(data.length === PAGE_SIZE);
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ── Debounced search on input change ──
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(0);
      doSearch(search, category, 0, false);
    }, 350);
    return () => clearTimeout(searchTimeout.current);
  }, [search, category, doSearch]);

  // ── Load more ──
  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    doSearch(search, category, next, true);
  };

  // ── Send to LINE chat ──
  const sendToChat = async (product) => {
    const msg = `我想詢問這個產品的優惠價格：\n📦 ${product.item_number}\n📝 ${product.description}\n💰 牌價 ${formatPrice(product.tw_retail_price)}`;

    if (liff && liff.isInClient()) {
      setSending(product.item_number);
      try {
        await liff.sendMessages([{ type: 'text', text: msg }]);
        showToast('已傳送到聊天室！');
      } catch (e) {
        console.error('Send error:', e);
        showToast('傳送失敗，請重試');
      } finally {
        setSending(null);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(msg);
        showToast('已複製到剪貼簿！');
      } catch {
        showToast('請手動複製詢價');
      }
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Noto Sans TC', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #f5f5f5;
          color: #1a1a1a;
          -webkit-font-smoothing: antialiased;
        }

        .qb-app {
          max-width: 100vw;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        /* ── Header ── */
        .qb-header {
          background: linear-gradient(135deg, #c41230 0%, #8b0d22 100%);
          color: white;
          padding: 16px 16px 12px;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 2px 12px rgba(196, 18, 48, 0.3);
        }
        .qb-header-top {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .qb-logo {
          width: 36px;
          height: 36px;
          background: white;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 11px;
          color: #c41230;
          letter-spacing: -0.5px;
          flex-shrink: 0;
        }
        .qb-title {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .qb-subtitle {
          font-size: 11px;
          opacity: 0.8;
          font-weight: 400;
        }
        .qb-count {
          margin-left: auto;
          background: rgba(255,255,255,0.2);
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
        }

        /* ── Search ── */
        .qb-search-wrap {
          position: relative;
        }
        .qb-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 16px;
          opacity: 0.5;
        }
        .qb-search {
          width: 100%;
          padding: 10px 12px 10px 36px;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          background: rgba(255,255,255,0.95);
          color: #1a1a1a;
          outline: none;
          font-family: inherit;
        }
        .qb-search::placeholder {
          color: #999;
        }

        /* ── Categories ── */
        .qb-cats {
          display: flex;
          gap: 6px;
          padding: 10px 16px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          background: white;
          border-bottom: 1px solid #eee;
          position: sticky;
          top: 108px;
          z-index: 90;
        }
        .qb-cats::-webkit-scrollbar { display: none; }
        .qb-cat {
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          border: 1.5px solid #ddd;
          background: white;
          color: #555;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .qb-cat:active { transform: scale(0.95); }
        .qb-cat.active {
          background: #c41230;
          border-color: #c41230;
          color: white;
        }

        /* ── Product list ── */
        .qb-list {
          flex: 1;
          padding: 8px 12px 80px;
        }

        .qb-card {
          background: white;
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          display: flex;
          align-items: center;
          gap: 12px;
          transition: transform 0.15s;
        }
        .qb-card:active { transform: scale(0.985); }

        .qb-card-body {
          flex: 1;
          min-width: 0;
        }
        .qb-item-num {
          font-size: 15px;
          font-weight: 700;
          color: #c41230;
          letter-spacing: 0.3px;
        }
        .qb-desc {
          font-size: 13px;
          color: #666;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .qb-price-row {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-top: 6px;
        }
        .qb-price {
          font-size: 16px;
          font-weight: 700;
          color: #1a1a1a;
        }
        .qb-promo-hint {
          font-size: 11px;
          color: #c41230;
          background: #fff0f3;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 500;
        }
        .qb-cat-tag {
          font-size: 10px;
          color: #999;
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 3px;
          margin-top: 4px;
          display: inline-block;
        }

        .qb-ask-btn {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #06c755 0%, #05a847 100%);
          color: white;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(6, 199, 85, 0.3);
        }
        .qb-ask-btn:active { transform: scale(0.9); }
        .qb-ask-btn.sending {
          opacity: 0.6;
          pointer-events: none;
        }

        /* ── States ── */
        .qb-loading {
          text-align: center;
          padding: 40px 20px;
          color: #999;
          font-size: 14px;
        }
        .qb-spinner {
          width: 28px;
          height: 28px;
          border: 3px solid #eee;
          border-top-color: #c41230;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          margin: 0 auto 12px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .qb-empty {
          text-align: center;
          padding: 60px 20px;
          color: #bbb;
        }
        .qb-empty-icon { font-size: 48px; margin-bottom: 12px; }
        .qb-empty-text { font-size: 15px; }
        .qb-empty-hint { font-size: 13px; margin-top: 6px; color: #ccc; }

        .qb-load-more {
          display: block;
          width: 100%;
          padding: 14px;
          border: 1.5px dashed #ddd;
          background: none;
          border-radius: 12px;
          font-size: 14px;
          color: #888;
          cursor: pointer;
          font-family: inherit;
          font-weight: 500;
          margin-top: 4px;
        }
        .qb-load-more:active { background: #f9f9f9; }

        /* ── Toast ── */
        .qb-toast {
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.85);
          color: white;
          padding: 10px 24px;
          border-radius: 24px;
          font-size: 14px;
          font-weight: 500;
          z-index: 999;
          animation: toastIn 0.3s ease;
          pointer-events: none;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        /* ── Discontinued badge ── */
        .qb-discontinued {
          font-size: 10px;
          color: #f59e0b;
          background: #fffbeb;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: 600;
          margin-left: 6px;
        }
        .qb-replacement {
          font-size: 11px;
          color: #666;
          margin-top: 2px;
        }
        .qb-replacement a {
          color: #c41230;
          text-decoration: none;
          font-weight: 600;
        }
      `}</style>

      <div className="qb-app">
        {/* Header */}
        <div className="qb-header">
          <div className="qb-header-top">
            <div className="qb-logo">QB</div>
            <div>
              <div className="qb-title">Quick Buy 工具查價</div>
              <div className="qb-subtitle">Snap-on 原廠授權</div>
            </div>
            {total > 0 && (
              <div className="qb-count">
                {total.toLocaleString()} 筆
              </div>
            )}
          </div>
          <div className="qb-search-wrap">
            <span className="qb-search-icon">🔍</span>
            <input
              className="qb-search"
              type="text"
              placeholder="輸入料號或關鍵字，例如 FDX71 或 wrench"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="qb-cats">
          {Object.entries(CATEGORIES).map(([key, label]) => (
            <button
              key={key}
              className={`qb-cat ${category === key ? 'active' : ''}`}
              onClick={() => setCategory(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Product list */}
        <div className="qb-list">
          {loading && products.length === 0 ? (
            <div className="qb-loading">
              <div className="qb-spinner" />
              搜尋中...
            </div>
          ) : products.length === 0 ? (
            <div className="qb-empty">
              <div className="qb-empty-icon">🔧</div>
              <div className="qb-empty-text">
                {search ? '找不到符合的產品' : '請輸入料號或關鍵字搜尋'}
              </div>
              <div className="qb-empty-hint">
                {search ? '試試其他關鍵字或切換分類' : '支援料號、品名英文搜尋'}
              </div>
            </div>
          ) : (
            <>
              {products.map((p) => (
                <div className="qb-card" key={p.item_number}>
                  <div className="qb-card-body">
                    <div className="qb-item-num">
                      {p.item_number}
                    </div>
                    <div className="qb-desc">{p.description}</div>
                    <div className="qb-price-row">
                      <span className="qb-price">{formatPrice(p.tw_retail_price)}</span>
                      <span className="qb-promo-hint">💬 私訊享優惠</span>
                    </div>
                    {p.category && p.category !== 'other' && (
                      <span className="qb-cat-tag">{CATEGORIES[p.category] || p.category}</span>
                    )}
                  </div>
                  <button
                    className={`qb-ask-btn ${sending === p.item_number ? 'sending' : ''}`}
                    onClick={() => sendToChat(p)}
                    title="詢問優惠價"
                  >
                    {sending === p.item_number ? '⏳' : '💬'}
                  </button>
                </div>
              ))}

              {hasMore && (
                <button className="qb-load-more" onClick={loadMore} disabled={loading}>
                  {loading ? '載入中...' : `載入更多（已顯示 ${products.length} / ${total} 筆）`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Toast */}
        {toast && <div className="qb-toast">{toast}</div>}
      </div>
    </>
  );
}
