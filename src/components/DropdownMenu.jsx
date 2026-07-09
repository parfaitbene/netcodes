import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * DropdownMenu — a ⋮ trigger button that opens a portal-based dropdown.
 *
 * Props:
 *   items: Array<{ label, icon, onClick, danger?, disabled?, separator? }>
 *     - separator: true  →  renders a <hr> divider instead of a menu item
 *   align: 'left' | 'right'  (default 'right')
 */
function DropdownMenu({ items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: null, bottom: null, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const visibleItems = items.filter(item => !item.separator).length;
    const separators = items.filter(item => item.separator).length;
    const estimatedHeight = visibleItems * 32 + separators * 13 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < estimatedHeight && rect.top > estimatedHeight) {
      setCoords({ top: null, bottom: window.innerHeight - rect.top + 4, left: rect.right });
    } else {
      setCoords({ top: rect.bottom + 4, bottom: null, left: rect.right });
    }
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const handleToggle = (e) => {
    e.stopPropagation();
    setOpen(prev => !prev);
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="btn btn-sm btn-link text-secondary p-0 px-1 dropdown-trigger"
        onClick={handleToggle}
        title="Actions"
        style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0, marginLeft: 'auto' }}
      >
        <i className="bi bi-three-dots-vertical"></i>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            ...(coords.top !== null ? { top: coords.top } : { bottom: coords.bottom }),
            ...(align === 'right'
              ? { right: `calc(100vw - ${coords.left}px)` }
              : { left: coords.left - 160 }),
            minWidth: 170,
            backgroundColor: 'white',
            border: '1px solid #dee2e6',
            borderRadius: '6px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 9999,
            padding: '4px 0',
          }}
        >
          {items.map((item, i) => {
            if (item.separator) {
              return <hr key={i} style={{ margin: '4px 0', borderColor: '#dee2e6' }} />;
            }
            return (
              <button
                key={i}
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick(e);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 14px',
                  border: 'none',
                  background: 'none',
                  textAlign: 'left',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  color: item.danger ? '#dc3545' : '#212529',
                  opacity: item.disabled ? 0.5 : 1,
                  fontSize: '0.875rem',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled) e.currentTarget.style.backgroundColor = '#f8f9fa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {item.icon && <i className={`bi ${item.icon}`} style={{ width: '16px' }}></i>}
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

export default DropdownMenu;
