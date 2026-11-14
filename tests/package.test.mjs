import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {bundle,createLock,verifyLock} from '../tools/build.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));

test('optional modules resolve their required dependencies, preserving CSS cascade positions',async()=>{
  const result=await bundle(root,{modules:['appearance'],css:'before{}\n/* @foundation core/base.css */\nafter{}'});
  assert.deepEqual(result.modules.map(m=>m.id),['core','components','appearance']);
  assert(result.css.startsWith('before{}\n:root'));
  assert(result.css.endsWith('after{}'));
  assert(!result.js.includes('mountSidebar'));
  await assert.rejects(()=>bundle(root,{modules:['core'],css:'/* @foundation shell/layout.css */'}),/Unselected/);
});

test('unknown modules and a lock with a changed module selection are rejected',async()=>{
  await assert.rejects(()=>bundle(root,{modules:['unknown']}),/Unknown/);
  const lock=await createLock(root,['core']);
  await assert.rejects(()=>bundle(root,{lock,modules:['shell']}),/differs from the lock/);
});

test('locked packages reject tampering, incompatible APIs and dependency cycles',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'velora-foundation-test-'));
  try {
    await cp(path.join(root,'modules'),path.join(temporary,'modules'),{recursive:true});
    await cp(path.join(root,'tools'),path.join(temporary,'tools'),{recursive:true});
    for(const file of ['velora-foundation.json','LICENSE']) await cp(path.join(root,file),path.join(temporary,file));
    const lock=await createLock(temporary,['shell']);
    await verifyLock(temporary,lock);
    await writeFile(path.join(temporary,'modules/core/base.css'),'body { color:red }');
    await assert.rejects(()=>verifyLock(temporary,lock),/integrity mismatch/);
    const file=path.join(temporary,'modules/core/velora-module.json');
    const manifest=JSON.parse(await readFile(file,'utf8'));
    await writeFile(file,JSON.stringify({...manifest,module_api:2}));
    await assert.rejects(()=>bundle(temporary,{modules:['core']}),/Unsupported module/);
    await writeFile(file,JSON.stringify({...manifest,dependencies:{shell:1}}));
    await assert.rejects(()=>bundle(temporary,{modules:['shell']}),/Circular/);
    await writeFile(file,JSON.stringify({...manifest,styles:['../../../outside.css']}));
    await assert.rejects(()=>bundle(temporary,{modules:['core']}),/Unsafe package path/);
  } finally { await rm(temporary,{recursive:true,force:true}); }
});

test('runtime is reusable without Music globals, respects Device and clears theme overrides',async()=>{
  const {js}=await bundle(root,{modules:['appearance']});
  const events=new Map(),tokens=new Map(),saved=[];
  const media={matches:false,addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type)};
  const element={dataset:{},style:{setProperty:(k,v)=>tokens.set(k,v),removeProperty:k=>tokens.delete(k)}};
  const ctx=vm.createContext({window:{},matchMedia:()=>media,localStorage:{getItem:()=>null,setItem(){}},document:{documentElement:element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}}});
  vm.runInContext(js,ctx);
  const foundation=ctx.window.VeloraFoundation;
  const theme=foundation.use('appearance').createTheme({catalog:{plugin_api:1,items:[{id:'test',color_scheme:'dark',colors:{paper:'#123456'}}]},onChange:change=>saved.push(change)});
  assert.equal(element.dataset.appearance,'light');
  media.matches=true;events.get('change')();
  assert.equal(element.dataset.appearance,'dark');
  assert.equal(saved.length,0);
  theme.set('test');assert.equal(tokens.get('--paper'),'#123456');
  theme.set('light');assert.equal(tokens.has('--paper'),false);
  media.matches=false;events.get('change')();assert.equal(theme.get(),'light');
  const font=foundation.use('fonts').create();font.set('rounded');
  assert.match(tokens.get('--app-font'),/ui-rounded/);
  font.destroy();theme.destroy();assert.equal(events.size,0);
});

// Dependency order is not CSS cascade order: theme bindings must follow shell defaults.
test('default composition keeps navigation and avatar colours theme-driven',async()=>{
  const {css}=await bundle(root);
  assert(css.indexOf('nav a { color: var(--nav-text); }')>css.indexOf('nav a { display: flex;'));
  assert(css.indexOf('.avatar { background: var(--avatar-surface);')>css.indexOf('.avatar { display: grid;'));
});
