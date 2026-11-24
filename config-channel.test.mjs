import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, receiveConfig } from './config-channel.js';

function fakeWin({ parent, config } = {}) {
  const listeners = new Set();
  const win = {
    config,
    addEventListener: (t, f) => { if (t === 'message') listeners.add(f); },
    removeEventListener: (t, f) => { if (t === 'message') listeners.delete(f); },
    dispatch: (event) => { for (const f of [...listeners]) f(event); },
    listenerCount: () => listeners.size,
  };
  win.parent = parent === undefined ? win : parent;
  return win;
}
function fakeParent() {
  const posted = [];
  return { posted, postMessage: (msg, target) => posted.push({ msg, target }) };
}

test('same origin and brainlife hosts are allowed, others are not', () => {
  const own = 'https://brainlife.io';
  for (const o of [own, 'https://lite.brainlife.io', 'http://localhost:5173', 'http://127.0.0.1:8767'])
    assert.equal(isAllowedOrigin(o, own), true, o);
  for (const o of ['https://evil.example', 'https://brainlife.io.evil.example', 'http://brainlife.io', 'null'])
    assert.equal(isAllowedOrigin(o, own), false, o);
});

test('the own origin is allowed even when it is not a brainlife host', () => {
  assert.equal(isAllowedOrigin('https://host.example', 'https://host.example'), true);
});

test('a parent config wins without messaging', async () => {
  const parent = fakeParent();
  parent.config = { path: 'p.nii.gz' };
  const win = fakeWin({ parent, config: { path: 'own' } });
  assert.deepEqual(await receiveConfig(win), { path: 'p.nii.gz' });
  assert.equal(parent.posted.length, 0);
  assert.equal(win.listenerCount(), 0);
});

test('own window config is used when not framed', async () => {
  const win = fakeWin({ config: { path: 'own' } });
  assert.deepEqual(await receiveConfig(win), { path: 'own' });
});

test('a cross-origin parent falls back to a message from an allowed origin', async () => {
  const parent = fakeParent();
  Object.defineProperty(parent, 'config', { get() { throw new Error('SecurityError'); } });
  const win = fakeWin({ parent });
  const p = receiveConfig(win, { timeoutMs: 1000 });
  assert.deepEqual(parent.posted.map(x => x.msg), [{ type: 'niivue-ready' }]);
  win.dispatch({ origin: 'https://evil.example', data: { type: 'niivue-config', config: { path: 'evil' } } });
  win.dispatch({ origin: 'https://lite.brainlife.io', data: { type: 'other', config: { path: 'x' } } });
  win.dispatch({ origin: 'https://lite.brainlife.io', data: { type: 'niivue-config', config: { path: 'good' } } });
  assert.deepEqual(await p, { path: 'good' });
  assert.equal(win.listenerCount(), 0);
});

test('no config resolves null after the timeout', async () => {
  const parent = fakeParent();
  const win = fakeWin({ parent });
  assert.equal(await receiveConfig(win, { timeoutMs: 20 }), null);
  assert.equal(win.listenerCount(), 0);
});
