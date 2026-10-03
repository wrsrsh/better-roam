import test from 'node:test';
import assert from 'node:assert/strict';
import {RoamAdapter, createWebviewTransport, createActionClientTransport, normalize} from '../adapter/dist/index.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const page={':block/uid':'page',':node/title':'Page'};
const block={':block/uid':'block',':block/string':'before',':block/order':0};
function fixture(options={}) {
  const state={scope:{graph:'test',user:'user'},entities:new Map([['page',structuredClone(page)],['block',structuredClone(block)]]),calls:[],watchers:[],next:0,hook:null};
  const transport={
    scope:()=>state.scope,
    supports:()=>true,
    async watch(pattern,ref,callback){state.watchers.push(callback);return async()=>{state.watchers=state.watchers.filter(x=>x!==callback);};},
    async call(method,args){
      state.calls.push({method,args:structuredClone(args)});
      if(state.hook){const override=state.hook(method,args);if(override!==undefined)return override;}
      if(method==='data.pull') {
        const [key,value]=args[1];
        return structuredClone(key===':block/uid'?state.entities.get(value):[...state.entities.values()].find(x=>x[':node/title']===value))??null;
      }
      if(method==='util.generateUID')return `new${++state.next}`;
      if(method==='data.page.create'){const p=args[0].page;state.entities.set(p.uid,{':block/uid':p.uid,':node/title':p.title});return null;}
      if(method==='data.block.create'){const b=args[0].block;state.entities.set(b.uid,{':block/uid':b.uid,':block/string':b.string});return null;}
      if(method==='data.block.update'){const b=args[0].block;state.entities.get(b.uid)[':block/string']=b.string??state.entities.get(b.uid)[':block/string'];return null;}
      if(method==='data.block.delete'){state.entities.delete(args[0].block.uid);return null;}
      if(method==='data.q')return [];
      return null;
    }
  };
  return {state,transport,adapter:new RoamAdapter(transport,options)};
}
const code=(expected)=>e=>e.code===expected;
test('normalizes recursive blocks, order, refs and both key styles without losing raw attributes',()=>{
  const entity=normalize({...page,':custom/value':'kept',':block/children':[
    {'block/uid':'second','block/string':'B','block/order':1},
    {...block,':block/refs':[{':block/uid':'target'}]}
  ]});
  assert.deepEqual(entity.children.map(x=>x.uid),['block','second']);
  assert.deepEqual(entity.children[0].referenceUids,['target']);assert.equal(entity.attributes[':custom/value'],'kept');
});
test('uses bounded cache; returned objects cannot mutate cached data',async()=>{
  const {adapter,state}=fixture();const a=await adapter.getBlock('block');a.value.text='tampered';
  const b=await adapter.getBlock('block');assert.equal(b.value.text,'before');assert.equal(b.source,'memory-cache');
  assert.equal(state.calls.length,1);await adapter.getBlock('block',{fresh:true});assert.equal(state.calls.length,2);
});
test('graph and account switches clear caches and search indexes',async()=>{
  const {adapter,state}=fixture();await adapter.getBlock('block');await adapter.refreshSearch();
  state.scope={graph:'other',user:'user'};
  assert.throws(()=>adapter.search('x'),code('INDEX_NOT_READY'));
  await adapter.getBlock('block');state.scope={graph:'other',user:'other'};
  await adapter.getBlock('block');assert.equal(state.calls.filter(x=>x.method==='data.pull').length,3);
});
test('scope changes reject late reads instead of returning another graph\'s content',async()=>{
  const {adapter,state}=fixture();const d=deferred();state.hook=m=>m==='data.pull'?d.promise:undefined;
  const result=adapter.getBlock('block');state.scope={graph:'other',user:'user'};d.resolve(block);
  await assert.rejects(result,code('SCOPE_CHANGED'));
});
test('late reads are rejected after invalidation',async()=>{
  const {adapter,state}=fixture();const d=deferred();state.hook=m=>m==='data.pull'?d.promise:undefined;
  const result=adapter.getBlock('block');adapter.invalidate();d.resolve(block);
  await assert.rejects(result,code('STALE_READ'));
});
test('update maps styles and checks the draft base before writing',async()=>{
  const {adapter,state}=fixture();
  await assert.rejects(adapter.updateBlock('block',{text:'draft'},{expectedText:'old'}),code('CONFLICT'));
  assert.equal(state.calls.filter(x=>x.method==='data.block.update').length,0);
  const result=await adapter.updateBlock('block',{text:'after',heading:2,textAlign:'center'},{expectedText:'before'});
  assert.equal(result.status,'applied-in-client');assert.equal(result.serverSynced,'unknown');
  assert.deepEqual(state.calls.at(-1).args,[{block:{uid:'block',string:'after',heading:2,'text-align':'center'}}]);
});
test('writes serialize and a later edit sees the first write',async()=>{
  const {adapter,state}=fixture();const d=deferred();let n=0;
  state.hook=m=>m==='data.block.update'&&++n===1?d.promise:undefined;
  const first=adapter.updateBlock('block',{text:'first'});const second=adapter.updateBlock('block',{text:'second'});
  await new Promise(r=>setImmediate(r));assert.equal(n,1);d.resolve(null);
  await Promise.all([first,second]);assert.equal(n,2);
});
test('timed out writes hold the queue; expired queued writes never execute later',async()=>{
  const {adapter,state}=fixture({timeoutMs:20});const d=deferred();
  state.hook=m=>m==='data.block.update'?d.promise:undefined;
  const first=adapter.updateBlock('block',{text:'first'});const second=adapter.updateBlock('block',{text:'second'});
  const results=await Promise.allSettled([first,second]);
  assert.equal(results[0].reason.outcome,'unknown');assert.equal(results[1].reason.outcome,'not-applied');
  assert.equal(state.calls.filter(x=>x.method==='data.block.update').length,1);
  d.resolve(null);await new Promise(r=>setImmediate(r));
  assert.equal(state.calls.filter(x=>x.method==='data.block.update').length,1);
});
test('ensurePage is serialized and does not create duplicate pages locally',async()=>{
  const {adapter,state}=fixture();const results=await Promise.all([adapter.ensurePage('New'),adapter.ensurePage('New')]);
  assert.deepEqual(results.map(x=>x.value.created),[true,false]);
  assert.equal(state.calls.filter(x=>x.method==='data.page.create').length,1);
});
test('create validates parent and refuses UID reuse',async()=>{
  const {adapter}=fixture();await assert.rejects(adapter.createBlock('missing',{text:'x'}),code('NOT_FOUND'));
  await assert.rejects(adapter.createBlock('page',{uid:'block',text:'x'}),code('ALREADY_EXISTS'));
});
test('rename does not silently merge pages; move refuses descendant cycles',async()=>{
  const {adapter,state}=fixture();state.entities.set('other',{':block/uid':'other',':node/title':'Other'});
  await assert.rejects(adapter.renamePage('page','Other'),code('ALREADY_EXISTS'));
  state.entities.set('descendant',{':block/uid':'descendant',':block/string':'child',':block/parents':[{':block/uid':'block'}]});
  await assert.rejects(adapter.moveBlock('block','descendant'),code('INVALID_ARGUMENT'));
});
test('modern no-op deletion reports are not claimed as success',async()=>{
  const {adapter,state}=fixture();state.hook=m=>m==='data.block.delete'?{deleted:false,reason:'not-found'}:undefined;
  await assert.rejects(adapter.deleteBlock('block'),code('NOT_DELETED'));
});
test('batch reports partial completion and never replays completed writes',async()=>{
  const {adapter,state}=fixture();const result=await adapter.batch([
    {method:'createPage',args:[{title:'Created'}]},
    {method:'updateBlock',args:['missing',{text:'fail'}]},
    {method:'createPage',args:[{title:'Never'}]}
  ]);
  assert.equal(result.completed.length,1);assert.equal(result.failedIndex,1);
  assert.equal(state.calls.filter(x=>x.method==='data.page.create').length,1);
});
test('search runs locally after indexing, ranks exact titles, and labels stale results',async()=>{
  const {adapter,state}=fixture();state.hook=m=>m==='data.q'?[['1','Alpha','page'],['2','something Alpha','block'],['3','Alpine home','page']]:undefined;
  await adapter.refreshSearch();const count=state.calls.length;
  assert.equal(adapter.search('Alpha').items[0].uid,'1');assert.equal(adapter.search('Alph').items.length,3);
  assert.equal(state.calls.length,count);adapter.invalidate();assert.equal(adapter.search('Alpha').stale,true);
});
test('parameterized backlinks do not interpolate user UID into datalog',async()=>{
  const {adapter,state}=fixture();const uid='\" ] malicious';await adapter.getBacklinks(uid);
  assert.equal(state.calls.at(-1).args[1],uid);assert.ok(!state.calls.at(-1).args[0].includes(uid));
});
test('watch callbacks isolate exceptions, invalidate cache and dispose precisely',async()=>{
  const {adapter,state}=fixture({onEvent:()=>{throw Error('consumer');}});
  const id=await adapter.watch('block');await adapter.getBlock('block');
  assert.doesNotThrow(()=>state.watchers[0](block,block));await adapter.getBlock('block');
  assert.equal(state.calls.length,2);await adapter.unwatch(id);assert.equal(state.watchers.length,0);
  await adapter.dispose();assert.throws(()=>adapter.status(),code('DISPOSED'));
});
test('late subscription registration is cleaned up after graph change',async()=>{
  const {transport,state}=fixture();const d=deferred();let cleaned=0;
  transport.watch=()=>d.promise;const adapter=new RoamAdapter(transport);
  const registration=adapter.watch('block');state.scope={graph:'new',user:'user'};adapter.status();
  d.resolve(async()=>{cleaned++;});await assert.rejects(registration,code('SCOPE_CHANGED'));assert.equal(cleaned,1);
});
test('JSON request interface rejects prototype and arbitrary API access',async()=>{
  const {adapter}=fixture();
  for(const method of ['constructor','__proto__','transport','request','dispose','file.delete']) {
    const response=await adapter.request({id:'1',method});assert.equal(response.ok,false);assert.equal(response.error.code,'UNKNOWN_METHOD');
  }
});
test('runtime argument validation and leap day handling',async()=>{
  const {adapter}=fixture();assert.throws(()=>adapter.createBlock('page',{text:'x'},-1),code('INVALID_ARGUMENT'));
  await assert.rejects(adapter.getEntity({uid:'a',title:'b'}),code('INVALID_ARGUMENT'));
  await assert.rejects(adapter.dailyNote('2025-02-29'),code('INVALID_ARGUMENT'));
});
test('transport preserves function receiver and supports legacy API names',async()=>{
  const api={graph:{name:'test'},user:{uid:()=> 'user'},pull(){return this.graph.name;}};
  const transport=createWebviewTransport(()=>api,()=> 'test');
  assert.equal(transport.call('data.pull',[]),'test');assert.equal(transport.scope().user,'user');
  assert.equal(createWebviewTransport(()=>api,()=> 'different').scope(),null);
});
test('webview watch cleanup uses the original function and callback only',async()=>{
  let args,removed;const cb=()=>{};
  let api={data:{addPullWatch(...a){args=a;},removePullWatch(...a){removed=a;}}};
  const transport=createWebviewTransport(()=>api,()=> 'test');
  const cleanup=await transport.watch('pattern','entity',cb);api={data:{removePullWatch(){throw Error('wrong graph');}}};
  await cleanup();assert.deepEqual(args,removed);assert.equal(removed[2],cb);
});
test('official action client bridge unwraps responses and uses explicit capabilities',async()=>{
  let args;const transport=createActionClientTransport({async call(...a){args=a;return {success:true,result:42};}},{graph:'test',user:null},['data.q']);
  assert.equal(await transport.call('data.q',['query']),42);assert.deepEqual(args,['data.q',['query']]);
  await assert.rejects(transport.call('file.delete',[]),code('UNSUPPORTED'));
});
test('timed out subscription registration cleans up when it eventually finishes',async()=>{
  const {transport}=fixture();const d=deferred();let cleaned=0;
  transport.watch=()=>d.promise;const adapter=new RoamAdapter(transport,{timeoutMs:10});
  await assert.rejects(adapter.watch('block'),code('TIMEOUT'));
  d.resolve(async()=>{cleaned++;});await new Promise(r=>setImmediate(r));assert.equal(cleaned,1);
});
test('a write queued before a graph switch never lands in the new graph',async()=>{
  const {adapter,state}=fixture();const d=deferred();
  state.hook=m=>m==='data.block.update'?d.promise:undefined;
  const first=adapter.updateBlock('block',{text:'one'});const second=adapter.updateBlock('block',{text:'two'});
  const outcomes=Promise.allSettled([first,second]);await new Promise(r=>setImmediate(r));
  state.scope={graph:'other',user:'user'};adapter.status();d.resolve(null);
  const results=await outcomes;assert.equal(results[0].reason.outcome,'unknown');assert.equal(results[1].reason.code,'SCOPE_CHANGED');
  assert.equal(state.calls.filter(x=>x.method==='data.block.update').length,1);
});
