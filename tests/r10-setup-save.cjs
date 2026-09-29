const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const wrapper = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
const packed = wrapper.match(/<pre id="app-bundle">([A-Za-z0-9+/=\s]+)<\/pre>/);
assert.ok(packed);
const html = zlib.gunzipSync(Buffer.from(packed[1].replace(/\s/g, ''), 'base64')).toString('utf8');
for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('function ', start + 9));
}

const frontend = {
  uB: (teachers) => teachers.map((teacher) => ({ teacher, ranked: [], scores: {}, opinion: '', signed: false })),
  uz: () => ({ reviews: [], candidates: [] }),
  dB: () => true,
};
vm.createContext(frontend);
vm.runInContext(functionSource('fB') + '\n' + functionSource('v1') + '\n' + functionSource('JI') + '\n' + functionSource('k3'), frontend);
const rebuiltLegacy = frontend.k3({ subject: '과학', label: '과학 3', mode: 'single', volumes: ['3'], candidates: [], books: [], members: [], criteria: [] });
assert.equal(Object.hasOwn(rebuiltLegacy, 'selectionName'), false, 'legacy units do not gain an empty grouping field');

const signedReview = {
  teacher: '교사A', ranked: ['b1'], scores: { b1: { c1: 10 } },
  opinion: '기존 평가', signed: true, signature: { name: '교사A' },
};
const previousUnit = {
  id: 'science-3', subject: '과학', label: '과학 3', mode: 'single',
  volumes: ['3'], status: 'active', candidates: [{ id: 'b1', label: '', bookIds: ['b1'] }],
  criteria: [{ id: 'c1', area: '내용', text: '적절한가?', max: 10 }],
  reviews: [signedReview], topScore: 97, gap: 3,
  recommendations: { b1: '추천' }, signatures: { 'unit:science-3:recommend:writer': { name: '교사B' } }, opinionSources: {},
};
const updatedReviews = frontend.JI(previousUnit, ['교사B', '교사C']);
assert.ok(updatedReviews.some((review) => review.teacher === '교사A' && review.signed), 'removed teacher history is retained');
assert.ok(frontend.v1({ ...previousUnit, reviews: updatedReviews }), 'active unit remains locked in setup UI');

const source = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8')
  .replace('exports.apiDispatch = apiDispatch;', 'exports.testSaveSetup = saveSetup;\n\texports.testStructureChanged = selectionUnitStructureChanged;\n\texports.apiDispatch = apiDispatch;');
new vm.Script(source);
const server = {};
vm.createContext(server);
vm.runInContext(source, server);
const api = server.TextbookSelectionGas;
assert.equal(api.testStructureChanged(previousUnit, { ...previousUnit, selectionName: '' }), false, 'legacy blank field is not structural change');
assert.equal(api.testStructureChanged(previousUnit, { ...previousUnit, candidates: [{ id: 'b2', bookIds: ['b2'] }] }), true, 'actual candidate change stays protected');
assert.equal(api.testStructureChanged({ ...previousUnit, mode: 'course', selectionName: '과학 3' }, { ...previousUnit, mode: 'course', selectionName: '다른 대상' }), true, 'course target change stays protected');

const book = { id: 'b1', subject: '과학', volume: '3', publisher: '출판사', title: '과학 3', author: '', price: 10000 };
const setup = {
  schoolName: '테스트고', schoolYear: 2027, managerName: '담당자', managerEmail: 'manager',
  vicePrincipalName: '교감', vicePrincipalEmail: 'vice',
  staff: [
    { name: '교사A', email: 'teachera', subjects: ['과학'] },
    { name: '교사B', email: 'teacherb', subjects: ['과학'] },
    { name: '교사C', email: 'teacherc', subjects: ['과학'] },
  ], completedAt: '2026-09-29',
};
const stored = {
  data: {
    setup, members: { 과학: ['교사A', '교사B', '교사C'] }, books: [book],
    selectionUnits: [previousUnit], departmentHeads: { 과학: '교사B' }, summaryWriters: { 과학: '교사C' },
  }, revision: 1,
};
const body = {
  setup: { ...setup, staff: setup.staff.filter((person) => person.name !== '교사A') },
  workspace: {
    workspaceRevision: 1, members: { 과학: ['교사B', '교사C'] }, books: [book],
    selectionUnits: [{ ...previousUnit, selectionName: '', reviews: updatedReviews.filter((review) => review.teacher !== '교사A') }],
  },
  departmentHeads: { 과학: '교사B' }, summaryWriters: { 과학: '교사C' },
};
const save = (request) => api.testSaveSetup({ email: 'manager' }, { bootstrapManagerId: 'manager' }, stored, request);
const result = save(body);
assert.equal(result.status, 200, result.body.error);
const savedUnit = result.body.data.selectionUnits[0];
assert.ok(savedUnit.reviews.some((review) => review.teacher === '교사A' && review.signed), 'server preserves signed history even from an older client');
assert.deepEqual(JSON.parse(JSON.stringify(savedUnit.signatures)), previousUnit.signatures);
assert.deepEqual(JSON.parse(JSON.stringify(savedUnit.recommendations)), previousUnit.recommendations);
assert.deepEqual(JSON.parse(JSON.stringify(result.body.data.members.과학)), ['교사B', '교사C'], 'unrelated staff change is saved');

const changed = structuredClone(body);
changed.workspace.books.push({ ...book, id: 'b2', title: '새 교과서' });
changed.workspace.selectionUnits[0].candidates = [{ id: 'b2', label: '', bookIds: ['b2'] }];
const rejected = save(changed);
assert.equal(rejected.status, 409, 'real candidate replacement remains blocked');
console.log('r10 legacy setup save, evaluated review retention, and real-change protection passed');
