// Lazy-loaded decoder script (own bundle, see scripts/build.mjs). Sets window.__heicDecode.
import libheif from '../../node_modules/libheif-js/libheif-wasm/libheif.js';

const base = document.currentScript.src; // only valid synchronously at load
let ready;

window.__heicDecode = async (buffer) => {
  // this libheif build only fetches its wasm synchronously, so hand it the bytes
  ready ||= fetch(new URL(__HEIC_WASM__, base)).then((r) => r.ok ? r.arrayBuffer() : Promise.reject(new Error('Could not load the HEIC decoder'))).then((wasmBinary) => libheif({ wasmBinary }));
  ready.catch(() => { ready = null; });
  const lib = await ready;
  const images = new lib.HeifDecoder().decode(new Uint8Array(buffer));
  const image = images[0]; // primary image only
  if (!image) throw new Error('No image in HEIC file');
  const width = image.get_width(), height = image.get_height();
  const out = await new Promise((resolve, reject) =>
    image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (d) => d ? resolve(d) : reject(new Error('HEIC decode failed'))));
  return { width, height, data: out.data };
};
