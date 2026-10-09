// The legacy UI continues to compare string references, now opaque person IDs.
// Only rendered names are translated; select values, keys and save payloads keep
// IDs. This covers interactive forms, static/batch sheets and PDF clones alike.
var teacherDirectory = [];
var teacherHistoricalNames = {};
function teacherName(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/teacher_[0-9a-f]+/g, key => {
    const person = teacherDirectory.find(item => (item.id || item.name) === key);
    return person ? TeacherIdentity.realName(person) : teacherHistoricalNames[key] || key;
  });
}
function teacherLabel(value) {
  const person = teacherDirectory.find(item => (item.id || item.name) === value);
  if (!person) return teacherName(value);
  const name = TeacherIdentity.realName(person);
  const matches = teacherDirectory.filter(item => TeacherIdentity.realName(item) === name);
  return matches.length < 2 ? name : name + ' · ' + (person.subjects || []).join('/') + ' · 등록 ' + (matches.indexOf(person) + 1);
}
function teacherRenderProps(type, props) {
  if (!props) return props;
  const label = type === 'option' || type === 'button' || props.role === 'option';
  const names = value => typeof value === 'string' ? label && /^teacher_[0-9a-f]+$/.test(value) ? teacherLabel(value) : teacherName(value) : Array.isArray(value) ? value.map(names) : value;
  const result = { ...props };
  // HTML otherwise derives an option's value from its translated text. Preserve
  // the reference explicitly before replacing only the visible label.
  if (type === 'option' && result.value === undefined && typeof result.children === 'string' && /^teacher_[0-9a-f]+$/.test(result.children)) result.value = result.children;
  if ('children' in result) result.children = names(result.children);
  for (const key of ['title', 'aria-label', 'alt']) if (typeof result[key] === 'string') result[key] = teacherName(result[key]);
  return result;
}
var teacherOriginalJsx = w.jsx, teacherOriginalJsxs = w.jsxs;
w = { ...w, jsx: (type, props, key) => teacherOriginalJsx(type, teacherRenderProps(type, props), key), jsxs: (type, props, key) => teacherOriginalJsxs(type, teacherRenderProps(type, props), key) };

function identityImport(rows, staff, domain, formulaRows = [], subjects = []) {
  const headers = (rows[0] || []).map(RI);
  const columns = names => headers.flatMap((value, index) => names.includes(value) ? [index] : []);
  const names = columns(DI), accounts = columns(MI), courses = columns(jI);
  if (names.length !== 1 || accounts.length !== 1 || courses.length > 1) return { rows: [], errors: ['첫 행을 이름 / 교과 / 계정으로 작성해 주세요. 이름과 계정 열은 각각 하나씩 필요합니다.'], staff };
  if (rows.length > 1001) return { rows: [], errors: ['한 번에 1,000명까지 등록할 수 있습니다.'], staff };
  const allowed = new Set(subjects.length ? subjects : staff.flatMap(person => person.subjects));
  const merged = staff.map(person => ({ ...person, subjects: [...person.subjects] }));
  const results = [], errors = [];
  rows.slice(1).forEach((row, index) => {
    if (row.every(value => !Kg(value).trim())) return;
    const name = Kg(row[names[0]]).trim();
    const email = fA(row[accounts[0]]);
    const course = courses.length ? Kg(row[courses[0]]).trim() : '';
    const requested = [...new Set(course.split(/[,·/]/).map(value => value.trim()).filter(Boolean))];
    const person = merged.find(item => fA(item.email) === email);
    let error = formulaRows.includes(index + 2) ? '수식 대신 성명과 학교 아이디를 값으로 입력해 주세요.' : !name ? '이름이 비어 있습니다.' : !ig(email, domain) ? '유효한 학교 아이디를 입력해 주세요.' : person && TeacherIdentity.realName(person) !== name ? '같은 학교 아이디에 다른 이름이 연결돼 있습니다. 기존 연결을 확인해 주세요.' : !person && !requested.length ? '새 교사의 교과를 입력해 주세요.' : '';
    const valid = requested.filter(value => allowed.has(value));
    if (!error && person && requested.some(value => !allowed.has(value))) error = '등록되지 않은 교과가 있습니다. 교과명을 확인해 주세요.';
    const skipped = !person && requested.some(value => !allowed.has(value));
    const key = person ? person.id || person.name : TeacherIdentity.newId();
    results.push({ row: index + 2, name, email, subject: course, previousEmail: person && person.email || '', error, skipped, personKey: key });
    if (error || skipped) return;
    if (person) person.subjects = [...new Set([...person.subjects, ...valid])];
    else merged.push({ id: key, name: key, displayName: name, email, subjects: valid });
  });
  if (!results.length) errors.push('등록할 교사가 없습니다.');
  if (results.length && !results.some(row => !row.skipped)) errors.push('등록할 협의회의 교사가 없습니다.');
  if (results.some(row => row.error)) errors.push('표시된 오류를 수정한 파일을 다시 올려 주세요. 아직 적용되지 않았습니다.');
  return { rows: results, errors, staff: errors.length ? staff : merged };
}
