import {readFile, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const digest = content => createHash('sha256').update(content).digest('hex');
const idPattern=/^[a-z][a-z0-9-]*$/;
const versionPattern=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function safeRead(root, name) {
  if(typeof name!=='string'||!name||name.includes('\\')||path.isAbsolute(name)||name.split('/').includes('..')) throw new Error(`Unsafe package path: ${name}`);
  const base=await realpath(root), target=await realpath(path.join(root,name));
  if(!target.startsWith(base+path.sep)) throw new Error(`Package path escapes its root: ${name}`);
  if(!(await stat(target)).isFile()) throw new Error(`Package asset is not a file: ${name}`);
  return readFile(target,'utf8');
}
const readJSON=async(root,name)=>JSON.parse(await safeRead(root,name));

export async function inspectPackage(root, selected=['core','components','appearance','shell']) {
  const manifest=await readJSON(root,'velora-foundation.json');
  if(manifest.manifest_version!==1||manifest.foundation_api!==1||manifest.type!=='web-foundation'||manifest.id!=='velora-web-foundation'||!versionPattern.test(manifest.version)) throw new Error('Unsupported foundation manifest');
  if(!Array.isArray(manifest.modules)||manifest.modules.some(id=>typeof id!=='string'||!idPattern.test(id))) throw new Error('Invalid module catalog');
  if(!Array.isArray(selected)||selected.length===0||selected.some(id=>!manifest.modules.includes(id))||new Set(selected).size!==selected.length) throw new Error('Unknown or duplicate module selection');
  if(!Array.isArray(manifest.style_order)||manifest.style_order.some(name=>typeof name!=='string')||new Set(manifest.style_order).size!==manifest.style_order.length) throw new Error('Invalid foundation style order');
  const ordered=[],seen=new Set(),visiting=new Set(),files={'velora-foundation.json':await safeRead(root,'velora-foundation.json')};
  async function visit(id) {
    if(seen.has(id)) return;
    if(visiting.has(id)) throw new Error(`Circular module dependency: ${id}`);
    if(!manifest.modules.includes(id)) throw new Error(`Missing module dependency: ${id}`);
    visiting.add(id);
    const name=`modules/${id}/velora-module.json`, content=await safeRead(root,name), module=JSON.parse(content);
    if(module.manifest_version!==1||module.module_api!==1||module.type!=='web-module'||module.id!==id||!versionPattern.test(module.version)) throw new Error(`Unsupported module manifest: ${id}`);
    if(!module.dependencies||typeof module.dependencies!=='object'||Array.isArray(module.dependencies)) throw new Error(`Invalid module dependencies: ${id}`);
    for(const [dependency,api] of Object.entries(module.dependencies)) {
      if(api!==1) throw new Error(`Incompatible dependency API: ${id} → ${dependency}`);
      await visit(dependency);
    }
    files[name]=content;
    for(const kind of ['styles','scripts']) {
      if(!Array.isArray(module[kind])) throw new Error(`Missing ${kind}: ${id}`);
      for(const asset of module[kind]) {
        if(typeof asset!=='string'||!asset.endsWith(kind==='styles'?'.css':'.js')) throw new Error(`Invalid ${kind} asset: ${id}`);
        const assetPath=`modules/${id}/${asset}`;
        files[assetPath]=await safeRead(root,assetPath);
      }
    }
    visiting.delete(id);seen.add(id);ordered.push(module);
  }
  for(const id of selected) await visit(id);
  return {manifest,modules:ordered,files};
}

export async function createLock(root, selected, source={kind:'local-release'}) {
  const pkg=await inspectPackage(root,selected);
  const files=Object.fromEntries(Object.entries(pkg.files).sort().map(([name,content])=>[name,digest(content)]));
  // Include the build tooling and license in the integrity pin as well.
  for(const name of ['tools/build.mjs','LICENSE']) files[name]=digest(await safeRead(root,name));
  return {lock_version:1,foundation_api:1,version:pkg.manifest.version,source,modules:selected,files};
}

export async function verifyLock(root,lock) {
  if(lock.lock_version!==1||lock.foundation_api!==1) throw new Error('Unsupported foundation lock');
  const actual=await createLock(root,lock.modules,lock.source);
  if(actual.version!==lock.version||JSON.stringify(Object.keys(actual.files).sort())!==JSON.stringify(Object.keys(lock.files||{}).sort())) throw new Error('Foundation lock does not match the installed package');
  for(const [name,hash] of Object.entries(actual.files)) if(lock.files[name]!==hash) throw new Error(`Foundation integrity mismatch: ${name}`);
}

export async function bundle(root,{modules,css,lock}={}) {
  if(lock) {
    await verifyLock(root,lock);
    if(modules&&JSON.stringify(modules)!==JSON.stringify(lock.modules)) throw new Error('Module selection differs from the lock');
    modules=lock.modules;
  }
  const pkg=await inspectPackage(root,modules);
  const styles=new Map(),scripts=[];
  for(const module of pkg.modules) {
    for(const name of module.styles) styles.set(`${module.id}/${name}`,pkg.files[`modules/${module.id}/${name}`]);
    for(const name of module.scripts) scripts.push(pkg.files[`modules/${module.id}/${name}`].replaceAll('__VELORA_FOUNDATION_VERSION__',pkg.manifest.version));
    if(module.scripts.length===0) scripts.push(`window.VeloraFoundation.define(${JSON.stringify(module.id)}, ${module.module_api}, ${JSON.stringify(Object.keys(module.dependencies))}, () => ({}));`);
  }
  // Expand at the original cascade positions: extracting CSS cannot reorder overrides.
  if([...styles.keys()].some(name=>!pkg.manifest.style_order.includes(name))) throw new Error('A selected style is missing from the foundation cascade order');
  const compiled=css===undefined?pkg.manifest.style_order.filter(name=>styles.has(name)).map(name=>styles.get(name)).join('\n'):css.replace(/\/\*\s*@foundation\s+([^\s*]+)\s*\*\/(?:\r?\n)?/g,(_,name)=>{
    if(!styles.has(name)) throw new Error(`Unselected or unknown foundation style: ${name}`);
    return styles.get(name);
  });
  if(compiled.includes('@foundation')) throw new Error('Malformed foundation CSS include');
  return {css:compiled,js:scripts.join('\n'),manifest:pkg.manifest,modules:pkg.modules.map(m=>({id:m.id,version:m.version,api:m.module_api}))};
}
