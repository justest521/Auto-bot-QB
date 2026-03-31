'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { fmt, useResponsive } from '@/lib/admin/helpers';
import { Loading, PageLead, StatCard, PanelHeader, ReportShortcut, RankingPanel } from '../shared/ui';

export default function ReportCenter({ setTab }) {
  const { isMobile } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet({ action: 'report_center' })
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const counts = data?.counts || {};
  const rankings = data?.rankings || {};
  const returns = data?.returns || {};
  return (
    <div>
      <PageLead
        eyebrow="A1 Mapping"
        title="進銷存報表中心"
        description="用鼎新 A1 的邏輯整理我們現在的 ERP 模組，讓客戶、供應商、銷退貨、利潤與排行報表都能直接對應到現有系統。"
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18, ...(isMobile && S.statGrid) }}>
        <StatCard code="CUST" label="客戶主檔" value={fmt(counts.customers)} tone="blue" />
        <StatCard code="VNDR" label="供應商主檔" value={fmt(counts.vendors)} tone="green" />
        <StatCard code="RETN" label="銷退貨單" value={fmt(counts.sales_returns)} tone="yellow" />
        <StatCard code="PFT" label="利潤資料" value={fmt(counts.profit_rows)} tone="red" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={S.card}>
          <PanelHeader title="銷售報表" meta="鼎新 A1：銷售 / 銷退 / 利潤" />
          <div style={{ display: 'grid', gap: 10 }}>
            <ReportShortcut code="QUOT" title="報價明細表" desc={`目前 ${fmt(counts.quotes)} 筆報價，可查詢與轉單。`} onClick={() => setTab?.('quotes')} tone="blue" />
            <ReportShortcut code="ORDR" title="訂單明細表" desc={`目前 ${fmt(counts.orders)} 筆訂單，可接續出貨與銷貨。`} onClick={() => setTab?.('orders')} tone="green" />
            <ReportShortcut code="SALE" title="銷貨明細表" desc={`目前 ${fmt(counts.sales_documents)} 筆銷貨單，可點單號看內容。`} onClick={() => setTab?.('sales_documents')} tone="yellow" />
            <ReportShortcut code="RETN" title="銷退貨彙總表" desc={`銷貨 ${fmt(returns.saleCount)} 筆 / 退貨 ${fmt(returns.returnCount)} 筆。`} onClick={() => setTab?.('sales_returns')} tone="red" />
            <ReportShortcut code="PFT" title="銷售利潤分析表" desc="對應現有利潤分析頁，可看毛利與日期區間。" onClick={() => setTab?.('profit_analysis')} tone="blue" />
          </div>
        </div>

        <div style={S.card}>
          <PanelHeader title="基本資料" meta="鼎新 A1：客戶 / 供應商 / 商品" />
          <div style={{ display: 'grid', gap: 10 }}>
            <ReportShortcut code="CUST" title="客戶主檔" desc={`目前 ${fmt(counts.customers)} 位正式客戶。`} onClick={() => setTab?.('customers')} tone="blue" />
            <ReportShortcut code="VNDR" title="供應商主檔" desc={`目前 ${fmt(counts.vendors)} 家供應商。`} onClick={() => setTab?.('vendors')} tone="green" />
            <ReportShortcut code="ITEM" title="商品主檔 / 查價" desc="目前先對應產品查價頁，後續可升級成完整商品主檔。" onClick={() => setTab?.('products')} tone="yellow" />
            <ReportShortcut code="LINE" title="LINE 客戶對照" desc="把 LINE 詢價名單綁到正式客戶，對應 CRM/客服入口。" onClick={() => setTab?.('line_customers')} tone="red" />
          </div>
        </div>

        <div style={S.card}>
          <PanelHeader title="分析圖表" meta="鼎新 A1：十大客戶 / 業務銷售 / 排行" />
          <div style={{ display: 'grid', gap: 10 }}>
            <ReportShortcut code="DASH" title="儀表板" desc="綜合 KPI、趨勢、互動概況。" onClick={() => setTab?.('dashboard')} tone="blue" />
            <ReportShortcut code="IMPT" title="資料匯入中心" desc="CSV / XLSX 對應匯入客戶、供應商、報價、訂單、銷貨與報表資料。" onClick={() => setTab?.('imports')} tone="green" />
            <ReportShortcut code="MSG" title="客服/AI 對話紀錄" desc="雖然不是鼎新 A1 原生模組，但可對應客服紀錄與詢價來源。" onClick={() => setTab?.('messages')} tone="yellow" />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        <RankingPanel title="十大客戶分析圖" rows={rankings.top_customers} emptyText="目前還沒有足夠的銷貨資料來排行客戶" valueLabel="銷售額" />
        <RankingPanel title="業務銷售排名表" rows={rankings.top_sales_people} emptyText="目前還沒有足夠的業務銷貨資料" valueLabel="銷售額" />
      </div>
    </div>
  );
}
