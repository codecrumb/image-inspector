export const isTouch = matchMedia('(pointer: coarse)').matches;
export const EXPORT_MAX = isTouch ? 3072 : 4096; // phones run out of canvas memory above this

const ua = navigator.userAgent;
const isIPhone = /iPhone|iPod/.test(ua);
const isIPad = /iPad/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
const isMac = /Mac/.test(ua) && !isIPad;
const pasteHint = document.getElementById('pasteHint');
if (!isIPhone) {
  pasteHint.textContent = 'or paste with ' + (isMac || isIPad ? 'Cmd+V' : 'Ctrl+V');
}
