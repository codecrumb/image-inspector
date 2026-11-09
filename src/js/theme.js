import { drawHistogram } from './visual.js';

// ── Theme toggle ──────────────────────────────────────────────────────────
export const toggle = document.getElementById('themeToggle');
const iconSun = document.getElementById('iconSun');
const iconMoon = document.getElementById('iconMoon');

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  iconSun.classList.toggle('hidden', !isDark);
  iconMoon.classList.toggle('hidden', isDark);
}
// localStorage can throw (e.g. a downloaded copy opened from file:// in Safari)
const readTheme = () => { try { return localStorage.getItem('theme'); } catch { return null; } };
applyTheme(readTheme() || (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
toggle.addEventListener('click', () => {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  try { localStorage.setItem('theme', next); } catch {}
  applyTheme(next);
  drawHistogram();
});
