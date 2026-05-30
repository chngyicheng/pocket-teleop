import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './index.css';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app root element');
createRoot(container).render(<React.StrictMode><App /></React.StrictMode>);
