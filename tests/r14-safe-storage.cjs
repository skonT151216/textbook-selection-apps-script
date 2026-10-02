const assert = require('node:assert/strict');
const { storageFixture, clone } = require('./storage-fixture.cjs');
const image = 'data:image/webp;base64,' + 'A'.repeat(30000);
function workspace(count = 7, teachers = 4, uniqueImages = false) {
  const names = Array.from({ length: teachers }, (_, i) => '테스트교사' + i);
  const signature = (name, id) => ({ name, image: uniqueImages ? image + id : image, signedAt: '2026-10-02T00:00:00Z', signedAccountId: 'school-id:' + name, signedAccountEmail: 'account-' + name });
  const units = Array.from({ length: count }, (_, i) => ({
    id: 'u' + i, subject: i % 2 ? '국어' : '체육', label: '선정 대상 ' + i, mode: 'course', selectionName: '도서 ' + i, status: 'active',
    candidates: [{ id: 'b' + i, bookIds: ['b' + i] }], criteria: [{ id: 'c', max: 100, text: '적절한가?' }], topScore: 97, gap: 3,
    reviews: names.map((teacher, j) => ({ teacher, ranked: ['b' + i], scores: { ['b' + i]: { c: 97 } }, opinion: '평가 의견', signed: true, signature: signature(teacher, i + ':' + j) })),
    recommendations: { ['b' + i]: '추천 의견' }, signatures: { ['unit:u' + i + ':recommend:writer']: signature(names[0], i + ':0') }, opinionSources: {},
  }));
  return { selectionUnits: units, activeUnitId: units[0].id, ...Object.fromEntries(['subject', 'criteria', 'reviews', 'topScore', 'gap', 'recommendations', 'signatures', 'opinionSources'].map(key => [key, units[0][key]])),
    books: units.map((unit, i) => ({ id: 'b' + i, subject: unit.subject, title: '도서 ' + i, publisher: '출판사', price: 10000 })),
    members: { 국어: names, 체육: names }, departmentHeads: { 국어: names[0], 체육: names[0] }, summaryWriters: { 국어: names[1], 체육: names[1] },
    setup: { completedAt: '2026-10-02', schoolName: '가상학교', managerEmail: 'manager', managerName: '담당자', vicePrincipalEmail: 'vice', vicePrincipalName: '교감', staff: names.map((name, i) => ({ name, email: 'teacher' + i, subjects: ['국어', '체육'] })) } };
}
const original = workspace();
const env = storageFixture(original);
const legacy = clone(env.sheets.get('_APP_DATA').cells);
assert.deepEqual(clone(env.api.testRead().data), clone(original), 'r13 format loads unchanged');
const packed = env.api.testEncode(original);
assert.deepEqual(clone(env.api.testDecode(packed)), clone(original), 'all scores, opinions, exact image strings, and audit fields round-trip');
assert.equal(JSON.parse(packed).images.length, 1, 'only byte-identical images are pooled');
const restored = env.api.testDecode(packed);
assert.notEqual(restored.reviews, restored.selectionUnits[0].reviews, 'legacy top-level fields remain independent objects');
assert.ok(JSON.stringify(original).length > 900000, 'fixture exceeds old cap');
assert.ok(packed.length < 900000, 'duplicate removal reduces storage');
const mismatched = clone(original); mismatched.recommendations = { legacy: '별도로 보존할 기존 문구' };
assert.deepEqual(clone(env.api.testDecode(env.api.testEncode(mismatched))), mismatched, 'nonidentical legacy active fields must not be dropped');
env.api.testWrite(original, 2);
assert.deepEqual(clone(env.api.testRead().data), clone(original));
assert.deepEqual(env.sheets.get('_APP_DATA').cells, legacy, 'original legacy data never overwritten');
const firstPointer = env.props.get('WORKSPACE_SNAPSHOT_V1');
const updated = clone(original); updated.setup.schoolName = '수정된 학교';
for (const phase of ['create', 'write-before', 'write-partial', 'flush', 'tamper-write', 'promote-before']) {
  const migration = storageFixture(original);
  const before = clone(migration.sheets.get('_APP_DATA').cells);
  migration.faults.phase = phase;
  assert.throws(() => migration.api.testWrite(updated, 2));
  migration.faults.phase = '';
  assert.equal(migration.props.get('WORKSPACE_SNAPSHOT_V1'), undefined);
  assert.deepEqual(clone(migration.api.testRead().data), clone(original), 'first migration failure preserves legacy final: ' + phase);
  assert.deepEqual(migration.sheets.get('_APP_DATA').cells, before);
}
for (const phase of ['create', 'write-before', 'write-partial', 'flush', 'tamper-write', 'promote-before']) {
  env.faults.phase = phase;
  assert.throws(() => env.api.testWrite(updated, 3), undefined, phase);
  env.faults.phase = '';
  assert.equal(env.props.get('WORKSPACE_SNAPSHOT_V1'), firstPointer, phase + ': no failed slot promoted');
  assert.deepEqual(clone(env.api.testRead().data), clone(original), phase + ': prior final data intact');
  assert.deepEqual(env.sheets.get('_APP_DATA').cells, legacy);
}
env.faults.phase = 'promote-after';
env.api.testWrite(updated, 3); // Unknown-result exception after a successful switch is resolved by readback.
env.faults.phase = '';
assert.deepEqual(clone(env.api.testRead().data), updated);
const secondPointer = JSON.parse(env.props.get('WORKSPACE_SNAPSHOT_V1'));
assert.equal(secondPointer.current.sheet, '_APP_DATA_V2_B');
assert.deepEqual(clone(env.api.testSnapshot(secondPointer.previous).data), clone(original), 'prior normal snapshot retained after promotion');
assert.throws(() => env.api.testWrite(original, 3), /저장 순서/, 'stale writer cannot promote');
const third = clone(updated); third.setup.schoolName = '세 번째 정상본'; env.api.testWrite(third, 4);
assert.deepEqual(clone(env.api.testRead().data), third);
const beforeFailure = env.props.get('WORKSPACE_SNAPSHOT_V1');
env.faults.phase = 'clear'; assert.throws(() => env.api.testWrite(updated, 5)); env.faults.phase = '';
assert.equal(env.props.get('WORKSPACE_SNAPSHOT_V1'), beforeFailure);
assert.deepEqual(clone(env.api.testRead().data), third);

