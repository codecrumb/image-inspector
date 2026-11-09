import { queueFiles } from './queue.js';


document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  // Prefer a pasted file
  for (const item of items) {
    if (item.kind === 'file' && (item.type.startsWith('image/') || item.type.startsWith('video/'))) {
      queueFiles([item.getAsFile()]); return;
    }
  }

  // Fall back: plain-text URL
  for (const item of items) {
    if (item.kind === 'string' && item.type === 'text/plain') {
      item.getAsString((text) => {
        let url = text.trim();
        if (!/^https?:\/\/.+/i.test(url)) return;

        const imgurExt = (mime) => ({ 'video/mp4': 'mp4', 'video/webm': 'webm', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[mime] || 'jpeg');
        const imgurHeaders = { 'Authorization': 'Client-ID d297fd441566f99' };
        const fetchImgur = (id, mime) => { const ext = imgurExt(mime); return fetch(`https://i.imgur.com/${id}.${ext}`).then(r => r.blob()).then(blob => queueFiles([new File([blob], `${id}.${ext}`, { type: mime || 'image/jpeg' })])); };

        // Imgur album URL (imgur.com/a/xxxxx or imgur.com/a/title-slug-xxxxx) → fetch first image via API
        const imgurAlbum = url.match(/^https?:\/\/imgur\.com\/(?:a|gallery)\/([\w-]+)/);
        if (imgurAlbum) {
          const albumId = imgurAlbum[1].split('-').pop();
          fetch(`https://api.imgur.com/3/album/${albumId}/images`, { headers: imgurHeaders })
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(json => { const img = json.data?.[0]; if (img) fetchImgur(img.id, img.type); })
            .catch(() => {});
          return;
        }

        // Bare imgur image URL (imgur.com/AbCdEfG) → look up type via API then fetch
        const imgurDirect = url.match(/^https?:\/\/imgur\.com\/([a-zA-Z0-9]+)$/);
        if (imgurDirect) {
          fetch(`https://api.imgur.com/3/image/${imgurDirect[1]}`, { headers: imgurHeaders })
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(json => fetchImgur(json.data.id, json.data.type))
            .catch(() => fetchImgur(imgurDirect[1], 'image/jpeg')); // fall back to jpeg if API fails
          return;
        }

        // Unwrap reddit.com/media?url=<encoded> wrapper
        const redditMedia = url.match(/^https?:\/\/(?:www\.)?reddit\.com\/media\?url=(.+)/i);
        if (redditMedia) url = decodeURIComponent(redditMedia[1]);

        const fetchAndAnalyze = (fetchUrl) => {
          return fetch(fetchUrl)
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const ct = res.headers.get('content-type') || '';
              if (!ct.startsWith('image/') && !ct.startsWith('video/')) throw new Error('Not an image or video URL');
              return res.blob().then((blob) => {
                const ext = url.split('?')[0].split('.').pop().toLowerCase();
                const mime = ct.split(';')[0].trim();
                const name = url.split('/').pop().split('?')[0] || `pasted.${ext}`;
                queueFiles([new File([blob], name, { type: mime })], url);
              });
            });
        };
        fetchAndAnalyze(url)
          .catch(() => fetchAndAnalyze('https://corsproxy.io/?' + encodeURIComponent(url)))
          .catch(() => fetchAndAnalyze('https://images.weserv.nl/?url=' + encodeURIComponent(url)))
          .catch(() => {});
      });
      return;
    }
  }
});

// ── Paste button ──────────────────────────────────────────────────────────
document.getElementById('pasteBtn').addEventListener('click', async () => {
  if (!navigator.clipboard?.read) {
    alert('Clipboard access is not supported in this browser. Try pasting with Ctrl+V / Cmd+V instead.');
    return;
  }
  let items;
  try {
    items = await navigator.clipboard.read();
  } catch {
    alert('Clipboard permission denied. Try pasting with Ctrl+V / Cmd+V instead.');
    return;
  }
  for (const item of items) {
    const mediaType = item.types.find(t => t.startsWith('image/') || t.startsWith('video/'));
    if (mediaType) {
      const blob = await item.getType(mediaType);
      const ext = mediaType.split('/')[1] || 'png';
      queueFiles([new File([blob], `pasted.${ext}`, { type: mediaType })]);
      return;
    }
  }
  // No image found — check for a text/plain URL
  for (const item of items) {
    if (item.types.includes('text/plain')) {
      const blob = await item.getType('text/plain');
      const text = await blob.text();
      const url = text.trim();
      if (/^https?:\/\/.+/i.test(url)) {
        // Synthesize a ClipboardEvent-style paste and re-dispatch as text paste
        const dt = new DataTransfer();
        dt.items.add(url, 'text/plain');
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
        return;
      }
    }
  }
  alert('No image or image URL found in clipboard.');
});
