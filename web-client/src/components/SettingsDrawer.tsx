/**
 * SettingsDrawer.tsx — slide-in settings panel (React 18 + TypeScript).
 *
 * Layout: 320px fixed width, 100vh height, fixed positioning.
 * Sections: Gamepad / Video / Connection (dark palette: #0b0d12 bg, #e6e9ef fg, z-index ≤ 9).
 * Transition: translateX(0) open, translateX(-100%) closed, 0.2s ease.
 *
 * Props:
 *   - open: boolean — visibility state.
 *   - onClose: () => void — called on close button click.
 *   - activeGamepadProfile?: string — current profile name (optional).
 *   - onGamepadProfileChange?: (profileName: string) => void — callback on profile change (optional).
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
}

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
    if (!videoApplyResult) return '#e6e9ef';
    if (videoApplyResult === 'ok') return '#22c55e';
    if (videoApplyResult.startsWith('validation-error:') || videoApplyResult.startsWith('http-error:') || videoApplyResult.startsWith('network-error:')) {
      return '#ef4444';
    }
    return '#e6e9ef';
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
    <div
      role="dialog"
      aria-label="Settings"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '320px',
        height: '100vh',
        backgroundColor: '#0b0d12',
        color: '#e6e9ef',
        borderRight: '1px solid #2a2f3a',
        zIndex: 9,
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
          padding: '16px',
          borderBottom: '1px solid #2a2f3a',
          minHeight: '60px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Settings</h2>
        <button
          aria-label="Close settings"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#e6e9ef',
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
          gap: '16px',
        }}
      >
        {/* Gamepad Section */}
        <section>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#3b82f6' }}>
            Gamepad
          </h3>
          <select
            value={activeGamepadProfile}
            onChange={(e) => onGamepadProfileChange?.(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#1a1f2e',
              color: '#e6e9ef',
              border: '1px solid #2a2f3a',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'inherit',
            }}
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
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#3b82f6' }}>
            Video
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <select
              value={videoMode}
              onChange={(e) => setVideoMode(e.target.value as VideoSourceMode)}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#1a1f2e',
                color: '#e6e9ef',
                border: '1px solid #2a2f3a',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
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
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#1a1f2e',
                color: '#e6e9ef',
                border: '1px solid #2a2f3a',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleVideoApply}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: '#0b0d12',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
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
                }}
              >
                {getVideoResultMessage()}
              </div>
            )}
          </div>
        </section>

        {/* Connection Section */}
        <section>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#3b82f6' }}>
            Connection
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              value={robotNamespace}
              onChange={(e) => setRobotNamespace(e.target.value)}
              placeholder="Robot namespace (e.g., /robot)"
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#1a1f2e',
                color: '#e6e9ef',
                border: '1px solid #2a2f3a',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleNamespaceSave}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: '#0b0d12',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            {namespaceSaved && (
              <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>
                Saved
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
