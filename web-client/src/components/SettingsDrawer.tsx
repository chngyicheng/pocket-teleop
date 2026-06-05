/**
 * SettingsDrawer.tsx — slide-in settings panel (React 18 + TypeScript).
 *
 * Layout: 320px fixed width, anchored to the LEFT edge below `topOffset` px so
 * the top bar / E-STOP stay visible above it. Mission palette (#14171e surface,
 * #f0a92a amber accent, JetBrains Mono headings). Drawer sits above the
 * collapsible rail tabs (z15); panel z17 / backdrop z16. E-STOP stays uncovered
 * because the drawer is offset below the top bar (top: topOffset), not by z-index.
 * Transition: translateX(0) open, translateX(-100%) closed, 0.2s ease.
 * A backdrop scrim (rendered only when open) closes the drawer on outside tap.
 *
 * Props:
 *   - open: boolean — visibility state.
 *   - onClose: () => void — called on close button / backdrop click.
 *   - activeGamepadProfile?: string — current profile name (optional).
 *   - onGamepadProfileChange?: (profileName: string) => void — callback on profile change (optional).
 *   - topOffset?: number — px from viewport top (clears the top bar). Default 0.
 *
 * Sections:
 *   1. Gamepad: Select from getAllProfiles().
 *   2. Video: Mode select (ros2|rtsp|udp|srt|mjpeg|disabled) + URL input + Apply button.
 *   3. Connection: Robot namespace input + Save button.
 */

import React, { useState, useEffect } from 'react';
import { getAllProfiles } from '../gamepad_profiles.js';
import { VideoSourcePicker, type VideoSourceMode } from '../video_source.js';

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  activeGamepadProfile?: string;
  onGamepadProfileChange?: (profileName: string) => void;
  /**
   * Pixels from the top of the viewport where the drawer (and backdrop) begin,
   * so the top bar / E-STOP button stay visible and tappable above it.
   * Defaults to 0 (full height).
   */
  topOffset?: number;
}

/** Mission palette — matches the dark industrial console used across the app. */
const P = {
  surface: '#14171e',
  surface2: '#1a1e26',
  border: '#2a2f3a',
  text: '#e6e9ef',
  muted: '#8a92a3',
  accent: '#f0a92a', // amber
  bg: '#0c0e12',
  ok: '#22c55e',
  danger: '#ef4444',
};
const SANS = 'Inter, ui-sans-serif, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

/** Shared style for the uppercase mono section headings. */
const sectionHeading: React.CSSProperties = {
  margin: '0 0 8px 0',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: P.accent,
  fontFamily: MONO,
};

/** Shared style for selects / text inputs. */
const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  backgroundColor: P.surface2,
  color: P.text,
  border: `1px solid ${P.border}`,
  borderRadius: 3,
  fontSize: 13,
  fontFamily: MONO,
  boxSizing: 'border-box',
};

/** Shared style for the amber action buttons. */
const actionButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: P.accent,
  color: P.bg,
  border: 'none',
  borderRadius: 3,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  cursor: 'pointer',
  fontFamily: MONO,
};

const VIDEO_MODES: VideoSourceMode[] = ['ros2', 'rtsp', 'udp', 'srt', 'mjpeg', 'disabled'];

const MODE_LABELS: Record<VideoSourceMode, string> = {
  ros2: 'ROS2',
  rtsp: 'RTSP',
  udp: 'UDP',
  srt: 'SRT',
  mjpeg: 'MJPEG',
  disabled: 'Disabled',
};