const boundary = storageFixture();
const nearLimit = { note: 'x'.repeat(7999880) };
assert.ok(boundary.api.testEncode(nearLimit).length <= 8000000);
boundary.api.testWrite(nearLimit, 1);
assert.deepEqual(clone(boundary.api.testRead().data), nearLimit, 'near 8-million compact-character limit tested');
const boundaryPointer = boundary.props.get('WORKSPACE_SNAPSHOT_V1');
assert.throws(() => boundary.api.testWrite({ note: 'x'.repeat(8000000) }, 2), /저장 용량/);
assert.equal(boundary.props.get('WORKSPACE_SNAPSHOT_V1'), boundaryPointer);
assert.deepEqual(clone(boundary.api.testRead().data), nearLimit);

const large = workspace(25, 10, true);
const largeEnv = storageFixture(large);
const compactSize = largeEnv.api.testEncode(large).length;
assert.ok(compactSize > 7000000 && compactSize < 8000000);
largeEnv.api.testWrite(large, 2);
assert.deepEqual(clone(largeEnv.api.testRead().data), clone(large), '25 units x 10 uniquely imaged signed reviews retained');
const grow = storageFixture(); grow.faults.phase = 'grow';
assert.throws(() => grow.api.testWrite(large, 1));
grow.faults.phase = ''; assert.equal(grow.api.testRead().data, null, 'failed first migration does not activate staging data');

const unicode = storageFixture();
const formula = storageFixture();
const noteOffset = formula.api.testEncode({ note: '' }).indexOf('"note":"') + '"note":"'.length;
const formulaNote = { note: 'x'.repeat(40000 - noteOffset) + '=1+1' };
formula.api.testWrite(formulaNote, 1);
assert.ok(formula.sheets.get('_APP_DATA_V2_A').cells[2][2].startsWith('s:='));
assert.deepEqual(clone(formula.api.testRead().data), formulaNote, 'JSON fragments never become spreadsheet formulas');
const emoji = { note: '😀\n한국어'.repeat(18000) };
unicode.api.testWrite(emoji, 1);
assert.deepEqual(clone(unicode.api.testRead().data), emoji);
for (const row of unicode.sheets.get('_APP_DATA_V2_A').cells.slice(1)) assert.ok(!/[\uD800-\uDBFF]$/.test(row[2]), 'no surrogate pair split across cells');
const corrupt = JSON.parse(unicode.props.get('WORKSPACE_SNAPSHOT_V1')).current;
unicode.sheets.get(corrupt.sheet).cells[1][2] += 'tamper';
assert.throws(() => unicode.api.testRead(), /검증/, 'corrupt committed data fails closed, not empty workspace');
assert.throws(() => unicode.api.testWrite(emoji, 2), /검증/, 'corrupt final cannot be overwritten by normal saves');

const concurrency = storageFixture(original);
concurrency.cache.set('session:teacher', JSON.stringify({ email: 'teacher0', accountId: 'school-id:teacher0' }));
concurrency.faults.lockBusy = true;
assert.equal(concurrency.api.apiDispatch({ path: '/api/workspace', method: 'PUT', token: 'teacher', body: {} }).status, 503);
assert.deepEqual(clone(concurrency.api.testRead().data), clone(original));
concurrency.faults.lockBusy = false;
for (const id of ['u0', 'u1']) {
  const incoming = clone(original); incoming._clientScope = 'summary'; incoming._clientUnitId = id;
  incoming.selectionUnits.find(unit => unit.id === id).signatures['unit:' + id + ':summary:checker'] = { name: '테스트교사0', image, signedAt: '2026-10-02T01:00:00Z' };
  const result = concurrency.api.apiDispatch({ path: '/api/workspace', method: 'PUT', token: 'teacher', body: incoming });
  assert.equal(result.status, 200);
}
const final = clone(concurrency.api.testRead().data);
assert.ok(final.selectionUnits[0].signatures['unit:u0:summary:checker']);
assert.ok(final.selectionUnits[1].signatures['unit:u1:summary:checker'], 'stale other-unit snapshot does not erase earlier save');
assert.deepEqual(final.selectionUnits[2], clone(original.selectionUnits[2]), 'untouched final unit unchanged');
console.log(JSON.stringify({ result: 'r14 codec, migration, failure injection, cap boundary, Unicode and concurrent scoped-save tests passed', originalChars: JSON.stringify(original).length, compactChars: packed.length, uniqueImageLargeChars: compactSize }));
