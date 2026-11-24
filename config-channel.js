export function isAllowedOrigin(origin, ownOrigin) {
  // An opaque origin ('null': sandboxed frames, file: pages) names no one in particular.
  if (origin === 'null') return false;
  if (origin === ownOrigin) return true;
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (url.origin !== origin) return false;
  if (url.protocol === 'https:') return url.hostname === 'brainlife.io' || url.hostname.endsWith('.brainlife.io');
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port !== '';
}

function readConfig(win) {
  try {
    if (win.parent && win.parent.config) return win.parent.config;
  } catch { /* cross-origin parent */ }
  return win.config || null;
}

export function receiveConfig(win, { timeoutMs = 10000 } = {}) {
  const present = readConfig(win);
  if (present) return Promise.resolve(present);
  if (win.parent === win) return Promise.resolve(null);
  return new Promise(resolve => {
    let timer;
    const ownOrigin = win.location?.origin;
    const finish = value => {
      clearTimeout(timer);
      win.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = event => {
      if (event.source !== win.parent) return;
      if (!isAllowedOrigin(event.origin, ownOrigin)) return;
      if (event.data?.type !== 'niivue-config' || !event.data.config) return;
      finish(event.data.config);
    };
    win.addEventListener('message', onMessage);
    timer = setTimeout(() => finish(null), timeoutMs);
    try { win.parent.postMessage({ type: 'niivue-ready' }, '*'); } catch { /* no parent */ }
  });
}
