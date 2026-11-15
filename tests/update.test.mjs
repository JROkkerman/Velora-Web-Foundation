import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,mkdir,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createLock,verifyLock} from '../tools/build.mjs';
import {updateApps,restoreApps} from '../tools/update.mjs';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const silent=()=>{};
const selected=['core','components','appearance','shell'];
const vendor='frontend/vendor/velora-web-foundation';
const lockFile='frontend/foundation.lock.json';
const git=async(cwd,args)=>(await exec('git',args,{cwd,env:{...process.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'safe.directory',GIT_CONFIG_VALUE_0:'*'}})).stdout.trim();
async function fixture(t){
 const base=await mkdtemp(path.join(tmpdir(),'foundation-update-test-'));t.after(()=>rm(base,{recursive:true,force:true}));const source=path.join(base,'Foundation');await mkdir(source);
 for(const name of ['modules','tools','velora-foundation.json','LICENSE','README.md'])await cp(path.join(root,name),path.join(source,name),{recursive:true});
 await git(source,['init','-b','main','--quiet']);await git(source,['config','user.email','fixture@example.test']);await git(source,['config','user.name','Test fixture']);await git(source,['add','.']);await git(source,['commit','-qm','Initial fixture']);const commit=await git(source,['rev-parse','HEAD']);
 async function app(name,legacy=false){const app=path.join(base,name);await mkdir(path.join(app,'frontend/assets'),{recursive:true});await mkdir(path.join(app,'scripts'));
 await cp(source,path.join(app,vendor),{recursive:true,filter:p=>!p.split(path.sep).includes('.git')});
 const lock=await createLock(path.join(app,vendor),selected,{kind:'git',repository:'fixture',commit},{lockVersion:legacy?1:2});await writeFile(path.join(app,lockFile),JSON.stringify(lock,null,2)+'\n');
 await writeFile(path.join(app,'frontend/foundation.config.json'),JSON.stringify({config_version:1,foundation_api:1,build:['scripts/build.mjs'],checks:[['scripts/build.mjs','--check']],outputs:['frontend/assets/bundle.css','frontend/assets/bundle.js']}));
 await writeFile(path.join(app,'scripts/build.mjs'),`import {readFile,writeFile} from 'node:fs/promises'; import {bundle} from '../${vendor}/tools/build.mjs';const root=new URL('../',import.meta.url);const lock=JSON.parse(await readFile(new URL('${lockFile}',root),'utf8'));const result=await bundle(new URL('../${vendor}/',import.meta.url).pathname,{lock});for(const [p,text] of [['frontend/assets/bundle.css',result.css],['frontend/assets/bundle.js',result.js]]){if(process.argv.includes('--check')){if(await readFile(new URL(p,root),'utf8')!==text)throw new Error('stale generated asset');}else await writeFile(new URL(p,root),text);}`);
 await writeFile(path.join(app,'frontend/custom.css'),'/* app-specific: keep me */');await exec(process.execPath,['scripts/build.mjs'],{cwd:app});return app;
 }
 async function change(marker='test-update'){const p=path.join(source,'modules/core/base.css');await writeFile(p,(await readFile(p,'utf8'))+`\n/* ${marker} */\n`);}
 return {base,source,app,change,commit};
}
async function snapshot(app){const map={};async function walk(dir,rel=''){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=rel?`${rel}/${entry.name}`:entry.name;if(p.startsWith('temp')||p==='.foundation-update.lock')continue;if(entry.isDirectory())await walk(path.join(dir,entry.name),p);else map[p]=(await readFile(path.join(dir,entry.name))).toString('base64');}}await walk(app);return map;}

test('one update applies the same local snapshot to both apps and preserves app-specific files',async t=>{
 const f=await fixture(t),a=await f.app('Music',true),b=await f.app('Receipts');await f.change();await writeFile(path.join(f.source,'tools/future-helper.mjs'),'export const helper = true;');const results=await updateApps({apps:[a,b],source:f.source,log:silent});assert(results.every(r=>r.changed));
 const locks=await Promise.all([a,b].map(p=>readFile(path.join(p,lockFile),'utf8')));assert.equal(locks[0],locks[1]);const lock=JSON.parse(locks[0]);assert.equal(lock.lock_version,2);assert.equal(lock.source.kind,'local-worktree');assert.equal(lock.source.base_commit,f.commit);assert.deepEqual(lock.modules,selected);assert(lock.files['tools/update.mjs']);assert(lock.files['tools/run-update.sh']);assert(lock.files['tools/future-helper.mjs']);
 for(const app of [a,b]){await verifyLock(path.join(app,vendor),lock);assert.match(await readFile(path.join(app,'frontend/assets/bundle.css'),'utf8'),/test-update/);assert.equal(await readFile(path.join(app,'frontend/custom.css'),'utf8'),'/* app-specific: keep me */');assert.equal((await readdir(path.join(app,'temp/foundation-backups'))).length,1);}
 const again=await updateApps({apps:[a,b],source:f.source,log:silent});assert(again.every(r=>!r.changed));assert.equal((await readdir(path.join(a,'temp/foundation-backups'))).length,1);
});

test('preview does not mutate either application',async t=>{const f=await fixture(t),a=await f.app('Music'),b=await f.app('Receipts');const before=await Promise.all([a,b].map(snapshot));await f.change();assert((await updateApps({apps:[a,b],source:f.source,check:true,log:silent})).every(r=>r.changed));assert.deepEqual(await Promise.all([a,b].map(snapshot)),before);});

