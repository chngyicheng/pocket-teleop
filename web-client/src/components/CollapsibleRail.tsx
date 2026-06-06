/**
 * CollapsibleRail.tsx — Presentational rail that slides fully out of view when
 * collapsed, leaving only a small "bookmark" arrow protruding into the viewport
 * (like a page marker on a book). When expanded, the bookmark gives way to an
 * inline arrow strip sitting in line with the drawer's inner edge.
 *
 * Slide-out mechanics: the panel keeps its expanded `width` and translates
 * off-screen (translateX ±100%) while the parent grid column animates to 0 — so
 * the center video (1fr) widens. The toggle button is anchored to the column
 * edge and does NOT translate, so it stays reachable as the page-marker tab.
 *
 * The toggle's z-index sits ABOVE the joystick hold-zones (z 5) so taps register
 * even where a rail edge overlaps a joystick — this is what makes collapse/expand
 * actually work in the short landscape viewports (tablet + 16:9 phone), where the
 * old equal-z tab was swallowed by the joystick layer painted after it.
 *
 * No grid logic — the parent view drives gridTemplateColumns.
 */

import React from 'react';

interface CollapsibleRailProps {
  side: 'left' | 'right';
  open: boolean;
  onToggle: () => void;
  title: string;
  children: React.ReactNode;
  /** Expanded width in px — should match the parent grid column's open width. */
  width?: number;
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
  width = 220,
  accent = '#f0a92a',
  border = '#2a2f3a',
  surface = '#14171e',
  muted = '#8a92a3',
}) => {
  const isLeft = side === 'left';
  // Chevron points toward the action: collapse direction when open, expand when closed.
  const chevron = open ? (isLeft ? '◀' : '▶') : isLeft ? '▶' : '◀';

  // Toggle geometry: a thin inline strip in line with the drawer when open;
  // a rounded protruding bookmark when collapsed.
  const toggleGeometry: React.CSSProperties = open
    ? {
        top: 0,
        bottom: 0,
        [isLeft ? 'right' : 'left']: 0,
        width: '22px',
        background: 'transparent',
        border: 'none',
        borderRadius: 0,
      }
    : {
        // Vertically centered on the rail edge.
        top: '50%',
        transform: 'translateY(-50%)',
        height: 56,
        width: 26,
        // Anchor to the (now 0-width) column edge and protrude inward over the video.
        [isLeft ? 'left' : 'right']: 0,
        background: surface,
        border: `1px solid ${border}`,
        [isLeft ? 'borderLeft' : 'borderRight']: 'none',
        borderRadius: isLeft ? '0 8px 8px 0' : '8px 0 0 8px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      };

  return (
    <aside
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        // Let the bookmark protrude past the 0-width column when collapsed.
        overflow: 'visible',
      }}
    >
      {/* Sliding panel — keeps its expanded width, translates off-screen when collapsed. */}
      <div
        data-testid={`rail-panel-${side}`}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          [isLeft ? 'left' : 'right']: 0,
          width,
          background: surface,
          [isLeft ? 'borderRight' : 'borderLeft']: `1px solid ${border}`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : `translateX(${isLeft ? '-100%' : '100%'})`,
          transition: 'transform 0.2s ease',
          // Above the joystick hold-zones (z5) so rail content (incl. the SPEED
          // +/- steppers) is tappable where a joystick overlaps; still below the
          // toggle tab (z15) and Settings drawer (z16/17). Collapsed -> translated
          // off-screen, so this never blocks the video/joysticks.
          zIndex: 6,
        }}
      >
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

        {/* Content — always rendered, clipped by overflow:hidden as the panel slides out. */}
        <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
      </div>

      {/* Toggle — stays anchored to the edge while the panel slides; above joystick zones. */}
      <button
        data-testid={`rail-tab-${side}`}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${title} panel`}
        aria-expanded={open}
        type="button"
        onClick={onToggle}
        style={{
          position: 'absolute',
          ...toggleGeometry,
          zIndex: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accent,
          fontSize: '16px',
          cursor: 'pointer',
          padding: 0,
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {chevron}
      </button>
    </aside>
  );
};

export default CollapsibleRail;
