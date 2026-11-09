// ── OPFS persistence helpers ────────────────────────────────────────────
const OPFS_DIR      = 'image-inspector-cache';
const SS_KEY        = 'ii_opfs_ids';       // sessionStorage: JSON array of cached IDs
const SS_QUEUE_KEY  = 'ii_queue_id';       // sessionStorage: cacheId of last viewed image
const MAX_FILE_SIZE = 50 * 1024 * 1024;    // 50 MB per-file cap
const MAX_CACHED    = 20;                  // max files stored per tab in OPFS
const BC_CHANNEL    = 'image-inspector-opfs';
const BC_TIMEOUT    = 300;                 // ms to wait for tab replies

async function opfsDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

async function saveToOPFS(id, file) {
  if (file.size > MAX_FILE_SIZE) return false;
  const dir = await opfsDir();
  // metadata sidecar: store name + type so we can reconstruct the File
  const metaHandle = await dir.getFileHandle(id + '.meta', { create: true });
  const metaW = await metaHandle.createWritable();
  await metaW.write(JSON.stringify({ name: file.name, type: file.type, size: file.size }));
  await metaW.close();
  // binary data
  const dataHandle = await dir.getFileHandle(id + '.data', { create: true });
  const dataW = await dataHandle.createWritable();
  await dataW.write(await file.arrayBuffer());
  await dataW.close();
  return true;
}

export async function loadFromOPFS(id) {
  try {
    const dir = await opfsDir();
    const metaHandle = await dir.getFileHandle(id + '.meta');
    const metaFile   = await metaHandle.getFile();
    const meta       = JSON.parse(await metaFile.text());
    const dataHandle = await dir.getFileHandle(id + '.data');
    const dataFile   = await dataHandle.getFile();
    const buf        = await dataFile.arrayBuffer();
    return new File([buf], meta.name, { type: meta.type });
  } catch { return null; }
}

async function removeFromOPFS(id) {
  try {
    const dir = await opfsDir();
    await dir.removeEntry(id + '.meta');
    await dir.removeEntry(id + '.data');
  } catch {}
}

async function listOPFSIds() {
  const ids = new Set();
  try {
    const dir = await opfsDir();
    for await (const name of dir.keys()) {
      if (name.endsWith('.meta')) ids.add(name.slice(0, -5));
    }
  } catch {}
  return ids;
}

// Session-scoped ID tracking
export function ssGetIds() {
  try { return JSON.parse(sessionStorage.getItem(SS_KEY) || '[]'); } catch { return []; }
}
export function ssSetIds(ids) { try { sessionStorage.setItem(SS_KEY, JSON.stringify(ids)); } catch {} }
function ssAddId(id) {
  const ids = ssGetIds();
  if (!ids.includes(id)) { ids.push(id); ssSetIds(ids); }
}
function ssRemoveId(id) {
  ssSetIds(ssGetIds().filter(x => x !== id));
}
export function ssSaveQueueId(cacheId) { try { if (cacheId) sessionStorage.setItem(SS_QUEUE_KEY, cacheId); } catch {} }
export function ssGetQueueId() { try { return sessionStorage.getItem(SS_QUEUE_KEY) || null; } catch { return null; } }

function generateCacheId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// BroadcastChannel cross-tab coordination
const opfsBroadcast = (typeof BroadcastChannel !== 'undefined')
  ? new BroadcastChannel(BC_CHANNEL) : null;

// Respond to pings from other tabs with our claimed IDs
if (opfsBroadcast) {
  opfsBroadcast.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'ping') {
      opfsBroadcast.postMessage({ type: 'pong', ids: ssGetIds() });
    }
  });
}

// Ask other tabs which IDs they're using
function collectClaimedIds() {
  return new Promise((resolve) => {
    if (!opfsBroadcast) { resolve(new Set()); return; }
    const claimed = new Set();
    const handler = (e) => {
      if (e.data && e.data.type === 'pong' && Array.isArray(e.data.ids)) {
        e.data.ids.forEach(id => claimed.add(id));
      }
    };
    opfsBroadcast.addEventListener('message', handler);
    opfsBroadcast.postMessage({ type: 'ping' });
    setTimeout(() => {
      opfsBroadcast.removeEventListener('message', handler);
      resolve(claimed);
    }, BC_TIMEOUT);
  });
}

// Evict oldest entries beyond the cap
async function enforceOPFSCap() {
  const ids = ssGetIds();
  if (ids.length <= MAX_CACHED) return;
  const evict = ids.slice(0, ids.length - MAX_CACHED);
  for (const id of evict) {
    await removeFromOPFS(id);
    ssRemoveId(id);
  }
}

// Purge OPFS entries not claimed by any open tab
export async function cleanupOPFS() {
  const claimed = await collectClaimedIds();
  // Add our own IDs to claimed set
  ssGetIds().forEach(id => claimed.add(id));
  const stored = await listOPFSIds();
  for (const id of stored) {
    if (!claimed.has(id)) await removeFromOPFS(id);
  }
}

// Save a file to OPFS and register in sessionStorage
export async function cacheFile(file) {
  if (file.size > MAX_FILE_SIZE) return null;
  const id = generateCacheId();
  const saved = await saveToOPFS(id, file);
  if (!saved) return null;
  ssAddId(id);
  await enforceOPFSCap();
  return id;
}
