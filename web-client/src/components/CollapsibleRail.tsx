/**
 * CollapsibleRail.tsx — Presentational rail component with toggle tab
 * Slides in/out from left or right edge. Tab button always visible (minimal reopen chevron).
 * No grid logic — parent view handles gridTemplateColumns.
 */

import React from 'react';

export interface CollapsibleRailProps {
  side: 'left' | 'right';
  open: boolean;
  onToggle: () => void;
  title: string;
  children: React.ReactNode;
  accent?: string;
  border?: string;
  surface?: string;
  muted?: string;
}

const CollapsibleRail: React.FC<CollapsibleRailProps> = ({
  side,
  open,
  onToggle,
  title,
  children,
  accent = '#f0a92a',
  border = '#2a2f3a',
  surface = '#14171e',
  muted = '#8a92a3',
}) => {
  // Chevron direction: left rail opens left (◀), right rail opens right (▶)
  const chevronOpen = side === 'left' ? '◀' : '▶';
  const chevronClosed = side === 'left' ? '▶' : '◀';

  return (
    <aside
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: surface,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Tab button — always visible, positioned at the inner edge */}
      <button
        data-testid={`rail-tab-${side}`}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${title} panel`}
        aria-expanded={open}
        type="button"
        onClick={onToggle}
        style={{
          position: 'absolute',
          [side === 'left' ? 'right' : 'left']: 0,
          top: 0,
          bottom: 0,
          width: '20px',
          zIndex: 5,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accent,
          fontSize: '16px',
          padding: 0,
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {open ? chevronOpen : chevronClosed}
      </button>

      {/* Title label */}
      <div
        style={{
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: muted,
          padding: '12px 8px',
          fontFamily: 'JetBrains Mono, monospace',
          borderBottom: `1px solid ${border}`,
          userSelect: 'none',
        }}
      >
        {title}
      </div>

      {/* Children (content) — always rendered but clipped by overflow:hidden */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </aside>
  );
};

export default CollapsibleRail;
