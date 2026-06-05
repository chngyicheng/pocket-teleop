import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollapsibleRail from '../src/components/CollapsibleRail.js';

describe('CollapsibleRail', () => {
  it('renders title, children, and tab button', () => {
    const { container } = render(
      <CollapsibleRail
        side="left"
        open={true}
        onToggle={() => {}}
        title="Stream"
      >
        <div>Stream content here</div>
      </CollapsibleRail>
    );

    // Title should be in the DOM
    expect(screen.getByText('Stream')).toBeTruthy();

    // Children should be in the DOM
    expect(screen.getByText('Stream content here')).toBeTruthy();

    // Tab button should exist by testid
    const tabButton = container.querySelector('[data-testid="rail-tab-left"]');
    expect(tabButton).toBeTruthy();
  });

  it('calls onToggle when tab button is clicked', async () => {
    const onToggle = vi.fn();
    const { container } = render(
      <CollapsibleRail
        side="left"
        open={true}
        onToggle={onToggle}
        title="Stream"
      >
        <div>Content</div>
      </CollapsibleRail>
    );

    const tabButton = container.querySelector('[data-testid="rail-tab-left"]');
    await userEvent.click(tabButton as HTMLElement);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('sets aria-expanded to true when open=true', () => {
    const { container } = render(
      <CollapsibleRail
        side="left"
        open={true}
        onToggle={() => {}}
        title="Stream"
      >
        <div>Content</div>
      </CollapsibleRail>
    );

    const tabButton = container.querySelector('[data-testid="rail-tab-left"]');
    expect((tabButton as HTMLElement)?.getAttribute('aria-expanded')).toBe('true');
  });

  it('sets aria-expanded to false when open=false', () => {
    const { container } = render(
      <CollapsibleRail
        side="left"
        open={false}
        onToggle={() => {}}
        title="Stream"
      >
        <div>Content</div>
      </CollapsibleRail>
    );

    const tabButton = container.querySelector('[data-testid="rail-tab-left"]');
    expect((tabButton as HTMLElement)?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows left chevron (◀) when side=left and open=true', () => {
    const { container } = render(
      <CollapsibleRail
        side="left"
        open={true}
        onToggle={() => {}}
        title="Stream"
      >
        <div>Content</div>
      </CollapsibleRail>
    );

    const tabButton = container.querySelector('[data-testid="rail-tab-left"]');
    expect(tabButton?.textContent).toContain('◀');
  });

  it('shows right chevron (▶) when side=left and open=false', () => {
    const { container } = render(
      <CollapsibleRail
        side="left"
        open={false}
        onToggle={() => {}}
        title="Stream"
      >
        <div>Content</div>
      </CollapsibleRail>
    );

    const tabButton = container.querySelector('[data-testid="rail-tab-left"]');
    expect(tabButton?.textContent).toContain('▶');
  });

  it('shows right chevron (▶) when side=right and open=true', () => {
    const { container } = render(
      <CollapsibleRail
        side="right"
        open={true}
        onToggle={() => {}}
        title="Map"
      >
        <div>Content</div>
      </CollapsibleRail>
    );

    const tabButton = container.querySelector('[data-testid="rail-tab-right"]');
    expect(tabButton?.textContent).toContain('▶');
  });

  it('shows left chevron (◀) when side=right and open=false', () => {
    const { container } = render(
      <CollapsibleRail
        side="right"
        open={false}
        onToggle={() => {}}
        title="Map"
      >
        <div>Content</div>
      </CollapsibleRail>
    );

    const tabButton = container.querySelector('[data-testid="rail-tab-right"]');
    expect(tabButton?.textContent).toContain('◀');
  });
});
