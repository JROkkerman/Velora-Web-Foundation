#!/usr/bin/env node
// Shared consumer updater. Node and Git are build-time tools; deployed apps remain offline.
import {readFile,writeFile,mkdir,readdir,lstat,realpath,cp,rm,mkdtemp,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createLock,verifyLock,inspectPackage} from './build.mjs';
const exec=promisify(execFile);
export const REPOSITORY='https://github.com/JROkkerman/Velora-Web-Foundation';
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const vendor='frontend/vendor/velora-web-foundation';
const lockPath='frontend/foundation.lock.json';
const configPath='frontend/foundation.config.json';
const packageFiles=['velora-foundation.json','LICENSE','README.md','modules','tools'];
const exists=async p=>{try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const serialize=value=>JSON.stringify(value,null,2)+'\n';
function relative(value){if(typeof value!=='string'||!value||value.includes('\\')||path.isAbsolute(value)||value.split('/').some(p=>p==='..'||p==='.'||!p))throw new Error(`Unsafe relative path: ${value}`);return value;}
async function noSymlinks(root,name){let current=root;for(const part of relative(name).split('/')){current=path.join(current,part);if(await exists(current)&& (await lstat(current)).isSymbolicLink())throw new Error(`Symlinks are not supported in update paths: ${current}`);}}
async function copyPlain(from,to){const stat=await lstat(from);if(stat.isSymbolicLink())throw new Error(`Package contains a symlink: ${from}`);if(stat.isDirectory()){await mkdir(to,{recursive:true});for(const entry of (await readdir(from)).sort()){if(entry.startsWith('.'))continue;await copyPlain(path.join(from,entry),path.join(to,entry));}}else if(stat.isFile()){await mkdir(path.dirname(to),{recursive:true});await cp(from,to);}else{throw new Error(`Unsupported package file: ${from}`);}}
async function copyPackage(from,to){await mkdir(to,{recursive:true});for(const name of packageFiles){await noSymlinks(from,name);await copyPlain(path.join(from,name),path.join(to,name));}}
async function git(cwd,args){return (await exec('git',['-c','core.hooksPath=/dev/null',...args],{cwd,encoding:'utf8',maxBuffer:16*1024*1024,timeout:120_000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}})).stdout.trim();}
function validRef(ref){if(typeof ref!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)||ref.includes('..')||ref.includes('//'))throw new Error('Use a branch, tag, or commit SHA for --ref.');return ref;}

