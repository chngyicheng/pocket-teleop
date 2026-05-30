/**
 * MissionControl.tsx — phone-layout Mission Control HUD
 * Ported 1:1 from design_handoff_pocket_teleop/directions/mission.jsx:MissionControl
 *
 * Replaces useTeleopState with real bridge/stream props.
 * Joystick onMove/onEnd → bridge.sendTwist().
 * E-STOP and Space keydown → bridge.eStop().
 */

import React, { useState, useEffect, useRef } from 'react';
import { Joystick, MiniMap, Compass, VelBars, Readout, CONNECTION_LABELS } from '../components/shared.js';
import { TeleopBridge } from '../hooks/useTeleopBridge.js';
import { WhepStream } from '../hooks/useWhepStream.js';

export type MissionLayout = 'phone-landscape' | 'phone-portrait';

export interface MissionControlProps {
  bridge: TeleopBridge;
  stream: WhepStream;
  onMenu: () => void;
  layout: MissionLayout;
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
}) => {
  const p = MissionPalette;
  const sansFont = 'Inter, ui-sans-serif, system-ui, sans-serif';
  const monoFont = '"JetBrains Mono", ui-monospace, monospace';

  const isLandscape = layout === 'phone-landscape';

  // Video ref for streaming MediaStream
  const videoRef = useRef<HTMLVideoElement>(null);

  // Track velocity axes for proper onEnd behavior (maintain one while releasing other)
  const [lx, setLx] = useState(0);
  const [ly, setLy] = useState(0);
  const [az, setAz] = useState(0);

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
    bridge.sendTwist(-y, ly, -x);
  };

  const handleDriveEnd = () => {
    setLx(0);
    setAz(0);
    bridge.sendTwist(0, ly, 0);
  };

  // STRAFE joystick: ly (lateral)
  const handleStrafeMove = (x: number) => {
    setLy(x);
    bridge.sendTwist(lx, x, az);
  };

  const handleStrafeEnd = () => {
    setLy(0);
    bridge.sendTwist(lx, 0, az);
  };

  // Derive minimap/compass data from bridge.odom
  const odomPos = bridge.odom ?? { x: 0, y: 0, heading: 0 };

  // Connection state label
  const connLabel = CONNECTION_LABELS[bridge.connectionState];
  const stateShort =
    bridge.connectionState === 'live'
      ? '● Live'
      : bridge.connectionState === 'reconnecting'
        ? '⟳ Retry'
        : '○ Down';

  return (
    <div
      style={{
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
          flex: '0 0 auto',
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
          POCKET-TELEOP{' '}
          <span style={{ color: p.accent, marginLeft: 6 }}>
            ● {bridge.robotName || 'bot-07'}
          </span>
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
          {isLandscape ? connLabel.text : stateShort}
        </div>

        {/* E-STOP button */}
        <button
          onClick={() => bridge.eStop()}
          style={{
            background: p.danger,
            color: '#fff',
            border: 'none',
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
          }}
        >
          ■ STOP
        </button>
      </header>

      {/* Video viewport + overlays */}
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
            objectFit: 'cover',
          }}
        />

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
            value={bridge.latencyMs !== null ? `${bridge.latencyMs} ms` : '— ms'}
            color={p.accent}
          />
          <Readout label="BAT" value="78%" color={p.accent} />
          <Readout label="SIG" value="-58 dBm" color={p.accent} />
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
            pointerEvents: 'auto',
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
            pointerEvents: 'auto',
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
    </div>
  );
};
