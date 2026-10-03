import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code = readFileSync(new URL('../extension/runtime/controls.js', import.meta.url), 'utf8');
function setup({palette = false, emptyPage = false, editing = false} = {}) {
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
  const window = {__betterRoamPalette(){state.palette=true;},roamAlphaAPI:{ui:{mainWindow:{focusFirstBlock(){state.blockClicks++;}}}},addEventListener(name,callback){events['window:'+name]=callback;},
    open(url){opened.push(url);}};
  window.top=window;
  vm.runInNewContext(code,{window,document,Element,URL,console,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
    MutationObserver:class {constructor(callback){events.mutate=callback;} observe(){}},
    KeyboardEvent:class {constructor(type,args){Object.assign(this,{type},args);}},
    location:{origin:'https://roamresearch.com',href:'https://roamresearch.com/#/app/test',hash:'#/app/test/page/test-page'},
    localStorage:{getItem(){return null;},setItem(){}}
  });
  return {window,events,keys,opened,state,Element,tick(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}};
}
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
