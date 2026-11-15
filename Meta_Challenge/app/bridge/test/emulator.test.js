import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../server.js';

test('GET /emulator serves the emulator page with a camera-friendly, same-origin CSP', async () => {
  const bridge = await start({ port: 0, token: 'secret', provider: 'mock', heartbeatMs: 60000 });
  try {
    const res = await fetch(`http://localhost:${bridge.port}/emulator`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /frame-src 'self'/);
    assert.doesNotMatch(csp, /frame-src[^;]*\*/);
    assert.match(res.headers.get('permissions-policy'), /camera=\(self\)/);
    const html = await res.text();
    assert.match(html, /id="hud"/);
    assert.doesNotMatch(html, /secret/, 'the token never appears in the page');
  } finally {
    await bridge.close();
  }
});

test('the emulator page opens on a WonderWhy start screen with the privacy notice and gates uploads on consent', async () => {
  const bridge = await start({ port: 0, provider: 'mock', heartbeatMs: 60000 });
  try {
    const html = await (await fetch(`http://localhost:${bridge.port}/emulator`)).text();
    assert.match(html, /<title>WonderWhy<\/title>/);
    assert.match(html, /<h1 id="startTitle">WonderWhy<\/h1>/);
    assert.match(html, /Google Gemini/);
    assert.match(html, /do not store/i);
    assert.match(html, /do not point at people/i);
    assert.match(html, /<button id="go"[^>]*>Start camera<\/button>/);
    assert.match(html, /if \(!consented \|\| busy/, 'photo() refuses to upload before consent');
    assert.doesNotMatch(html, /Physics Lens/);
  } finally {
    await bridge.close();
  }
});
