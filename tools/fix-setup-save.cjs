// One-time mechanical edit of the gzip-compressed frontend after r9.
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
  if (index < 0 || source.indexOf(before, index + 1) >= 0) throw Error(`Expected one match: ${before.slice(0, 80)}`);
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

// Keep an evaluated former committee member's review in the unit for audit.
// The active committee filter already excludes that review from current totals.
replaceOnce(
  'function JI(e,t){return uB(t).map(r=>e.reviews.find(n=>n.teacher===r.teacher)||r)}',
  'function JI(e,t){let r=uB(t).map(n=>e.reviews.find(a=>a.teacher===n.teacher)||n),i=e.reviews.filter(n=>!t.includes(n.teacher)&&fB(n));return[...r,...i]}',
);
// The new grouping key has no meaning for legacy single/volume/bundle units.
replaceOnce(
  'f={...u,subject:e,label:t,mode:r,selectionName:s,volumes:n,candidates:a,reviews:JI(u,A)}',
  'f={...u,subject:e,label:t,mode:r,...(r==="course"?{selectionName:s}:{}),volumes:n,candidates:a,reviews:JI(u,A)}',
);

const encoded = zlib.gzipSync(Buffer.from(source, 'utf8'), { level: 9, mtime: 0 }).toString('base64');
fs.writeFileSync(file, wrapper.replace(match[0], match[1] + '\n' + encoded.match(/.{1,128}/g).join('\n') + '\n' + match[3]));
console.log('Preserved evaluated reviews and legacy selection-unit shape');
