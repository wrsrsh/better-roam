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
import {createSearchSession,searchGraph} from '../extension/runtime/palette-search.js';
function mount(x) {
  x.w.createSearchSession=createSearchSession;
  x.w.searchGraph=searchGraph;
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
