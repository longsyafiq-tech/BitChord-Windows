import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isAppUrl, isHttps, isAuthUrl, matchesRule, ruleHeaders, validateRequest, assetPath } from '../src/policy.mjs';

test('only the packaged app origin is trusted', () => {
  assert.ok(isAppUrl('bitchord://app/settings'));
  for (const u of ['https://app', 'bitchord://app.evil.test/', 'bitchord://user@app/', 'bitchord://app:123/', 'file:///c:/test']) assert.equal(isAppUrl(u), false);
});
test('external links and sign-in windows reject unsafe protocols and misleading hosts', () => {
  assert.ok(isAuthUrl('https://accounts.google.com/ServiceLogin'));
  assert.ok(isAuthUrl('https://accounts.spotify.com/login'));
  for (const u of ['javascript:alert(1)', 'file:///C:/Windows/notepad.exe', 'http://accounts.google.com/', 'https://accounts.google.com.evil.test/', 'https://user:pass@accounts.google.com/', 'https://accounts.google.com:444/']) assert.equal(isAuthUrl(u), false);
  assert.equal(isHttps('https://example.com/'), true);
});
test('header rules match complete hosts and preserve unrelated requests', () => {
  const r = { priority: 1, condition: { urlFilter: '||googlevideo.com/' }, action: { requestHeaders: [{ header: 'Origin', operation: 'set', value: 'https://www.youtube.com' }] } };
  assert.ok(matchesRule(r, 'https://rr1.googlevideo.com/videoplayback?x=1'));
  assert.equal(matchesRule(r, 'https://googlevideo.com.evil.test/videoplayback'), false);
  assert.deepEqual(ruleHeaders([r], 'https://example.com/', { origin: 'bitchord://app' }, 'requestHeaders'), { origin: 'bitchord://app' });
  assert.deepEqual(ruleHeaders([r], 'https://rr1.googlevideo.com/videoplayback', { origin: 'bitchord://app', Range: 'bytes=0-' }, 'requestHeaders'), { Origin: 'https://www.youtube.com', Range: 'bytes=0-' });
});
test('VISIONOS media keeps its upstream no-Origin rule, including mixed header casing', () => {
  const rules = [
    { priority: 1, condition: { urlFilter: '||googlevideo.com/' }, action: { requestHeaders: [{ header: 'Origin', operation: 'set', value: 'https://www.youtube.com' }] } },
    { priority: 2, condition: { urlFilter: '||googlevideo.com/*c=VISIONOS' }, action: { requestHeaders: [{ header: 'Origin', operation: 'remove' }, { header: 'Referer', operation: 'remove' }] } },
  ];
  assert.deepEqual(ruleHeaders(rules, 'https://rr1.googlevideo.com/videoplayback?c=VISIONOS&id=123', { origin: 'x', referer: 'y', Range: 'bytes=0-' }, 'requestHeaders'), { Range: 'bytes=0-' });
});
test('IPC accepts well-formed requests and rejects privileged headers, file access and oversized bodies', () => {
  const base = { channel: 'bitchord-bridge', direction: 'to-extension', protocol: 1, id: 'test', method: 'ping', params: {} };
  assert.ok(validateRequest(base));
  assert.equal(validateRequest({ ...base, direction: 'to-page' }), false);
  assert.equal(validateRequest({ ...base, params: null }), false);
  const request = { ...base, method: 'lyrics.fetch', params: { url: 'https://lrclib.net/api/get', method: 'GET' } };
  assert.ok(validateRequest(request));
  assert.equal(validateRequest({ ...request, params: { ...request.params, headers: { Cookie: 'secret' } } }), false);
  assert.equal(validateRequest({ ...request, params: { ...request.params, url: 'file:///C:/secret' } }), false);
  assert.equal(validateRequest({ ...request, params: { ...request.params, body: 'a'.repeat(2 * 1024 * 1024) } }), false);
  assert.equal(validateRequest({ ...request, params: { ...request.params, headers: { test: 'a\r\nb' } } }), false);
});
test('asset serving cannot leave the bundled player directory', () => {
  const root = path.resolve('player');
  assert.equal(assetPath(root, 'bitchord://app/assets/test.js', path), path.join(root, 'assets', 'test.js'));
  for (const u of ['bitchord://app/..%2fsecret', 'bitchord://app/%5c..%5csecret', 'bitchord://other/index.html', 'bitchord://app/%00secret', 'bitchord://app/%invalid']) assert.equal(assetPath(root, u, path), null);
});
