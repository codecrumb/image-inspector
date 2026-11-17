// Fetches the HEIC decoder on first use. __HEIC_JS__ is injected at build time (null in the standalone page).
let pending;

export function loadHeicDecoder() {
  if (__HEIC_JS__ === null) return Promise.reject(new Error('HEIC needs the hosted version'));
  pending ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = __HEIC_JS__;
    s.onload = () => {
      if (typeof window.__heicDecode === 'function') resolve(window.__heicDecode);
      else { pending = null; reject(new Error('Could not load the HEIC decoder')); }
    };
    s.onerror = () => { s.remove(); reject(new Error('Could not load the HEIC decoder')); };
    document.head.appendChild(s);
  }).catch((e) => { pending = null; throw e; });
  return pending;
}
