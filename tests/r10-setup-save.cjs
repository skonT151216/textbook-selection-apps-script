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
vm.runInContext(functionSource('qd') + '\n' + functionSource('selectionTargetOnSheet'), frontend);
const courseUnits = [
  { id: 'korean-one', subject: '국어', mode: 'course', selectionName: '언어생활 탐구 3-1', status: 'active' },
  { id: 'korean-two', subject: '국어', mode: 'course', selectionName: '논술 3-3', status: 'active' },
];
assert.equal(frontend.selectionTargetOnSheet({ selectionUnits: courseUnits, activeUnitId: 'korean-two', subject: '국어' }).selectionName, '논술 3-3', 'the active target is shown on its own sheet');
assert.equal(frontend.selectionTargetOnSheet({ selectionUnits: courseUnits, activeUnitId: 'korean-two', subject: '국어', setup: { showSelectionNameOnEvaluation: false } }), null, 'the school can hide the target name');
assert.equal(frontend.selectionTargetOnSheet({ selectionUnits: [{ ...courseUnits[0], mode: 'single' }], activeUnitId: 'korean-one', subject: '국어' }), null, 'legacy selection mode keeps its form');
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
  .replace('exports.apiDispatch = apiDispatch;', 'exports.testSaveSetup = saveSetup;\n\texports.testFormTestSource = formTestSource;\n\texports.testStructureChanged = selectionUnitStructureChanged;\n\texports.apiDispatch = apiDispatch;');
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

const displayOnly = structuredClone(body);
displayOnly.setup.showSelectionNameOnEvaluation = false;
const displaySave = save(displayOnly);
assert.equal(displaySave.status, 200, displaySave.body.error);
assert.equal(displaySave.body.data.setup.showSelectionNameOnEvaluation, false, 'evaluation sheet option is saved');
assert.deepEqual(JSON.parse(JSON.stringify(displaySave.body.data.selectionUnits[0].reviews.find((review) => review.teacher === '교사A'))), signedReview, 'display setting does not reset the signed review');
assert.deepEqual(JSON.parse(JSON.stringify(displaySave.body.data.selectionUnits[0].signatures)), previousUnit.signatures, 'display setting does not reset signatures');
assert.equal(api.testFormTestSource(displaySave.body.data).setup.showSelectionNameOnEvaluation, false, 'test form respects the saved display option');
const legacyDisplay = save(body);
assert.equal(legacyDisplay.body.data.setup.showSelectionNameOnEvaluation, true, 'older schools default to visible target names for course selection');

const changed = structuredClone(body);
changed.workspace.books.push({ ...book, id: 'b2', title: '새 교과서' });
changed.workspace.selectionUnits[0].candidates = [{ id: 'b2', label: '', bookIds: ['b2'] }];
changed.setup.schoolName = '변경된 학교명';
const protectedSave = save(changed);
assert.equal(protectedSave.status, 200, protectedSave.body.error);
assert.deepEqual(JSON.parse(JSON.stringify(protectedSave.body.preservedSubjects)), ['과학']);
assert.equal(protectedSave.body.data.setup.schoolName, '변경된 학교명', 'unrelated school setting is saved');
assert.deepEqual(JSON.parse(JSON.stringify(protectedSave.body.data.books)), [book], 'evaluated subject catalog is not replaced');
assert.deepEqual(JSON.parse(JSON.stringify(protectedSave.body.data.selectionUnits[0].candidates)), previousUnit.candidates, 'evaluated candidates are not replaced');
assert.deepEqual(JSON.parse(JSON.stringify(protectedSave.body.data.selectionUnits[0].signatures)), previousUnit.signatures, 'existing signature survives the partial save');
assert.ok(html.includes('st.preservedSubjects.length&&window.alert('), 'setup frontend announces protected subject changes');

const movedBook = structuredClone(body);
movedBook.workspace.books[0].subject = '영어';
const movedSave = save(movedBook);
assert.equal(movedSave.status, 200, movedSave.body.error);
assert.equal(movedSave.body.data.books[0].subject, '과학', 'a protected book cannot be moved to another subject');

const englishBook = { ...book, id: 'e1', subject: '영어', volume: '', title: '영어 교과서', price: 10000 };
const englishUnit = { ...structuredClone(previousUnit), id: 'english', subject: '영어', label: '영어', volumes: [], candidates: [{ id: 'e1', label: '', bookIds: ['e1'] }], reviews: [], recommendations: {}, signatures: {} };
const storedTwoSubjects = structuredClone(stored);
storedTwoSubjects.data.books.push(englishBook);
storedTwoSubjects.data.selectionUnits.push(englishUnit);
storedTwoSubjects.data.members.영어 = ['교사B', '교사C'];
storedTwoSubjects.data.departmentHeads.영어 = '교사B';
storedTwoSubjects.data.summaryWriters.영어 = '교사C';
const twoSubjects = structuredClone(changed);
twoSubjects.workspace.books.push({ ...englishBook, price: 12000 });
twoSubjects.workspace.selectionUnits.push(englishUnit);
twoSubjects.workspace.members.영어 = ['교사B', '교사C'];
twoSubjects.departmentHeads.영어 = '교사B';
twoSubjects.summaryWriters.영어 = '교사C';
const partial = api.testSaveSetup({ email: 'manager' }, { bootstrapManagerId: 'manager' }, storedTwoSubjects, twoSubjects);
assert.equal(partial.status, 200, partial.body.error);
assert.deepEqual(JSON.parse(JSON.stringify(partial.body.preservedSubjects)), ['과학']);
assert.equal(partial.body.data.books.find((item) => item.id === 'e1').price, 12000, 'an unevaluated subject can still be edited');
assert.equal(partial.body.data.books.find((item) => item.id === 'b1').price, 10000, 'the evaluated subject remains unchanged');
console.log('r10/r11 legacy setup save, evaluation preservation, and protected-subject partial save passed');
