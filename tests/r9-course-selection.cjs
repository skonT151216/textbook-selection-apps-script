const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const wrapper = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
const bundle = wrapper.match(/<pre id="app-bundle">([A-Za-z0-9+/=\s]+)<\/pre>/);
assert.ok(bundle);
const html = zlib.gunzipSync(Buffer.from(bundle[1].replace(/\s/g, ''), 'base64')).toString('utf8');
for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const next = html.indexOf('function ', start + 9);
  return html.slice(start, next);
}

const frontend = {
  YI: (values) => [...new Set(values)],
  XI: new Intl.Collator('ko', { numeric: true }),
  v1: (unit) => unit.reviews.some((review) => review.signed),
  JI: (unit) => unit.reviews,
  k3: ({ subject, label, mode, selectionName, candidates, volumes, existing }) => ({
    id: existing?.id || `new:${selectionName || label}`, subject, label, mode, selectionName,
    candidates, volumes, reviews: existing?.reviews || [], status: 'active',
  }),
  Sb: (left, right) => left.length === right.length && left.every((item) => right.includes(item)),
  bZ: () => [],
};
vm.createContext(frontend);
vm.runInContext(['Gg', 'courseName', 'courseNames', 'C3', '$I', 'wZ'].map(functionSource).join('\n'), frontend);

const viStart = html.indexOf('VI={');
const viEnd = html.indexOf('},KI=', viStart) + 1;
assert.ok(viStart >= 0 && viEnd > viStart);
frontend.Wg = (value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
frontend.co = (value) => frontend.Wg(value).replace(/\s/g, '');
frontend.zI = (value) => frontend.co(value).replace(/㈜|\(주\)|주식회사/g, '');
frontend.x3 = (value) => frontend.co(value).replace(/^중학교/, '');
frontend.KI = ['국어', '수학'];
frontend.B3 = { sheet_to_json: (sheet) => sheet.rows };
vm.runInContext(`var ${html.slice(viStart, viEnd)};`, frontend);
const importerStart = html.indexOf('function mZ(');
const importerEnd = html.indexOf('}Cb();var WI', importerStart) + 1;
assert.ok(importerStart >= 0 && importerEnd > importerStart);
vm.runInContext(functionSource('kb') + '\n' + html.slice(importerStart, importerEnd), frontend);
const imported = frontend.mZ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: { rows: [
  ['학기', '과목', '도서명', '출판사', '대표저자', '가격', '선정 대상명'],
  [3, '국어', '언어생활 탐구 3-1', 'A', '저자A', 10800, ''],
  [3, '국어', '화법과 언어 3-2', 'B', '저자B', 10960, ''],
  [3, '국어', '논술 3-3', 'C', '저자C', 15300, ''],
  [3, '수학', '대수 교과서', 'D', '저자D', 12000, '대수'],
] } } }, [], 'books', (() => { let id = 0; return () => `import-${++id}`; })());
assert.equal(imported.issues.length, 0);
assert.deepEqual(JSON.parse(JSON.stringify(imported.books.map((book) => book.selectionName))),
  ['언어생활 탐구 3-1', '화법과 언어 3-2', '논술 3-3', '대수']);
assert.equal(frontend.wZ({ subject: '국어', books: imported.books, members: [], criteria: [], existingUnits: [], choice: 'course' }).length, 3);

