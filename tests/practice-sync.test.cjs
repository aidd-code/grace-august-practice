const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../practice-sync.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const empty = () => ({days:{}, typeOverrides:{}});
const plan = () => ({items:{}, journal:{}, planSnapshot:[{title:'Left hand',minutes:5,tasks:[]}]});
const initial = () => ({days:{'2026-10-13':{plans:{U:plan()}}},typeOverrides:{}});
const getPlan = state => state.days['2026-10-13'].plans.U;
const flush = async () => { for (let i=0; i<25; i++) await new Promise(resolve => setImmediate(resolve)); };

function server(state=initial()) {
  const api = {row:{state:clone(state),updated_at:'2026-10-13T00:00:00.000Z'}, offline:false, collisions:0, writes:0, lostReply:false};
  api.fetch = async (url, options={}) => {
    if (api.offline) throw new Error('offline');
    const result = value => ({ok:true,status:200,json:async()=>clone(value)});
    if (!options.method) return result(api.row ? [api.row] : []);
    const data = JSON.parse(options.body);
    if (options.method==='PATCH') {
      const stamp = new URL(url).searchParams.get('updated_at').slice(3);
      if (!api.row || api.row.updated_at!==stamp) { api.collisions++; return result([]); }
      api.row = {state:data.state,updated_at:data.updated_at};
    } else {
      if (api.row) return result([]);
      api.row = data;
    }
    api.writes++;
    if (api.lostReply) { api.lostReply=false; throw new Error('reply lost after commit'); }
    return result([api.row]);
  };
  return api;
}
function client(api, {state=initial(),loggedIn=true,storage=new Map()}={}) {
  let local=clone(state), busy=false;
  const listeners={}, timers=new Map(), intervals=[], elements={}; let timerId=0;
  for(const id of ['cloudSaveStatus','cloudSaveText','cloudSaveRetry','syncStatusPanel','syncStatusText','syncRefresh']) elements[id]={dataset:{}};
  const register=(name,fn)=>(listeners[name]||=[]).push(fn);
  const window={graceIsLoggedIn:()=>loggedIn,graceGetPracticeState:()=>clone(local),gracePracticeSyncBusy:()=>busy,graceApplyPracticeState:next=>{if(busy)return false;local=clone(next);return true;},addEventListener:register};
  const context={window,document:{hidden:false,getElementById:id=>elements[id],addEventListener:register},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},fetch:api.fetch,AbortController,Date,Math,console:{warn:()=>{}},setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{intervals.push(fn);return intervals.length;}};
  vm.runInNewContext(source, context);
  return {local:()=>local,storage,status:()=>elements.syncStatusText.textContent,setBusy:value=>busy=value,setLogin:value=>loggedIn=value,
    fire:async(name,arg)=>{await Promise.all((listeners[name]||[]).map(fn=>fn(arg)));await flush();},
    edit:fn=>{fn(local);for(const listener of listeners['grace:practice-state-changed']||[])listener();},
    poll:async()=>{await intervals[0]();await flush();},
    save:async()=>{await Promise.all((listeners['grace:practice-save-retry']||[]).map(fn=>fn()));await flush();},
    runTimers:async()=>{for(const [id,timer] of [...timers])if(timer.delay<15000){timers.delete(id);await timer.fn();}await flush();}
  };
}

