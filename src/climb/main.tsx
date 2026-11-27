/**
 * @fileoverview The climbing log: a second app in this repository, on its
 * own page (climb/index.html). It shares building blocks with the dashboard
 * (styles, saving, the service worker) but none of its data.
 */

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {setUpPwa} from '../pwa';
import {App} from './app';
import './climb.css';

// The one service worker serves both apps' pages.
setUpPwa('../sw.js');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
