import { useSyncExternalStore } from 'react';

// Live theme switching.

const KEY = 'face-attendance.theme';
const DEFAULT_THEME = 'matrix';

// swatch values are only used to paint the little theme dots.
export const THEMES = [
  { id: 'matrix', label: 'Matrix', accent: '#00ff46', bg: '#021406' },
  { id: 'cyan', label: 'Cyan', accent: '#22d3ee', bg: '#030c16' },
  { id: 'amber', label: 'Amber', accent: '#ffb000', bg: '#120b02' },
  { id: 'violet', label: 'Violet', accent: '#a78bfa', bg: '#0c081a' },
  { id: 'light', label: 'Light', accent: '#00703c', bg: '#f1f7f3' },
];

const isValid = (id) => THEMES.some((theme) => theme.id === id);

function read() {
  try {
    const saved = window.localStorage.getItem(KEY);
    return isValid(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

const listeners = new Set();
let current = typeof window === 'undefined' ? DEFAULT_THEME : read();
let fadeTimer = 0;

const reducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function paint(id) {
  document.documentElement.setAttribute('data-theme', id);
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function getTheme() {
  return current;
}

// Switches theme with a short cross-fade, and remembers the choice.
export function setTheme(id) {
  if (!isValid(id) || id === current) return;
  current = id;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // storage unavailable (private mode): the theme still applies for this visit
  }

  const root = document.documentElement;
  if (reducedMotion()) {
    paint(id);
    emit();
    return;
  }

  if (typeof document.startViewTransition === 'function') {
    // Browser cross-fades a snapshot of the old page into the new one.
    root.classList.add('theme-vt');
    const transition = document.startViewTransition(() => {
      paint(id);
      emit();
    });
    const done = () => root.classList.remove('theme-vt');
    transition.finished.then(done, done);
    return;
  }

  // Fallback: briefly transition colours on every element.
  root.classList.add('theme-fade');
  paint(id);
  emit();
  window.clearTimeout(fadeTimer);
  fadeTimer = window.setTimeout(() => root.classList.remove('theme-fade'), 520);
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);
  return { theme, setTheme, themes: THEMES };
}

// Apply the saved theme as soon as this module loads, before the first render.
if (typeof document !== 'undefined') paint(current);