async function sourceSnapshot(temporary,{source,ref,repository=REPOSITORY}){
    let root,metadata;
    if(source){
        if(ref)throw new Error('Choose --source for local edits, or --ref for a Git release; not both.');
        root=await realpath(source);let commit;
        try{commit=await git(root,['rev-parse','HEAD']);if(await realpath(await git(root,['rev-parse','--show-toplevel']))!==root)throw new Error('not the repository root');}catch{throw new Error('--source must point to the Foundation Git checkout.');}
        metadata={kind:'local-worktree',repository,base_commit:commit};
    }else{
        const selected=validRef(ref||'main');root=path.join(temporary,'checkout');await mkdir(root);
        await git(root,['init','--quiet']);await git(root,['remote','add','origin',repository]);
        await git(root,['fetch','--quiet','--depth=1','origin',selected]);
        const commit=await git(root,['rev-parse','FETCH_HEAD^{commit}']);
        await git(root,['checkout','--quiet','--detach',commit]);metadata={kind:'git',repository,commit};
    }
    const snapshot=path.join(temporary,'package');await copyPackage(root,snapshot);
    const info=await inspectPackage(snapshot);if(info.manifest.lock_version!==2||!await exists(path.join(snapshot,'tools/update.mjs')))throw new Error('This source predates the shared updater. Use Foundation 0.1.1 or newer, or update from the local Foundation checkout.');return {root:snapshot,metadata};
}
function command(args){if(!Array.isArray(args)||!args.length||args.some(a=>typeof a!=='string'||!a)||args.includes('-e')||args.includes('--eval'))throw new Error('Each check must be a Node script or node --test command.');const script=args[0]==='--test'?args.slice(1):[args[0]];if(!script.length)throw new Error('Specify test files explicitly.');for(const p of script)relative(p);return args;}
async function node(app,args,log){log(`  node ${args.join(' ')}`);try{const result=await exec(process.execPath,args,{cwd:app,encoding:'utf8',maxBuffer:16*1024*1024,timeout:180_000});if(result.stdout.trim())log(result.stdout.trim());}catch(error){throw new Error(`Check failed in ${path.basename(app)}: node ${args.join(' ')}\n${error.stderr||error.stdout||error.message}`);}}
async function inspectApp(app,log){
    app=await realpath(app);for(const item of [configPath,lockPath,vendor,'temp/foundation-backups'])await noSymlinks(app,item);
    const config=await json(path.join(app,configPath));const lock=await json(path.join(app,lockPath));
    if(config.config_version!==1||config.foundation_api!==1)throw new Error(`Unsupported Foundation consumer configuration in ${app}`);
    if(!Array.isArray(config.outputs)||!config.outputs.length||new Set(config.outputs).size!==config.outputs.length)throw new Error('List the generated Foundation outputs in the consumer configuration.');
    for(const output of config.outputs){relative(output);if(!output.startsWith('frontend/assets/')&&output!=='frontend/index.html'&&!/^frontend\/templates\/foundation\/[^/]+\.html$/.test(output))throw new Error(`Unsupported generated frontend output: ${output}`);await noSymlinks(app,output);}
    command(config.build);if(!Array.isArray(config.checks)||!config.checks.length)throw new Error('The consumer must define verification checks.');config.checks.forEach(command);
    await verifyLock(path.join(app,vendor),lock);
    // Run existing checks first: a stale/hand-edited generated asset must not be silently replaced.
    for(const check of config.checks)await node(app,check,log);
    return {root:app,config,lock,paths:[vendor,lockPath,...config.outputs]};
}
async function saveBackup(app,id){
    const destination=path.join(app.root,'temp/foundation-backups',id);await mkdir(destination,{recursive:true});const present=[];
    for(const file of app.paths){await noSymlinks(app.root,file);if(await exists(path.join(app.root,file))){await cp(path.join(app.root,file),path.join(destination,'files',file),{recursive:true});present.push(file);}}
    await writeFile(path.join(destination,'backup.json'),serialize({backup_version:1,created_at:new Date().toISOString(),paths:app.paths,present}));
    return {root:destination,app:app.root,paths:app.paths,present};
}
async function restore(backup){for(const file of backup.paths){await noSymlinks(backup.app,file);await rm(path.join(backup.app,file),{recursive:true,force:true});if(backup.present.includes(file)){await mkdir(path.dirname(path.join(backup.app,file)),{recursive:true});await cp(path.join(backup.root,'files',file),path.join(backup.app,file),{recursive:true});}}}
async function acquire(app,id){const marker=path.join(app,'.foundation-update.lock');try{await writeFile(marker,serialize({id,pid:process.pid,started:new Date().toISOString()}),{flag:'wx'});}catch(error){if(error.code==='EEXIST')throw new Error(`Another update may be running in ${app}. If an earlier process was interrupted, see docs for recovery before removing .foundation-update.lock.`);throw error;}return marker;}
async function release(markers){for(const marker of markers)await rm(marker,{force:true});}
export async function updateApps(options){
    const log=options.log||console.log;const targets=[...new Set((options.apps||[]).map(p=>path.resolve(p)))];if(!targets.length)throw new Error('Choose at least one application with --app.');
    if(options.source&&targets.some(p=>path.resolve(options.source)===p))throw new Error('Foundation source and application destination must be separate checkouts.');
    const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);const markers=[],backups=[];const temporary=await mkdtemp(path.join(tmpdir(),'velora-foundation-update-'));
    try{
        for(const app of [...targets].sort())markers.push(await acquire(await realpath(app),id));
        const source=await sourceSnapshot(temporary,options);const apps=[];
        for(const target of targets){log(`Checking ${path.basename(target)}…`);const app=await inspectApp(target,log);app.nextLock=await createLock(source.root,app.config.modules ?? app.lock.modules,source.metadata);if(app.nextLock.foundation_api!==app.config.foundation_api)throw new Error(`${path.basename(target)} does not support this Foundation API.`);apps.push(app);}
        const changes=apps.filter(app=>JSON.stringify(app.lock)!==JSON.stringify(app.nextLock));
        const summary=apps.map(app=>({app:app.root,from:app.lock.version,to:app.nextLock.version,changed:changes.includes(app),source:source.metadata}));
        if(options.check){log(serialize(summary));log('Preview only; application files were not changed.');return summary;}
        if(!changes.length){log('Both the pinned source and package contents are already up to date.');return summary;}
        for(const app of changes)backups.push(await saveBackup(app,id));
        try{
            for(const app of changes){log(`Updating ${path.basename(app.root)}: ${app.lock.version} → ${app.nextLock.version}`);
                const stage=await mkdtemp(path.join(app.root,'frontend/vendor/.foundation-stage-'));
                try{await copyPackage(source.root,stage);await rm(path.join(app.root,vendor),{recursive:true,force:true});await rename(stage,path.join(app.root,vendor));}finally{await rm(stage,{recursive:true,force:true});}
                await writeFile(path.join(app.root,lockPath),serialize(app.nextLock));await node(app.root,app.config.build,log);
                for(const check of app.config.checks)await node(app.root,check,log);
            }
        }catch(error){const failures=[];for(const backup of backups.reverse()){try{await restore(backup);}catch(e){failures.push(`${backup.app}: ${e.message}`);}}
            if(failures.length)throw new Error(`${error.message}\nAutomatic restore needs attention: ${failures.join('; ')}. Backups: ${id}`);
            throw new Error(`${error.message}\nAll applications were restored to their previous Foundation files. Backup: ${id}`);
        }
        for(const app of changes)log(`${path.basename(app.root)} updated. Backup: temp/foundation-backups/${id}`);
        log('Update complete. Review and commit the changes, then rebuild/redeploy each app when ready.');return summary;
    }finally{await release(markers);await rm(temporary,{recursive:true,force:true});}
}
export async function restoreApps({apps,id,log=console.log}){
    if(!apps?.length)throw new Error('Choose at least one application with --app.');
    if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Use the backup folder name, not a path.');
    const markers=[],backups=[],current=[];
    const recoveryId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
    try{
        for(const target of [...new Set(apps.map(p=>path.resolve(p)))].sort()){
            const app=await realpath(target);markers.push(await acquire(app,`restore-${id}`));await noSymlinks(app,`temp/foundation-backups/${id}`);
            const config=await json(path.join(app,configPath));const root=path.join(app,'temp/foundation-backups',id);const saved=await json(path.join(root,'backup.json'));
            const allowed=[vendor,lockPath,...config.outputs];
            if(saved.backup_version!==1||JSON.stringify(saved.paths)!==JSON.stringify(allowed)||!Array.isArray(saved.present)||saved.present.some(p=>!allowed.includes(p)))throw new Error(`Backup does not match ${path.basename(app)}.`);
            for(const p of allowed){relative(p);await noSymlinks(app,p);}
            for(const p of saved.present)await noSymlinks(root,`files/${p}`);
            const pinned=await json(path.join(root,'files',lockPath));await verifyLock(path.join(root,'files',vendor),pinned);
            config.checks.forEach(command);backups.push({root,app,paths:saved.paths,present:saved.present,config});
        }
        for(const backup of backups)current.push(await saveBackup({root:backup.app,paths:backup.paths},recoveryId));
        try{
            for(const backup of backups){await restore(backup);for(const check of backup.config.checks)await node(backup.app,check,log);log(`Restored ${path.basename(backup.app)} from ${id}.`);}
        }catch(error){const failures=[];for(const backup of current.reverse()){try{await restore(backup);}catch(e){failures.push(e.message);}}
            throw new Error(`${error.message}\n${failures.length?'Restore needs attention: '+failures.join('; '):'The pre-restore files were recovered.'} Recovery backup: ${recoveryId}`);
        }
        log(`Pre-restore files are backed up in temp/foundation-backups/${recoveryId}.`);
    }finally{await release(markers);}
}

