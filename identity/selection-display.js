// Presentation only: never rewrite unit IDs, grouping, labels or saved history.
function singleUnitTargetName(unit, books) {
  if (!unit || unit.mode !== 'single') return '';
  const ids = [...new Set((unit.candidates || []).flatMap(candidate => candidate.bookIds || []))];
  if (!ids.length) return '';
  const selected = ids.map(id => books.find(book => book.id === id));
  if (selected.some(book => !book || book.subject !== unit.subject)) return '';
  const names = [...new Set(selected.map(courseName))];
  if (names.length !== 1 || !names[0]) return '';
  const compact = value => String(value || '').replace(/\s/g, '');
  const subject = compact(unit.subject), name = compact(names[0]);
  // Preserve familiar middle-school subject/volume labels and unnamed books.
  if (name === subject || name === subject + '교과서' ||
      selected.some(book => name === subject + compact(book.volume))) return '';
  return names[0];
}
function unitDisplayLabel(unit, books) {
  if (!unit) return '';
  const name = singleUnitTargetName(unit, books);
  return name ? unit.subject + ' · ' + name : unit.label || unit.subject;
}
function selectionDisplayName(data, unitId) {
  return unitDisplayLabel(qd(data, unitId), data.books || []) || data.subject;
}
