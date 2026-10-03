import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code = readFileSync(new URL('../src-tauri/src/controls.js', import.meta.url), 'utf8');
function setup({palette = false} = {}) {
  const events = {}, keys = [], opened = [], state = {focused:false, selected:false, settings:false};
  class Element { matches() { return true; } }
  const input = {focus(){state.focused=true;},select(){state.selected=true;}};
  const document = {
    activeElement:{dispatchEvent(event){keys.push(event.key);}},
    addEventListener(name, callback){events[name]=callback;},
    querySelector(selector){
      if (selector.includes('Find or Create Page')) return input;
      if (selector.includes('command-palette')) return palette ? {} : null;
      return null;
    },
    querySelectorAll(){return [{textContent:'Open settings',click(){state.settings=true;}}];}
  };
  const window = {addEventListener(name,callback){events['window:'+name]=callback;},
    __TAURI__:{core:{invoke(_command,args){opened.push(args.url);return Promise.resolve();}}}};
  window.top=window;
  vm.runInNewContext(code,{window,document,Element,URL,console,setTimeout,
    KeyboardEvent:class {constructor(type,args){Object.assign(this,{type},args);}},
    location:{origin:'https://roamresearch.com',href:'https://roamresearch.com/#/app/test',hash:'#/app/test'},
    localStorage:{getItem(){return null;},setItem(){}}
  });
  return {window,events,keys,opened,state,Element};
}
test('external click is cancelled in Roam and sent to the system opener, including modifier clicks',()=>{
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
  const x=setup({palette:true});x.window.__roamDesktopAction('settings');
  assert.equal(x.state.settings,true);assert.deepEqual(x.keys,[]);
});
test('search focuses and selects the native Roam search input',()=>{
  const x=setup();x.window.__roamDesktopAction('search');
  assert.equal(x.state.focused,true);assert.equal(x.state.selected,true);
});
test('Cmd+K consumes the editor link shortcut and opens the palette',()=>{
  const x=setup();let cancelled=false;
  x.events['window:keydown']({key:'k',metaKey:true,isTrusted:true,preventDefault(){cancelled=true;},stopImmediatePropagation(){}});
  assert.equal(cancelled,true);assert.deepEqual(x.keys,['p','p','p']);
});