export async function main(argv=process.argv.slice(2),defaults={}){
    const options={...defaults,apps:[...(defaults.apps||[])]};let all=false;
    for(let i=0;i<argv.length;i++){const flag=argv[i];if(['--app','--source','--ref','--restore'].includes(flag)){const value=argv[++i];if(!value||value.startsWith('--'))throw new Error(`${flag} needs a value.`);if(flag==='--app')options.apps.push(value);else options[flag.slice(2)]=value;}else if(flag==='--all')all=true;else if(flag==='--check')options.check=true;else if(flag==='--help'||flag==='-h'){console.log('Foundation update\n  --all                 Update sibling Velora-Music-Web and Velora-Receipts-Web\n  --app PATH            Update one checkout (repeat for multiple apps)\n  --source PATH         Use local Foundation edits, marked as a local-worktree lock\n  --ref REF             Download a GitHub branch, tag or commit (default: main)\n  --check               Preview the update and run current checks\n  --restore BACKUP_ID   Restore a previous update backup\n\n--all uses this Foundation checkout unless --ref or --source is supplied.');return;}else throw new Error(`Unknown option: ${flag}`);}
    if(all&&!options.apps.length)options.apps=['Velora-Music-Web','Velora-Receipts-Web'].map(name=>path.resolve(packageRoot,'..',name));
    if(all&&!options.source&&!options.ref&&!options.restore)options.source=packageRoot;
    if(!all&&!options.ref&&!options.source&&!options.restore&&defaults.localSource&&await exists(defaults.localSource))options.source=defaults.localSource;
    if(options.restore){if(options.source||options.ref||options.check)throw new Error('--restore cannot be combined with source/ref/check options.');return restoreApps({...options,id:options.restore});}
    return updateApps(options);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
