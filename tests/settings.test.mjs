import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {bundle} from '../tools/build.mjs';
import {renderHousehold} from '../tools/household.mjs';
const root=new URL('../',import.meta.url).pathname;
async function settings(){const {js}=await bundle(root,{modules:['appearance']});const context=vm.createContext({window:{}});vm.runInContext(js,context);return context.window.VeloraFoundation.use('settings');}
test('settings is optional, app independent and escapes catalog and product content',async()=>{
 const ui=await settings(),html=ui.render({productName:'<img src=x>',fontSample:'<script>bad</script>',themeChoices:[{id:'ruby',name:'A&B',description:'" onfocus="bad'}],fontChoices:[{id:'x',name:'<Font>',family:'" onmouseover="bad'}]});
 assert(!html.includes('<img'));assert(!html.includes('<script>'));assert(!html.includes('<Font>'));assert(!html.includes('onfocus="bad'));assert(!html.includes('onmouseover="bad'));assert(html.includes('A&amp;B'));
 assert(html.includes('data-theme-choice="system"'));assert(html.includes('data-theme-choice="none"'));
 const {js}=await bundle(root,{modules:['identity']});assert(!js.includes('Find a theme'));
});
test('settings mounts once, scopes choices, dismisses menus and releases handlers',async()=>{
 const ui=await settings(),listeners=new Map();let saves=0,syncs=0,focused=0;
 const doc={addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:(k,v)=>{if(listeners.get(k)===v)listeners.delete(k);}};
 const summary={focus:()=>focused++},menu={open:true,contains:()=>false,querySelector:()=>summary};
 const root={ownerDocument:doc,contains:b=>b.inside,querySelector:()=>summary,querySelectorAll:()=>[menu]};
 const mount=ui.mount({root,theme:{set:()=>saves++,sync:()=>syncs++},font:{sync:()=>syncs++}});assert.equal(syncs,2);
 const button={inside:true,dataset:{themeChoice:'ruby'},closest:()=>menu};listeners.get('click')({target:{closest:()=>button}});assert.equal(saves,1);assert.equal(menu.open,false);
 button.inside=false;listeners.get('click')({target:{closest:()=>button}});assert.equal(saves,1);
 menu.open=true;listeners.get('keydown')({key:'Escape'});assert(!menu.open);assert.equal(focused,2);mount.destroy();assert.equal(listeners.size,0);
});
test('shared picker has no top branding and exposes device connection only when enabled',async()=>{
 const config={productName:'Velora Receipts',logo:{href:'/assets/logo.svg#mark',viewBox:'0 0 24 24'}};
 const a=await renderHousehold(root,{...config,connectDevices:true}),b=await renderHousehold(root,config);
 assert(!a.picker.includes('profile-picker-brand'));assert.equal((a.picker.match(/id="picker-connect-device"/g)||[]).length,1);assert(!b.picker.includes('picker-connect-device'));
});
