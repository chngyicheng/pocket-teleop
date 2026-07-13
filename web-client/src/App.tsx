/**
 * App.tsx — React root component for Mission Control UI
 *
 * Layout detection:
 *   - tablet: window.matchMedia('(min-width: 700px)').matches
 *   - phone landscape: (orientation: landscape).matches
 *   - phone portrait: everything else
 *
 * Wires useTeleopBridge and useWhepStream, conditionally renders MissionTablet
 * (tablet layout) or MissionControl (phone layout) with SettingsDrawer overlay.
 */

import React, { useState, useEffect } from 'react';
import { useTeleopBridge, type TeleopClientFactory } from './hooks/useTeleopBridge.js';
import { useWhepStream, type WhepClientFactory } from './hooks/useWhepStream.js';
import { useSessionStatus } from './hooks/useSessionStatus.js';
import { MissionControl, type MissionLayout } from './views/MissionControl.js';
import { MissionTablet } from './views/MissionTablet.js';
import SettingsDrawer from './components/SettingsDrawer.js';
import SessionBanner from './components/SessionBanner.js';

export interface AppProps {
  // Optional factories for test injection. Production uses real classes.
  TeleopClientCtor?: TeleopClientFactory;
  WhepClientCtor?: WhepClientFactory;
}

export const App: React.FC<AppProps> = ({ TeleopClientCtor, WhepClientCtor }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [layout, setLayout] = useState<'tablet' | 'phone-landscape' | 'phone-portrait'>('phone-portrait');

  // Layout detection hook: tablet ≥ 900px, phone landscape/portrait from orientation
  useEffect(() => {
    const updateLayout = () => {
      const isTablet = window.matchMedia('(min-width: 700px)').matches;
      if (isTablet) {
        setLayout('tablet');
      } else {
        const isLandscape = window.matchMedia('(orientation: landscape)').matches;
        setLayout(isLandscape ? 'phone-landscape' : 'phone-portrait');
      }
    };

    updateLayout();

    // Listen to matchMedia changes
    const tabletMQ = window.matchMedia('(min-width: 700px)');
    const orientationMQ = window.matchMedia('(orientation: landscape)');

    const handleChange = () => updateLayout();

    // addEventListener for both media queries
    tabletMQ.addEventListener('change', handleChange);
    orientationMQ.addEventListener('change', handleChange);

    return () => {
      tabletMQ.removeEventListener('change', handleChange);
      orientationMQ.removeEventListener('change', handleChange);
    };
  }, []);

  // Bridge and stream initialization
  const bridge = useTeleopBridge({
    url: `ws://${location.host}/teleop`,
    TeleopClientCtor,
  });

  const stream = useWhepStream({
    url: `http://${location.host}/video/teleop/whep`,
    WhepClientCtor,
  });

  // Session status hook — heartbeat on user activity
  const session = useSessionStatus({
    active: bridge.inputSource !== 'idle',
  });

  // Burger toggles the drawer (tap again to close).
  const toggleDrawer = () => setDrawerOpen((o) => !o);

  // Top bar heights: MissionTablet 44px, phone-landscape 44px, phone-portrait 36px.
  // Drawer starts below the bar so the burger / E-STOP stay tappable above it.
  const headerHeight = layout === 'phone-portrait' ? 36 : 44;

  return (
    <>
      {layout === 'tablet' ? (
        <MissionTablet
          bridge={bridge}
          stream={stream}
          onMenu={toggleDrawer}
          controlsDisabled={drawerOpen}
        />
      ) : (
        <MissionControl
          bridge={bridge}
          stream={stream}
          onMenu={toggleDrawer}
          layout={layout}
          controlsDisabled={drawerOpen}
        />
      )}
      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        topOffset={headerHeight}
        disconnectAction={bridge.disconnectAction}
        wsState={bridge.connectionState}
        videoState={stream.state}
        telemetryAges={bridge.telemetryAges}
      />
      <SessionBanner
        remainingMs={session.remainingMs}
        show={session.showWarning}
        onKeepAlive={session.keepAlive}
      />
    </>
  );
};
