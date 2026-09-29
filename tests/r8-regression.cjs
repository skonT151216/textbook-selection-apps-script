const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const wrapper = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
const match = wrapper.match(/<pre id="app-bundle">([A-Za-z0-9+/=\s]+)<\/pre>/);
assert.ok(match, 'compressed app bundle');
const html = zlib.gunzipSync(Buffer.from(match[1].replace(/\s/g, ''), 'base64')).toString('utf8');
const appScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
for (const script of appScript) new vm.Script(script[1]);
const code = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
new vm.Script(code);

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name}`);
  const end = html.indexOf('function ', start + 9);
  return html.slice(start, end);
}

const context = {};
vm.createContext(context);
vm.runInContext(['qd', '$d', 'qg', 'iL', 'sL', 'oL', 'recommendationChangeReasons'].map(extractFunction).join('\n'), context);
const book = { id: 'b1', subject: '영어', publisher: '출판사', title: '도서', price: 10000 };
const state = {
  subject: '영어', activeUnitId: 'u1', selectionUnits: [{ id: 'u1', label: '영어' }],
  criteria: [{ id: 'c1', area: '내용', text: '적합한가?', max: 100 }],
  members: { 영어: ['교사A'] }, reviews: [{ teacher: '교사A', autoTopScore: 99, ranked: ['b1'], scores: { b1: { c1: 99 } } }],
  topScore: 97, gap: 3,
};
const originalSource = context.oL(state, book, 0);
const revised = structuredClone(state);
revised.reviews[0].scores.b1.c1 = 98;
const currentSource = context.oL(revised, book, 0);
assert.notEqual(originalSource, currentSource);
assert.ok(Array.from(context.recommendationChangeReasons(originalSource, currentSource)).includes('교사별 점수'));

const qzStart = html.indexOf('function QZ(');
const actionStart = html.indexOf('U=async()=>', qzStart);
const actionEnd = html.indexOf(';return(0,w.jsxs)(w.Fragment', actionStart);
assert.ok(actionStart > qzStart && actionEnd > actionStart, 'recommendation handlers');
const recommendationHandlers = new Function('e', 'r', 'n', 'g', 'b', 'A', 'o', 'AL', 'oL', `let ${html.slice(actionStart, actionEnd)};return {U,I,N}`);
assert.ok(html.includes('onClick:()=>N(M.b,j),children:"내용 확인 완료"'), 'confirmation button');
assert.ok(html.includes('readOnly:!a||x,readOnlyReason:x?') && html.includes('readOnly:!i||x,readOnlyReason:x?'), 'unsaved recommendation edits cannot be signed');

async function testRecommendationActions() {
  const signatures = { writer: { name: '부장' }, approver: { name: '교감' } };
  const data = { recommendations: { b1: '기존 의견' }, opinionSources: { 'recommend:b1': originalSource }, signatures };
  let saved;
  let edited;
  const handlers = recommendationHandlers(data, (value) => { edited = value; }, async (value) => { saved = value; return true; }, [{ b: book }], [{ id: 'b1', value: '기존 의견' }], 'writer', 'approver', (_, id) => `recommend:${id}`, () => currentSource);
  await handlers.N(book, 0);
  assert.deepEqual(saved.recommendations, data.recommendations);
  assert.deepEqual(saved.signatures, signatures);
  assert.equal(saved.opinionSources['recommend:b1'], currentSource);
  handlers.I('b1', '수정 의견');
  assert.deepEqual(edited.signatures, signatures, 'draft edit retains signatures until saved');
  await handlers.U();
  assert.deepEqual(saved.signatures, signatures, 'identical regenerated text retains signatures');
  const changed = recommendationHandlers(data, () => {}, async (value) => { saved = value; return true; }, [{ b: book }], [{ id: 'b1', value: '새 의견' }], 'writer', 'approver', (_, id) => `recommend:${id}`, () => currentSource);
  await changed.U();
  assert.deepEqual(saved.signatures, {}, 'changed regenerated text removes signatures');
}

function testCriterionOrder() {
  const izStart = html.indexOf('function IZ(');
  const start = html.indexOf('O=()=>', izStart);
  const end = html.indexOf(',W=D=>', start);
  assert.ok(start > izStart && end > start, 'criterion handlers');
  const handlers = new Function('e', 't', 'F3', 'Xd', 'Xg', `let ${html.slice(start, end)};return {O,B}`);
  const priceArea = '17. 교과용도서의 가격';
  let current = { criteria: [{ id: 'a', area: '내용' }, { id: 'price', area: priceArea }] };
  const make = () => handlers(current, (value) => { current = value; }, () => 'new', [{ name: '추가', items: ['기준'] }], priceArea);
  make().O();
  assert.deepEqual(current.criteria.map((item) => item.id), ['a', 'new', 'price'], 'new item inserted before price');
  make().B(1, -1);
  assert.deepEqual(current.criteria.map((item) => item.id), ['new', 'a', 'price']);
  make().B(1, 1);
  assert.deepEqual(current.criteria.map((item) => item.id), ['new', 'a', 'price'], 'price remains fixed');
  assert.ok(html.includes('onClick:()=>B(z,-1)') && html.includes('onClick:()=>B(z,1)'), 'move buttons wired');
}

function testServerSignatureRules() {
  const instrumented = code.replace('exports.apiDispatch = apiDispatch;', 'exports.testSaveWorkspace = saveWorkspace;\n\texports.apiDispatch = apiDispatch;');
  const server = {};
  vm.createContext(server);
  vm.runInContext(instrumented, server);
  const unit = {
    id: 'u1', subject: '영어', status: 'active', candidates: [{ id: 'b1', bookIds: ['b1'] }],
    criteria: state.criteria, reviews: [], topScore: 97, gap: 3,
    recommendations: { b1: '기존 의견' }, opinionSources: { 'unit:u1:recommend:b1': originalSource },
    signatures: { 'unit:u1:recommend:writer': { name: '부장' }, 'unit:u1:recommend:approver': { name: '교감' } },
  };
  const workspace = {
    setup: { completedAt: '2026-09-29', managerEmail: 'manager', managerName: '담당자', vicePrincipalName: '교감', staff: [] },
    departmentHeads: { 영어: '부장' }, summaryWriters: {}, selectionUnits: [unit],
  };
  const body = structuredClone(workspace);
  body._clientScope = 'recommend';
  body._clientUnitId = 'u1';
  body.selectionUnits[0].opinionSources['unit:u1:recommend:b1'] = currentSource;
  const user = { email: 'manager', accountId: 'school-id:manager' };
  const unchanged = server.TextbookSelectionGas.testSaveWorkspace(user, { data: workspace, revision: 1 }, structuredClone(body));
  assert.equal(unchanged.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(unchanged.body.data.selectionUnits[0].signatures)), unit.signatures);
  assert.equal(unchanged.body.data.selectionUnits[0].opinionSources['unit:u1:recommend:b1'], currentSource);
  const changedBody = structuredClone(body);
  changedBody.selectionUnits[0].recommendations.b1 = '새 의견';
  const changed = server.TextbookSelectionGas.testSaveWorkspace(user, { data: workspace, revision: 1 }, changedBody);
  assert.equal(changed.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(changed.body.data.selectionUnits[0].signatures)), {});
}

(async () => {
  await testRecommendationActions();
  testCriterionOrder();
  testServerSignatureRules();
  console.log('r8 recommendation confirmation, signature, and criterion order checks passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
