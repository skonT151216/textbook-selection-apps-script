// Shared by the Apps Script server and its embedded browser application.
// IDs are references, not authentication credentials. Existing school IDs remain
// the only login input. Never infer ownership merely from a duplicated name.
var TeacherIdentity = (function () {
  const clone = value => JSON.parse(JSON.stringify(value));
  const login = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const id = value => 'teacher_' + Array.from(login(value), ch => ch.codePointAt(0).toString(16).padStart(6, '0')).join('');
  const newId = () => 'teacher_' + (typeof crypto.randomUUID === 'function' ? crypto.randomUUID().replace(/-/g, '') : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''));
  const unique = values => [...new Set(values)];
  const realName = person => person.displayName !== undefined ? person.displayName : person.name;
  function fail(message) { throw new Error('교사 연결 확인 필요: ' + message + ' 기존 저장 자료는 변경하지 않았습니다.'); }
  function normalize(input, previous) {
    if (!input || input.testOnly || !input.setup || !Array.isArray(input.setup.staff)) return input && clone(input);
    const state = clone(input);
    const before = previous && previous.setup && previous.setup.staff || [];
    const staff = state.setup.staff.map(person => {
      const email = login(person.email);
      const prior = before.find(item => login(item.email) === email);
      if (prior && prior.id && person.id && prior.id !== person.id) fail('같은 학교 아이디의 내부 식별자가 달라졌습니다. 새로고침해 주세요.');
      const key = person.id || prior && prior.id || id(email);
      const name = realName(person);
      if (typeof key !== 'string' || !/^teacher_[0-9a-f]+$/.test(key)) fail('교직원의 내부 식별자가 올바르지 않습니다. 새로고침해 주세요.');
      if (!email || !name || name === key) fail('교직원의 성명과 학교 아이디를 확인해 주세요.');
      const result = { ...person, id: key, name, email, subjects: unique(person.subjects || []) };
      delete result.displayName;
      return result;
    });
    if (new Set(staff.map(p => p.id)).size !== staff.length || new Set(staff.map(p => p.email)).size !== staff.length) fail('학교 아이디 또는 내부 식별자가 중복되었습니다.');
    const byId = new Map(staff.map(person => [person.id, person]));
    const matches = (name, subject) => staff.filter(person => person.name === name && (!subject || person.subjects.includes(subject)));
    function resolve(value, subject, allowed, signature, historical = false) {
      if (!value) return value;
      if (byId.has(value)) return value;
      let candidates = matches(value, subject);
      if (!candidates.length) candidates = matches(value);
      if (allowed) candidates = candidates.filter(person => allowed.includes(person.id));
      if (signature && candidates.length > 1) {
        const account = login(signature.signedAccountEmail || String(signature.signedAccountId || '').replace(/^school-id:/, ''));
        const identified = candidates.filter(person => person.id === signature.personId || person.email === account);
        if (identified.length === 1) candidates = identified;
      }
      if (candidates.length === 1) return candidates[0].id;
      if (!candidates.length && historical) return value; // Retired/unregistered historical author: preserve, never reassign.
      fail((subject ? subject + '의 ' : '') + '“' + value + '” 기록의 소유자를 유일하게 확인할 수 없습니다.');
    }
    state.setup.staff = staff;
    state.identityNames = { ...(previous && previous.identityNames || {}), ...(state.identityNames || {}), ...Object.fromEntries(staff.map(person => [person.id, person.name])) };
    const members = Object.fromEntries(Object.entries(state.members || {}).map(([subject, values]) => [subject, unique(values.map(value => resolve(value, subject)))]));
    state.members = members;
    for (const field of ['departmentHeads', 'summaryWriters']) {
      state[field] = Object.fromEntries(Object.entries(state[field] || {}).map(([subject, value]) => [subject, resolve(value, subject, members[subject])]));
    }
    function signature(record, expected, preserveOnly = false, previousRecord) {
      if (!record || typeof record !== 'object') return record;
      const next = { ...record };
      if (byId.has(next.name) || next.personId === next.name && state.identityNames[next.name]) {
        next.personId = next.name;
        // An internal display label is not evidence of the signer's real name.
        // Keep a proven unchanged signature's original name; new signatures use
        // the registered name, never a client-supplied displayName.
        const unchanged = previousRecord && previousRecord.personId === next.personId && previousRecord.image === next.image && previousRecord.signedAt === next.signedAt;
        next.name = unchanged ? previousRecord.name : state.identityNames[next.personId];
      } else if (!preserveOnly && !next.personId) {
        const candidates = matches(next.name);
        const audit = login(next.signedAccountEmail || String(next.signedAccountId || '').replace(/^school-id:/, ''));
        const identified = candidates.filter(person => person.email === audit);
        if (identified.length === 1) next.personId = identified[0].id;
        else if (candidates.length === 1) next.personId = candidates[0].id;
        else if (candidates.length > 1 && expected) fail('“' + next.name + '”의 기존 서명자를 확인할 수 없습니다.');
      }
      delete next.displayName;
      return next;
    }
    function scope(unit, subject, unitId, previousUnit) {
      const mappings = new Map();
      if (Array.isArray(unit.reviews)) unit.reviews = unit.reviews.map(review => {
        const key = review.legacyTeacherName ? review.teacher : resolve(review.teacher, subject, undefined, review.signature, true);
        const historical = !byId.has(key);
        mappings.set(review.teacher, key);
        const earlier = previousUnit && (previousUnit.reviews || []).find(item => item.teacher === key || item.teacher === review.teacher);
        return { ...review, teacher: key, ...(historical ? { legacyTeacherName: true } : {}), ...(review.signature ? { signature: signature(review.signature, key, historical, earlier && earlier.signature) } : {}) };
      });
      if (unit.signatures) unit.signatures = Object.fromEntries(Object.entries(unit.signatures).map(([key, record]) => {
        const expected = key.endsWith('summary:writer') ? state.summaryWriters[subject] : key.endsWith('summary:checker') || key.endsWith('recommend:writer') ? state.departmentHeads[subject] : undefined;
        return [key, signature(record, expected, key.endsWith('recommend:approver'), previousUnit && previousUnit.signatures && previousUnit.signatures[key])];
      }));
      if (unit.opinionSources) unit.opinionSources = Object.fromEntries(Object.entries(unit.opinionSources).map(([key, value]) => {
        // Generated recommendation fingerprints contain teacher references too.
        // Migrate only those references so an identity-only update does not look
        // like a changed evaluator. Leave all other history and opaque values intact.
        if (typeof value === 'string') {
          try {
            const fingerprint = JSON.parse(value);
            if (fingerprint && fingerprint.opinionFormat === 'criterion-narrative-v4' && Array.isArray(fingerprint.reviews)) {
              let changed = false;
              fingerprint.reviews = fingerprint.reviews.map(review => {
                const next = review && mappings.get(review.teacher);
                if (!next || next === review.teacher) return review;
                changed = true; return { ...review, teacher: next };
              });
              if (changed) value = JSON.stringify(fingerprint);
            }
          } catch { /* Unknown historical formats are preserved byte-for-byte. */ }
        }
        for (const [old, next] of mappings) {
          if (key === 'unit:' + unitId + ':review:' + old) return ['unit:' + unitId + ':review:' + next, value];
          if (key === 'review:' + subject + ':' + old) return ['review:' + subject + ':' + next, value];
        }
        return [key, value];
      }));
    }
    // Preserve any nonidentical active aliases: normalize each separately.
    scope(state, state.subject, state.activeUnitId, previous);
    for (const unit of state.selectionUnits || []) scope(unit, unit.subject, unit.id, previous && (previous.selectionUnits || []).find(item => item.id === unit.id));
    if (state._clientTeacher) state._clientTeacher = resolve(state._clientTeacher, (state.selectionUnits || []).find(u => u.id === state._clientUnitId)?.subject || state.subject, undefined, undefined, true);
    state.identityVersion = 1;
    delete state.internalIdentityView;
    return state;
  }
  function internal(input) {
    if (!input || input.testOnly || !input.setup || !Array.isArray(input.setup.staff)) return input && clone(input);
    const state = clone(input);
    const staff = state.setup.staff;
    function signature(record) {
      if (!record || !record.personId) return record;
      return { ...record, name: record.personId, displayName: record.name };
    }
    function scope(value) {
      if (Array.isArray(value.reviews)) value.reviews = value.reviews.map(review => ({ ...review, ...(review.signature ? { signature: signature(review.signature) } : {}) }));
      if (value.signatures) value.signatures = Object.fromEntries(Object.entries(value.signatures).map(([key, record]) => [key, signature(record)]));
    }
    scope(state);
    for (const unit of state.selectionUnits || []) scope(unit);
    state.setup.staff = staff.map(person => ({ ...person, name: person.id, displayName: person.name }));
    state.internalIdentityView = true;
    return state;
  }
  return { id, newId, login, realName, normalize, internal };
})();
