/**
 * MissionControl.tsx — phone-layout Mission Control HUD
 * Ported 1:1 from design_handoff_pocket_teleop/directions/mission.jsx:MissionControl
 *
 * Replaces useTeleopState with real bridge/stream props.
 * Joystick onMove/onEnd → bridge.sendTwist().
 * E-STOP and Space keydown → bridge.eStop().
 */

import React, { useState, useEffect, useRef } from 'react';
import { Joystick, MiniMap, Compass, VelBars, Readout, CONNECTION_LABELS, VideoSignalOverlay } from '../components/shared.js';
import CollapsibleRail from '../components/CollapsibleRail.js';
import { TeleopBridge } from '../hooks/useTeleopBridge.js';
import { WhepStream } from '../hooks/useWhepStream.js';

export type MissionLayout = 'phone-landscape' | 'phone-portrait';

export interface MissionControlProps {
  bridge: TeleopBridge;
  stream: WhepStream;
  onMenu: () => void;
  layout: MissionLayout;
  /** When true (Settings drawer open), joysticks render but cannot be grabbed. */
  controlsDisabled?: boolean;
}

/**
 * Mission palette: dark industrial console
 */
const MissionPalette = {
  bg: '#0c0e12',
  surface: '#14171e',
  surface2: '#1a1e26',
  border: '#2a2f3a',
  text: '#e6e9ef',
  muted: '#8a92a3',
  accent: '#f0a92a', // amber
  accent2: '#4ec9d6', // cyan
  danger: '#ef4444',
  ok: '#22c55e',
};