export default function SettingsDrawer({
  open,
  onClose,
  activeGamepadProfile = 'Default Profile',
  onGamepadProfileChange,
  topOffset = 0,
}: SettingsDrawerProps): JSX.Element {
  const [videoMode, setVideoMode] = useState<VideoSourceMode>('ros2');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoApplyResult, setVideoApplyResult] = useState<string | null>(null);
  const [robotNamespace, setRobotNamespace] = useState('');
  const [namespaceSaved, setNamespaceSaved] = useState(false);
  const [pickerInstance] = useState(() => new VideoSourcePicker());

  // Initialize video state from picker
  useEffect(() => {
    const saved = pickerInstance.loadSaved();
    setVideoMode(saved.mode);
    setVideoUrl(saved.streamUrl || saved.mjpegUrl || '');
  }, [pickerInstance]);

  // Initialize robot namespace from localStorage
  useEffect(() => {
    const ns = localStorage.getItem('pocket-teleop.robot-namespace') ?? '';
    setRobotNamespace(ns);
  }, []);

  const handleVideoApply = async () => {
    const result = await pickerInstance.apply(videoMode, videoUrl);
    setVideoApplyResult(result);
    // Clear result after 2s
    setTimeout(() => setVideoApplyResult(null), 2000);
  };

  const handleNamespaceSave = () => {
    localStorage.setItem('pocket-teleop.robot-namespace', robotNamespace);
    setNamespaceSaved(true);
    setTimeout(() => setNamespaceSaved(false), 2000);
  };

  const getVideoResultColor = (): string => {
    if (!videoApplyResult) return P.text;
    if (videoApplyResult === 'ok') return P.ok;
    if (videoApplyResult.startsWith('validation-error:') || videoApplyResult.startsWith('http-error:') || videoApplyResult.startsWith('network-error:')) {
      return P.danger;
    }
    return P.text;
  };

  const getVideoResultMessage = (): string => {
    if (!videoApplyResult) return '';
    if (videoApplyResult === 'ok') return 'Applied successfully';
    if (videoApplyResult.includes(':')) {
      const [type, message] = videoApplyResult.split(':', 2);
      return message || videoApplyResult;
    }
    return videoApplyResult;
  };

  return (
    <>
      {/* Backdrop scrim — only when open. Starts below the top bar so the
          burger / E-STOP stay tappable; clicking it closes the drawer. */}
      {open && (
        <div
          data-testid="settings-backdrop"
          onClick={onClose}
          style={{
            position: 'fixed',
            top: topOffset,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            zIndex: 16,
          }}
        />
      )}

      <div
        role="dialog"
        aria-label="Settings"
        style={{
          position: 'fixed',
          top: topOffset,
          left: 0,
          width: '320px',
          height: topOffset ? `calc(100vh - ${topOffset}px)` : '100vh',
          backgroundColor: P.surface,
          color: P.text,
          fontFamily: SANS,
          borderRight: `1px solid ${P.border}`,
          zIndex: 17,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.2s ease',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header + Close button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: `1px solid ${P.border}`,
            background: P.bg,
            minHeight: '52px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: P.text,
              fontFamily: MONO,
            }}
          >
            Settings
          </h2>
          <button
            aria-label="Close settings"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: P.muted,
              fontSize: '24px',
              cursor: 'pointer',
              padding: 0,
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Gamepad Section */}
          <section>
            <h3 style={sectionHeading}>Gamepad</h3>
            <select
              value={activeGamepadProfile}
              onChange={(e) => onGamepadProfileChange?.(e.target.value)}
              style={fieldStyle}
            >
              {getAllProfiles().map((profile) => (
                <option key={profile.name} value={profile.name}>
                  {profile.name}
                </option>
              ))}
            </select>
          </section>

          {/* Video Section */}
          <section>
            <h3 style={sectionHeading}>Video</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <select
                value={videoMode}
                onChange={(e) => setVideoMode(e.target.value as VideoSourceMode)}
                style={fieldStyle}
              >
                {VIDEO_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Stream URL (if needed)"
                style={fieldStyle}
              />
              <button onClick={handleVideoApply} style={actionButtonStyle}>
                Apply
              </button>
              {videoApplyResult && (
                <div
                  style={{
                    fontSize: '12px',
                    color: getVideoResultColor(),
                    marginTop: '4px',
                    wordWrap: 'break-word',
                    whiteSpace: 'normal',
                    fontFamily: MONO,
                  }}
                >
                  {getVideoResultMessage()}
                </div>
              )}
            </div>
          </section>

          {/* Connection Section */}
          <section>
            <h3 style={sectionHeading}>Connection</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                value={robotNamespace}
                onChange={(e) => setRobotNamespace(e.target.value)}
                placeholder="Robot namespace (e.g., /robot)"
                style={fieldStyle}
              />
              <button onClick={handleNamespaceSave} style={actionButtonStyle}>
                Save
              </button>
              {namespaceSaved && (
                <div style={{ fontSize: '12px', color: P.ok, marginTop: '4px', fontFamily: MONO }}>
                  Saved
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
