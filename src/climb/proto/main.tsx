import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './climb.css';
import {SCREENS} from './screens';

// ?theme=light|dark picks the look, ?scroll=N scrolls the screen down;
// #screen picks the screen.
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') ?? 'dark';
const scroll = Number(params.get('scroll') ?? 0);

function App() {
  const [screen, setScreen] = useState(location.hash.slice(1) || 'today');
  useEffect(() => {
    const on = () => setScreen(location.hash.slice(1) || 'today');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (scroll) document.querySelector('main')?.scrollTo(0, scroll);
  }, [screen]);
  const Screen = SCREENS[screen] ?? SCREENS.today;
  return <Screen />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
