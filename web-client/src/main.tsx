import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { reportPerf } from './perf_beacon.js';
import './index.css';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app root element');
createRoot(container).render(<React.StrictMode><App /></React.StrictMode>);

// After the first paint commits (double rAF), report UI-ready timing to /perf.
requestAnimationFrame(() => requestAnimationFrame(() => reportPerf()));
