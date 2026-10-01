// Mechanical edit of the embedded frontend: key order is not an opinion edit.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const file = path.join(__dirname, '..', 'Index.html');
const wrapper = fs.readFileSync(file, 'utf8');
const match = wrapper.match(/(<pre id="app-bundle">)([A-Za-z0-9+/=\s]+)(<\/pre>)/);
if (!match) throw Error('App bundle not found');
let source = zlib.gunzipSync(Buffer.from(match[2].replace(/\s/g, ''), 'base64')).toString('utf8');
function replaceOnce(before, after) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) >= 0) throw Error(`Expected one match: ${before}`);
  source = source.slice(0, index) + after + source.slice(index + before.length);
}
replaceOnce('x=!!v&&JSON.stringify(v.recommendations||{})!==JSON.stringify(e.recommendations||{})', 'x=!!v&&!b1(v.recommendations||{},e.recommendations||{})');
replaceOnce('JSON.stringify(M)!==JSON.stringify(e.recommendations)&&(delete P[A],delete P[o])', '!b1(M,e.recommendations)&&(delete P[A],delete P[o])');
const encoded = zlib.gzipSync(Buffer.from(source, 'utf8'), { level: 9, mtime: 0 }).toString('base64');
fs.writeFileSync(file, wrapper.replace(match[0], match[1] + '\n' + encoded.match(/.{1,128}/g).join('\n') + '\n' + match[3]));
console.log('Recommendation signatures now ignore object key order');
