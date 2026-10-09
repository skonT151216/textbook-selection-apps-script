const { storageFixture, clone } = require('./storage-fixture.cjs');
const personId = account => 'teacher_' + [...account].map(ch => ch.codePointAt(0).toString(16).padStart(6, '0')).join('');
function workspace(duplicate = false) {
  const staff = [
    { name: '김교사', email: 'kim1', subjects: ['윤리', '역사'] },
    { name: duplicate ? '김교사' : '이교사', email: 'kim2', subjects: ['윤리'] },
    { name: '박교사', email: 'park', subjects: ['윤리', '역사'] },
  ];
  const refs = staff.map(p => duplicate ? personId(p.email) : p.name);
  if (duplicate) staff.forEach(p => { p.id = personId(p.email); });
  const books = ['윤리', '역사'].flatMap((subject, i) => [0, 1, 2].map(j => ({ id: 'b' + i + j, subject, volume: '3', title: i ? '세계사' : '현대사회와 윤리', selectionName: i ? '세계사' : '현대사회와 윤리', publisher: ['가출판', '나출판', '다출판'][j], author: '저자' + j, price: 10000 + j * 1000 })));
  const members = { 윤리: refs, 역사: [refs[0], refs[2]] };
  const units = ['윤리', '역사'].map((subject, i) => ({
    id: 'u' + i, subject, label: subject + ' · ' + (i ? '세계사' : '현대사회와 윤리'), mode: 'course', selectionName: i ? '세계사' : '현대사회와 윤리', volumes: ['3'], status: 'active',
    candidates: books.filter(b => b.subject === subject).map(b => ({ id: b.id, label: b.publisher, bookIds: [b.id] })),
    criteria: [{ id: 'c1', area: '1. 교육과정 부합성', text: '교육과정에 부합하는가?', max: 90 }, { id: 'required-price', area: '17. 교과용도서의 가격', text: '해당 교과용도서의 내용, 구성, 품질 등을 고려하였을 때 적정한 가격인가?', max: 10 }], topScore: 97, gap: 3,
    reviews: members[subject].map(teacher => ({ teacher, ranked: [], scores: {}, opinion: '', signed: false })),
    recommendations: {}, signatures: {}, opinionSources: {},
  }));
  return { setup: { schoolName: '동명이인검증고등학교', schoolYear: 2027, managerName: '담당자', managerEmail: 'manager', vicePrincipalName: '교감', vicePrincipalEmail: 'vice', googleDomain: 'school-id', completedAt: '2026-10-09', showSelectionNameOnEvaluation: true, staff },
    books, members, departmentHeads: { 윤리: refs[0], 역사: refs[0] }, summaryWriters: { 윤리: refs[1], 역사: refs[2] }, selectionUnits: units, activeUnitId: 'u0',
    ...Object.fromEntries(['subject', 'criteria', 'reviews', 'topScore', 'gap', 'recommendations', 'signatures', 'opinionSources'].map(k => [k, clone(units[0][k])])), ...(duplicate ? { identityVersion: 1 } : {}) };
}
function fixture(data = workspace(true)) {
  const env = storageFixture(data);
  for (const email of ['manager', 'vice', 'kim1', 'kim2', 'park']) env.cache.set('session:' + email, JSON.stringify({ email, accountId: 'school-id:' + email }));
  env.dispatch = (path, method = 'GET', body, token = 'manager') => clone(env.api.apiDispatch({ path, method, body, token }));
  env.load = token => env.dispatch('/api/workspace', 'GET', undefined, token).body;
  env.save = (data, scope, teacher, token = 'manager', unit = 'u0') => env.dispatch('/api/workspace', 'PUT', { ...data, _clientScope: scope, _clientTeacher: teacher, _clientUnitId: unit }, token);
  return env;
}
module.exports = { workspace, fixture, personId, clone };
