import test from 'node:test';
import assert from 'node:assert/strict';
import d from 'datascript';
import {RoamAdapter} from '../adapter/dist/index.mjs';

// DataScript's JS interface uses string attributes; Roam's ClojureScript API
// uses keyword attributes. Translate attribute literals only, preserving the
// real pull/query structure, joins, parameters and recursion under test.
const jsAttributes=s=>s.replace(/:(block|node|create|edit)\/[a-z-]+/g,x=>JSON.stringify(x));
function setup(){
  const refs={':db/valueType':':db.type/ref',':db/cardinality':':db.cardinality/many'};
  const conn=d.create_conn({
    ':block/uid':{':db/unique':':db.unique/identity'},':node/title':{':db/unique':':db.unique/identity'},
    ':block/children':refs,':block/refs':refs,':block/parents':refs,
    ':block/page':{':db/valueType':':db.type/ref'}
  });
  d.transact(conn,[
    {':db/id':-1,':block/uid':'page',':node/title':'Alpha',':block/children':[-3,-2]},
    {':db/id':-2,':block/uid':'a',':block/string':'first [[Target]]',':block/order':0,':block/page':-1,':block/refs':[-4],':block/parents':[-1],':block/children':[-5]},
    {':db/id':-3,':block/uid':'b',':block/string':'second',':block/order':1,':block/page':-1},
    {':db/id':-4,':block/uid':'target',':node/title':'Target'},
    {':db/id':-5,':block/uid':'child',':block/string':'nested',':block/order':0,':block/parents':[-1,-2]}
  ]);
  return new RoamAdapter({
    scope:()=>({graph:'fixture',user:'test'}),supports:()=>true,
    call(method,args){
      if(method==='data.pull')return d.pull(d.db(conn),jsAttributes(args[0]),args[1]);
      if(method==='data.q')return d.q(jsAttributes(args[0]),d.db(conn),...args.slice(1));
      throw Error('Unexpected method');
    }
  });
}
test('real DataScript pulls preserve depth, ordered children, references and parent IDs',async()=>{
  const adapter=setup();const page=await adapter.getPage({uid:'page'},{depth:2});
  assert.deepEqual(page.value.children.map(x=>x.uid),['a','b']);
  assert.equal(page.value.children[0].children[0].text,'nested');
  assert.deepEqual(page.value.children[0].referenceUids,['target']);
  assert.equal(page.value.children[0].pageUid,'page');
  const block=await adapter.getBlock('a');assert.deepEqual(block.value.childUids,['child']);assert.equal(block.value.childrenLoaded,false);
});
test('real DataScript list and backlink queries return structured entities',async()=>{
  const adapter=setup();assert.equal((await adapter.listPages()).value.total,2);
  const links=await adapter.getBacklinks('target');assert.equal(links.value.items[0].uid,'a');assert.equal(links.value.total,1);
});
test('real DataScript search snapshot includes both pages and blocks',async()=>{
  const adapter=setup();assert.equal((await adapter.refreshSearch()).count,5);
  assert.equal(adapter.search('Alpha').items[0].uid,'page');assert.equal(adapter.search('nested',{kind:'block'}).items[0].uid,'child');
});