test('a failed check in the second app rolls back both applications exactly',async t=>{
 const f=await fixture(t),a=await f.app('Music'),b=await f.app('Receipts');await writeFile(path.join(b,'scripts/reject.mjs'),`import {readFile} from 'node:fs/promises';if((await readFile('frontend/assets/bundle.css','utf8')).includes('reject-me'))throw new Error('Consumer rejected this update');`);
 const config=JSON.parse(await readFile(path.join(b,'frontend/foundation.config.json'),'utf8'));config.checks.push(['scripts/reject.mjs']);await writeFile(path.join(b,'frontend/foundation.config.json'),JSON.stringify(config));const before=await Promise.all([a,b].map(snapshot));await f.change('reject-me');
 await assert.rejects(()=>updateApps({apps:[a,b],source:f.source,log:silent}),/All applications were restored/);assert.deepEqual(await Promise.all([a,b].map(snapshot)),before);
});

test('local vendor edits and stale generated files are protected before writing',async t=>{
 const f=await fixture(t),a=await f.app('Music');await f.change();const asset=path.join(a,'frontend/assets/bundle.css');await writeFile(asset,'hand-edited output');const before=await snapshot(a);await assert.rejects(()=>updateApps({apps:[a],source:f.source,log:silent}),/Check failed/);assert.deepEqual(await snapshot(a),before);
 await exec(process.execPath,['scripts/build.mjs'],{cwd:a});await writeFile(path.join(a,vendor,'modules/core/base.css'),'hand-edited vendor');const beforeVendor=await snapshot(a);await assert.rejects(()=>updateApps({apps:[a],source:f.source,log:silent}),/integrity mismatch/);assert.deepEqual(await snapshot(a),beforeVendor);
});

test('incompatible APIs and package symlinks are rejected without changing consumers',async t=>{
 const f=await fixture(t),a=await f.app('Music');const before=await snapshot(a);const file=path.join(f.source,'velora-foundation.json');const manifest=JSON.parse(await readFile(file,'utf8'));await writeFile(file,JSON.stringify({...manifest,foundation_api:2}));await assert.rejects(()=>updateApps({apps:[a],source:f.source,log:silent}),/Unsupported foundation/);assert.deepEqual(await snapshot(a),before);
 await writeFile(file,JSON.stringify(manifest));const asset=path.join(f.source,'modules/core/base.css');await rm(asset);await symlink(path.join(a,'frontend/custom.css'),asset);await assert.rejects(()=>updateApps({apps:[a],source:f.source,log:silent}),/symlink/);assert.deepEqual(await snapshot(a),before);
});

test('Git branch and tag updates resolve to an exact commit and omit uncommitted source edits',async t=>{
 const f=await fixture(t),a=await f.app('Music');await f.change('committed-change');await git(f.source,['add','.']);await git(f.source,['commit','-qm','Release']);await git(f.source,['tag','v-test']);const commit=await git(f.source,['rev-parse','HEAD']);await f.change('uncommitted-change');
 const result=await updateApps({apps:[a],repository:f.source,ref:'v-test',log:silent});assert.equal(result[0].source.kind,'git');assert.equal(result[0].source.commit,commit);const css=await readFile(path.join(a,'frontend/assets/bundle.css'),'utf8');assert.match(css,/committed-change/);assert(!css.includes('uncommitted-change'));
});

test('backups restore the previous package, lock, and generated files',async t=>{const f=await fixture(t),a=await f.app('Music');const before=await snapshot(a);await f.change();await updateApps({apps:[a],source:f.source,log:silent});const [id]=await readdir(path.join(a,'temp/foundation-backups'));await restoreApps({apps:[a],id,log:silent});assert.deepEqual(await snapshot(a),before);});

test('an existing update lock prevents concurrent writers and is not removed',async t=>{const f=await fixture(t),a=await f.app('Music');await writeFile(path.join(a,'.foundation-update.lock'),'other updater');await assert.rejects(()=>updateApps({apps:[a],source:f.source,log:silent}),/Another update/);assert.equal(await readFile(path.join(a,'.foundation-update.lock'),'utf8'),'other updater');});

test('unsafe generated paths are rejected before any copy',async t=>{const f=await fixture(t),a=await f.app('Music');const file=path.join(a,'frontend/foundation.config.json');const config=JSON.parse(await readFile(file,'utf8'));config.outputs=['frontend/assets/../../outside'];await writeFile(file,JSON.stringify(config));const before=await snapshot(a);await assert.rejects(()=>updateApps({apps:[a],source:f.source,log:silent}),/Unsafe relative path/);assert.deepEqual(await snapshot(a),before);});

test('consumer configuration can opt into identity without editing the old integrity lock',async t=>{
 const f=await fixture(t),a=await f.app('Music');const file=path.join(a,'frontend/foundation.config.json');const config=JSON.parse(await readFile(file,'utf8'));config.modules=[...selected,'identity'];await writeFile(file,JSON.stringify(config));
 await updateApps({apps:[a],source:f.source,log:silent});const lock=JSON.parse(await readFile(path.join(a,lockFile),'utf8'));assert.deepEqual(lock.modules,config.modules);assert(lock.files['modules/identity/identity.js']);assert.match(await readFile(path.join(a,'frontend/assets/bundle.js'),'utf8'),/mountProfilePicker/);
});
