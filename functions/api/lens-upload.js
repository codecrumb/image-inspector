const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost({ request }) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) {
    return new Response('Missing file', { status: 400, headers: CORS_HEADERS });
  }

  const upstream = new FormData();
  upstream.append('file', file);
  const res = await fetch('https://0x0.st', { method: 'POST', body: upstream });

  if (!res.ok) {
    return new Response('Upstream upload failed', { status: 502, headers: CORS_HEADERS });
  }

  const url = await res.text();
  return new Response(url.trim(), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
  });
}
