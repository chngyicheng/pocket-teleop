/**
 * useSessionStatus.ts — session idle timeout hook
 *
 * Polls GET /auth/session-status every pollIntervalMs (default 60s) to check
 * remaining session time. Shows warning when remainingMs < warnThresholdMs
 * (default 5 min). Heartbeat is throttled to heartbeatMinGapMs (default 60s).
 *
 * Activity detection:
 *   - Window pointerdown / keydown events trigger throttled heartbeat
 *   - opts.active prop also triggers heartbeat
 *   - keepAlive() manually sends heartbeat + re-polls
 *
 * Returns: { remainingMs, showWarning, keepAlive }
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseSessionStatusOpts {
  /** Poll interval (ms). Default 60_000. */
  pollIntervalMs?: number;
  /** Show warning when remainingMs < this threshold (ms). Default 5*60_000 (5 min). */
  warnThresholdMs?: number;
  /** Minimum gap between heartbeat sends (ms). Default 60_000. */
  heartbeatMinGapMs?: number;
  /** External activity signal: true = heartbeat immediately. */
  active?: boolean;
}

export interface SessionStatus {
  remainingMs: number | null;
  showWarning: boolean;
  keepAlive: () => void;
}

export function useSessionStatus(opts?: UseSessionStatusOpts): SessionStatus {
  const {
    pollIntervalMs = 60_000,
    warnThresholdMs = 5 * 60_000,
    heartbeatMinGapMs = 60_000,
    active = false,
  } = opts ?? {};

  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const lastHeartbeatRef = useRef(0);
  const activeRef = useRef(active);
  const pollIntervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll session status
  const pollSessionStatus = useCallback(async () => {
    try {
      const res = await fetch('/auth/session-status');
      if (!res.ok) {
        if (res.status === 401) {
          location.replace('/auth/login');
        }
        return;
      }
      const data = (await res.json()) as { remainingMs?: number };
      if (data.remainingMs !== undefined) {
        setRemainingMs(data.remainingMs);
        setShowWarning(data.remainingMs < warnThresholdMs);
      }
    } catch {
      // Network error — ignore, let poll retry next interval
    }
  }, [warnThresholdMs]);

  // Heartbeat (POST /auth/heartbeat)
  const sendHeartbeat = useCallback(async () => {
    try {
      const res = await fetch('/auth/heartbeat', { method: 'POST' });
      if (!res.ok && res.status === 401) {
        location.replace('/auth/login');
        return;
      }
      // After heartbeat, re-poll to get fresh remainingMs
      await pollSessionStatus();
    } catch {
      // Network error — ignore
    }
  }, [pollSessionStatus]);

  // Throttled heartbeat
  const throttledHeartbeat = useCallback(() => {
    const now = Date.now();
    if (now - lastHeartbeatRef.current >= heartbeatMinGapMs) {
      lastHeartbeatRef.current = now;
      sendHeartbeat();
    }
  }, [heartbeatMinGapMs, sendHeartbeat]);

  // keepAlive: send heartbeat immediately (ignore throttle) + re-poll
  const keepAlive = useCallback(async () => {
    lastHeartbeatRef.current = Date.now();
    await sendHeartbeat();
  }, [sendHeartbeat]);

  // DOM activity listeners
  useEffect(() => {
    const handleActivity = () => {
      throttledHeartbeat();
    };

    const options = { passive: true };
    window.addEventListener('pointerdown', handleActivity, options);
    window.addEventListener('keydown', handleActivity, options);

    return () => {
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [throttledHeartbeat]);

  // External activity signal
  useEffect(() => {
    activeRef.current = active;
    if (active) {
      throttledHeartbeat();
    }
  }, [active, throttledHeartbeat]);

  // Sustained activity (e.g. a gamepad stick held for many minutes) never
  // flips `active`, so the transition effect above would send a single
  // heartbeat and then starve the session. Re-check on an interval.
  useEffect(() => {
    const id = setInterval(() => {
      if (activeRef.current) {
        throttledHeartbeat();
      }
    }, heartbeatMinGapMs);
    return () => clearInterval(id);
  }, [heartbeatMinGapMs, throttledHeartbeat]);

  // Poll on mount and set interval
  useEffect(() => {
    pollSessionStatus();
    pollIntervalIdRef.current = setInterval(pollSessionStatus, pollIntervalMs);

    return () => {
      if (pollIntervalIdRef.current) {
        clearInterval(pollIntervalIdRef.current);
      }
    };
  }, [pollIntervalMs, pollSessionStatus]);

  return {
    remainingMs,
    showWarning,
    keepAlive,
  };
}
