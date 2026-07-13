/**
 * diagnostics.test.ts — computeDiagnostics tests
 *
 * Tests telemetry age thresholds, connection states, video states, row order.
 */

import { describe, it, expect } from 'vitest';
import { computeDiagnostics, type DiagRow } from '../src/diagnostics.js';

describe('computeDiagnostics', () => {
  // =========================================================================
  // Telemetry age thresholds (odom/pose/scan/map)
  // =========================================================================
  describe('telemetry age thresholds (<2s ok, <5s warn, else error, null none)', () => {
    it('odom age <2000 ms → ok', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: 1000, pose: null, scan: null, map: null, battery: null },
      });
      const odomRow = rows.find((r) => r.name === 'Odometry');
      expect(odomRow).toBeDefined();
      expect(odomRow!.level).toBe('ok');
    });

    it('odom age <5000 ms → warn', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: 3000, pose: null, scan: null, map: null, battery: null },
      });
      const odomRow = rows.find((r) => r.name === 'Odometry');
      expect(odomRow!.level).toBe('warn');
    });

    it('odom age ≥5000 ms → error', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: 6000, pose: null, scan: null, map: null, battery: null },
      });
      const odomRow = rows.find((r) => r.name === 'Odometry');
      expect(odomRow!.level).toBe('error');
    });

    it('odom age null → none', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: null, pose: null, scan: null, map: null, battery: null },
      });
      const odomRow = rows.find((r) => r.name === 'Odometry');
      expect(odomRow!.level).toBe('none');
      expect(odomRow!.detail).toContain('no data');
    });
  });

  // =========================================================================
  // Battery separate thresholds (<3000 ms ok, <10000 ms warn, else error)
  // =========================================================================
  describe('battery age thresholds (<3s ok, <10s warn, else error)', () => {
    it('battery age <3000 ms → ok', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: null, pose: null, scan: null, map: null, battery: 2000 },
      });
      const batteryRow = rows.find((r) => r.name === 'Battery');
      expect(batteryRow!.level).toBe('ok');
    });

    it('battery age <10000 ms → warn', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: null, pose: null, scan: null, map: null, battery: 5000 },
      });
      const batteryRow = rows.find((r) => r.name === 'Battery');
      expect(batteryRow!.level).toBe('warn');
    });

    it('battery age ≥10000 ms → error', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: null, pose: null, scan: null, map: null, battery: 12000 },
      });
      const batteryRow = rows.find((r) => r.name === 'Battery');
      expect(batteryRow!.level).toBe('error');
    });

    it('battery age null → none', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: null, pose: null, scan: null, map: null, battery: null },
      });
      const batteryRow = rows.find((r) => r.name === 'Battery');
      expect(batteryRow!.level).toBe('none');
    });
  });

  // =========================================================================
  // WebSocket state mapping
  // =========================================================================
  describe('WebSocket state mapping', () => {
    it('wsState "live" → ok', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: null, pose: null, scan: null, map: null, battery: null },
      });
      const wsRow = rows.find((r) => r.name === 'WebSocket');
      expect(wsRow!.level).toBe('ok');
      expect(wsRow!.detail).toContain('Connected');
    });

    it('wsState "reconnecting" → warn', () => {
      const rows = computeDiagnostics({
        wsState: 'reconnecting',
        videoState: 'live',
        ages: { odom: null, pose: null, scan: null, map: null, battery: null },
      });
      const wsRow = rows.find((r) => r.name === 'WebSocket');
      expect(wsRow!.level).toBe('warn');
    });

    it('wsState "disconnected" → error', () => {
      const rows = computeDiagnostics({
        wsState: 'disconnected',
        videoState: 'live',
        ages: { odom: null, pose: null, scan: null, map: null, battery: null },
      });
      const wsRow = rows.find((r) => r.name === 'WebSocket');
      expect(wsRow!.level).toBe('error');
    });
  });

  // =========================================================================
  // Video state mapping
  // =========================================================================
  describe('Video state mapping', () => {
    it('videoState "live" → ok', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: null, pose: null, scan: null, map: null, battery: null },
      });
      const videoRow = rows.find((r) => r.name === 'Video');
      expect(videoRow!.level).toBe('ok');
    });

    it('videoState "connecting" → warn', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'connecting',
        ages: { odom: null, pose: null, scan: null, map: null, battery: null },
      });
      const videoRow = rows.find((r) => r.name === 'Video');
      expect(videoRow!.level).toBe('warn');
    });

    it('videoState "retrying" → warn', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'retrying',
        ages: { odom: null, pose: null, scan: null, map: null, battery: null },
      });
      const videoRow = rows.find((r) => r.name === 'Video');
      expect(videoRow!.level).toBe('warn');
    });

    it('videoState "error" → error', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'error',
        ages: { odom: null, pose: null, scan: null, map: null, battery: null },
      });
      const videoRow = rows.find((r) => r.name === 'Video');
      expect(videoRow!.level).toBe('error');
      expect(videoRow!.detail).toContain('error');
    });
  });

  // =========================================================================
  // Row order and count
  // =========================================================================
  describe('row order: WS, Video, Odom, Pose, Scan, Map, Battery', () => {
    it('returns 7 rows in correct order', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: 1000, pose: 1000, scan: 1000, map: 1000, battery: 1000 },
      });
      expect(rows.length).toBe(7);
      expect(rows[0].name).toBe('WebSocket');
      expect(rows[1].name).toBe('Video');
      expect(rows[2].name).toBe('Odometry');
      expect(rows[3].name).toBe('Pose');
      expect(rows[4].name).toBe('Scan');
      expect(rows[5].name).toBe('Map');
      expect(rows[6].name).toBe('Battery');
    });
  });

  // =========================================================================
  // Detail text formatting (age in seconds, one decimal place)
  // =========================================================================
  describe('detail text formatting', () => {
    it('formats age as "X.X s ago" (one decimal place)', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: 1234, pose: null, scan: null, map: null, battery: null },
      });
      const odomRow = rows.find((r) => r.name === 'Odometry');
      expect(odomRow!.detail).toMatch(/\d+\.\d+\s*s\s*ago/);
      // 1234 ms → 1.2 s
      expect(odomRow!.detail).toContain('1.2');
    });

    it('formats 400 ms as "0.4 s ago"', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: 400, pose: null, scan: null, map: null, battery: null },
      });
      const odomRow = rows.find((r) => r.name === 'Odometry');
      expect(odomRow!.detail).toContain('0.4');
    });

    it('formats 5600 ms as "5.6 s ago"', () => {
      const rows = computeDiagnostics({
        wsState: 'live',
        videoState: 'live',
        ages: { odom: 5600, pose: null, scan: null, map: null, battery: null },
      });
      const odomRow = rows.find((r) => r.name === 'Odometry');
      expect(odomRow!.detail).toContain('5.6');
    });
  });

  // =========================================================================
  // Integration: multiple telemetry types with mixed states
  // =========================================================================
  it('integration: multi-telemetry with mixed ages and states', () => {
    const rows = computeDiagnostics({
      wsState: 'reconnecting',
      videoState: 'retrying',
      ages: {
        odom: 1500, // ok
        pose: 3500, // warn
        scan: 6000, // error
        map: null, // none
        battery: 2500, // ok
      },
    });

    expect(rows).toHaveLength(7);

    const wsRow = rows.find((r) => r.name === 'WebSocket');
    expect(wsRow!.level).toBe('warn');

    const videoRow = rows.find((r) => r.name === 'Video');
    expect(videoRow!.level).toBe('warn');

    const odomRow = rows.find((r) => r.name === 'Odometry');
    expect(odomRow!.level).toBe('ok');

    const poseRow = rows.find((r) => r.name === 'Pose');
    expect(poseRow!.level).toBe('warn');

    const scanRow = rows.find((r) => r.name === 'Scan');
    expect(scanRow!.level).toBe('error');

    const mapRow = rows.find((r) => r.name === 'Map');
    expect(mapRow!.level).toBe('none');

    const batteryRow = rows.find((r) => r.name === 'Battery');
    expect(batteryRow!.level).toBe('ok');
  });
});