(async()=>{
  // Two idle pages must receive each other's changes, without refreshing manually.
  let api=server(),parent=client(api),child=client(api),viewer=client(api,{loggedIn:false});
  await Promise.all([parent.fire('DOMContentLoaded'),child.fire('DOMContentLoaded'),viewer.fire('DOMContentLoaded')]);
  child.edit(state=>getPlan(state).items[0]={done:true,seconds:30,checks:{},note:'child discovery'});
  await child.save();await parent.poll();await viewer.poll();
  assert.equal(getPlan(parent.local()).items[0].done,true);assert.equal(getPlan(viewer.local()).items[0].note,'child discovery');
  parent.edit(state=>getPlan(state).items[0].teacherNote='Listen before shifting');await parent.save();await child.poll();
  assert.equal(getPlan(child.local()).items[0].teacherNote,'Listen before shifting');
  assert.equal(getPlan(child.local()).items[0].done,true);
  console.log('PASS child check-in / parent reminder / read-only viewer auto-refresh');

  // Simultaneous saves read the same revision. Only one CAS can win; the loser merges.
  api=server();parent=client(api);child=client(api);await Promise.all([parent.fire('DOMContentLoaded'),child.fire('DOMContentLoaded')]);
  child.edit(state=>getPlan(state).items[0]={done:true,seconds:0,checks:{},note:'',answer:''});
  parent.edit(state=>getPlan(state).items[0]={done:false,seconds:0,checks:{},note:'',answer:'',teacherNote:'parent reminder'});
  await Promise.all([parent.save(),child.save()]);await Promise.all([parent.poll(),child.poll()]);
  assert.equal(getPlan(api.row.state).items[0].done,true);assert.equal(getPlan(api.row.state).items[0].teacherNote,'parent reminder');assert.ok(api.collisions>0);
  console.log('PASS simultaneous same-item changes merge without empty-default overwrite');

  // Two counters add elapsed time instead of overwriting one another.
  api=server();getPlan(api.row.state).items[0]={seconds:10};parent=client(api,{state:api.row.state});child=client(api,{state:api.row.state});
  await Promise.all([parent.fire('DOMContentLoaded'),child.fire('DOMContentLoaded')]);
  parent.edit(state=>getPlan(state).items[0].seconds+=5);child.edit(state=>getPlan(state).items[0].seconds+=7);
  await Promise.all([parent.save(),child.save()]);assert.equal(getPlan(api.row.state).items[0].seconds,22);
  console.log('PASS timer increments from both devices are retained');

  // Lost response must not cause timer increments to be written twice.
  api=server();child=client(api);await child.fire('DOMContentLoaded');child.edit(state=>getPlan(state).items[0]={seconds:5});api.lostReply=true;await child.save();await child.save();
  assert.equal(getPlan(api.row.state).items[0].seconds,5);
  console.log('PASS retry after committed response loss is idempotent');

  // Pending edits persist across offline reload and logout; do not discard on login.
  api=server();child=client(api);await child.fire('DOMContentLoaded');api.offline=true;
  child.edit(state=>getPlan(state).items[0]={done:true});await child.save();assert.match(child.status(),/本机修改已保留/);
  const storage=child.storage,oldState=clone(child.local());child=client(api,{state:oldState,storage,loggedIn:false});await child.fire('DOMContentLoaded');
  api.offline=false;child.setLogin(true);await child.fire('grace:auth-changed',{detail:{loggedIn:true}});await child.runTimers();
  assert.equal(getPlan(api.row.state).items[0].done,true);assert.equal(storage.has('grace-practice-sync-outbox-v2'),false);
  console.log('PASS offline edits survive reload and login');

  // Polling while editing must not replace the textarea or recording target.
  api=server();child=client(api);parent=client(api);await Promise.all([parent.fire('DOMContentLoaded'),child.fire('DOMContentLoaded')]);
  child.setBusy(true);parent.edit(state=>getPlan(state).journal.next='tomorrow');await parent.save();await child.poll();
  assert.equal(getPlan(child.local()).journal.next,undefined);assert.match(child.status(),/结束输入/);child.setBusy(false);await child.poll();assert.equal(getPlan(child.local()).journal.next,'tomorrow');
  console.log('PASS active input/recording is protected and then refreshed');

  // Recover missing local-only historic records; never overwrite conflicting cloud notes.
  api=server();getPlan(api.row.state).items[0]={note:'cloud current'};
  const old=initial();getPlan(old).items[0]={note:'old local'};getPlan(old).items[1]={done:true,note:'local only'};
  child=client(api,{state:old});await child.fire('DOMContentLoaded');
  assert.equal(getPlan(api.row.state).items[0].note,'cloud current');assert.equal(getPlan(api.row.state).items[1].note,'local only');assert.ok(child.storage.has('grace-practice-before-sync-v2'));
  console.log('PASS missing legacy records recovered with pre-sync backup');
  // Read-only page can be logged in later without losing its sync session.
  api=server();viewer=client(api,{loggedIn:false});await viewer.fire('DOMContentLoaded');viewer.setLogin(true);await viewer.fire('grace:auth-changed',{detail:{loggedIn:true}});await viewer.runTimers();assert.ok(viewer.status());
  console.log('PASS read-only to logged-in transition');
  console.log('All tests use a simulated cloud; no real practice records were modified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
