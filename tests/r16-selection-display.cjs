const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const cp = require('node:child_process');
const root = path.join(__dirname, '..');
function decode(wrapper) { return zlib.gunzipSync(Buffer.from(wrapper.match(/<pre id="app-bundle">([\s\S]*?)<\/pre>/)[1].replace(/\s/g, ''), 'base64')).toString(); }
const html = decode(fs.readFileSync(path.join(root, 'Index.html'), 'utf8'));
const previous = decode(cp.execFileSync('git', ['show', '0f715cf:Index.html'], { cwd: root, encoding: 'utf8', maxBuffer: 8000000 }));
function source(text, name) {
  const start = text.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  return text.slice(start, text.indexOf('function ', start + 9));
}
for (const name of ['qd', '$d', 'UZ', 'oL', 'Fb', 'wc', 'wZ', 'mZ']) {
  assert.equal(source(html, name), source(previous, name), name + ' keeps storage, grouping and confirmed opinion history unchanged');
}
const context = {};
vm.createContext(context);
vm.runInContext(source(html, 'courseName') + source(html, 'qd') + fs.readFileSync(path.join(root, 'identity/selection-display.js'), 'utf8') + source(html, 'selectionTargetOnSheet'), context);
for (const [subject, title] of [['생명', '생물의 유전'], ['물리', '전자기와 양자'], ['지구과학', '행성우주과학'], ['화학', '화학반응의 세계']]) {
  const books = [0, 1, 2, 3].map(i => ({ id: 'b' + i, subject, volume: '3-1', title, selectionName: title, publisher: '출판사' + i }));
  const unit = { id: 'old-unit', subject, label: subject + ' 3-1', mode: 'single', volumes: ['3-1'], candidates: books.map(b => ({ id: b.id, label: b.publisher, bookIds: [b.id] })), reviews: [{ teacher: '교사', signed: true, signature: { name: '교사', image: 'original-image', signedAt: '2026-10-01' } }], signatures: { 'unit:old-unit:recommend:writer': { image: 'original-writer-image' } }, recommendations: { b0: '확정 의견' }, opinionSources: { original: 'unchanged-history' } };
  const data = { books, selectionUnits: [unit], subject, activeUnitId: unit.id, setup: {} }, before = JSON.stringify(data);
  assert.equal(context.selectionDisplayName(data), subject + ' · ' + title);
  assert.equal(context.selectionTargetOnSheet(data).selectionName, title);
  assert.equal(context.selectionTargetOnSheet({ ...data, setup: { showSelectionNameOnEvaluation: false } }), null);
  assert.equal(JSON.stringify(data), before, 'display must not mutate any existing signed record');
  assert.equal(context.unitDisplayLabel({ ...unit, mode: 'course', label: '기존 대상 표기' }, books), '기존 대상 표기');
  assert.equal(context.unitDisplayLabel({ ...unit, mode: 'bundle' }, books), unit.label);
  assert.equal(context.unitDisplayLabel({ ...unit, mode: 'separate' }, books), unit.label);
  const generic = books.map(b => ({ ...b, title: subject + ' 3-1', selectionName: subject + ' 3-1' }));
  assert.equal(context.unitDisplayLabel(unit, generic), unit.label, 'ordinary subject/volume labels retain their familiar format');
  generic.forEach(b => { b.title = b.selectionName = subject + ' 교과서'; });
  assert.equal(context.unitDisplayLabel(unit, generic), unit.label, 'generic imported titles do not become artificial target names');
  assert.equal(context.unitDisplayLabel(unit, []), unit.label, 'missing book references must not be guessed');
  assert.equal(context.unitDisplayLabel(unit, books.map((b, i) => i ? b : { ...b, selectionName: '다른 도서' })), unit.label, 'mixed titles cannot be collapsed into an arbitrary title');
  assert.equal(context.unitDisplayLabel(unit, [...books, { ...books[0], id: 'unselected', selectionName: '선정하지 않은 다른 도서' }]), subject + ' · ' + title, 'only candidate books determine the displayed title');
  assert.equal(context.unitDisplayLabel(unit, books.map(b => ({ ...b, selectionName: '긴 직접 입력 대상명', title: '원래 도서명' }))), subject + ' · 긴 직접 입력 대상명');
}
const koreanBooks = ['a', 'b'].map(id => ({ id, subject: '국어', title: '국어', selectionName: '국어', volume: '3-1' }));
const koreanUnit = { id: 'korean', subject: '국어', label: '국어 3-1', mode: 'single', candidates: koreanBooks.map(book => ({ bookIds: [book.id] })) };
assert.equal(context.unitDisplayLabel(koreanUnit, koreanBooks), '국어 3-1', 'middle-school plain 국어 title keeps its original display');
assert.equal(context.selectionTargetOnSheet({ subject: '국어', activeUnitId: 'korean', selectionUnits: [koreanUnit], books: koreanBooks }), null, 'plain 국어 does not gain redundant target metadata');
// r17 adds read-only version/update metadata; the entire storage and business
// implementation still matches r15, not just a selected list of functions.
const gas = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
const oldGas = cp.execFileSync('git', ['show', '0f715cf:Code.gs'], { cwd: root, encoding: 'utf8' });
assert.equal(gas.slice(0, gas.indexOf('\tvar APP_VERSION')), oldGas.slice(0, oldGas.indexOf('\tvar APP_VERSION')));
assert.equal(gas.slice(gas.indexOf('\tfunction properties()'), gas.indexOf('\tfunction apiDispatch(')), oldGas.slice(oldGas.indexOf('\tfunction properties()'), oldGas.indexOf('\tfunction apiDispatch(')));
for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
console.log('r16 single-title display, four science subjects, middle-school fallback, opt-out, exact grouping/storage/fingerprint preservation and syntax passed');