export const MissionControl: React.FC<MissionControlProps> = ({
  bridge,
  stream,
  onMenu,
  layout,
  controlsDisabled = false,
}) => {
  const { estopEngaged } = bridge;
  const p = MissionPalette;
  const sansFont = 'Inter, ui-sans-serif, system-ui, sans-serif';
  const monoFont = '"JetBrains Mono", ui-monospace, monospace';

  const isLandscape = layout === 'phone-landscape';

  // Collapsible rail state (landscape only)
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Video ref for streaming MediaStream
  const videoRef = useRef<HTMLVideoElement>(null);

  // Track velocity axes for proper onEnd behavior (maintain one while releasing other)
  const [lx, setLx] = useState(0);
  const [ly, setLy] = useState(0);
  const [az, setAz] = useState(0);

  /**
   * axesRef holds the live (non-stale) current command.
   * React useState setters are async — reading lx/ly/az in a closure can
   * capture a stale render-cycle value.  The ref is always synchronously
   * up-to-date and is the authoritative source for what gets sent.
   */
  const axesRef = useRef({ lx: 0, ly: 0, az: 0 });

  // Video srcObject sync
  useEffect(() => {
    if (videoRef.current && stream.stream) {
      videoRef.current.srcObject = stream.stream;
    }
  }, [stream.stream]);

  // E-STOP via Space key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Ignore Space while typing in a form field — it must insert a
        // character, not fire E-STOP. Only fire when no editable element holds focus.
        const t = e.target;
        if (
          t instanceof HTMLElement &&
          (t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' ||
            t.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        bridge.eStop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bridge]);

  // Joystick sizes + variant based on layout
  const zone = isLandscape ? 230 : 190;
  const baseSize = isLandscape ? 120 : 110;
  const knobSize = isLandscape ? 52 : 46;
  const variant = 'zone' as const; // hold-zone by default

  // DRIVE joystick: lx (forward) + az (rotate)
  const handleDriveMove = (x: number, y: number) => {
    setLx(-y); // y-axis inverted → forward+
    setAz(-x); // x-axis inverted → ccw+
    axesRef.current.lx = -y;
    axesRef.current.az = -x;
    bridge.sendTwist(axesRef.current.lx, axesRef.current.ly, axesRef.current.az);
  };

  const handleDriveEnd = () => {
    setLx(0);
    setAz(0);
    axesRef.current.lx = 0;
    axesRef.current.az = 0;
    // ly preserved in axesRef — STRAFE may still be active
    bridge.sendTwist(axesRef.current.lx, axesRef.current.ly, axesRef.current.az);
  };

  // STRAFE joystick: ly (lateral)
  const handleStrafeMove = (x: number) => {
    setLy(x);
    axesRef.current.ly = x;
    bridge.sendTwist(axesRef.current.lx, axesRef.current.ly, axesRef.current.az);
  };

  const handleStrafeEnd = () => {
    setLy(0);
    axesRef.current.ly = 0;
    // lx and az preserved in axesRef — DRIVE may still be active
    bridge.sendTwist(axesRef.current.lx, axesRef.current.ly, axesRef.current.az);
  };

  // Derive minimap/compass data from bridge.odom
  const odomPos = bridge.odom ?? { x: 0, y: 0, heading: 0 };

  // Latency readout: only render a number for a real, finite, non-negative
  // value. Negative / NaN / Infinity all fall back to the em-dash placeholder.
  const latText =
    bridge.latencyMs !== null &&
    Number.isFinite(bridge.latencyMs) &&
    bridge.latencyMs >= 0
      ? `${bridge.latencyMs} ms`
      : '— ms';

  // Connection state label. While reconnecting, show the live attempt counter
  // (bridge.retryCount, counts up 1→2→3…) instead of the placeholder text.
  const connLabel = CONNECTION_LABELS[bridge.connectionState];
  const connText =
    bridge.connectionState === 'reconnecting'
      ? `⟳ Reconnecting… (${bridge.retryCount})`
      : connLabel.text;
  const stateShort =
    bridge.connectionState === 'live'
      ? '● Live'
      : bridge.connectionState === 'reconnecting'
        ? `⟳ Retry ${bridge.retryCount}`
        : '○ Down';

  // Robot identity: prefer the reported name, fall back to the robot model
  // (robotType). When neither is known yet, render nothing (no fake placeholder).
  const robotLabel = bridge.robotName || bridge.robotType;

  return (
    <div
      style={isLandscape ? {
        width: '100%',
        height: '100%',
        background: p.bg,
        color: p.text,
        fontFamily: sansFont,
        display: 'grid',
        gridTemplateColumns: `${leftOpen ? 180 : 0}px 1fr ${rightOpen ? 180 : 0}px`,
        gridTemplateRows: '44px 1fr',
        position: 'relative',
        overflow: 'hidden',
        transition: 'grid-template-columns 0.2s ease',
      } : {
        width: '100%',
        height: '100%',
        background: p.bg,
        color: p.text,
        fontFamily: sansFont,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <header
        style={{
          ...(isLandscape ? { gridColumn: '1 / -1' } : { flex: '0 0 auto' }),
          height: isLandscape ? 44 : 36,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          background: p.surface,
          borderBottom: `1px solid ${p.border}`,
        }}
      >
        {/* Hamburger menu */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenu}
          style={{
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: p.muted,
            fontSize: 16,
            cursor: 'pointer',
            flex: '0 0 auto',
            background: 'transparent',
            border: 'none',
            padding: 0,
          }}
        >
          ☰
        </button>

        {/* Robot name */}
        <div
          style={{
            fontFamily: monoFont,
            fontSize: 9,
            letterSpacing: '0.1em',
            color: p.muted,
            textTransform: 'uppercase',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            flex: 1,
          }}
        >
          POCKET-TELEOP
          {robotLabel && (
            <span style={{ color: p.accent, marginLeft: 6 }}>
              ● {robotLabel}
            </span>
          )}
        </div>

        {/* Connection state chip */}
        <div
          style={{
            fontFamily: monoFont,
            fontSize: 10,
            flex: '0 0 auto',
            color: connLabel.color,
            padding: '3px 7px',
            border: `1px solid ${connLabel.color}55`,
            borderRadius: 2,
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
          }}
        >
          {isLandscape ? connText : stateShort}
        </div>

        {/* E-STOP button — engaged state shows RESET affordance */}
        <button
          onClick={() => estopEngaged ? bridge.resetEstop() : bridge.eStop()}
          style={{
            background: estopEngaged ? '#ff0000' : p.danger,
            color: '#fff',
            border: estopEngaged ? '2px solid #fff' : 'none',
            borderRadius: 3,
            padding: isLandscape ? '5px 12px' : '4px 8px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            fontFamily: monoFont,
            cursor: 'pointer',
            flex: '0 0 auto',
            whiteSpace: 'nowrap',
            zIndex: 10,
            animation: estopEngaged ? 'pulse 1s ease-in-out infinite alternate' : 'none',
          }}
        >
          {estopEngaged ? '■ RESET' : '■ STOP'}
        </button>
      </header>

      {/* E-STOP engaged banner — always visible above all content when latched */}
      {estopEngaged && (
        <div
          style={{
            position: 'absolute',
            top: isLandscape ? 44 : 36,
            left: 0,
            right: 0,
            background: '#ff0000',
            color: '#fff',
            textAlign: 'center',
            fontFamily: monoFont,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.12em',
            padding: '5px 0',
            zIndex: 20,
          }}
        >
          ⚠ E-STOP ENGAGED — tap RESET
        </div>
      )}

      {isLandscape ? (
        <>
          {/* Landscape: Left rail (STREAM, VELOCITY, LAT/BAT/SIG) */}
          <CollapsibleRail
            side="left"
            title="STREAM"
            open={leftOpen}
            onToggle={() => setLeftOpen((o) => !o)}
            width={180}
            accent={p.accent}
            border={p.border}
            surface={p.surface}
            muted={p.muted}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
              {/* STREAM data */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: monoFont, fontSize: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ opacity: 0.6 }}>src</span>
                  <span style={{ color: p.text, fontWeight: 500 }}>WebRTC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ opacity: 0.6 }}>codec</span>
                  <span style={{ color: p.text, fontWeight: 500 }}>H.264</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ opacity: 0.6 }}>fps</span>
                  <span style={{ color: p.text, fontWeight: 500 }}>{stream.stats?.fps != null ? stream.stats.fps.toFixed(1) : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ opacity: 0.6 }}>res</span>
                  <span style={{ color: p.text, fontWeight: 500 }}>{(stream.stats?.width != null && stream.stats?.height != null) ? `${stream.stats.width}×${stream.stats.height}` : '—'}</span>
                </div>
              </div>

              {/* VELOCITY bars */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: p.muted, marginBottom: 6, fontFamily: monoFont }}>VELOCITY</div>
                <VelBars
                  lx={lx}
                  ly={ly}
                  az={az}
                  color={p.accent}
                  trackColor="rgba(255,255,255,0.08)"
                  font={monoFont}
                />
              </div>

              {/* LAT/BAT/SIG readouts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Readout
                  label="LAT"
                  value={latText}
                  color={p.accent}
                />
                <Readout label="BAT" value="—" color={p.accent} />
                <Readout label="SIG" value="—" color={p.accent} />
              </div>
            </div>
          </CollapsibleRail>

          {/* Landscape: Main viewport (video + reticle + mode + joysticks) */}
          <main
            style={{
              position: 'relative',
              overflow: 'hidden',
              background: p.bg,
            }}
            data-testid="landscape-main"
          >
            {/* Video element */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />

            {/* Video signal overlay */}
            <VideoSignalOverlay state={stream.state} />

            {/* Center crosshair reticle */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 16,
                height: 16,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: p.accent,
                  opacity: 0.4,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  right: 0,
                  height: 1,
                  background: p.accent,
                  opacity: 0.4,
                }}
              />
            </div>

            {/* Mode chip */}
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                fontFamily: monoFont,
                fontSize: 10,
                letterSpacing: '0.1em',
                color: p.text,
                background: 'rgba(8,10,14,0.7)',
                padding: '4px 8px',
                borderRadius: 2,
                border: `1px solid ${p.border}`,
              }}
            >
              MANUAL · TELEOP
            </div>

            {/* DRIVE joystick (left bottom) */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: zone,
                height: zone,
                pointerEvents: controlsDisabled ? 'none' : 'auto',
              }}
              data-testid="joystick-zone"
            >
              <Joystick
                variant={variant}
                size={zone}
                baseSize={baseSize}
                knobSize={knobSize}
                baseColor="rgba(240,169,42,0.08)"
                ringColor={p.accent + 'aa'}
                knobColor={p.accent}
                knobBorder={p.bg}
                onMove={handleDriveMove}
                onEnd={handleDriveEnd}
                label="DRIVE"
              />
            </div>

            {/* STRAFE joystick (right bottom) */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: zone,
                height: zone,
                pointerEvents: controlsDisabled ? 'none' : 'auto',
              }}
              data-testid="joystick-zone"
            >
              <Joystick
                variant={variant}
                axes="x"
                size={zone}
                baseSize={baseSize}
                knobSize={knobSize}
                baseColor="rgba(78,201,214,0.08)"
                ringColor={p.accent2 + 'aa'}
                knobColor={p.accent2}
                knobBorder={p.bg}
                onMove={handleStrafeMove}
                onEnd={handleStrafeEnd}
                label="STRAFE"
              />
            </div>
          </main>

          {/* Landscape: Right rail (MAP, HEADING) */}
          <CollapsibleRail
            side="right"
            title="MAP"
            open={rightOpen}
            onToggle={() => setRightOpen((o) => !o)}
            width={180}
            accent={p.accent}
            border={p.border}
            surface={p.surface}
            muted={p.muted}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
              {/* MAP */}
              <MiniMap
                pos={odomPos}
                heading={odomPos.heading}
                size={140}
                color={p.accent}
                bg={p.bg}
                border={p.border}
              />

              {/* HEADING */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: p.muted, marginBottom: 6, fontFamily: monoFont }}>HEADING</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Compass heading={odomPos.heading} color={p.accent} font={monoFont} size={40} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: monoFont, fontSize: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ opacity: 0.6 }}>course</span>
                      <span style={{ color: p.text, fontWeight: 500 }}>{Math.round(((odomPos.heading * 180 / Math.PI) % 360 + 360) % 360).toString().padStart(3, '0')}°</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ opacity: 0.6 }}>track</span>
                      <span style={{ color: p.text, fontWeight: 500 }}>{(Math.atan2(ly, lx) * 180 / Math.PI).toFixed(0)}°</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleRail>
        </>
      ) : (
        /* Portrait: Video viewport + overlays (original structure) */
        <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: p.bg,
        }}
      >
        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />

        {/* Video signal overlay */}
        <VideoSignalOverlay state={stream.state} />

        {/* Top-left vel bars */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: isLandscape ? 'auto' : 8,
            width: isLandscape ? 200 : 'auto',
            background: 'rgba(8,10,14,0.55)',
            backdropFilter: 'blur(6px)',
            padding: '6px 8px',
            borderRadius: 4,
            border: `1px solid ${p.border}40`,
          }}
        >
          <VelBars
            lx={lx}
            ly={ly}
            az={az}
            color={p.accent}
            trackColor="rgba(255,255,255,0.08)"
            font={monoFont}
          />
        </div>

        {/* Top-right telemetry stack */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            alignItems: 'flex-end',
            fontFamily: monoFont,
            fontSize: 10,
            color: p.muted,
          }}
        >
          <Readout
            label="LAT"
            value={latText}
            color={p.accent}
          />
          <Readout label="BAT" value="—" color={p.accent} />
          <Readout label="SIG" value="—" color={p.accent} />
        </div>

        {/* Bottom-right mini-map + compass */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            alignItems: 'flex-end',
          }}
        >
          <MiniMap
            pos={odomPos}
            heading={odomPos.heading}
            size={isLandscape ? 110 : 88}
            color={p.accent}
            bg="rgba(8,10,14,0.7)"
            border={p.border}
          />
          <Compass
            heading={odomPos.heading}
            color={p.accent}
            font={monoFont}
            size={isLandscape ? 28 : 22}
          />
        </div>

        {/* Center crosshair reticle */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 16,
            height: 16,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: 1,
              background: p.accent,
              opacity: 0.4,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: 1,
              background: p.accent,
              opacity: 0.4,
            }}
          />
        </div>

        {/* DRIVE joystick (left bottom) */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: zone,
            height: zone,
            pointerEvents: controlsDisabled ? 'none' : 'auto',
          }}
        >
          <Joystick
            variant={variant}
            size={zone}
            baseSize={baseSize}
            knobSize={knobSize}
            baseColor="rgba(240,169,42,0.08)"
            ringColor={p.accent + 'aa'}
            knobColor={p.accent}
            knobBorder={p.bg}
            onMove={handleDriveMove}
            onEnd={handleDriveEnd}
            label="DRIVE"
          />
        </div>

        {/* STRAFE joystick (right bottom) */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: zone,
            height: zone,
            pointerEvents: controlsDisabled ? 'none' : 'auto',
          }}
        >
          <Joystick
            variant={variant}
            axes="x"
            size={zone}
            baseSize={baseSize}
            knobSize={knobSize}
            baseColor="rgba(78,201,214,0.08)"
            ringColor={p.accent2 + 'aa'}
            knobColor={p.accent2}
            knobBorder={p.bg}
            onMove={handleStrafeMove}
            onEnd={handleStrafeEnd}
            label="STRAFE"
          />
        </div>

        {/* Mode chip (bottom center) */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: monoFont,
            fontSize: 10,
            letterSpacing: '0.1em',
            color: p.text,
            background: 'rgba(8,10,14,0.7)',
            padding: '4px 10px',
            borderRadius: 2,
            border: `1px solid ${p.border}`,
          }}
        >
          MANUAL · TELEOP
        </div>
      </div>
      )}
    </div>
  );
};
