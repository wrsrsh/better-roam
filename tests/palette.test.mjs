import test from 'node:test';
import assert from 'node:assert/strict';
import {searchGraph, createSearchSession} from '../extension/runtime/palette-search.js';

test('search uses the bounded async API and preserves receiver', async () => {
  let calls = 0;
  const owner = {async search(args) {
    assert.equal(this, owner); calls++;
    assert.equal(args.limit, 40); assert.equal(args['search-pages'], true); assert.equal(args['search-blocks'], false);
    assert.equal(args['search-str'], 'a "quoted" title');
    return [{':block/uid': '1', ':node/title': 'Page'}, {':block/uid': '1', ':node/title': 'duplicate'}, {':block/uid': '2', ':block/string': 'block'}, {}];
  }};
  const api = {data: {async: owner, search() {throw Error('sync path should not run');}}};
  assert.deepEqual(await searchGraph(api, '  a "quoted" title ', 'pages'), [{uid: '1', kind: 'page', label: 'Page', detail: 'Page'}]);
  assert.equal(calls, 1);
  assert.deepEqual(await searchGraph(api, ''), []); assert.equal(calls, 1);
});
test('legacy search stays bounded and preserves untrusted result text as text', async () => {
  const label = '<img src=x onerror=alert(1)>';
  assert.deepEqual(await searchGraph({data:{search: () => [{':block/uid':'b', ':block/string':label, ':block/page':{':node/title':'Home'}}]}}, 'x'), [{uid:'b',kind:'block',label,detail:'Home'}]);
});
function fixture() {
  let timer, graph='a', calls=[], deliveries=[];
  const session=createSearchSession({scope:()=>graph,
    schedule:fn=>{timer=fn;return 1;},cancel:()=>{timer=null;},
    search:(text)=>new Promise(resolve=>calls.push({text,resolve})),deliver:(...args)=>deliveries.push(args),
  });
  return {session,calls,deliveries, tick(){const fn=timer;timer=null;fn?.();},graph(value){graph=value;}};
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('rapid input is coalesced and stale results are dropped without parallel searches', async () => {
  const x=fixture();
  for(let i=0;i<100;i++) x.session.query(String(i),'all');
  assert.equal(x.calls.length,0);x.tick();assert.equal(x.calls[0].text,'99');
  x.session.query('latest','all');x.tick();assert.equal(x.calls.length,1);
  x.calls[0].resolve(['old']);await settle();
  assert.equal(x.deliveries.length,0);assert.equal(x.calls.length,2);
  x.calls[1].resolve(['new']);await settle();assert.deepEqual(x.deliveries,[[['new'],null]]);
});
test('closing, changing graph, empty queries, and action mode suppress graph work/results', async () => {
  const x=fixture();x.session.query('','all');x.tick();x.session.query('settings','actions');x.tick();assert.equal(x.calls.length,0);
  x.session.query('test','all');x.tick();x.graph('b');x.calls[0].resolve(['private']);await settle();assert.equal(x.deliveries.length,0);
  x.session.query('pending','all');x.session.close();x.tick();assert.equal(x.calls.length,1);
  const y=fixture();y.session.query('test','all');y.tick();y.session.close();y.calls[0].resolve(['old']);await settle();assert.equal(y.deliveries.length,0);
});
