import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {bundle} from '../tools/build.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));

function target() {
  const listeners=new Map(),classes=new Set(),attributes=new Map(),children=new Map();
  return {listeners,children,style:{setProperty(){}},hidden:false,inert:false,
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    emit(type,extra={}){const event={preventDefault(){},stopPropagation(){},...extra};for(const fn of listeners.get(type)||[])fn(event);},
    classList:{contains:key=>classes.has(key),toggle(key,value){if(value)classes.add(key);else classes.delete(key);}},
    setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name),
    getBoundingClientRect:()=>({top:120}),querySelector:selector=>children.get(selector)||null,
    contains(node){return node===this;},focus(){this.focused=true;},click(){this.emit('click');}
  };
}

test('sidebar supports independent groups, keyboard navigation, narrow screens and clean unmounting',async()=>{
  const {js}=await bundle(root,{modules:['shell']});
  const window=target(),document=target(),media=Object.assign(target(),{matches:true}),storage=new Map();
  const context=vm.createContext({window,document,innerHeight:900,matchMedia:()=>media,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(js,context);
  const app=target(),sidebar=target(),toggle=target(),profile=target(),summary=target(),nav=target();
  sidebar.children.set('nav',nav);profile.children.set('summary',summary);
  const groups=[0,1].map(()=>{const panel=target();panel.children.set('a,button',target());return {panel,trigger:target()};});
  const controller=window.VeloraFoundation.use('shell').mountSidebar({app,sidebar,toggle,profile,groups,storageKey:'test-app-sidebar'});
  assert(!controller.isCollapsed());
  toggle.click();assert(controller.isCollapsed());assert.equal(storage.get('test-app-sidebar'),'true');assert(summary.focused);
  groups[0].trigger.click();assert.equal(groups[0].panel.inert,false);
  groups[1].trigger.click();assert.equal(groups[0].panel.inert,true);assert.equal(groups[1].panel.inert,false);
  document.emit('keydown',{key:'Escape'});assert.equal(groups[1].panel.inert,true);assert(groups[1].trigger.focused);
  groups[0].trigger.emit('keydown',{key:'ArrowDown'});assert(groups[0].panel.children.get('a,button').focused);
  document.emit('pointerdown',{target:target()});assert(groups[0].panel.inert);
  media.matches=false;media.emit('change');assert(!controller.isCollapsed());assert(toggle.hidden);
  media.matches=true;media.emit('change');assert(controller.isCollapsed());
  controller.destroy();toggle.click();assert(controller.isCollapsed());
  for(const node of [window,document,media,toggle,nav,...groups.flatMap(g=>[g.trigger,g.panel])]) assert.equal([...node.listeners.values()].reduce((sum,set)=>sum+set.size,0),0);
});
