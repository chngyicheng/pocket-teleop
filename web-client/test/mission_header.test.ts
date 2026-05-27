// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MissionHeader } from '../src/mission_header';

describe('MissionHeader', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('constructor builds header with menu, title, robot pill, chip, e-stop in order', () => {
    const opts = {
      compact: false,
      robotName: 'bot-07',
      onMenu: () => {},
      onEStop: () => {},
    };

    const header = new MissionHeader(container, opts);

    const headerEl = container.querySelector('header.mission-header') as HTMLElement;
    expect(headerEl).toBeTruthy();

    const children = Array.from(headerEl.children);
    expect(children.length).toBe(5);

    const menu = children[0] as HTMLElement;
    expect(menu.className).toContain('mh-menu');
    expect(menu.textContent).toBe('☰');

    const title = children[1] as HTMLElement;
    expect(title.className).toContain('mh-title');
    expect(title.textContent).toBe('POCKET-TELEOP');

    const robot = children[2] as HTMLElement;
    expect(robot.className).toContain('mh-robot');
    expect(robot.textContent).toContain('bot-07');

    const chip = children[3] as HTMLElement;
    expect(chip.className).toContain('mh-chip');

    const estop = children[4] as HTMLElement;
    expect(estop.className).toContain('mh-estop');
    expect(estop.textContent).toContain('STOP');
  });

  it('setConnectionState live sets chip color to #22c55e and contains "Live" in compact mode', () => {
    const opts = {
      compact: true,
      robotName: 'bot-07',
      onMenu: () => {},
      onEStop: () => {},
    };

    const header = new MissionHeader(container, opts);
    header.setConnectionState('live');

    const chip = container.querySelector('.mh-chip') as HTMLElement;
    expect(chip.style.color).toBe('rgb(34, 197, 94)'); // #22c55e
    expect(chip.style.borderColor).toBe('rgb(34, 197, 94)');
    expect(chip.textContent).toContain('Live');
  });

  it('setConnectionState reconnecting includes retryCount in non-compact text', () => {
    const opts = {
      compact: false,
      robotName: 'bot-07',
      onMenu: () => {},
      onEStop: () => {},
    };

    const header = new MissionHeader(container, opts);
    header.setConnectionState('reconnecting', 3);

    const chip = container.querySelector('.mh-chip') as HTMLElement;
    expect(chip.textContent).toContain('Reconnecting');
    expect(chip.textContent).toContain('3');
  });

  it('setConnectionState disconnected sets chip color to #ef4444', () => {
    const opts = {
      compact: false,
      robotName: 'bot-07',
      onMenu: () => {},
      onEStop: () => {},
    };

    const header = new MissionHeader(container, opts);
    header.setConnectionState('disconnected');

    const chip = container.querySelector('.mh-chip') as HTMLElement;
    expect(chip.style.color).toBe('rgb(239, 68, 68)'); // #ef4444
    expect(chip.style.borderColor).toBe('rgb(239, 68, 68)');
  });

  it('clicking the e-stop button calls onEStop', () => {
    let estopCalled = false;
    const opts = {
      compact: false,
      robotName: 'bot-07',
      onMenu: () => {},
      onEStop: () => {
        estopCalled = true;
      },
    };

    const header = new MissionHeader(container, opts);

    const estopBtn = container.querySelector('.mh-estop') as HTMLButtonElement;
    estopBtn.click();

    expect(estopCalled).toBe(true);
  });

  it('destroy removes the header element from container', () => {
    const opts = {
      compact: false,
      robotName: 'bot-07',
      onMenu: () => {},
      onEStop: () => {},
    };

    const header = new MissionHeader(container, opts);
    expect(container.querySelector('header.mission-header')).toBeTruthy();

    header.destroy();

    expect(container.querySelector('header.mission-header')).toBeFalsy();
  });
});
