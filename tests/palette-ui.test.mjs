import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {installPalette} from '../extension/runtime/palette.js';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture() {
  const dom = new JSDOM('<button id="editor">Editor</button>', {url:'https://roamresearch.com/#/app/test',runScripts:'outside-only'});
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function(){this.open=true;};
  w.HTMLDialogElement.prototype.close = function(){this.open=false;};
  const calls=[];
  w.roamAlphaAPI={graph:{name:'test'},data:{async:{search:async()=>[
    {':block/uid':'p',':node/title':'<img src=x onerror=alert(1)>'},
    {':block/uid':'b',':block/string':'A matching block'},
  ]}},ui:{mainWindow:{openPage:async value=>calls.push(['page',value]),openBlock:async value=>calls.push(['block',value])},rightSidebar:{addWindow:async value=>calls.push(['sidebar',value])}}};
  w.__betterRoamAction=(...args)=>calls.push(args);
  // Evaluate the UI in its own DOM; inject the imported search helpers through
  // a wrapper to keep tests isolated from node's globals.
  return {dom,w,calls};
}
import {parseSearch} from '../extension/runtime/advanced-search.js';
import {createSearchSession,searchGraph} from '../extension/runtime/palette-search.js';
function mount(x) {
  x.w.createSearchSession=createSearchSession;
  x.w.searchGraph=searchGraph;
  x.w.parseSearch=parseSearch;
  x.w.eval(`(${installPalette.toString()})()`);
  x.w.document.getElementById('editor').focus();
  x.w.__betterRoamPalette();
  return x.w.document.querySelector('#better-roam-palette input');
}
test('palette opens without graph reads, renders text safely and opens selected results', async () => {
  const x=fixture();let searches=0;const original=x.w.roamAlphaAPI.data.async.search;
  x.w.roamAlphaAPI.data.async.search=async(...args)=>{searches++;return original(...args);};
  const input=mount(x);x.w.__betterRoamPalette();assert.equal(x.w.document.querySelectorAll('dialog').length,1);assert.equal(searches,0);assert.equal(x.w.document.activeElement,input);
  input.value='matching';input.dispatchEvent(new x.w.Event('input'));await wait(170);
  assert.equal(searches,1);assert.equal(x.w.document.querySelector('#br-palette-results img'),null);
  assert.ok(x.w.document.getElementById('br-palette-results').textContent.includes('<img'));
  input.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  input.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));await wait(0);
  assert.deepEqual(x.calls.map(c=>c[0]),['sidebar']);assert.equal(x.w.document.getElementById('better-roam-palette'),null);
  x.dom.window.close();
});
test('Enter on a page result opens it at the end of the page', async () => {
  const x=fixture();const input=mount(x);
  input.value='matching';input.dispatchEvent(new x.w.Event('input'));await wait(170);
  input.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(0);
  assert.deepEqual(x.calls,[['open-page','p']]);assert.equal(x.w.document.getElementById('better-roam-palette'),null);
  x.dom.window.close();
});
test('palette creation is explicit and Escape restores focus', async () => {
  const x=fixture();x.w.roamAlphaAPI.data.async.search=async()=>[];
  const input=mount(x);input.value='New test page';input.dispatchEvent(new x.w.Event('input'));await wait(170);
  assert.match(x.w.document.getElementById('br-palette-results').textContent,/Create “New test page”/);
  assert.equal(x.calls.length,0);
  input.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(0);
  assert.deepEqual(x.calls[0],['create-page','New test page']);
  x.w.document.getElementById('editor').focus();
  x.w.__betterRoamPalette();x.w.document.querySelector('dialog').dispatchEvent(new x.w.Event('cancel',{cancelable:true}));
  assert.equal(x.w.document.querySelector('dialog'),null);assert.equal(x.w.document.activeElement.id,'editor');
  x.dom.window.close();
});
test('create-page opens an existing exact title without creating another page', async () => {
  const x=fixture();const api=x.w.roamAlphaAPI;
  api.util={generateUID(){throw Error('must not create');}};
  api.data.async.pull=async(pattern,lookup)=>{assert.deepEqual(Array.from(lookup),[':node/title','Existing']);return {':block/uid':'existing'};};
  delete x.w.__betterRoamAction;
  x.w.eval(readFileSync(new URL('../extension/runtime/controls.js',import.meta.url),'utf8'));
  await x.w.__betterRoamAction('create-page','Existing');
  assert.equal(x.calls[0][1].page.uid,'existing');
  x.dom.window.close();
});
test('new page creates exactly one empty block then opens the page', async () => {
  const x=fixture();const api=x.w.roamAlphaAPI;let sequence=0;
  api.util={generateUID:()=>`uid-${++sequence}`};
  api.data.async.pull=async()=>null;
  api.data.page={create:async value=>x.calls.push(['create-page',value])};
  api.data.block={create:async value=>x.calls.push(['create-block',value])};
  delete x.w.__betterRoamAction;
  x.w.eval(readFileSync(new URL('../extension/runtime/controls.js',import.meta.url),'utf8'));
  await x.w.__betterRoamAction('create-page','New page');
  assert.deepEqual(x.calls.map(c=>c[0]),['create-page','create-block','page']);
  assert.equal(x.calls[1][1].location['parent-uid'],'uid-1');
  assert.equal(x.calls[1][1].block.string,'');
  assert.equal(x.calls[2][1].page.uid,'uid-1');
  x.dom.window.close();
});
test('native actions dispatch inside Roam when focus is outside its React root', () => {
  const x=fixture();const root=x.w.document.createElement('div');root.className='roam-body';x.w.document.body.append(root);
  const keys=[];root.addEventListener('keydown',event=>keys.push(event.key));
  delete x.w.__betterRoamAction;
  x.w.eval(readFileSync(new URL('../extension/runtime/controls.js',import.meta.url),'utf8'));
  x.w.__betterRoamAction('roam-palette');
  assert.deepEqual(keys,['p']);x.dom.window.close();
});
test('empty palette stays quiet and advanced search is edited in place', async () => {
  const x=fixture();const input=mount(x);
  assert.equal(x.w.document.getElementById('br-palette-results').hidden,true);
  assert.equal(x.w.document.querySelector('[role="status"]').textContent,'');
  assert.equal(x.w.document.querySelector('.br-result-icon'),null);
  input.value='advanced';input.dispatchEvent(new x.w.Event('input'));await wait(170);
  const option=[...x.w.document.querySelectorAll('[role="option"]')].find(n=>n.textContent.includes('Search within a page'));
  assert.ok(option);option.click();
  assert.equal(input.value,'in:"" ');
  assert.ok(x.w.document.querySelector('dialog'));
  assert.equal(x.calls.length,0);
  x.dom.window.close();
});
test('advanced filters search the graph in the palette without suggesting a page named after the query', async () => {
  const x=fixture();let queried=0;
  x.w.roamAlphaAPI.data.async.q=async()=>{queried++;return [['b','Scoped result','block','Projects']];};
  const input=mount(x);input.value='in:"Projects" -old';input.dispatchEvent(new x.w.Event('input'));await wait(170);
  assert.equal(queried,1);
  assert.equal(x.w.document.querySelector('[role="option"]').textContent,'Scoped resultProjects');
  assert.doesNotMatch(x.w.document.getElementById('br-palette-results').textContent,/Create/);
  x.dom.window.close();
});
