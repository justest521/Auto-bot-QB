'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * ResizableTable — 可拖拉欄寬的表格元件
 *
 * Usage:
 *   const { colWidths, ResizableHeader } = useResizableColumns(storageKey, defaultWidths);
 *   // colWidths = [80, 150, ...] — current pixel widths
 *   // ResizableHeader renders the <div> grid header row with drag handles
 *
 * Props for ResizableHeader:
 *   headers: [{ label, align?, render? }]  — column definitions
 *   style:   extra styles merged onto header row
 */

const HANDLE_WIDTH = 6;

export function useResizableColumns(storageKey, defaultWidths) {
  const [colWidths, setColWidths] = useState(() => {
    if (typeof window === 'undefined') return defaultWidths;
    try {
      const saved = localStorage.getItem(`resize_${storageKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only use saved if same column count
        if (Array.isArray(parsed) && parsed.length === defaultWidths.length) return parsed;
      }
    } catch {}
    return defaultWidths;
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`resize_${storageKey}`, JSON.stringify(colWidths));
    } catch {}
  }, [colWidths, storageKey]);

  const dragRef = useRef(null);

  const onMouseDown = useCallback((colIndex, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[colIndex];
    const MIN_WIDTH = 36;

    const onMouseMove = (moveE) => {
      const delta = moveE.clientX - startX;
      const newWidth = Math.max(MIN_WIDTH, startWidth + delta);
      setColWidths((prev) => {
        const next = [...prev];
        next[colIndex] = newWidth;
        return next;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [colWidths]);

  const gridTemplate = colWidths.map((w) => `${w}px`).join(' ');

  const resetWidths = useCallback(() => {
    setColWidths(defaultWidths);
  }, [defaultWidths]);

  // ResizableHeader component
  const ResizableHeader = useCallback(({ headers, style = {} }) => {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          borderBottom: '2px solid #d1d5db',
          background: '#f3f4f6',
          position: 'relative',
          ...style,
        }}
      >
        {headers.map((hdr, i) => (
          <div
            key={i}
            style={{
              padding: '8px 10px',
              borderRight: i < headers.length - 1 ? '1px solid #d1d5db' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: hdr.align === 'right' ? 'flex-end' : hdr.align === 'center' ? 'center' : 'flex-start',
              fontSize: 13,
              fontWeight: 600,
              color: '#374151',
              position: 'relative',
              overflow: 'hidden',
              userSelect: 'none',
            }}
          >
            {hdr.render ? hdr.render() : hdr.label}
            {/* Drag handle */}
            {i < headers.length - 1 && (
              <div
                onMouseDown={(e) => onMouseDown(i, e)}
                style={{
                  position: 'absolute',
                  right: -HANDLE_WIDTH / 2,
                  top: 0,
                  bottom: 0,
                  width: HANDLE_WIDTH,
                  cursor: 'col-resize',
                  zIndex: 10,
                }}
                title="拖拉調整欄寬"
              />
            )}
          </div>
        ))}
      </div>
    );
  }, [gridTemplate, onMouseDown]);

  return { colWidths, gridTemplate, setColWidths, resetWidths, ResizableHeader };
}
