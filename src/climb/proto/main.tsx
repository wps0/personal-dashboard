import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './climb.css';
import {SCREENS} from './screens';

// ?theme=light|dark and ?accent=blue pick the look; #screen picks the screen.
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') ?? 'dark';
const accent = params.get('accent');
if (accent) document.documentElement.dataset.accent = accent;

function App() {
  const [screen, setScreen] = useState(location.hash.slice(1) || 'today');
  useEffect(() => {
    const on = () => setScreen(location.hash.slice(1) || 'today');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const Screen = SCREENS[screen] ?? SCREENS.today;
  return <Screen />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
