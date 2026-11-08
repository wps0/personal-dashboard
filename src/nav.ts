/**
 * @fileoverview The app's pages, in the order the navigation lists them, and
 * how a phone moves between them.
 */
import {
  BriefcaseBusiness,
  CalendarDays,
  FolderKanban,
  House,
  NotebookPen,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import {create} from 'zustand';
import type {Route} from './router';

export interface Page {
  route: Route;
  label: string;
  icon: LucideIcon;
}

/** Keys 1–6 open them in this order. */
export const PAGES: readonly Page[] = [
  {route: {name: 'home'}, label: 'Home', icon: House},
  {route: {name: 'week'}, label: 'Week', icon: NotebookPen},
  {route: {name: 'projects'}, label: 'Projects', icon: FolderKanban},
  {route: {name: 'calendar'}, label: 'Calendar', icon: CalendarDays},
  {route: {name: 'work'}, label: 'Work', icon: BriefcaseBusiness},
  {route: {name: 'settings'}, label: 'Settings', icon: Settings},
];

/**
 * How a phone (below 640px) moves between pages: tabs along the bottom, or a
 * menu button (☰) that opens a drawer listing them.
 */
export type PhoneNav = 'tabs' | 'menu';

/** Per device, like the theme: in localStorage, not in the synced data. */
const KEY = 'personal-dashboard/phone-nav';

function readPhoneNav(): PhoneNav {
  try {
    return localStorage.getItem(KEY) === 'menu' ? 'menu' : 'tabs';
  } catch {
    return 'tabs';
  }
}

export const usePhoneNav = create<{
  nav: PhoneNav;
  setNav(nav: PhoneNav): void;
}>(set => ({
  nav: readPhoneNav(),
  setNav: nav => {
    try {
      if (nav === 'tabs') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, nav);
    } catch {
      // Storage blocked: the choice just won't outlive the tab.
    }
    set({nav});
  },
}));
