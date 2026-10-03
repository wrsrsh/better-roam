import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('unrelated head mutations do not rescan or rewrite theme styles', () => {
  let observer, scans = 0, writes = 0, observers = 0;
  const styles = new Map();
  const style = {id: '', disabled: false, isConnected: false};
  const document = {
    readyState: 'complete',
    getElementById: id => styles.get(id),
    createElement: () => style,
    head: {
      appendChild(node) { writes++; node.isConnected = true; styles.set(node.id, node); },
      querySelectorAll() { scans++; return []; },
    },
  };
  const window = {addEventListener() {}}; window.top = window;
  const context = vm.createContext({window, document,
    location: {origin: 'https://roamresearch.com', hash: '#/app/test'},
    MutationObserver: class {constructor(callback) {observer = callback; observers++;} observe() {}},
  });
  const code = source('../extension/runtime/theme-template.js').replace('__THEME_CSS__', '"body {}"');
  vm.runInContext(code, context);
  assert.equal(scans, 1); assert.equal(writes, 1);
  for (let i = 0; i < 1000; i++) observer([{addedNodes: [{matches: () => false}], removedNodes: []}]);
  assert.equal(scans, 1); assert.equal(writes, 1);
  observer([{addedNodes: [{matches: () => true}], removedNodes: []}]);
  assert.equal(scans, 2);
  style.isConnected = false;
  observer([{addedNodes: [], removedNodes: [style]}]);
  assert.equal(writes, 2);
  vm.runInContext(code, context);
  assert.equal(observers, 1); assert.equal(writes, 2);
});

test('repeated controls injection installs no additional event handlers', () => {
  const window = {__betterRoamAction() {}, addEventListener() {throw Error('duplicate handler');}};
  window.top = window;
  vm.runInNewContext(source('../extension/runtime/controls.js'), {
    window, location: {origin: 'https://roamresearch.com'},
  });
});
