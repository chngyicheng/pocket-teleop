export type ConnectionState = 'live' | 'reconnecting' | 'disconnected';

export interface MissionHeaderOptions {
  compact: boolean;
  robotName: string;
  onMenu: () => void;
  onEStop: () => void;
}

export class MissionHeader {
  private header: HTMLElement;
  private chip: HTMLElement;
  private robotPill: HTMLElement;
  private compact: boolean;

  constructor(container: HTMLElement, opts: MissionHeaderOptions) {
    this.compact = opts.compact;

    // Create header element
    this.header = document.createElement('header');
    this.header.className = 'mission-header';

    // Create menu button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'mh-menu';
    menuBtn.textContent = '☰';
    menuBtn.addEventListener('click', opts.onMenu);

    // Create title span
    const title = document.createElement('span');
    title.className = 'mh-title';
    title.textContent = 'POCKET-TELEOP';

    // Create robot pill
    this.robotPill = document.createElement('span');
    this.robotPill.className = 'mh-robot';
    this.robotPill.textContent = `● ${opts.robotName}`;

    // Create chip (connection state indicator)
    this.chip = document.createElement('span');
    this.chip.className = 'mh-chip';
    this.setConnectionState('disconnected');

    // Create e-stop button
    const estopBtn = document.createElement('button');
    estopBtn.className = 'mh-estop';
    estopBtn.textContent = opts.compact ? '■ STOP' : '■ E-STOP';
    estopBtn.addEventListener('click', opts.onEStop);

    // Append all elements to header in order
    this.header.appendChild(menuBtn);
    this.header.appendChild(title);
    this.header.appendChild(this.robotPill);
    this.header.appendChild(this.chip);
    this.header.appendChild(estopBtn);

    // Append header to container
    container.appendChild(this.header);
  }

  setConnectionState(state: ConnectionState, retryCount?: number): void {
    // Remove previous state classes
    this.chip.classList.remove('mh-chip-live', 'mh-chip-reconnecting', 'mh-chip-disconnected');

    // Add current state class
    this.chip.classList.add(`mh-chip-${state}`);

    // Set colors and text based on state
    if (state === 'live') {
      this.chip.style.color = 'rgb(34, 197, 94)'; // #22c55e
      this.chip.style.borderColor = 'rgb(34, 197, 94)';
      this.chip.textContent = this.compact ? '● Live' : '● Connected — diff_drive';
    } else if (state === 'reconnecting') {
      this.chip.style.color = 'rgb(245, 158, 11)'; // #f59e0b
      this.chip.style.borderColor = 'rgb(245, 158, 11)';
      const retryText = retryCount !== undefined ? `(${retryCount})` : '(?)';
      this.chip.textContent = this.compact ? '⟳ Retry' : `⟳ Reconnecting… ${retryText}`;
    } else if (state === 'disconnected') {
      this.chip.style.color = 'rgb(239, 68, 68)'; // #ef4444
      this.chip.style.borderColor = 'rgb(239, 68, 68)';
      this.chip.textContent = this.compact ? '○ Down' : '○ Disconnected · 12s ago';
    }
  }

  setRobotName(name: string): void {
    this.robotPill.textContent = `● ${name}`;
  }

  destroy(): void {
    this.header.remove();
  }
}
