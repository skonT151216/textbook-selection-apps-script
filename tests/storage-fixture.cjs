const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const clone = value => JSON.parse(JSON.stringify(value));

function storageFixture(data = null, revision = data ? 1 : 0) {
  const sheets = new Map();
  const props = new Map([['BOOTSTRAP_MANAGER_ID', 'manager'], ['DATABASE_SPREADSHEET_ID', 'test-sheet'], ['SCHOOL_NAME', '테스트학교']]);
  const faults = { phase: '', lockBusy: false };
  const events = [];
  function fail(phase) { events.push(phase); if (faults.phase === phase) throw Error('Injected failure: ' + phase); }
  class Sheet {
    constructor(name) { this.name = name; this.cells = []; this.maxRows = 100; }
    hideSheet() { return this; }
    getLastRow() { for (let i = this.cells.length - 1; i >= 0; i--) if (this.cells[i]?.some(value => value !== '' && value !== undefined)) return i + 1; return 0; }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(after, count) { fail('grow'); this.maxRows += count; return this; }
    getRange(row, column, height, width) {
      const sheet = this;
      return {
        setNumberFormat(format) { if (format !== '@') throw Error('Expected text format'); return this; },
        getValues() { return Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => sheet.cells[row - 1 + r]?.[column - 1 + c] ?? '')); },
        clearContent() { fail('clear'); for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (sheet.cells[row - 1 + r]) sheet.cells[row - 1 + r][column - 1 + c] = ''; return this; },
        setValues(values) {
          fail('write-before');
          if (row + height - 1 > sheet.maxRows) throw Error('Range exceeds rows');
          for (let r = 0; r < height; r++) {
            if (!sheet.cells[row - 1 + r]) sheet.cells[row - 1 + r] = [];
            for (let c = 0; c < width; c++) sheet.cells[row - 1 + r][column - 1 + c] = values[r][c];
            if (r === 0 && faults.phase === 'write-partial') throw Error('Injected partial write');
          }
          if (faults.phase === 'tamper-write' && height > 1) sheet.cells[row][column + 1] += 'broken';
          return this;
        },
      };
    }
  }
  const book = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet(name) { fail('create'); const sheet = new Sheet(name); sheets.set(name, sheet); return sheet; },
  };
  const properties = {
    getProperty: name => props.get(name) ?? null,
    setProperty(name, value) { fail('promote-before'); props.set(name, value); fail('promote-after'); return this; },
  };
  if (data) {
    const legacy = new Sheet('_APP_DATA');
    const value = JSON.stringify(data);
    legacy.cells = [['type', 'index', 'content', 'revision']];
    for (let i = 0; i < value.length; i += 40000) legacy.cells.push(['workspace', i / 40000, value.slice(i, i + 40000), revision]);
    legacy.maxRows = Math.max(100, legacy.cells.length);
    sheets.set('_APP_DATA', legacy);
  }
  const cache = new Map();
  const context = {
    PropertiesService: { getScriptProperties: () => properties },
    SpreadsheetApp: { openById: () => book, flush: () => fail('flush') },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => [...crypto.createHash(algorithm).update(value, 'utf8').digest()],
      base64Encode: value => Buffer.from(value).toString('base64'),
      getUuid: () => crypto.randomUUID(),
    },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) ?? null, put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => !faults.lockBusy, releaseLock: () => events.push('unlock') }) },
  };
  let code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  code = code.replace('exports.apiDispatch = apiDispatch;', 'exports.testEncode=encodedWorkspace;exports.testDecode=decodedWorkspace;exports.testRead=readWorkspaceRecord;exports.testWrite=writeWorkspaceRecord;exports.testSnapshot=readSnapshot;exports.testSave=saveWorkspace;exports.testSource=formTestSource;exports.apiDispatch = apiDispatch;');
  vm.createContext(context); vm.runInContext(code, context);
  return { api: context.TextbookSelectionGas, sheets, props, faults, events, cache, clone };
}
module.exports = { storageFixture, clone };