const books = [
  { id: 'a1', subject: '국어', title: '언어생활 탐구 3-1', selectionName: '언어생활 탐구 3-1', volume: '3-1', publisher: 'A' },
  { id: 'a2', subject: '국어', title: '언어생활 탐구 3-1', selectionName: '언어생활 탐구 3-1', volume: '3-1', publisher: 'B' },
  { id: 'b1', subject: '국어', title: '화법과 언어 3-2', selectionName: '화법과 언어 3-2', volume: '3-2', publisher: 'A' },
  { id: 'c1', subject: '국어', title: '논술 3-3', selectionName: '논술 3-3', volume: '', publisher: 'A' },
  { id: 'm1', subject: '수학', title: '대수', selectionName: '대수', volume: '', publisher: 'A' },
  { id: 'm2', subject: '수학', title: '대수 교과서', selectionName: '대수', volume: '', publisher: 'B' },
  { id: 'm3', subject: '수학', title: '미적분', selectionName: '미적분', volume: '', publisher: 'A' },
];
const make = (subject, choice, existingUnits = []) => frontend.wZ({
  subject, books, members: ['교사A'], criteria: [], existingUnits, choice,
});
const korean = make('국어', 'course');
assert.deepEqual(JSON.parse(JSON.stringify(korean.map((unit) => [unit.selectionName, unit.candidates.map((item) => item.bookIds[0])]))), [
  ['논술 3-3', ['c1']], ['언어생활 탐구 3-1', ['a1', 'a2']], ['화법과 언어 3-2', ['b1']],
]);
assert.ok(korean.every((unit) => unit.volumes.length === 0), '3-3 is retained without volume recognition');
assert.equal(frontend.C3(korean, '국어', ['3-1', '3-2']), 'course');
assert.deepEqual(JSON.parse(JSON.stringify(make('수학', 'course').map((unit) => unit.candidates.length))), [2, 1]);
assert.equal(make('수학', undefined).length, 0, 'multiple titles require an explicit choice');
assert.equal(make('수학', 'single').length, 1, 'one combined evaluation remains available');
assert.equal(frontend.C3(make('수학', 'single'), '수학', []), 'single');

const active = structuredClone(korean[1]);
active.reviews = [{ teacher: '교사A', signed: true }];
const preserved = make('국어', 'course', [active]);
assert.equal(preserved.find((unit) => unit.id === active.id).reviews[0].signed, true);
assert.equal(preserved.length, 3, 'new targets can coexist with an active target');

const serverCode = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8')
  .replace('exports.apiDispatch = apiDispatch;', 'exports.validateSelectionUnit = validateSelectionUnit;\n\texports.validateCourseCoverage = validateCourseCoverage;\n\texports.testSaveSetup = saveSetup;\n\texports.apiDispatch = apiDispatch;');
new vm.Script(serverCode);
const server = {};
vm.createContext(server);
vm.runInContext(serverCode, server);
const { validateSelectionUnit, validateCourseCoverage } = server.TextbookSelectionGas;
for (const unit of korean) assert.deepEqual(Array.from(validateSelectionUnit(unit, books)), []);
assert.deepEqual(Array.from(validateCourseCoverage(korean, books)), []);
const missing = korean.filter((unit) => unit.selectionName !== '논술 3-3');
assert.match(validateCourseCoverage(missing, books)[0], /논술/);
const duplicate = structuredClone(korean);
duplicate[0].candidates.push({ id: 'copy', bookIds: ['a1'] });
assert.ok(validateSelectionUnit(duplicate[0], books).length);
assert.ok(validateCourseCoverage(duplicate, books).length);

const setupBody = {
  setup: {
    schoolName: '테스트고', schoolYear: 2027, managerName: '담당자', managerEmail: 'manager',
    vicePrincipalName: '교감', vicePrincipalEmail: 'vice',
    staff: [{ name: '교사A', email: 'teachera' }, { name: '교사B', email: 'teacherb' }],
  },
  departmentHeads: { 국어: '교사A' }, summaryWriters: { 국어: '교사B' },
  workspace: { members: { 국어: ['교사A', '교사B'] }, books: books.filter((book) => book.subject === '국어'), selectionUnits: korean },
};
const save = (body) => server.TextbookSelectionGas.testSaveSetup(
  { email: 'manager' }, { bootstrapManagerId: 'manager' }, { data: null, revision: 0 }, body,
);
assert.equal(save(setupBody).status, 200, 'valid course grouping saves');
const incomplete = structuredClone(setupBody);
incomplete.workspace.selectionUnits = missing;
assert.equal(save(incomplete).status, 400, 'missing textbook rejected during setup save');

assert.ok(html.includes('selectionName:["선정 대상명"'), 'spreadsheet header supported');
assert.ok(html.includes('children:"선정 대상명"'), 'catalog field visible');
assert.ok(html.includes('option("course","선정 대상명별로 따로 평가"'), 'choice visible for every subject');
console.log('r9 cross-subject course grouping, 3-3 retention, coverage, and syntax checks passed');
