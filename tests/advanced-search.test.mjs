import test from 'node:test';
import assert from 'node:assert/strict';
import d from 'datascript';
import {parseSearch, advancedQuery, advancedSearch} from '../extension/runtime/advanced-search.js';
const schema={':block/page':{':db/valueType':':db.type/ref'},':block/refs':{':db/valueType':':db.type/ref',':db/cardinality':':db.cardinality/many'}};
const db=d.db_with(d.empty_db(schema),[
 {':db/id':1,':block/uid':'p',':node/title':'Projects'},
 {':db/id':2,':block/uid':'tag',':node/title':'Active'},
 {':db/id':3,':block/uid':'a',':block/string':'Ship the new app',':block/page':1,':block/refs':[2]},
 {':db/id':4,':block/uid':'b',':block/string':'Ship old app',':block/page':1},
 {':db/id':5,':block/uid':'c',':block/string':'Literal a+b [x]',':block/page':1},
]);
const query=async(q,...args)=>d.q(q.replace(' :timeout 2000','').replace(/:(?:block|node)\/[\w-]+/g, value => JSON.stringify(value)),db,...args);
const api={data:{async:{q:query}}};
test('advanced search applies page scope, exact phrases, references and exclusions to the graph',async()=>{
 const rows=await advancedSearch(api,parseSearch('in:"Projects" ref:Active "new app" -old'));
 assert.deepEqual(rows.map(r=>r.uid),['a']);
 assert.equal(rows[0].detail,'Projects');
 assert.deepEqual((await advancedSearch(api,parseSearch('type:page Projects'))).map(r=>r.uid),['p']);
 assert.deepEqual((await advancedSearch(api,parseSearch('in:[[Projects]] -old'))).map(r=>r.uid).sort(),['a','c','p']);
});
test('filter values are parameters and metacharacters remain literal',async()=>{
 const spec=parseSearch('"a+b [x]"');
 const built=advancedQuery(spec);assert.ok(!built.query.includes('a+b'));
 assert.deepEqual((await advancedSearch(api,spec)).map(r=>r.uid),['c']);
 assert.throws(()=>parseSearch('in:"unfinished'),/Close the quote/);
 assert.throws(()=>parseSearch('type:invalid'),/type:page/);
});
