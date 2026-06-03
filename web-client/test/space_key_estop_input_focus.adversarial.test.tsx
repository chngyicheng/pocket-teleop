/**
 * space_key_estop_input_focus.adversarial.test.tsx — H2
 *
 * Hypothesis: Space key fires E-STOP while user is typing in SettingsDrawer
 *
 * The keydown listener is attached to window and triggers bridge.eStop() on
 * e.code === 'Space' with no event.target / instanceof HTMLInputElement guard.
 * When an input inside SettingsDrawer has focus and user presses Space,
 * it should insert the character, not fire e-stop.
 *
 * Expected: Space character inserted into input, bridge.eStop NOT called.
 * Actual (today): bridge.eStop() fires even when input has focus.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MissionControl } from '../src/views/MissionControl.js';
import type { TeleopBridge } from '../src/hooks/useTeleopBridge.js';
import type { WhepStream } from '../src/hooks/useWhepStream.js';

const stream: WhepStream = {
  stream: null,
  state: 'connecting',
  error: null,
};

function makeBridge(): TeleopBridge {
  return {
    connected: true,
    connectionState: 'live',
    retryCount: 0,
    latencyMs: 50,
    odom: { x: 0, y: 0, heading: 0 },
    robotType: 'diff',
    robotName: 'r1',
    robotNamespace: '/ns',
    eStop: vi.fn(),
    sendTwist: vi.fn(),
  };
}

describe('space_key_estop_input_focus.adversarial', () => {
  it('should NOT fire eStop when Space is pressed while input has focus', () => {
    const bridge = makeBridge();
    render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={() => {}}
        layout="phone-portrait"
      />,
    );

    const testInput = document.createElement('input');
    testInput.type = 'text';
    document.body.appendChild(testInput);
    testInput.focus();

    expect(document.activeElement).toBe(testInput);

    const spaceEvent = new KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    // Dispatch from the input so event.target is the input — proper simulation
    testInput.dispatchEvent(spaceEvent);

    // EXPECTED (today fails): eStop should NOT have been called
    expect(bridge.eStop).not.toHaveBeenCalled();

    document.body.removeChild(testInput);
  });

  it('SANITY: should fire eStop when Space is pressed with no input focus', () => {
    const bridge = makeBridge();
    render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={() => {}}
        layout="phone-portrait"
      />,
    );

    // No input focused
    const spaceEvent = new KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(spaceEvent);

    expect(bridge.eStop).toHaveBeenCalled();
  });
});
