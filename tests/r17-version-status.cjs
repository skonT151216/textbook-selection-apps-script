const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const zlib = require('node:zlib');
const { fixture, clone } = require('./identity-fixture.cjs');
const root = path.join(__dirname, '..');
const decode = wrapper => zlib.gunzipSync(Buffer.from(wrapper.match(/<pre id="app-bundle">([\s\S]*?)<\/pre>/)[1].replace(/\s/g, ''), 'base64')).toString();
const html = decode(fs.readFileSync(path.join(root, 'Index.html'), 'utf8'));
const previous = decode(cp.execFileSync('git', ['show', '085e798:Index.html'], { cwd: root, encoding: 'utf8', maxBuffer: 8000000 }));
for (const name of ['lL', 'LZ', 'QZ', 'MZ', 'jZ', 'DZ', 'NZ']) {
  const source = text => { const start = text.indexOf('function ' + name + '('); assert.ok(start >= 0); return text.slice(start, text.indexOf('function ', start + 9)); };
  assert.equal(source(html), source(previous), 'r17 leaves ' + name + ' official forms, PDF capture and workspace operations unchanged');
}
const env = fixture(), before = clone(env.api.testRead().data), calls = [], puts = [];
let latest = { tag_name: 'v2026.10.09.4' }, code = 200, failure = false;
env.context.UrlFetchApp = { fetch(url, options) {
  calls.push(url);
  assert.equal(url, 'https://api.github.com/repos/skonT151216/textbook-selection-apps-script/releases/latest');
  assert.equal(options.muteHttpExceptions, true);
  if (failure) throw Error('offline');
  return { getResponseCode: () => code, getContentText: () => typeof latest === 'string' ? latest : JSON.stringify(latest) };
} };
const cacheFactory = env.context.CacheService.getScriptCache;
env.context.CacheService.getScriptCache = () => { const cache = cacheFactory(); return { ...cache, put(key, value, ttl) { puts.push({ key, ttl }); cache.put(key, value); } }; };
const config = env.dispatch('/api/config');
assert.deepEqual(Object.keys(config.body).sort(), ['currentVersion', 'ready', 'schoolName']);
assert.equal(config.body.currentVersion, 'v2026.10.09.3');
assert.equal(calls.length, 0, 'public version disclosure never reads GitHub');
assert.equal(env.dispatch('/api/update-notice', 'GET', undefined, 'unknown').status, 401);
assert.equal(env.dispatch('/api/update-notice', 'POST', undefined, 'kim1').status, 403);
assert.equal(calls.length, 0, 'non-managers never cause an external release request');
let result = env.dispatch('/api/update-notice').body;
assert.equal(result.currentVersion, 'v2026.10.09.3');
assert.equal(result.latestVersion, 'v2026.10.09.4');
assert.equal(result.updateAvailable, true);
assert.equal(result.checkStatus, 'update-available');
assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
assert.equal(puts[0].ttl, 3600);
const key = 'textbook-selection-latest-release-v2';
env.dispatch('/api/update-notice'); env.dispatch('/api/update-notice', 'POST');
assert.equal(calls.length, 1, 'automatic hourly cache and manual one-minute cooldown avoid repeated external requests');
const saved = JSON.parse(env.cache.get(key)); saved.checkedAt -= 61000; env.cache.set(key, JSON.stringify(saved));
latest.tag_name = 'v2026.10.09.5';
assert.equal(env.dispatch('/api/update-notice').body.latestVersion, 'v2026.10.09.4', 'automatic check uses the cached release within one hour');
assert.equal(env.dispatch('/api/update-notice', 'POST').body.latestVersion, 'v2026.10.09.5', 'manual check can bypass the hourly cache');
for (const tag of ['v2026.10.09.3', 'v2026.10.09.2', 'v2026.09.30.99']) {
  env.cache.delete(key); latest = { tag_name: tag };
  result = env.dispatch('/api/update-notice').body;
  assert.equal(result.checkStatus, 'up-to-date'); assert.equal(result.updateAvailable, false);
}
for (const tag of ['v2026.10.09.10', 'v2026.10.10.1', 'v2027.01.01.1']) {
  env.cache.delete(key); latest = { tag_name: tag };
  assert.equal(env.dispatch('/api/update-notice').body.updateAvailable, true, 'numeric/date version comparison');
}
for (const value of [{ tag_name: 'bad' }, { tag_name: 'v2026.10.10.1', draft: true }, { tag_name: 'v2026.10.10.1', prerelease: true }, '{invalid-json']) {
  env.cache.delete(key); latest = value;
  result = env.dispatch('/api/update-notice').body;
  assert.equal(result.checkStatus, 'unavailable'); assert.equal(result.updateAvailable, false);
}
for (const status of [403, 429, 500]) {
  env.cache.delete(key); code = status;
  assert.equal(env.dispatch('/api/update-notice').body.checkStatus, 'unavailable');
}
code = 200; failure = true;
assert.equal(env.dispatch('/api/update-notice').body.checkStatus, 'unavailable');
assert.deepEqual(clone(env.api.testRead().data), before, 'all version/update checks leave the complete signed workspace unchanged');
assert.deepEqual(env.events, [], 'read-only checks never acquire the write lock or write snapshots');
console.log('r17 server version, manager authorization, current/new/older release, cache/manual refresh, failure visibility and exact workspace preservation passed');
