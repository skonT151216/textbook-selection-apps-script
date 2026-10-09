const assert = require('node:assert/strict');
const { workspace, fixture, personId, clone } = require('./identity-fixture.cjs');
const a = personId('kim1'), b = personId('kim2');
const fresh = fixture(null);
const initial = clone(fresh.api.testIdentity.internal(fresh.api.testIdentity.normalize(workspace(true))));
const installed = fresh.dispatch('/api/setup', 'POST', { setup: initial.setup, workspace: initial, departmentHeads: initial.departmentHeads, summaryWriters: initial.summaryWriters });
assert.equal(installed.status, 200, installed.body.error);
assert.equal(fresh.dispatch('/api/auth/login', 'POST', { loginId: 'kim2' }).body.user.name, '김교사', 'fresh installations support namesakes without a migration prerequisite');
const env = fixture();
assert.equal(env.dispatch('/api/workspace', 'GET', undefined, 'unknown').status, 401);
assert.equal(env.dispatch('/api/workspace', 'PUT', { testOnly: true }).status, 400, 'anonymous test data cannot overwrite operational records');
const login = env.dispatch('/api/auth/login', 'POST', { loginId: 'kim2' });
assert.equal(login.status, 200, login.body.error);
assert.equal(login.body.user.name, '김교사', 'school ID login still returns the real name');
const view = env.load('kim1');
assert.equal(view.setup.staff[0].name, a);
assert.equal(view.setup.staff[1].name, b);
assert.equal(view.setup.staff[0].displayName, view.setup.staff[1].displayName);
assert.deepEqual(view.setup.staff[0].subjects, ['윤리', '역사'], 'one account retains multiple councils');
const image = 'data:image/png;base64,AAAATEST';
const review = (data, id, note, img) => {
  const r = data.selectionUnits[0].reviews.find(r => r.teacher === id);
  Object.assign(r, { opinion: note, ranked: ['b00', 'b01', 'b02'], scores: { b00: { c1: 97 }, b01: { c1: 94 }, b02: { c1: 91 } }, signed: true, signature: { name: id, image: img, signedAt: '2026-10-09T07:00:00Z' } });
};
review(view, a, '첫 번째 김교사의 의견', image + '1');
assert.equal(env.save(view, 'review', a, 'kim1').status, 200);
const stale = clone(view); review(stale, b, '두 번째 김교사의 의견', image + '2');
assert.equal(env.save(stale, 'review', b, 'kim2').status, 200);
let saved = clone(env.api.testRead().data);
const first = saved.selectionUnits[0].reviews.find(r => r.teacher === a);
const second = saved.selectionUnits[0].reviews.find(r => r.teacher === b);
assert.equal(first.opinion, '첫 번째 김교사의 의견');
assert.equal(second.opinion, '두 번째 김교사의 의견');
assert.equal(first.signature.name, '김교사');
assert.equal(second.signature.name, '김교사');
assert.equal(first.signature.personId, a);
assert.equal(second.signature.personId, b);
assert.equal(first.signature.signedAccountEmail, 'kim1');
assert.equal(second.signature.signedAccountEmail, 'kim2');
assert.notEqual(first.signature.image, second.signature.image);
const forbidden = env.load('kim2'); review(forbidden, a, '다른 교사 덮어쓰기 시도', image);
assert.equal(env.save(forbidden, 'review', a, 'kim2').status, 403);
assert.deepEqual(clone(env.api.testRead().data), saved, 'denied save leaves all persisted data unchanged');
const wrongSignature = env.load('kim2'); wrongSignature.selectionUnits[0].reviews.find(r => r.teacher === b).signature.name = a;
assert.equal(env.save(wrongSignature, 'review', b, 'kim2').status, 400);
assert.deepEqual(clone(env.api.testRead().data), saved);
const fakeDisplay = env.load('kim2');
const fake = fakeDisplay.selectionUnits[0].reviews.find(r => r.teacher === b);
fake.signature.displayName = '다른사람'; fake.signature.image += 'changed'; fake.signature.signedAt = '2026-10-09T09:00:00Z';
assert.equal(env.save(fakeDisplay, 'review', b, 'kim2').status, 200);
assert.equal(env.api.testRead().data.selectionUnits[0].reviews.find(r => r.teacher === b).signature.name, '김교사', 'server never trusts a client display label as the signer name');
// Same real names occupy different form roles without changing the other signature.
for (const [scope, suffix, id, token] of [['summary', 'writer', b, 'kim2'], ['summary', 'checker', a, 'kim1'], ['recommend', 'writer', a, 'kim1']]) {
  const data = env.load(token); data.selectionUnits[0].signatures['unit:u0:' + scope + ':' + suffix] = { name: id, image: image + suffix, signedAt: '2026-10-09T08:00:00Z' };
  assert.equal(env.save(data, scope, id, token).status, 200);
}
const vice = env.load('vice'); vice.selectionUnits[0].signatures['unit:u0:recommend:approver'] = { name: '교감', image, signedAt: '2026-10-09T08:00:00Z' };
assert.equal(env.save(vice, 'recommend', '', 'vice').status, 200);
saved = clone(env.api.testRead().data);
assert.equal(saved.selectionUnits[0].signatures['unit:u0:summary:writer'].personId, b);
assert.equal(saved.selectionUnits[0].signatures['unit:u0:summary:checker'].personId, a);
assert.equal(saved.selectionUnits[0].signatures['unit:u0:recommend:approver'].name, '교감');
const repeat = env.load('kim1'); assert.equal(env.save(repeat, 'summary', a, 'kim1').status, 200);
assert.deepEqual(clone(env.api.testRead().data), saved, 'repeat save does not alter canonical state or signature audit');
const history = env.load('kim1');
const historicalReview = history.selectionUnits[1].reviews.find(r => r.teacher === a);
historicalReview.opinion = '역사 협의회에서 별도로 작성한 의견';
assert.equal(env.save(history, 'review', a, 'kim1', 'u1').status, 200);
assert.deepEqual(clone(env.api.testRead().data.selectionUnits[0]), saved.selectionUnits[0], 'same teacher in another council cannot alter the first council');
saved = clone(env.api.testRead().data);
// Editing only the school login keeps the permanent person, evaluations and signatures.
const renamed = env.load('manager'); renamed.setup.staff[1].email = 'kim-two';
const setupBody = data => ({ setup: data.setup, workspace: data, departmentHeads: data.departmentHeads, summaryWriters: data.summaryWriters });
const renamedSave = env.dispatch('/api/setup', 'POST', setupBody(renamed));
assert.equal(renamedSave.status, 200, renamedSave.body.error);
assert.equal(env.api.testRead().data.setup.staff[1].id, b);
assert.deepEqual(clone(env.api.testRead().data.selectionUnits), saved.selectionUnits, 'login edit leaves complete signed units unchanged');
assert.equal(env.dispatch('/api/auth/login', 'POST', { loginId: 'kim-two' }).body.user.name, '김교사');
const duplicateAccount = env.load('manager'); duplicateAccount.setup.staff[1].email = 'kim1';
const beforeDuplicate = clone(env.api.testRead().data);
assert.throws(() => env.dispatch('/api/setup', 'POST', setupBody(duplicateAccount)), /식별자가 달라|중복/);
assert.deepEqual(clone(env.api.testRead().data), beforeDuplicate);
const staleSetup = env.load('manager'); delete staleSetup.setup.staff[0].id;
assert.equal(env.dispatch('/api/setup', 'POST', setupBody(staleSetup)).status, 409, 'old setup client cannot guess duplicate identities');
// First migration preserves original storage and byte-exact signature content.
const old = workspace(false);
old.selectionUnits[0].reviews[0] = { ...old.selectionUnits[0].reviews[0], opinion: '기존 최종 의견', signed: true, signature: { name: '김교사', image, signedAt: '2026-01-01', signedAccountEmail: 'kim1', customHistory: { note: '서명 당시 기록' } } };
const oldFingerprint = { opinionFormat: 'criterion-narrative-v4', rank: 0, book: { id: 'b00' }, reviews: old.selectionUnits[0].reviews.map(r => ({ teacher: r.teacher, scores: r.scores, ranked: r.ranked })) };
old.selectionUnits[0].opinionSources = { 'unit:u0:recommend:b00': JSON.stringify(oldFingerprint), 'unit:u0:review:김교사': 'opaque-original-history' };
const migrated = fixture(old), legacyCells = clone(migrated.sheets.get('_APP_DATA').cells);
assert.deepEqual(clone(migrated.api.testRead().data), old, 'load alone never rewrites legacy storage');
const oldView = migrated.load('kim1');
assert.equal(oldView.selectionUnits[0].reviews[0].teacher, a);
assert.equal(migrated.save(oldView, 'review', a, 'kim1').status, 200);
const after = clone(migrated.api.testRead().data);
assert.deepEqual(after.selectionUnits[0].reviews[0].signature, { ...old.selectionUnits[0].reviews[0].signature, personId: a });
assert.deepEqual(clone(migrated.sheets.get('_APP_DATA').cells), legacyCells);
const expectedFingerprint = clone(oldFingerprint); expectedFingerprint.reviews.forEach((r, i) => r.teacher = personId(['kim1', 'kim2', 'park'][i]));
assert.deepEqual(JSON.parse(after.selectionUnits[0].opinionSources['unit:u0:recommend:b00']), expectedFingerprint, 'only fingerprint teacher references migrate, not scores or history');
assert.equal(after.selectionUnits[0].opinionSources['unit:u0:review:' + a], 'opaque-original-history');
const addNamesake = migrated.load('manager');
addNamesake.setup.staff.push({ id: 'teacher_aabbcc', name: 'teacher_aabbcc', displayName: '김교사', email: 'kim-new', subjects: ['윤리'] });
addNamesake.members.윤리.push('teacher_aabbcc');
addNamesake.selectionUnits[0].reviews.push({ teacher: 'teacher_aabbcc', ranked: [], scores: {}, opinion: '', signed: false });
const added = migrated.dispatch('/api/setup', 'POST', setupBody(addNamesake));
assert.equal(added.status, 200, added.body.error);
assert.deepEqual(clone(migrated.api.testRead().data.selectionUnits[0].reviews[0]), after.selectionUnits[0].reviews[0], 'adding a namesake never steals an existing signed review');
const testSource = env.dispatch('/api/form-test').body;
assert.ok(!JSON.stringify(testSource.members).includes('김교사'));
assert.ok(!JSON.stringify(testSource.members).includes('teacher_'), 'virtual forms use anonymous example references');
assert.doesNotThrow(() => env.api.testIdentity.normalize(testSource), 'test-only form source stays independent of real-person migration');
// Ambiguous old ownership must stop before a single storage cell changes.
const ambiguous = workspace(false); ambiguous.setup.staff[1].name = '김교사'; ambiguous.setup.staff[1].subjects.push('역사');
ambiguous.members.윤리 = ['김교사', '박교사'];
const blocked = fixture(ambiguous), before = clone(blocked.sheets.get('_APP_DATA').cells);
assert.throws(() => blocked.load('manager'), /소유자를 유일하게/);
assert.deepEqual(clone(blocked.sheets.get('_APP_DATA').cells), before);
assert.equal(blocked.props.get('WORKSPACE_SNAPSHOT_V1'), undefined);
// Removed people's historical references and exact signatures cannot attach to a namesake.
const retired = workspace(false); retired.selectionUnits[0].reviews.push({ teacher: '퇴직교사', opinion: '보존', signed: true, signature: { name: '퇴직교사', image, signedAt: '과거' } });
const normalized = clone(env.api.testIdentity.normalize(retired));
normalized.setup.staff.push({ id: 'teacher_aabbcc', name: '퇴직교사', email: 'new-person', subjects: ['윤리'] });
const normalizedAgain = clone(env.api.testIdentity.normalize(normalized));
assert.deepEqual(normalizedAgain.selectionUnits[0].reviews.at(-1), normalized.selectionUnits[0].reviews.at(-1));
assert.equal(normalizedAgain.selectionUnits[0].reviews.at(-1).legacyTeacherName, true);
const retiredCanonical = clone(after);
retiredCanonical.setup.staff = retiredCanonical.setup.staff.filter(p => p.id !== a);
for (const subject of ['윤리', '역사']) {
  retiredCanonical.members[subject] = retiredCanonical.members[subject].filter(id => id !== a);
  retiredCanonical.departmentHeads[subject] = personId('kim2');
  retiredCanonical.summaryWriters[subject] = personId('park');
}
// Keep this isolated conversion fixture's roles in valid memberships.
retiredCanonical.members.역사 = [personId('kim2'), personId('park')];
const retiredRoundTrip = clone(env.api.testIdentity.normalize(env.api.testIdentity.internal(retiredCanonical)));
assert.deepEqual(retiredRoundTrip.selectionUnits[0].reviews[0].signature, after.selectionUnits[0].reviews[0].signature, 'retired ID signatures round-trip without replacing their real name with an internal reference');
const twice = clone(env.api.testIdentity.normalize(env.api.testIdentity.internal(retiredRoundTrip)));
assert.deepEqual(twice.selectionUnits[0].reviews[0], retiredRoundTrip.selectionUnits[0].reviews[0], 'retired final remains stable across subsequent saves');
// Readable shared module and embedded server must behave identically across failures.
for (const phase of ['write-partial', 'flush', 'tamper-write', 'promote-before']) {
  const f = fixture(old); const data = f.load('kim1'); f.faults.phase = phase;
  assert.throws(() => f.save(data, 'review', a, 'kim1'));
  f.faults.phase = ''; assert.deepEqual(clone(f.api.testRead().data), old, phase + ': no partly migrated final promoted');
}
console.log('r15 distinct people, multi-council login, role signatures, cross-person denial, exact legacy preservation and failed migration tests passed');
