'use client';
import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';

// ── Context：讓子頁面可以註冊 dirty 狀態 ──
const UnsavedChangesContext = createContext({
  isDirty: false,
  setDirty: () => {},
  confirmIfDirty: (cb) => cb(),
});

export const useUnsavedGuard = () => useContext(UnsavedChangesContext);

// ── Hook：追蹤表單是否有未儲存變更 ──
export function useFormDirty(initialValues = {}) {
  const [dirty, setDirty] = useState(false);
  const saved = useRef(JSON.stringify(initialValues));

  const markClean = useCallback(() => {
    setDirty(false);
  }, []);

  const markDirty = useCallback(() => {
    setDirty(true);
  }, []);

  // 比對目前值與初始值
  const checkDirty = useCallback((currentValues) => {
    const isDiff = JSON.stringify(currentValues) !== saved.current;
    setDirty(isDiff);
    return isDiff;
  }, []);

  // 重設基準值（儲存後呼叫）
  const resetBaseline = useCallback((newValues) => {
    saved.current = JSON.stringify(newValues);
    setDirty(false);
  }, []);

  return { dirty, markClean, markDirty, checkDirty, resetBaseline };
}

// ── 確認對話框元件 ──
export function UnsavedConfirmDialog({ open, onConfirm, onCancel, message }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.35)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.15s ease',
    }} onClick={onCancel}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: '28px 32px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)',
        maxWidth: 400, width: '90%', textAlign: 'center',
        animation: 'slideUp 0.2s ease',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>{'\u26A0\uFE0F'}</div>
        <div style={{
          fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 8,
          fontFamily: "'Noto Sans TC', sans-serif",
        }}>
          {message || '變更尚未儲存，確定要離開嗎？'}
        </div>
        <div style={{
          fontSize: 13, color: '#6b7280', marginBottom: 24, lineHeight: 1.6,
          fontFamily: "'Noto Sans TC', sans-serif",
        }}>
          如果離開，您所做的修改將不會被保存。
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onConfirm} style={{
            background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8,
            padding: '9px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
            fontFamily: "'Noto Sans TC', sans-serif",
            boxShadow: '0 1px 3px rgba(239,68,68,0.3)',
            transition: 'background 0.15s',
          }} onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
             onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}>
            確認離開
          </button>
          <button onClick={onCancel} style={{
            background: '#fff', color: '#374151', border: '1px solid #e5e7eb',
            borderRadius: 8, padding: '9px 24px', fontWeight: 600, cursor: 'pointer',
            fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif",
            transition: 'border-color 0.15s, background 0.15s',
          }} onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderColor = '#d1d5db'; }}
             onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e5e7eb'; }}>
            繼續編輯
          </button>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ── Provider：包在最上層，管理 dirty 狀態 + 攔截導航 ──
export function UnsavedChangesProvider({ children }) {
  const [dirty, setDirtyRaw] = useState(false);
  const [pending, setPending] = useState(null); // 暫存要執行的 callback
  const dirtyRef = useRef(false);

  const setDirty = useCallback((val) => {
    dirtyRef.current = val;
    setDirtyRaw(val);
  }, []);

  // 攔截瀏覽器關閉/重整
  useEffect(() => {
    const handler = (e) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '變更尚未儲存，確定要離開嗎？';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // 如果 dirty，先彈確認框；否則直接執行
  const confirmIfDirty = useCallback((callback) => {
    if (dirtyRef.current) {
      setPending(() => callback);
    } else {
      callback();
    }
  }, []);

  const handleConfirm = useCallback(() => {
    setDirty(false);
    const cb = pending;
    setPending(null);
    if (cb) cb();
  }, [pending, setDirty]);

  const handleCancel = useCallback(() => {
    setPending(null);
  }, []);

  return (
    <UnsavedChangesContext.Provider value={{ isDirty: dirty, setDirty, confirmIfDirty }}>
      {children}
      <UnsavedConfirmDialog
        open={pending !== null}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </UnsavedChangesContext.Provider>
  );
}
