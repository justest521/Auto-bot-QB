'use client';
import { S } from './styles';
import { fmt, fmtP, fmtDate, fmtMs } from './formatters';
import { apiGet, apiPost } from './api';

export function Loading() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div style={{ color: '#7e8a9b', fontSize: 12, ...S.mono }}><span style={{ color: '#1976f3' }}>●</span> loading...</div></div>;
}
export function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', padding: '40px 0', color: '#8a96a8', fontSize: 12, ...S.mono }}>{text}</div>;
}
export function StatusBanner({ text, tone = 'neutral' }) {
  if (!text) return null;
  const toneMap = {
    success: { background: '#edf9f2', borderColor: '#bdeccb', color: '#127248' },
    error: { background: '#fff4f4', borderColor: '#ffc7cf', color: '#d1435b' },
    info: { background: '#edf5ff', borderColor: '#94c3ff', color: '#1976f3' },
    neutral: { background: '#f8fbff', borderColor: '#dbe6f3', color: '#617084' },
  };
  return <div style={{ ...S.card, padding: '14px 16px', ...(toneMap[tone] || toneMap.neutral) }}>{text}</div>;
}
export function PageLead({ eyebrow, title, description, action }) {
  return (
    <div style={S.pageLead}>
      <div>
        {eyebrow && <div style={S.eyebrow}>{eyebrow}</div>}
        <div style={S.pageTitle}>{title}</div>
        {description && <div style={S.pageDesc}>{description}</div>}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

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

export function ProductEditModal({ product, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    description: product?.description || '',
    us_price: product?.us_price ?? '',
    tw_retail_price: product?.tw_retail_price ?? 0,
    tw_reseller_price: product?.tw_reseller_price ?? 0,
    product_status: product?.product_status || 'Current',
    category: product?.category || 'other',
    replacement_model: product?.replacement_model || '',
    weight_kg: product?.weight_kg ?? '',
    origin_country: product?.origin_country || '',
    search_text: product?.search_text || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!product) return null;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiPost({
        action: 'update_product_master',
        item_number: product.item_number,
        product: form,
      });
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || '商品更新失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 240, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={S.eyebrow}>Product Master</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1c2740' }}>編輯商品主檔</div>
            <div style={{ fontSize: 12, color: '#7b889b', marginTop: 6 }}>{product.item_number}</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {error ? <StatusBanner text={error} tone="error" /> : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>品名 / 描述</label><textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} rows={3} style={{ ...S.input, resize: 'vertical' }} /></div>
          <div><label style={S.label}>US PRICE</label><input value={form.us_price} onChange={(e) => setForm((current) => ({ ...current, us_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>牌價</label><input type="number" value={form.tw_retail_price} onChange={(e) => setForm((current) => ({ ...current, tw_retail_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>經銷價</label><input type="number" value={form.tw_reseller_price} onChange={(e) => setForm((current) => ({ ...current, tw_reseller_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>狀態</label><input value={form.product_status} onChange={(e) => setForm((current) => ({ ...current, product_status: e.target.value }))} style={S.input} /></div>
          <div><label style={S.label}>分類</label><input value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))} style={S.input} /></div>
          <div><label style={S.label}>替代型號</label><input value={form.replacement_model} onChange={(e) => setForm((current) => ({ ...current, replacement_model: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>重量(kg)</label><input value={form.weight_kg} onChange={(e) => setForm((current) => ({ ...current, weight_kg: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>產地</label><input value={form.origin_country} onChange={(e) => setForm((current) => ({ ...current, origin_country: e.target.value }))} style={S.input} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>搜尋索引</label><textarea value={form.search_text} onChange={(e) => setForm((current) => ({ ...current, search_text: e.target.value }))} rows={3} style={{ ...S.input, resize: 'vertical', ...S.mono }} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={S.btnGhost}>取消</button>
          <button onClick={save} disabled={saving} style={S.btnPrimary}>{saving ? '儲存中...' : '儲存商品'}</button>
        </div>
      </div>
    </div>
  );
}
export function ImportStatus({ status }) {
  if (!status) return null;
  const success = status.includes('完成');
  const pending = status.includes('匯入中');
  return (
    <div style={{
      ...S.panelMuted,
      background: success ? '#edf9f2' : pending ? '#edf5ff' : '#fff4f4',
      borderColor: success ? '#bdeccb' : pending ? '#94c3ff' : '#ffc7cf',
      color: success ? '#127248' : pending ? '#1976f3' : '#d1435b',
    }}>
      {status}
    </div>
  );
}
export function CsvImportButton({ datasetId, onImported, compact = false }) {
  const { status, busy, selectedFile, previewCount, batchProgress, recentImportHint, chooseFile, importSelected, clearSelection } = useCsvImport(datasetId, onImported);
  const panelWidth = compact ? 248 : 360;
  const panelMinHeight = compact ? 116 : 188;
  const statusMinHeight = compact ? (status ? 48 : 0) : 72;

  return (
    <div style={{ width: '100%', maxWidth: panelWidth, minWidth: compact ? 220 : 320 }}>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'stretch' }}>
        <div style={{ minHeight: statusMinHeight }}>
          <ImportStatus status={status} />
        </div>
        <div style={{ ...S.panelMuted, minHeight: panelMinHeight, padding: compact ? '12px 14px' : S.panelMuted.padding, textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {selectedFile ? (
            <>
              <div>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>FILE_PREVIEW</div>
                <div style={{ fontSize: 12, color: '#1c2740', fontWeight: 700, wordBreak: 'break-word' }}>{selectedFile.name}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>預計匯入 {fmt(previewCount)} 筆</div>
                {recentImportHint ? (
                  <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: '#fff8eb', border: '1px solid #f7d699', color: '#8a5b00', fontSize: 12, lineHeight: 1.6 }}>
                    {recentImportHint.text}
                  </div>
                ) : null}
                {batchProgress ? (
                  <>
                    <div style={{ fontSize: compact ? 11 : 12, color: '#1976f3', marginTop: 8, lineHeight: 1.6 }}>
                      匯入進度 {batchProgress.current}/{batchProgress.total} 批 · {fmt(batchProgress.processed)}/{fmt(batchProgress.all)} 筆 · {batchProgress.percent}%
                    </div>
                    <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: '#dbe7f7', overflow: 'hidden' }}>
                      <div style={{ width: `${batchProgress.percent}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #2d8cff 0%, #19c767 100%)', transition: 'width 0.2s ease' }} />
                    </div>
                  </>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: compact ? 'flex-end' : 'flex-start', flexWrap: compact ? 'wrap' : 'nowrap' }}>
                <button onClick={importSelected} disabled={busy} style={{ ...S.btnPrimary, padding: compact ? '8px 14px' : S.btnPrimary.padding, fontSize: compact ? 12 : 13 }}>
                  {busy && batchProgress ? `匯入中 ${batchProgress.current}/${batchProgress.total}` : busy ? '匯入中...' : '確認匯入'}
                </button>
                <button onClick={clearSelection} disabled={busy} style={{ ...S.btnGhost, padding: compact ? '8px 12px' : S.btnGhost.padding, fontSize: compact ? 12 : 13 }}>取消</button>
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>FILE_PREVIEW</div>
                <div style={{ fontSize: 12, color: '#94a1b2', lineHeight: 1.7 }}>尚未選擇檔案</div>
              </div>
              <div style={{ display: 'flex', justifyContent: compact ? 'flex-end' : 'flex-start' }}>
                <label style={{ ...(compact ? { ...S.btnGhost, padding: '8px 14px', fontSize: 12 } : S.btnPrimary), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  選擇檔案
                  <input
                    type="file"
                    accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
                    style={{ display: 'none' }}
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      chooseFile(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export function PanelHeader({ title, meta, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1c2740' }}>{title}</div>
        {meta ? <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b' }}>{meta}</div> : null}
      </div>
      {badge}
    </div>
  );
}
export function Pager({ page, limit, total, onPageChange, onLimitChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (limit || 20)));

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>每頁</span>
        <select value={limit} onChange={(e) => onLimitChange(Number(e.target.value))} style={{ ...S.input, width: 90, padding: '8px 10px' }}>
          {[20, 50, 100, 200].map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} style={S.btnGhost}>← 上一頁</button>
        <span style={{ color: '#666', fontSize: 12, ...S.mono }}>P{page} / {totalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} style={S.btnGhost}>下一頁 →</button>
      </div>
    </div>
  );
}
