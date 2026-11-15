import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {bundle} from '../tools/build.mjs';
const root=new URL('../',import.meta.url).pathname;
class Node {
 constructor(tag='div',doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.listeners=new Map();this.attrs=new Map();this.children=[];this.dataset={};this.hidden=false;this.disabled=false;this.isConnected=true;this.textContent='';this.value='';this.classList={toggle(){}};}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 async emit(type,options={}){const event={target:this,preventDefault(){this.prevented=true;},...options};for(const fn of this.listeners.get(type)||[])await fn(event);return event;}
 setAttribute(k,v){this.attrs.set(k,String(v));}getAttribute(k){return this.attrs.get(k)??null;}removeAttribute(k){this.attrs.delete(k);}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
 matches(){return this.tagName==='FORM';}closest(){return this.tagName==='BUTTON'?this:null;}
 querySelector(selector){return selector==='[type=submit]'?this.button:this.feedback;}
 querySelectorAll(){return this.button?[this.button]:[];}
 focus(){this.ownerDocument.activeElement=this;}
 reset(){if(this.input)this.input.value='';}
 showModal(){this.open=true;}close(){if(this.open){this.open=false;this.emit('close');}}
}
async function fixture(){
 const doc={createElement:tag=>new Node(tag,doc),defaultView:new Node('window')};
 const ctx=vm.createContext({window:{},AbortController,FormData:class{constructor(form){this.values={...form.values};}get(key){return this.values[key];}*entries(){yield*Object.entries(this.values);}[Symbol.iterator](){return this.entries();}}});
 const {js}=await bundle(root,{modules:['identity']});vm.runInContext(js,ctx);
 const identity=ctx.window.VeloraFoundation.use('identity');const node=tag=>new Node(tag,doc);const form=node('form');form.values={username:'me',password:'secret',csrf:'csrf-value'};form.button=node('button');form.feedback=node('p');
 return {identity,node,doc,form};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('identity is optional and safely renders names without application globals',async()=>{
 const {identity}=await fixture();const html=identity.nameFields({first_name:'<img onerror="bad()">',last_name:"O'Neil"});assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(html.includes('autocomplete="given-name"'));assert(!html.includes('undefined'));
 assert.equal(identity.avatar({id:'abc',first_name:'😀 Person'}).initial,'😀');
 const {js}=await bundle(root,{modules:['shell']});assert(!js.includes('mountPinDialog'));
});
test('async login suppresses duplicate requests, restores controls and safely reports failure',async()=>{
 const {identity,form}=await fixture();let reject,calls=0;const binding=identity.bindForms(form,{submit:()=>{calls++;return new Promise((_,r)=>reject=r);}});
 const first=form.emit('submit');await tick();assert.equal(form.getAttribute('aria-busy'),'true');assert(form.button.disabled);assert((await form.emit('submit')).prevented);assert.equal(calls,1);
 reject(new Error('<img src=x onerror=bad()>'));await first;assert.equal(form.feedback.textContent,'<img src=x onerror=bad()>');assert(!form.button.disabled);assert.equal(form.getAttribute('aria-busy'),null);binding.destroy();
});
test('late profile saves do not update a switched account and reset aborts pending operations',async()=>{
 const {identity,form}=await fixture();let owner='a',resolve,signal,saves=0;const binding=identity.bindForms(form,{context:()=>owner,isCurrent:snapshot=>snapshot===owner,submit:(_,op)=>{signal=op.signal;return new Promise(r=>resolve=r);},onSuccess:()=>saves++});
 const first=form.emit('submit');owner='b';resolve({});await first;assert.equal(saves,0);
 const second=form.emit('submit');binding.reset();assert(signal.aborted);assert(!form.button.disabled);resolve({});await second;assert.equal(saves,0);binding.destroy();
});
test('native login preserves POST/CSRF and restores busy state after back navigation',async()=>{
 const {identity,form,doc}=await fixture();const binding=identity.bindForms(form);const event=await form.emit('submit');assert(!event.prevented);assert.equal(form.values.csrf,'csrf-value');assert(!form.button.disabled);assert((await form.emit('submit')).prevented);await doc.defaultView.emit('pageshow');assert.equal(form.getAttribute('aria-busy'),null);binding.destroy();assert.equal(form.listeners.get('submit').size,0);
});
test('invalid passwords are rejected before requests; form errors never become HTML',async()=>{
 const {identity,form}=await fixture();let sent=false;const binding=identity.bindForms(form,{validate:()=> 'Passwords must match.',submit:()=>{sent=true;}});assert((await form.emit('submit')).prevented);assert(!sent);assert.equal(form.feedback.textContent,'Passwords must match.');binding.destroy();
});
test('profile picker escapes names, filters management choices, blocks duplicate selection and recovers',async()=>{
 const {identity,node}=await fixture();const grid=node('div'),status=node('p');let resolve,calls=0;const picker=identity.mountProfilePicker({grid,status,onSelect:()=>{calls++;return new Promise(r=>resolve=r);},onAdd(){}});
 picker.render([{id:'admin',name:'<b>Admin</b>'},{id:'listener',name:'Listener'}],{allowAdd:true});assert.equal(grid.children.length,3);assert.equal(grid.children[0].children[1].textContent,'<b>Admin</b>');
 picker.filter(p=>p.id==='admin');assert(grid.children[1].hidden);assert(grid.children[2].hidden);
 const pending=grid.emit('click',{target:grid.children[0]});await grid.emit('click',{target:grid.children[0]});assert.equal(calls,1);resolve();await pending;assert(!grid.children[0].disabled);
 assert.throws(()=>picker.render([{id:'x'},{id:'x'}]),/unique/);picker.render([]);assert.equal(status.textContent,'No profiles available.');picker.destroy();assert.equal(grid.listeners.get('click').size,0);
});
test('PIN dialogs clear secrets and restore focus on close; cancelled responses cannot finish selection',async()=>{
 const {identity,node,form,doc}=await fixture();const dialog=node('dialog'),input=node('input'),heading=node('h2'),status=node('p'),cancel=node('button'),opener=node('button');form.input=input;opener.focus();let operation,resolve;
 const pin=identity.mountPinDialog({dialog,form,input,heading,status,cancel,onSubmit:(_,value,op)=>{assert.equal(value,'1234');operation=op;return new Promise(r=>resolve=r);}});
 pin.open({id:'x',name:'<Admin>'});assert(dialog.open);assert.equal(heading.textContent,'Enter PIN for <Admin>');assert.equal(doc.activeElement,input);input.value='1234';const pending=form.emit('submit');dialog.close();assert.equal(input.value,'');assert.equal(doc.activeElement,opener);assert(operation.signal.aborted);assert(!operation.isCurrent());resolve(true);await pending;assert(!dialog.open);pin.destroy();
});
