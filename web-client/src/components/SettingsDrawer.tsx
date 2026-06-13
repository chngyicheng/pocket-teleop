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
 *   2. Video: two grouped subgroups —
 *        • Source: mode select (ros2|rtsp|udp|srt|mjpeg|disabled) + URL + Apply
 *          (per-browser MediaMTX runtime switch, instant, not persisted).
 *        • ROS2 Camera: VIDEO_TOPIC + VIDEO_TOPIC_TYPE + Save (server config via
 *          PUT /auth/robot-config; used when Source = ROS2; restart to apply).
 *   3. Robot: identity + footprint (ROBOT_TYPE, ROBOT_NAME, ROBOT_NAMESPACE,
 *      ROBOT_LENGTH_M, ROBOT_WIDTH_M) + Save (server config, restart to apply).
 *
 * Both Saves issue partial PUTs to /auth/robot-config (merged server-side), so
 * each section persists only its own fields.
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

/** Shared style for the small field labels above an input. */
const fieldLabel: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  fontSize: 11,
  color: P.muted,
  fontFamily: MONO,
};

/** Shared style for per-field validation errors below an input. */
const fieldError: React.CSSProperties = {
  fontSize: 11,
  color: P.danger,
  marginTop: 3,
  fontFamily: MONO,
};

/** Sub-group label inside a section (e.g. "Source" / "ROS2 camera" under Video). */
const subHeading: React.CSSProperties = {
  margin: '0 0 6px 0',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: P.text,
  fontFamily: MONO,
};

/** Muted explanatory note tying related controls together. */
const noteStyle: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.4,
  color: P.muted,
  fontFamily: SANS,
  margin: '0 0 4px 0',
};

