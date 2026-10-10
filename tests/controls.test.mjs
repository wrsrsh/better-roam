import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code = readFileSync(new URL('../extension/runtime/controls.js', import.meta.url), 'utf8');
function setup({palette = false, emptyPage = false, editing = false, origin = 'https://roamresearch.com', api} = {}) {
  const timers = new Map(); let timerId = 0;
  const events = {}, keys = [], opened = [], state = {focused:false, selected:false, settings:false, blockClicks:0, scans:0};
  const page = {};
  const block = {textContent:"", click(){state.blockClicks++;}};
  class Element { matches() { return true; } }
  const input = {focus(){state.focused=true;},select(){state.selected=true;}};
  const document = {
    activeElement:{dispatchEvent(event){keys.push(event.key);}, matches(){return editing;}},
    body:{},
    getElementById(){return null;},
    addEventListener(name, callback){events[name]=callback;},
    querySelector(selector){
      state.scans++;
      if (selector.includes('rm-title-display')) return emptyPage ? page : null;
      if (selector.includes('Find or Create Page')) return input;
      if (selector.includes('command-palette')) return palette ? {} : null;
      return null;
    },
    querySelectorAll(selector){if(selector.includes('roam-block')) return emptyPage ? [block] : [];return [{textContent:'Open settings',click(){state.settings=true;}},{textContent:'Open advanced search',click(){state.search=true;}}];}
  };
  const window = {__betterRoamPalette(){state.palette=true;},roamAlphaAPI:api ?? {ui:{mainWindow:{focusFirstBlock(){state.blockClicks++;}}}},addEventListener(name,callback){events['window:'+name]=callback;},
    open(url){opened.push(url);}};
  window.top=window;
  const location={origin,href:origin+'/#/app/test',hash:'#/app/test/page/test-page'};
  vm.runInNewContext(code,{window,document,Element,URL,console,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
    MutationObserver:class {constructor(callback){events.mutate=callback;} observe(){}},
    KeyboardEvent:class {constructor(type,args){Object.assign(this,{type},args);}},
    location,
    localStorage:{getItem(){return null;},setItem(){}}
  });
  return {window,events,keys,opened,state,Element,location,tick(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}};
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const pageApi = (focused, {navigate = true, tree} = {}) => {
  const api = {data:{async:{pull:async(pattern,lookup)=>{assert.deepEqual(Array.from(lookup),[':block/uid','pg']);return tree ?? {':block/children':[
    {':block/uid':'a',':block/order':0,':block/string':'first'},
    {':block/uid':'b',':block/order':1,':block/string':'parent',':block/open':true,':block/children':[
      {':block/uid':'c',':block/order':0,':block/string':'closed child',':block/open':false,':block/children':[{':block/uid':'hidden',':block/order':0,':block/string':'x'}]}]}]};}}},
    ui:{setBlockFocusAndSelection(args){focused.push(JSON.parse(JSON.stringify(args)));},mainWindow:{focusFirstBlock(){focused.push('first');},openPage({page}){if(navigate) api.location.hash='#/app/test/page/'+page.uid;}}}};
  return api;
};
test('external click is cancelled in Roam and opened in a separate tab, including modifier clicks',()=>{
  const x=setup(); const link=new x.Element();link.href='https://example.com/article';
  let cancelled=false;
  x.events.click({composedPath:()=>[link],metaKey:true,preventDefault(){cancelled=true;},stopImmediatePropagation(){}});
  assert.equal(cancelled,true); assert.deepEqual(x.opened,['https://example.com/article']);
});
test('internal graph links are left to Roam',()=>{
  const x=setup();const link=new x.Element();link.href='https://roamresearch.com/#/app/test/page/abc';
  x.events.click({composedPath:()=>[link],preventDefault(){throw Error('internal navigation intercepted');}});
  assert.deepEqual(x.opened,[]);
});
test('settings reuses an open palette and activates the settings command',()=>{
  const x=setup({palette:true});x.window.__betterRoamAction('settings');
  assert.equal(x.state.settings,true);assert.deepEqual(x.keys,[]);
});
test('search opens the unified palette with built-in advanced search',()=>{
  const x=setup();x.window.__betterRoamAction('search');
  assert.equal(x.state.palette,true);assert.equal(x.state.focused,false);
});
test('Cmd+K consumes the editor link shortcut and opens the palette',()=>{
  const x=setup();let cancelled=false;
  x.events['window:keydown']({key:'k',metaKey:true,isTrusted:true,preventDefault(){cancelled=true;},stopImmediatePropagation(){}});
  assert.equal(cancelled,true);assert.equal(x.state.palette,true);assert.deepEqual(x.keys,[]);
});

test('Ctrl+K opens the palette inside Roam without a Chrome command binding',()=>{
  const x=setup();let cancelled=false;
  x.events['window:keydown']({key:'k',ctrlKey:true,isTrusted:true,preventDefault(){cancelled=true;},stopImmediatePropagation(){}});
  assert.equal(cancelled,true);assert.equal(x.state.palette,true);
});

test('other sites receive no shortcut handlers or Roam actions',()=>{
  const x=setup({origin:'https://example.com'});
  assert.equal(x.events['window:keydown'],undefined);
  assert.equal(x.window.__betterRoamAction,undefined);
});

test('modified palette shortcuts remain available to Roam',()=>{
  const x=setup();
  for(const modifiers of [{metaKey:true,shiftKey:true},{ctrlKey:true,altKey:true},{metaKey:true,ctrlKey:true}]) {
    x.events['window:keydown']({key:'k',isTrusted:true,...modifiers,
      preventDefault(){throw Error('unrelated shortcut consumed');},stopImmediatePropagation(){throw Error('unrelated shortcut stopped');}});
  }
  assert.equal(Boolean(x.state.palette),false);
});

test('empty pages focus their first block once and do not steal an active editor',()=>{
  const x=setup({emptyPage:true});
  x.tick();
  assert.equal(x.state.blockClicks,1);
  x.events.keydown();
  x.tick();
  assert.equal(x.state.blockClicks,1);
  const editing=setup({emptyPage:true,editing:true});
  editing.tick();
  assert.equal(editing.state.blockClicks,0);
  assert.equal(editing.state.scans,0);
});

test('typing cancels pending autofocus without scanning the document',()=>{
  const x=setup({emptyPage:true});
  x.events.keydown();
  for(let i=0;i<1000;i++) {
    x.events['window:keydown']({key:'a',isTrusted:true,metaKey:false});
    x.tick();
  }
  assert.equal(x.state.scans,0);
  assert.equal(x.state.blockClicks,0);
  assert.equal(x.events.mutate,undefined);
});

test('opening an existing page lands the caret after its last visible block',async()=>{
  const focused=[];const api=pageApi(focused);const x=setup({api});api.location=x.location;
  await x.window.__betterRoamAction('open-page','pg');await flush();
  assert.deepEqual(focused,[{location:{'block-uid':'c','window-id':'main-window'},selection:{start:12,end:12}}]);
  // Verification retries stop once a block editor is focused.
  x.window.roamAlphaAPI=api;x.tick();await flush();
  assert.equal(focused.length,2);
});

test('end-of-page focus waits for navigation and runs once when hashchange arrives late',async()=>{
  const focused=[];const api=pageApi(focused,{navigate:false});const x=setup({api});
  await x.window.__betterRoamAction('open-page','pg');await flush();
  assert.deepEqual(focused,[]);
  x.location.hash='#/app/test/page/pg';x.events['window:hashchange']();await flush();
  assert.equal(focused.length,1);
  x.tick();await flush();
  assert.equal(focused.length,2);
});

test('empty pages fall back to the first block and typing cancels end-of-page focus',async()=>{
  const focused=[];const api=pageApi(focused,{tree:{}});const x=setup({api});api.location=x.location;
  await x.window.__betterRoamAction('open-page','pg');await flush();
  assert.deepEqual(focused,['first']);
  const typed=[];const typedApi=pageApi(typed,{navigate:false});const y=setup({api:typedApi});
  await y.window.__betterRoamAction('open-page','pg');y.events.keydown();
  y.location.hash='#/app/test/page/pg';y.events['window:hashchange']();await flush();y.tick();await flush();
  assert.deepEqual(typed,[]);
});
