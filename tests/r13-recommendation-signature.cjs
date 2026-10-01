const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
const backend = {};
vm.createContext(backend);
vm.runInContext(code.replace('exports.apiDispatch = apiDispatch;', 'exports.testSaveWorkspace=saveWorkspace;exports.testSameRecommendations=sameRecommendationContent;exports.apiDispatch = apiDispatch;'), backend);
const api = backend.TextbookSelectionGas;
const clone = value => JSON.parse(JSON.stringify(value));
const writerKey = 'unit:u1:recommend:writer';
const approverKey = 'unit:u1:recommend:approver';
const writer = { name: '테스트부장', image: 'data:image/webp;base64,dGVzdA==', signedAt: '2026-10-01T00:00:00.000Z' };
const approver = { name: '테스트교감', image: 'data:image/png;base64,dGVzdA==', signedAt: '2026-10-01T00:00:00.000Z' };
const opinions = { b3: '세 번째 의견', b1: '첫 번째 의견', b2: '두 번째 의견' };
const reversed = { b2: '두 번째 의견', b1: '첫 번째 의견', b3: '세 번째 의견' };
assert.equal(api.testSameRecommendations(opinions, reversed), true);
assert.equal(api.testSameRecommendations(undefined, {}), true);
assert.equal(api.testSameRecommendations(opinions, { ...reversed, b1: '수정 의견' }), false);
assert.equal(api.testSameRecommendations(opinions, { ...reversed, b4: '추가 의견' }), false);
assert.equal(api.testSameRecommendations({ b1: '' }, {}), false, 'deletion is a real edit');
assert.equal(api.testSameRecommendations({ b1: '의견' }, { b1: '의견 ' }), false, 'actual text is compared exactly');
const unit = {
  id: 'u1', subject: '체육', status: 'active', mode: 'course', selectionName: '스포츠 생활1',
  candidates: ['b1', 'b2', 'b3', 'b4'].map(id => ({ id, bookIds: [id] })),
  criteria: [], reviews: [], topScore: 97, gap: 3, recommendations: opinions,
  signatures: { [approverKey]: approver }, opinionSources: {},
};
const workspace = {
  activeUnitId: 'u1', subject: '체육', selectionUnits: [unit],
  departmentHeads: { 체육: '테스트부장' }, summaryWriters: { 체육: '테스트교사' },
  setup: { completedAt: '2026-10-01', managerName: '테스트담당자', managerEmail: 'manager',
    vicePrincipalName: '테스트교감', vicePrincipalEmail: 'vice',
    staff: [{ name: '테스트부장', email: 'head', subjects: ['체육'] }] },
};
const head = { email: 'head', accountId: 'school-id:head' };
function save(data, user = head, signatures = { ...data.selectionUnits[0].signatures, [writerKey]: writer }, recommendations = reversed) {
  const incoming = clone(data);
  incoming._clientScope = 'recommend'; incoming._clientUnitId = 'u1';
  incoming.selectionUnits[0].signatures = clone(signatures);
  incoming.selectionUnits[0].recommendations = clone(recommendations);
  return api.testSaveWorkspace(user, { data: clone(data), revision: 1 }, incoming);
}
for (const user of [head, { email: 'manager', accountId: 'school-id:manager' }]) {
  const result = save(workspace, user);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.selectionUnits[0].signatures[writerKey].image, writer.image, 'new writer image survives a reordered opinion map');
  assert.deepEqual(clone(result.body.data.selectionUnits[0].signatures[approverKey]), approver, 'existing approver preserved');
  assert.equal(result.body.data.signatures[writerKey].image, writer.image, 'active view stays in sync');
  assert.equal(result.body.data.selectionUnits[0].signatures[writerKey].signedAccountId, user.accountId);
  const repeated = save(result.body.data, user, result.body.data.selectionUnits[0].signatures, opinions);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.data.selectionUnits[0].signatures[writerKey].image, writer.image, 're-saving preserves signature');
  for (const edited of [{ ...reversed, b1: '수정된 추천' }, { b1: opinions.b1, b2: opinions.b2 }, { ...reversed, b4: '추가 의견' }]) {
    const changed = save(result.body.data, user, result.body.data.selectionUnits[0].signatures, edited);
    assert.equal(changed.status, 200);
    assert.deepEqual(clone(changed.body.data.selectionUnits[0].signatures), {}, 'real content edits still invalidate both signatures');
  }
}
const signed = clone(save(workspace).body.data);
const vice = { email: 'vice', accountId: 'school-id:vice' };
const viceResult = save(signed, vice, { ...signed.selectionUnits[0].signatures, [approverKey]: { ...approver, signedAt: '2026-10-01T01:00:00.000Z' } });
assert.equal(viceResult.status, 200);
assert.equal(viceResult.body.data.selectionUnits[0].signatures[writerKey].image, writer.image);
assert.equal(viceResult.body.data.selectionUnits[0].signatures[approverKey].signedAccountId, vice.accountId);
assert.equal(save(workspace, head, { [writerKey]: { ...writer, name: '다른 교사' } }).status, 400, 'signer identity protection unchanged');

const wrapper = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
const html = zlib.gunzipSync(Buffer.from(wrapper.match(/<pre id="app-bundle">([A-Za-z0-9+/=\s]+)<\/pre>/)[1].replace(/\s/g, ''), 'base64')).toString();
function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('function ', start + 10));
}
const frontend = {};
vm.createContext(frontend);
vm.runInContext(functionSource('b1') + functionSource('qd'), frontend);
const guardStart = html.indexOf('v=p&&qd(p,e.activeUnitId)', html.indexOf('function QZ('));
const guardEnd = html.indexOf(',f=!x', guardStart);
assert.ok(guardStart >= 0 && guardEnd > guardStart);
const isUnsaved = new Function('e', 'p', 'qd', 'b1', `let ${html.slice(guardStart, guardEnd)};return x`);
const local = { activeUnitId: 'u1', recommendations: reversed };
assert.equal(isUnsaved(local, workspace, frontend.qd, frontend.b1), false, 'reordered keys do not disable the signature controls');
assert.equal(isUnsaved({ ...local, recommendations: { ...reversed, b1: '수정 의견' } }, workspace, frontend.qd, frontend.b1), true);
assert.ok(html.includes('!b1(M,e.recommendations)&&(delete P[A],delete P[o])'), 'generator compares content, not JSON key order');
console.log('r13 recommendation key-order, writer/approver, repeat-save, and real-edit checks passed');
