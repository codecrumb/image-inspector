import { state } from './state.js';

// Temp hosts that return a direct file URL and allow cross-origin uploads.
// Tried in order; add fallbacks here. (tmpfiles.org / onlyfiles.com only return
// a UI page URL with a signed /dl/ token in HTML we can't read cross-origin.)
const TEMP_UPLOADERS = [
  async (file) => {
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('time', '1h');
    fd.append('fileToUpload', file);
    const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: fd });
    const text = (await res.text()).trim();
    if (!res.ok || !/^https:\/\//.test(text)) throw new Error(text || 'Upload failed');
    return text;
  },
  async (file) => {
    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch('https://tempfile.org/api/upload/local', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');
    // files[0].url is a UI page; appending "download" serves the raw file
    return data.files[0].url.replace(/\/?$/, '/') + 'download';
  },
];

async function uploadTempFile(file) {
  let lastErr;
  for (const upload of TEMP_UPLOADERS) {
    try { return await upload(file); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Upload failed');
}

async function openGoogleLens() {
  const btn = document.getElementById('lensBtn');
  const originalHTML = btn.innerHTML;

  // If image came from a URL, pass it directly
  if (state.currentSourceUrl) {
    window.open('https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(state.currentSourceUrl), '_blank');
    return;
  }

  // Local file: upload to a CORS-friendly temp host, then redirect to uploadbyurl
  const preview = document.getElementById('preview');
  if (!preview._prevURL) return;

  btn.disabled = true;
  btn.innerHTML = `<svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Uploading…`;

  try {
    const blob = await fetch(preview._prevURL).then(r => r.blob());
    const ext = blob.type.split('/')[1] || 'png';
    const file =new File([blob], `image.${ext}`, { type: blob.type });
    const url = await uploadTempFile(file);
    window.open('https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(url), '_blank');
  } catch (err) {
    alert('Could not upload image: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}
document.getElementById('lensBtn').addEventListener('click', openGoogleLens);
