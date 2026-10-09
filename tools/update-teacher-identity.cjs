// Reproducible mechanical transformation of the standalone GAS distribution.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..');
const identity = fs.readFileSync(path.join(root, 'identity/teacher-identity.js'), 'utf8');
const browser = fs.readFileSync(path.join(root, 'identity/browser-identity.js'), 'utf8');
const gasFile = path.join(root, 'Code.gs');
let gas = fs.readFileSync(gasFile, 'utf8');
const open = '\n\t//#region teacher-identity-shared\n', close = '\n\t//#endregion teacher-identity-shared\n';
if (gas.includes(open)) gas = gas.slice(0, gas.indexOf(open)) + gas.slice(gas.indexOf(close) + close.length);
const anchor = '\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });';
gas = gas.replace(anchor, anchor + open + identity + close);
const file = path.join(root, 'Index.html');
const wrapper = fs.readFileSync(file, 'utf8');
const match = wrapper.match(/(<pre id="app-bundle">)([A-Za-z0-9+/=\s]+)(<\/pre>)/);
let source = zlib.gunzipSync(Buffer.from(match[2].replace(/\s/g, ''), 'base64')).toString();
function replace(before, after) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) >= 0) throw Error('Expected one match: ' + before.slice(0, 110));
  source = source.slice(0, index) + after + source.slice(index + before.length);
}
function section(name, next, transform) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('function ' + next + '(', start + 1);
  if (start < 0 || end < 0) throw Error(name + ' section missing');
  const before = source.slice(start, end);
  replace(before, transform(before));
}
if (source.includes('/* teacher-identity-browser */')) {
  const start = source.indexOf('/* teacher-identity-browser */');
  const end = source.indexOf('function dT(', start);
  source = source.slice(0, start) + '/* teacher-identity-browser */\n' + identity + '\n' + browser + '\n' + source.slice(end);
  source = source.replace('function HI(e,t,r,n=[],a=[]){return identityImport(e,t,r,n,a)}function fZ(', 'function HI(e,t,r,n=[],a=[]){return identityImport(e,t,r,n,a)}async function fZ(');
} else {
replace('function dT(', '/* teacher-identity-browser */\n' + identity + '\n' + browser + '\nfunction dT(');
section('HI', 'fZ', () => 'function HI(e,t,r,n=[],a=[]){return identityImport(e,t,r,n,a)}async ');
section('tL', 'BZ', value => {
  const edits = [
    ['if(f.staff.some(Pe=>Pe.name===De)){', 'if(false){'],
    ['let At=Object.fromEntries(Object.entries(g).map(([Pe,We])=>[Pe,st.includes(Pe)?[...We,De]:We]));', 'let staffKey=TeacherIdentity.newId();let At=Object.fromEntries(Object.entries(g).map(([Pe,We])=>[Pe,st.includes(Pe)?[...We,staffKey]:We]));'],
    ['staff:[...Pe.staff,{name:De,email:He,subjects:st}]', 'staff:[...Pe.staff,{id:staffKey,name:staffKey,displayName:De,email:He,subjects:st}]'],
    ['st.name!==f.managerName.trim()', 'TeacherIdentity.realName(st)!==f.managerName.trim()'],
    ['st.name!==f.vicePrincipalName.trim()', 'TeacherIdentity.realName(st)!==f.vicePrincipalName.trim()'],
    ['return(0,w.jsxs)("div",{className:"setup-page ', 'teacherDirectory=f.staff;teacherHistoricalNames=e.identityNames||{};return(0,w.jsxs)("div",{className:"setup-page '],
  ];
  for (const [before, after] of edits) { if (!value.includes(before)) throw Error('Setup edit missing: ' + before); value = value.replace(before, after); }
  return value;
});
replace('function Fb(e){let t=BZ,', 'function Fb(e){e=TeacherIdentity.internal(TeacherIdentity.normalize(e));teacherDirectory=e.setup?.staff||[];teacherHistoricalNames=e.identityNames||{};let t=BZ,');
// Staff templates use actual names, never the hidden identity references.
replace('...e.map(a=>[a.name,a.subjects.join(" \\xB7 "),a.email])', '...e.map(a=>[TeacherIdentity.realName(a),a.subjects.join(" \\xB7 "),a.email])');
}
// Browser setupIdentity compares references, while login and signer inputs stay real.
source = source.replace(/if\(false\)\{be\("[^"\n]*"\),G\(""\);return\}/, '');
source = source.replace('value:m,readOnly:n,onChange:ce=>g(ce.target.value)', 'value:teacherName(m),readOnly:n,onChange:ce=>g(ce.target.value===teacherName(t)?t:ce.target.value)');
// PDF capture must not inherit the operator's position after signing at the
// bottom of a page. Its print-width layout changes the original scroll bounds.
source = source.replace('scale:1.8,backgroundColor:"#fff",windowWidth:', 'scale:1.8,backgroundColor:"#fff",scrollX:0,scrollY:0,windowWidth:');
const help = new Map([
  ['이름 · 교과 · 계정 형식의 학교 명단을 올려 주세요. 새 교사는 해당 교과협의회에 등록되고, 기존 교사는 아이디만 갱신됩니다. 협의회에 없는 교과의 직원은 제외합니다.', '이름 · 교과 · 계정 형식의 학교 명단을 올려 주세요. 같은 학교 아이디는 한 교사로 연결하고 여러 협의회를 합칩니다. 이름이 같아도 아이디가 다르면 별도 교사로 등록합니다. 기존 아이디 변경은 아래 교직원 목록에서 수정하세요.'],
  ['최대 2MB · 첫 번째 시트 · 이름 / 교과 / 계정 · 새 교사는 교과 필수(기존 교사 아이디 변경은 교과 없는 양식도 가능) · 원본 파일은 서버에 보관하지 않습니다.', '최대 2MB · 첫 번째 시트 · 이름 / 교과 / 계정 · 새 교사는 교과 필수 · 같은 이름의 교사는 서로 다른 학교 아이디 사용 · 원본 파일은 서버에 보관하지 않습니다.'],
]);
for (const [before, after] of help) {
  const literal = JSON.stringify(before).replace(/[\u0080-\uffff]/g, ch => ch === '·' ? '\\xB7' : '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase());
  const next = JSON.stringify(after);
  if (!source.includes(literal) && !source.includes(next)) throw Error('Roster help anchor missing');
  source = source.split(literal).join(next);
}
if (!source.includes('id="teacher-identity-print"')) source = source.replace('</head>', '<style id="teacher-identity-print">@media print{#print-area .table-wrap table{table-layout:fixed;min-width:0;width:100%}#print-area .table-wrap th,#print-area .table-wrap td{overflow-wrap:anywhere;padding:5px 3px;font-size:10pt}}</style>\n</head>');
for (const script of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new (require('node:vm').Script)(script[1]);
new (require('node:vm').Script)(gas);
const packed = zlib.gzipSync(Buffer.from(source), { level: 9, mtime: 0 }).toString('base64');
fs.writeFileSync(gasFile, gas);
fs.writeFileSync(file, wrapper.replace(match[0], match[1] + '\n' + packed.match(/.{1,128}/g).join('\n') + '\n' + match[3]));
console.log('Embedded shared person identity, account-keyed import and real-name rendering');
