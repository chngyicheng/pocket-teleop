export interface VelBarsOpts {
  color?: string;
  trackColor?: string;
}

export interface VelBarsState {
  lx: number;
  ly: number;
  az: number;
}

export interface VelBarsAPI {
  update(state: VelBarsState): void;
  destroy(): void;
}

export function mountVelBars(el: HTMLElement, opts: VelBarsOpts = {}): VelBarsAPI {
  const labels = ['lx', 'ly', 'az'];
  const rows: HTMLElement[] = [];

  // Create three rows
  labels.forEach(label => {
    const row = document.createElement('div');
    row.className = 'vel-bar-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'vel-bar-label';
    labelEl.textContent = label;

    const track = document.createElement('div');
    track.className = 'vel-bar-track';

    const fill = document.createElement('div');
    fill.className = 'vel-bar-fill';

    const value = document.createElement('span');
    value.className = 'vel-bar-value';

    track.appendChild(fill);
    row.appendChild(labelEl);
    row.appendChild(track);
    row.appendChild(value);
    el.appendChild(row);
    rows.push(row);
  });

  return {
    update(state: VelBarsState) {
      const values = [state.lx, state.ly, state.az];
      const fills = Array.from(el.querySelectorAll('.vel-bar-fill')) as HTMLElement[];
      const valSpans = Array.from(el.querySelectorAll('.vel-bar-value')) as HTMLElement[];

      values.forEach((v, i) => {
        const clamped = Math.max(-1, Math.min(1, v));
        const fill = fills[i];
        const valSpan = valSpans[i];

        if (clamped >= 0) {
          fill.style.left = '50%';
          fill.style.width = `${clamped * 50}%`;
        } else {
          fill.style.left = `${(0.5 + clamped * 0.5) * 100}%`;
          fill.style.width = `${Math.abs(clamped) * 50}%`;
        }

        valSpan.textContent = clamped.toFixed(2);
      });
    },
    destroy() {
      rows.forEach(row => el.removeChild(row));
    }
  };
}

export interface MiniMapOpts {
  size: number;
  color?: string;
  bg?: string;
  border?: string;
}

export interface MiniMapState {
  pos: { x: number; y: number };
  heading: number;
}

export interface MiniMapAPI {
  update(state: MiniMapState): void;
  destroy(): void;
}

export function mountMiniMap(el: HTMLElement, opts: MiniMapOpts): MiniMapAPI {
  const size = opts.size;
  const trail: { x: number; y: number }[] = [];
  let currentPos = { x: 0, y: 0 };

  const container = document.createElement('div');
  container.className = 'mini-map';
  container.style.width = `${size}px`;
  container.style.height = `${size}px`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('class', 'mini-map-trail');

  const arrowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  arrowGroup.setAttribute('class', 'mini-map-arrow');

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '0,-10 5,10 -5,10');

  arrowGroup.appendChild(polygon);
  svg.appendChild(polyline);
  svg.appendChild(arrowGroup);
  container.appendChild(svg);
  el.appendChild(container);

  return {
    update(state: MiniMapState) {
      currentPos = { x: state.pos.x, y: state.pos.y };
      trail.push({ x: state.pos.x, y: state.pos.y });

      if (trail.length > 80) {
        trail.shift();
      }

      const points = trail
        .map(p => `${size / 2 + (p.x - currentPos.x) * 6},${size / 2 + (p.y - currentPos.y) * 6}`)
        .join(' ');
      polyline.setAttribute('points', points);

      const heading = state.heading;
      const deg = (heading * 180) / Math.PI;
      arrowGroup.setAttribute('transform', `translate(${size / 2},${size / 2}) rotate(${deg})`);
    },
    destroy() {
      el.removeChild(container);
      trail.length = 0;
    }
  };
}

export interface CompassOpts {
  size?: number;
  color?: string;
}

export interface CompassState {
  heading: number;
}

export interface CompassAPI {
  update(state: CompassState): void;
  destroy(): void;
}

export function mountCompass(el: HTMLElement, opts: CompassOpts = {}): CompassAPI {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '8px';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '50');
  svg.setAttribute('height', '50');

  const needle = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  needle.setAttribute('class', 'compass-needle');

  const needleLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  needleLine.setAttribute('x1', '25');
  needleLine.setAttribute('y1', '5');
  needleLine.setAttribute('x2', '25');
  needleLine.setAttribute('y2', '45');
  needleLine.setAttribute('stroke', 'red');
  needleLine.setAttribute('stroke-width', '2');

  needle.appendChild(needleLine);
  svg.appendChild(needle);

  const label = document.createElement('span');
  label.className = 'compass-label';
  label.textContent = '000°';

  container.appendChild(svg);
  container.appendChild(label);
  el.appendChild(container);

  return {
    update(state: CompassState) {
      const deg = ((state.heading * 180) / Math.PI) % 360;
      const normalizedDeg = (deg + 360) % 360;
      needle.setAttribute('transform', `rotate(${normalizedDeg} 25 25)`);
      label.textContent = Math.round(normalizedDeg).toString().padStart(3, '0') + '°';
    },
    destroy() {
      el.removeChild(container);
    }
  };
}

export interface ReadoutOpts {
  label: string;
  color?: string;
}

export interface ReadoutAPI {
  update(value: string): void;
  destroy(): void;
}

export function mountReadout(el: HTMLElement, opts: ReadoutOpts): ReadoutAPI {
  const container = document.createElement('div');
  container.className = 'readout';

  const labelEl = document.createElement('span');
  labelEl.className = 'readout-label';
  labelEl.textContent = opts.label;

  const valueEl = document.createElement('span');
  valueEl.className = 'readout-value';
  valueEl.textContent = '—';

  container.appendChild(labelEl);
  container.appendChild(valueEl);
  el.appendChild(container);

  return {
    update(value: string) {
      valueEl.textContent = value;
    },
    destroy() {
      el.removeChild(container);
    }
  };
}