/** Result/toast line shared by the Apply / Save actions. */
const resultLine: React.CSSProperties = {
  fontSize: 12,
  marginTop: 4,
  wordWrap: 'break-word',
  whiteSpace: 'normal',
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

interface RobotConfig {
  ROBOT_TYPE: string;
  ROBOT_NAME: string;
  ROBOT_NAMESPACE: string;
  ROBOT_LENGTH_M: string;
  ROBOT_WIDTH_M: string;
  VIDEO_TOPIC: string;
  VIDEO_TOPIC_TYPE: string;
}

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
  const [pickerInstance] = useState(() => new VideoSourcePicker());

  // Robot config state
  const [robotConfig, setRobotConfig] = useState<RobotConfig>({
    ROBOT_TYPE: '',
    ROBOT_NAME: '',
    ROBOT_NAMESPACE: '',
    ROBOT_LENGTH_M: '',
    ROBOT_WIDTH_M: '',
    VIDEO_TOPIC: '',
    VIDEO_TOPIC_TYPE: '',
  });
  const [robotSaveResult, setRobotSaveResult] = useState<string | null>(null);
  const [videoTopicSaveResult, setVideoTopicSaveResult] = useState<string | null>(null);
  const [robotFieldErrors, setRobotFieldErrors] = useState<Record<string, string>>({});

  // Initialize video state from picker
  useEffect(() => {
    const saved = pickerInstance.loadSaved();
    setVideoMode(saved.mode);
    setVideoUrl(saved.streamUrl || saved.mjpegUrl || '');
  }, [pickerInstance]);

  // Fetch robot config from server on mount
  useEffect(() => {
    const fetchRobotConfig = async () => {
      try {
        const response = await fetch('/auth/robot-config', { method: 'GET' });
        if (response.ok) {
          const data = await response.json();
          setRobotConfig(data);
          setRobotFieldErrors({});
        }
      } catch (err) {
        // Silently fail on network error; user can still interact with form
      }
    };
    fetchRobotConfig();
  }, []);

  const handleVideoApply = async () => {
    const result = await pickerInstance.apply(videoMode, videoUrl);
    setVideoApplyResult(result);
    // Clear result after 2s
    setTimeout(() => setVideoApplyResult(null), 2000);
  };

  const handleRobotConfigChange = (key: keyof RobotConfig, value: string) => {
    setRobotConfig((prev) => ({ ...prev, [key]: value }));
    // Clear field error when user edits
    if (robotFieldErrors[key]) {
      setRobotFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Persist a subset of the robot config. The endpoint accepts a partial PUT
  // and merges server-side, so each section can save only its own fields
  // without clobbering the others. Errors/clears are scoped to those keys.
  const saveRobotConfig = async (
    keys: (keyof RobotConfig)[],
    setResult: (s: string | null) => void,
  ) => {
    const body: Partial<RobotConfig> = {};
    for (const k of keys) body[k] = robotConfig[k];
    try {
      const response = await fetch('/auth/robot-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        await response.json();
        setRobotFieldErrors((prev) => {
          const next = { ...prev };
          for (const k of keys) delete next[k];
          return next;
        });
        setResult('Saved — restart the stack to apply');
        setTimeout(() => setResult(null), 3000);
      } else if (response.status === 400) {
        const errorData = await response.json();
        setRobotFieldErrors((prev) => ({ ...prev, ...(errorData.errors || {}) }));
        setResult(null);
      } else {
        setResult('Error saving config');
        setTimeout(() => setResult(null), 3000);
      }
    } catch (err) {
      setResult('Network error');
      setTimeout(() => setResult(null), 3000);
    }
  };

  const handleRobotConfigSave = () =>
    saveRobotConfig(
      ['ROBOT_TYPE', 'ROBOT_NAME', 'ROBOT_NAMESPACE', 'ROBOT_LENGTH_M', 'ROBOT_WIDTH_M'],
      setRobotSaveResult,
    );

  const handleVideoTopicSave = () =>
    saveRobotConfig(['VIDEO_TOPIC', 'VIDEO_TOPIC_TYPE'], setVideoTopicSaveResult);

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

  const saveResultColor = (msg: string | null): string => {
    if (!msg) return P.text;
    if (msg.includes('Saved') || msg.includes('restart')) return P.ok;
    if (msg.includes('Error') || msg.includes('error')) return P.danger;
    return P.text;
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
          // dvh (dynamic viewport height) tracks the *visible* area on mobile;
          // plain vh uses the larger layout viewport, pushing the drawer's
          // bottom under the browser chrome where it can't be scrolled to.
          height: topOffset ? `calc(100dvh - ${topOffset}px)` : '100dvh',
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

          {/* Video Section — all video controls grouped here.
              Two subgroups: the live MediaMTX source switch (this browser,
              instant) and the server-side ROS2 camera topic (used when the
              source is ROS2). */}
          <section>
            <h3 style={sectionHeading}>Video</h3>

            {/* Subgroup 1 — live source switch (per-browser, MediaMTX runtime) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={subHeading}>Source</h4>
              <p style={noteStyle}>
                What this browser plays. Applies instantly; not saved on the robot.
              </p>
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
                <div style={{ ...resultLine, color: getVideoResultColor() }}>
                  {getVideoResultMessage()}
                </div>
              )}
            </div>

            {/* Subgroup 2 — ROS2 camera topic (server config, restart to apply) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '14px',
                paddingTop: '14px',
                borderTop: `1px solid ${P.border}`,
              }}
            >
              <h4 style={subHeading}>ROS2 Camera</h4>
              <p style={noteStyle}>
                Used when Source is ROS2: the ROS2 image topic the robot streams.
                Saved on the robot — restart the stack to apply.
              </p>

              {/* VIDEO_TOPIC: text */}
              <div>
                <label style={fieldLabel}>Topic</label>
                <input
                  type="text"
                  value={robotConfig.VIDEO_TOPIC}
                  onChange={(e) => handleRobotConfigChange('VIDEO_TOPIC', e.target.value)}
                  placeholder="/camera/image"
                  style={fieldStyle}
                />
                {robotFieldErrors.VIDEO_TOPIC && (
                  <div style={fieldError}>{robotFieldErrors.VIDEO_TOPIC}</div>
                )}
              </div>

              {/* VIDEO_TOPIC_TYPE: select compressed | raw */}
              <div>
                <label style={fieldLabel}>Topic Type</label>
                <select
                  value={robotConfig.VIDEO_TOPIC_TYPE}
                  onChange={(e) => handleRobotConfigChange('VIDEO_TOPIC_TYPE', e.target.value)}
                  style={fieldStyle}
                >
                  <option value="">Select type</option>
                  <option value="compressed">Compressed</option>
                  <option value="raw">Raw</option>
                </select>
                {robotFieldErrors.VIDEO_TOPIC_TYPE && (
                  <div style={fieldError}>{robotFieldErrors.VIDEO_TOPIC_TYPE}</div>
                )}
              </div>

              <button onClick={handleVideoTopicSave} style={actionButtonStyle}>
                Save
              </button>
              {videoTopicSaveResult && (
                <div style={{ ...resultLine, color: saveResultColor(videoTopicSaveResult) }}>
                  {videoTopicSaveResult}
                </div>
              )}
            </div>
          </section>

          {/* Robot Section — identity + footprint (server config, restart to apply) */}
          <section>
            <h3 style={sectionHeading}>Robot</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* ROBOT_TYPE: select diff_drive | holonomic */}
              <div>
                <label style={fieldLabel}>Type</label>
                <select
                  value={robotConfig.ROBOT_TYPE}
                  onChange={(e) => handleRobotConfigChange('ROBOT_TYPE', e.target.value)}
                  style={fieldStyle}
                >
                  <option value="">Select type</option>
                  <option value="diff_drive">Differential Drive</option>
                  <option value="holonomic">Holonomic</option>
                </select>
                {robotFieldErrors.ROBOT_TYPE && (
                  <div style={fieldError}>{robotFieldErrors.ROBOT_TYPE}</div>
                )}
              </div>

              {/* ROBOT_NAME: text */}
              <div>
                <label style={fieldLabel}>Name</label>
                <input
                  type="text"
                  value={robotConfig.ROBOT_NAME}
                  onChange={(e) => handleRobotConfigChange('ROBOT_NAME', e.target.value)}
                  placeholder="Robot name"
                  style={fieldStyle}
                />
                {robotFieldErrors.ROBOT_NAME && (
                  <div style={fieldError}>{robotFieldErrors.ROBOT_NAME}</div>
                )}
              </div>

              {/* ROBOT_NAMESPACE: text */}
              <div>
                <label style={fieldLabel}>Namespace</label>
                <input
                  type="text"
                  value={robotConfig.ROBOT_NAMESPACE}
                  onChange={(e) => handleRobotConfigChange('ROBOT_NAMESPACE', e.target.value)}
                  placeholder="/robot"
                  style={fieldStyle}
                />
                {robotFieldErrors.ROBOT_NAMESPACE && (
                  <div style={fieldError}>{robotFieldErrors.ROBOT_NAMESPACE}</div>
                )}
              </div>

              {/* ROBOT_LENGTH_M: text (number) */}
              <div>
                <label style={fieldLabel}>Length (m)</label>
                <input
                  type="text"
                  value={robotConfig.ROBOT_LENGTH_M}
                  onChange={(e) => handleRobotConfigChange('ROBOT_LENGTH_M', e.target.value)}
                  placeholder="0.5"
                  style={fieldStyle}
                />
                {robotFieldErrors.ROBOT_LENGTH_M && (
                  <div style={fieldError}>{robotFieldErrors.ROBOT_LENGTH_M}</div>
                )}
              </div>

              {/* ROBOT_WIDTH_M: text (number) */}
              <div>
                <label style={fieldLabel}>Width (m)</label>
                <input
                  type="text"
                  value={robotConfig.ROBOT_WIDTH_M}
                  onChange={(e) => handleRobotConfigChange('ROBOT_WIDTH_M', e.target.value)}
                  placeholder="0.4"
                  style={fieldStyle}
                />
                {robotFieldErrors.ROBOT_WIDTH_M && (
                  <div style={fieldError}>{robotFieldErrors.ROBOT_WIDTH_M}</div>
                )}
              </div>

              <button onClick={handleRobotConfigSave} style={actionButtonStyle}>
                Save
              </button>
              {robotSaveResult && (
                <div style={{ ...resultLine, color: saveResultColor(robotSaveResult) }}>
                  {robotSaveResult}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
