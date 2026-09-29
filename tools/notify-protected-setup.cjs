// One-time mechanical edit of the gzip-compressed setup frontend.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const file = path.join(__dirname, '..', 'Index.html');
const wrapper = fs.readFileSync(file, 'utf8');
const match = wrapper.match(/(<pre id="app-bundle">)([A-Za-z0-9+/=\s]+)(<\/pre>)/);
if (!match) throw Error('App bundle not found');
let source = zlib.gunzipSync(Buffer.from(match[2].replace(/\s/g, ''), 'base64')).toString('utf8');

const before = 'ne(Date.now()),r(At)}catch(De)';
const after = 'ne(Date.now()),st.preservedSubjects&&st.preservedSubjects.length&&window.alert("설정은 저장했습니다. 평가 기록을 보호하기 위해 "+st.preservedSubjects.join(", ")+" 교과의 기존 도서·선정 방식·후보 구성은 변경하지 않았습니다. 해당 교과의 변경 사항은 저장된 설정을 다시 확인해 주세요."),r(At)}catch(De)';
const index = source.indexOf(before);
if (index < 0 || source.indexOf(before, index + 1) >= 0) throw Error('Expected one setup-save success handler');
source = source.slice(0, index) + after + source.slice(index + before.length);

const encoded = zlib.gzipSync(Buffer.from(source, 'utf8'), { level: 9, mtime: 0 }).toString('base64');
fs.writeFileSync(file, wrapper.replace(match[0], match[1] + '\n' + encoded.match(/.{1,128}/g).join('\n') + '\n' + match[3]));
console.log('Added protected-subject save notice');
