/**
 * SessionBanner.test.tsx — tests for session expiration warning banner
 *
 * Tests:
 * 1. show false -> not rendered
 * 2. show true -> renders with "Session expires in N min"
 * 3. Button click -> onKeepAlive called
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SessionBanner from '../src/components/SessionBanner.js';

describe('SessionBanner', () => {
  it('show false -> not rendered', () => {
    const { container } = render(
      <SessionBanner
        remainingMs={4 * 60 * 1000}
        show={false}
        onKeepAlive={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('show true -> renders with "Session expires in N min"', () => {
    const remainingMs = 4 * 60 * 1000 - 1; // ~3 min 59 sec
    const { getByText } = render(
      <SessionBanner
        remainingMs={remainingMs}
        show={true}
        onKeepAlive={vi.fn()}
      />
    );

    expect(getByText(/Session expires in 4 min/i)).toBeInTheDocument();
  });

  it('Button click -> onKeepAlive called', () => {
    const onKeepAlive = vi.fn();
    const { getByRole } = render(
      <SessionBanner
        remainingMs={4 * 60 * 1000}
        show={true}
        onKeepAlive={onKeepAlive}
      />
    );

    const button = getByRole('button', { name: /Stay logged in/i });
    fireEvent.click(button);

    expect(onKeepAlive).toHaveBeenCalledOnce();
  });
});
