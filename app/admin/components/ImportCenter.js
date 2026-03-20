'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { S } from '../shared/styles';
import { IMPORT_DATASETS } from '../shared/csv';
import { fmt, fmtP, fmtDate, fmtMs, getPresetDateRange, toDateInputValue, todayInTaipei } from '../shared/formatters';
import { apiGet, apiPost, SALES_DOCUMENT_FOCUS_KEY } from '../shared/api';
import { Loading, EmptyState, StatusBanner, PageLead, Pager, PanelHeader, CsvImportButton, ProductEditModal } from '../shared/ui';

export function ImportCenter() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'import_history' });
      setHistory(result.history || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const resetBusinessData = useCallback(async () => {
    const confirmation = typeof window === 'undefined'
      ? ''
      : window.prompt('這會清空 ERP 主資料、交易資料、銷貨/報表資料，但保留 LINE 與系統設定。\n\n請輸入 RESET ERP 確認：', '');

    if (confirmation !== 'RESET ERP') {
      setResetStatus('已取消清空作業');
      return;
    }

    setResetting(true);
    setResetStatus('');

    try {
      const result = await apiPost({ action: 'reset_erp_business_data', confirmation });
      setResetStatus(`已清空 ${fmt((result.cleared_tables || []).length)} 張 ERP 業務資料表`);
      await loadHistory();
    } catch (error) {
      setResetStatus(error.message || '清空作業失敗');
    } finally {
      setResetting(false);
    }
  }, [loadHistory]);

  return (
    <div>
      <PageLead eyebrow="Import" title="資料匯入" description="直接從後台匯入 CSV 或 Excel，不用再進 Supabase Table Editor。支援我們整理好的 import-ready CSV，也支援原始 .xlsx 檔案。" />
      <div style={{ ...S.card, marginBottom: 18, background: '#fff8eb', borderColor: '#f7d699' }}>
        <PanelHeader title="安全重置" meta="交付新店或重新初始化前，可先清空 ERP 業務資料。這個動作會保留 LINE 客戶、訊息、系統設定與匯入歷史。" badge={<div style={S.tag('red')}>Danger Zone</div>} />
        {resetStatus ? (
          <div style={{ ...S.panelMuted, marginBottom: 12, background: resetStatus.includes('已清空') ? '#edf9f2' : '#fff4f4', borderColor: resetStatus.includes('已清空') ? '#bdeccb' : '#ffc7cf', color: resetStatus.includes('已清空') ? '#127248' : '#d1435b' }}>
            {resetStatus}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: '#8a5b00', lineHeight: 1.8 }}>
            清空範圍：商品、正式客戶、廠商、報價、訂單、銷貨、銷退貨、利潤分析。
            <br />
            保留範圍：LINE 客戶、LINE 訊息、系統設定、AI Prompt、匯入歷史。
          </div>
          <button onClick={resetBusinessData} disabled={resetting} style={{ ...S.btnGhost, borderColor: '#f0b86d', color: '#8a5b00', background: '#fff' }}>
            {resetting ? '清空中...' : '清空 ERP 業務資料'}
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        {Object.entries(IMPORT_DATASETS).map(([datasetId, dataset]) => (
          <div key={datasetId} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 16, color: '#1c2740', fontWeight: 700 }}>{dataset.title}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 6, lineHeight: 1.7 }}>{dataset.desc}</div>
                <div style={{ fontSize: 11, color: '#7b889b', marginTop: 8, ...S.mono }}>{dataset.fields}</div>
              </div>
              <div style={{ minWidth: 150, textAlign: 'right' }}>
                <CsvImportButton datasetId={datasetId} onImported={loadHistory} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginTop: 18 }}>
        <PanelHeader title="匯入歷史" meta="保留最近的資料更換紀錄，方便回查誰在什麼時候換過哪一包資料。" badge={<div style={{ ...S.tag('') }}>{fmt(history.length)} 筆</div>} />
        {loading ? <Loading /> : history.length === 0 ? <EmptyState text="目前還沒有匯入紀錄" /> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {history.map((entry, index) => {
              const dataset = IMPORT_DATASETS[entry.dataset];
              return (
                <div key={`${entry.imported_at || 'history'}-${index}`} style={{ ...S.panelMuted, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 700 }}>
                      {dataset?.title || entry.dataset || '未知資料集'}
                    </div>
                    <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>{fmtDate(entry.imported_at)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.7 }}>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>FILE</span> {entry.file_name || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>ROWS</span> {fmt(entry.count || 0)} 筆</div>
                    {'inserted' in entry || 'updated' in entry ? (
                      <div><span style={{ color: '#7b889b', ...S.mono }}>DETAIL</span> 新增 {fmt(entry.inserted || 0)} / 更新 {fmt(entry.updated || 0)}</div>
                    ) : null}
                    <div><span style={{ color: '#7b889b', ...S.mono }}>BY</span> {entry.imported_by || 'admin'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================================= AI PROMPT 設定 ========================================= */
