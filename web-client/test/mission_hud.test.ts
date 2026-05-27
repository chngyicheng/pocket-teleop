// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mountVelBars,
  mountMiniMap,
  mountCompass,
  mountReadout,
} from '../src/mission_hud';

describe('mountVelBars', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders three rows lx/ly/az', () => {
    const api = mountVelBars(container);
    api.update({ lx: 0.5, ly: -0.3, az: 0 });

    const rows = container.querySelectorAll('.vel-bar-row');
    expect(rows.length).toBe(3);

    const labels = Array.from(rows).map(r => r.querySelector('.vel-bar-label')?.textContent);
    expect(labels).toEqual(['lx', 'ly', 'az']);
  });

  it('update sets bar width proportional to value', () => {
    const api = mountVelBars(container);
    api.update({ lx: 0.8, ly: 0, az: 0 });

    const fillBars = container.querySelectorAll('.vel-bar-fill');
    const lxFill = fillBars[0] as HTMLElement;
    const width = lxFill.style.width;
    expect(width).toBe('40%');
  });

  it('value -0.5 puts fill on left half', () => {
    const api = mountVelBars(container);
    api.update({ lx: -0.5, ly: 0, az: 0 });

    const fillBars = container.querySelectorAll('.vel-bar-fill');
    const lxFill = fillBars[0] as HTMLElement;
    expect(lxFill.style.left).toBe('25%');
    expect(lxFill.style.width).toBe('25%');
  });

  it('destroy removes children from el', () => {
    const api = mountVelBars(container);
    api.update({ lx: 0, ly: 0, az: 0 });
    expect(container.children.length).toBeGreaterThan(0);

    api.destroy();
    expect(container.children.length).toBe(0);
  });
});

describe('mountMiniMap', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates svg with arrow at center', () => {
    const api = mountMiniMap(container, { size: 100 });
    api.update({ pos: { x: 0, y: 0 }, heading: 0 });

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    const polygon = svg?.querySelector('polygon');
    expect(polygon).toBeTruthy();
  });

  it('update appends point to trail polyline', () => {
    const api = mountMiniMap(container, { size: 100 });
    api.update({ pos: { x: 0, y: 0 }, heading: 0 });

    let polylines = container.querySelectorAll('polyline');
    const initialCount = polylines.length;

    api.update({ pos: { x: 1, y: 1 }, heading: 0 });
    polylines = container.querySelectorAll('polyline');

    const points = polylines[0]?.getAttribute('points')?.split(' ') || [];
    expect(points.length).toBeGreaterThanOrEqual(2);
  });

  it('trail caps at 80 points', () => {
    const api = mountMiniMap(container, { size: 100 });

    for (let i = 0; i < 100; i++) {
      api.update({ pos: { x: i, y: i }, heading: 0 });
    }

    const polylines = container.querySelectorAll('polyline');
    const points = polylines[0]?.getAttribute('points')?.split(' ') || [];
    expect(points.length).toBeLessThanOrEqual(80);
  });
});

describe('mountCompass', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('update rotates needle and updates label to 3-digit padded', () => {
    const api = mountCompass(container);
    api.update({ heading: 0 });

    const label = container.querySelector('.compass-label');
    expect(label?.textContent).toBe('000°');

    api.update({ heading: Math.PI / 2 });
    expect(label?.textContent).toBe('090°');
  });
});

describe('mountReadout', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders label and value spans', () => {
    const api = mountReadout(container, { label: 'Latency' });
    api.update('42 ms');

    const label = container.querySelector('.readout-label');
    const value = container.querySelector('.readout-value');

    expect(label?.textContent).toBe('Latency');
    expect(value?.textContent).toBe('42 ms');
  });

  it('update swaps value text', () => {
    const api = mountReadout(container, { label: 'Latency' });
    api.update('100 ms');

    let value = container.querySelector('.readout-value');
    expect(value?.textContent).toBe('100 ms');

    api.update('50 ms');
    value = container.querySelector('.readout-value');
    expect(value?.textContent).toBe('50 ms');
  });
});
