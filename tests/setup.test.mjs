import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderSetup} from '../tools/setup.mjs';
import {createLock,verifyLock} from '../tools/build.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const music={productName:'Velora Music',logo:{href:'/assets/music.svg#mark',viewBox:'0 0 512 512'}};
test('products share one setup layout and all visible copy except branding',async()=>{
 const a=await renderSetup(root,music);
 const b=await renderSetup(root,{productName:'Velora Receipts',logo:{href:'/static/receipts.svg#mark',viewBox:'0 0 24 24'}});
 assert.equal(a.replaceAll('Velora Music','PRODUCT').replaceAll('>Music<','>APP<').replaceAll('/assets/music.svg#mark','LOGO').replaceAll('0 0 512 512','VIEWBOX'),b.replaceAll('Velora Receipts','PRODUCT').replaceAll('>Receipts<','>APP<').replaceAll('/static/receipts.svg#mark','LOGO').replaceAll('0 0 24 24','VIEWBOX'));
 assert.deepEqual([...a.matchAll(/<input name="([^"]+)"/g)].map(m=>m[1]),['first_name','name_prefix','last_name','username','password','confirm_password']);
 assert.match(a,/minlength="12"/);assert.match(a,/aria-labelledby="setup-heading"/);
});
test('server form retains CSRF and escaped values, never redisplays passwords',async()=>{
 const html=await renderSetup(root,{...music,transport:'minijinja'});
 assert.match(html,/method="post" data-vf-identity-form/);assert.match(html,/name="csrfmiddlewaretoken" value="{{ csrf }}"/);
 assert.match(html,/{{ setup_values.first_name\|default\(''\) }}/);assert.match(html,/{{ error\|default\(''\) }}/);
 for(const match of html.matchAll(/<input[^>]+type="password"[^>]*>/g))assert(!match[0].includes('value='));
 assert(!html.includes('|safe'));assert(!html.includes('%PRODUCT%'));
});
test('branding is escaped and active or remote logo URLs are rejected',async()=>{
 const html=await renderSetup(root,{...music,productName:'<script>"&'});assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;&quot;&amp;'));
 for(const href of ['javascript:alert(1)','//outside.test/logo.svg','https://outside.test/logo.svg','/x" onload="bad'])await assert.rejects(()=>renderSetup(root,{...music,logo:{...music.logo,href}}),/local SVG/);
 await assert.rejects(()=>renderSetup(root,{...music,transport:'html'}),/Unsupported/);
});
test('setup template is integrity pinned and cannot be silently altered',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'velora-setup-lock-'));
 try{
  for(const name of ['modules','tools','velora-foundation.json','LICENSE'])await cp(path.join(root,name),path.join(dir,name),{recursive:true});
  const lock=await createLock(dir,['identity']);assert(lock.files['modules/identity/setup.html']);
  await verifyLock(dir,lock);const file=path.join(dir,'modules/identity/setup.html');await writeFile(file,(await readFile(file,'utf8'))+'tampered');
  await assert.rejects(()=>verifyLock(dir,lock),/integrity mismatch/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
