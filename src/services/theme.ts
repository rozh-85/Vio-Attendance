import { useEffect, useState } from 'react';

/**
 * Light, dark, or whatever the device is set to. The choice is kept per
 * browser; index.html applies it before the first paint so a dark page never
 * flashes white on load.
 */
export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'vio.theme';
const CHANGE = 'vio-theme-change';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function readThemePref(): ThemePref {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') return media().matches ? 'dark' : 'light';
  return pref;
}

/** Puts the `dark` class on <html>; every colour in the app follows it. */
export function applyTheme(pref: ThemePref = readThemePref()): void {
  document.documentElement.classList.toggle('dark', resolveTheme(pref) === 'dark');
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent(CHANGE, { detail: pref }));
}

/**
 * Called once at start-up: on "Auto", the app turns dark and light with the
 * device (e.g. at sunset), on every page, toggle or not.
 */
export function followSystemTheme(): void {
  applyTheme();
  media().addEventListener('change', () => {
    if (readThemePref() === 'system') applyTheme('system');
  });
}

/** The saved choice and what it comes to now, kept in step across the page. */
export function useTheme(): {
  pref: ThemePref;
  resolved: 'light' | 'dark';
  setPref: (pref: ThemePref) => void;
} {
  const [pref, setPrefState] = useState<ThemePref>(readThemePref);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const onChange = (e: Event) => setPrefState((e as CustomEvent<ThemePref>).detail);
    const list = media();
    const onSystem = () => setSystemDark(list.matches);
    window.addEventListener(CHANGE, onChange);
    list.addEventListener('change', onSystem);
    return () => {
      window.removeEventListener(CHANGE, onChange);
      list.removeEventListener('change', onSystem);
    };
  }, []);

  return {
    pref,
    resolved: pref === 'system' ? (systemDark ? 'dark' : 'light') : pref,
    setPref: setThemePref,
  };
}
