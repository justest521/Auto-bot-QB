'use client';
import { useState, useEffect } from 'react';
import { S } from '../shared/styles';
import { fmt, useViewportWidth } from '../shared/formatters';
import { apiGet, apiPost } from '../shared/api';
import { Loading, PageLead } from '../shared/ui';
import { StatCard } from '../components/Dashboard';


export function AIPrompt() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiGet({ action: 'ai_prompt' })
      .then((data) => { setPrompt(data.prompt || ''); })
      .finally(() => setLoading(false));
    Promise.all([
      apiGet({ action: 'chat_history_stats' }),
      apiGet({ action: 'stats' }),
    ]).then(([history, dashboard]) => {
      setStats({
        chatHistory: history.total || 0,
        aiMessages: dashboard.total_messages || 0,
      });
    });
  }, []);

  const save = async () => {
    await apiPost({ action: 'update_ai_prompt', prompt });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <Loading />;
  return (
    <div>
      <PageLead eyebrow="Prompt" title="AI Prompt 設定" description="調整 Bot 的回覆風格與客服 SOP，這裡的內容會直接影響下一次對話生成。" />

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard code="HIST" label="歷史對話" value={fmt(stats.chatHistory)} sub="匯入的 Line 對話" accent="#06c755" />
          <StatCard code="AI" label="AI 回覆" value={fmt(stats.aiMessages)} sub="Bot 自動回覆" accent="#10b981" />
        </div>
      )}

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>AI_SYSTEM_PROMPT</div>
          <div style={{ ...S.tag('green') }}>Claude Sonnet</div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={S.label}>AI 回覆的 System Prompt — 控制 Bot 的回覆風格和行為</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={20}
            style={{ ...S.input, resize: 'vertical', ...S.mono, fontSize: 12, lineHeight: 1.8 }}
            placeholder="輸入 AI 的 system prompt..."
          />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row' }}>
          <button onClick={save} style={{ ...S.btnPrimary, flex: 1, background: saved ? '#22c55e' : '#10b981', transition: 'background 0.3s', padding: '11px 0', fontSize: 14 }}>{saved ? '✓ SAVED' : '儲存 Prompt'}</button>
          <div style={{ fontSize: 11, color: '#6f7d90', ...S.mono }}>{prompt.length} 字</div>
        </div>
      </div>

      <div style={{ ...S.card, borderColor: '#dbe3ee' }}>
        <div style={{ color: '#6f7d90', fontSize: 11, lineHeight: 1.9, ...S.mono }}>
          <span style={{ color: '#4f6178' }}>// 使用說明</span><br/>
          // 修改後立即生效，AI 下次回覆就會套用新 prompt<br/>
          // 建議包含：角色設定、回覆風格、報價格式、SOP 流程<br/>
          // 可從「歷史對話」分頁參考真人客服的回覆方式<br/>
          // prompt 越精確，AI 回覆品質越好
        </div>
      </div>
    </div>
  );
}

/* ========================================= LINE 歷史對話 ========================================= */
