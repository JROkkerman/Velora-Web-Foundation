/* Velora Foundation API 1. Modules are bundled explicitly by the consuming app. */
(() => {
  'use strict';
  const modules = new Map([['core', {api:1, exports:{}}]]);
  const foundation = {
    api:1,
    version:'0.1.0',
    define(id, api, dependencies, create) {
      if(api !== 1) throw new Error(`Unsupported Velora module API: ${id}`);
      if(modules.has(id)) throw new Error(`Duplicate Velora module: ${id}`);
      for(const dependency of dependencies) {
        if(!modules.has(dependency)) throw new Error(`Missing Velora module: ${dependency}`);
      }
      const value=Object.freeze(create());
      modules.set(id,{api,exports:value});
      return value;
    },
    use(id) {
      if(!modules.has(id)) throw new Error(`Velora module is not installed: ${id}`);
      return modules.get(id).exports;
    },
    installed:() => [...modules.keys()]
  };
  window.VeloraFoundation=Object.freeze(foundation);
})();

window.VeloraFoundation.define("components", 1, ["core"], () => ({}));
/* Resolve core appearance or an independently loaded theme before CSS loads. */
window.VeloraFoundation.define('appearance', 1, ['core'], () => ({
 createTheme({catalog, storageKey='velora-last-appearance', onChange=()=>{}} = {}) {
  const media=matchMedia('(prefers-color-scheme: dark)');
  const standard=['light','dark','system'];
  const choices=catalog?.plugin_api===1&&Array.isArray(catalog.items)?catalog.items:[];
  const plugins=new Map(choices.map(plugin=>[plugin.id,plugin]));
  const valid=value=>standard.includes(value)||plugins.has(value);
  let remembered='system', appliedTokens=[];
  try{const saved=localStorage.getItem(storageKey);if(valid(saved))remembered=saved;}catch{}
  let preference=remembered;

  function preview(element,plugin){
    if(!element)return;
    for(const token of ['paper','surface','line','ink','accent','art-from','art-to']){
      element.style.removeProperty('--mini-'+token);
      if(plugin?.preview[token])element.style.setProperty('--mini-'+token,plugin.preview[token]);
    }
  }
  function apply(value){
    preference=valid(value)?value:'system';
    const plugin=plugins.get(preference), themed=!!plugin;
    const resolved=preference==='system'?(media.matches?'dark':'light'):preference;
    const root=document.documentElement;
    root.dataset.theme=resolved;
    root.dataset.themeChoice=preference;
    root.dataset.appearance=plugin?.color_scheme||resolved;
    for(const token of appliedTokens)root.style.removeProperty('--'+token);
    appliedTokens=Object.keys(plugin?.colors||{});
    for(const token of appliedTokens)root.style.setProperty('--'+token,plugin.colors[token]);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',plugin?.colors.paper||(resolved==='dark'?'#000000':'#ffffff'));
    document.querySelectorAll('button[data-theme-choice]').forEach(button=>{
      const id=button.dataset.themeChoice;
      const selected=id==='none'?!themed:id===preference;
      button.setAttribute('aria-pressed',String(selected));
      preview(button.querySelector('.theme-swatches'),plugins.get(id));
      const status=button.querySelector('.theme-status');
      if(status)status.textContent=selected?'Selected':'Choose theme';
      if(selected&&button.dataset.themeName){
        const name=document.querySelector('#theme-current-name'),description=document.querySelector('#theme-current-description');
        if(name)name.textContent=button.dataset.themeName;
        if(description)description.textContent=button.dataset.themeDescription||'';
      }
    });
    const current=document.querySelector('#theme-current-preview');
    if(current){current.className='theme-miniature preview-'+preference;preview(current,plugin);}
  }
  const controller={
    choices,get:()=>preference,load:value=>apply(value),
    getRemembered:()=>remembered,
    remember:value=>{
      remembered=valid(value)?value:preference;
      try{localStorage.setItem(storageKey,remembered);}catch{}
    },
    set:value=>{
      apply(value==='none'?(standard.includes(preference)?preference:'system'):value);
      document.querySelector('#theme-picker')?.removeAttribute('open');
      onChange({theme:preference});
    },
    sync:()=>apply(preference)
  };
  const filter = event=>{
    if(event.target.id!=='theme-filter')return;
    const query=event.target.value.trim().toLocaleLowerCase();
    document.querySelectorAll('#theme-picker [data-theme-choice]').forEach(button=>button.hidden=!button.dataset.themeName.toLocaleLowerCase().includes(query));
  };
  const deviceChanged=()=>apply(preference);
  document.addEventListener('input',filter);
  apply(preference);
  media.addEventListener('change',deviceChanged);
  controller.destroy=()=>{document.removeEventListener('input',filter);media.removeEventListener('change',deviceChanged);};
  return controller;
 }
}));


/* Device fonts keep appearance choices available offline. */
window.VeloraFoundation.define('fonts', 1, ['core'], () => ({
 create({onChange=()=>{}, originalDescription='Velora’s familiar, clean everyday type.'} = {}) {
  const choices = [
    {id:'original',name:'Original',description:originalDescription,family:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'},
    {id:'rounded',name:'Rounded',description:'Soft curves with a friendly, relaxed feel.',family:'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif'},
    {id:'humanist',name:'Humanist',description:'Open, easygoing letters with a little character.',family:'"Trebuchet MS", "Gill Sans", sans-serif'},
    {id:'classic',name:'Classic',description:'Warm, bookish lettering for a quieter atmosphere.',family:'Georgia, "Times New Roman", serif'},
    {id:'editorial',name:'Editorial',description:'Refined serif lettering with a more expressive touch.',family:'"Palatino Linotype", Palatino, "Book Antiqua", serif'},
    {id:'mono',name:'Mono',description:'Precise, evenly spaced letters with a studio feel.',family:'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'},
    {id:'avenir',name:'Avenir',description:'Clean, balanced lettering with an easygoing rhythm.',family:'Avenir, "Avenir Next", "Century Gothic", sans-serif'},
    {id:'optima',name:'Optima',description:'Gentle, sculpted letterforms with a refined feel.',family:'Optima, Candara, "Trebuchet MS", sans-serif'},
    {id:'baskerville',name:'Baskerville',description:'Warm, literary serif lettering.',family:'Baskerville, "Baskerville Old Face", Georgia, serif'},
    {id:'didot',name:'Didot',description:'Elegant, high-contrast lettering inspired by magazines.',family:'Didot, "Bodoni MT", "Times New Roman", serif'},
    {id:'verdana',name:'Verdana',description:'Open, spacious lettering for comfortable reading.',family:'Verdana, Geneva, sans-serif'},
    {id:'helvetica',name:'Helvetica',description:'Quiet, straightforward lettering with a familiar feel.',family:'"Helvetica Neue", Helvetica, Arial, sans-serif'},
    {id:'typewriter',name:'Typewriter',description:'A nostalgic, evenly spaced studio character.',family:'"American Typewriter", "Courier New", Courier, monospace'},
    {id:'futura',name:'Futura',description:'Geometric shapes with a distinctive, modern rhythm.',family:'Futura, "Century Gothic", Avenir, sans-serif'}
  ];
  let preference='original';
  function apply(value){
    const font=choices.find(item=>item.id===value)||choices[0];preference=font.id;
    document.documentElement.dataset.font=font.id;
    document.documentElement.style.setProperty('--app-font',font.family);
    const name=document.querySelector('#font-current-name'),description=document.querySelector('#font-current-description'),preview=document.querySelector('#font-current-preview');
    if(name)name.textContent=font.name;
    if(description)description.textContent=font.description;
    if(preview)preview.style.fontFamily=font.family;
    document.querySelectorAll('button[data-font-choice]').forEach(button=>{
      const selected=button.dataset.fontChoice===preference;button.setAttribute('aria-pressed',String(selected));
      const status=button.querySelector('.font-status');if(status)status.textContent=selected?'Selected':'Choose font';
    });
  }

  const controller={choices,get:()=>preference,load:value=>apply(value),sync:()=>apply(preference),set:value=>{apply(value);document.querySelector('#font-picker')?.removeAttribute('open');onChange({font:preference});}};
  apply(preference);
  const filter=event=>{
    if(event.target.id!=='font-filter')return;
    const query=event.target.value.trim().toLocaleLowerCase();
    document.querySelectorAll('#font-picker [data-font-choice]').forEach(button=>button.hidden=!button.dataset.fontName.toLocaleLowerCase().includes(query));
  };
  const select=event=>{const button=event.target.closest('button[data-font-choice]');if(button)controller.set(button.dataset.fontChoice);};
  document.addEventListener('input',filter);document.addEventListener('click',select);
  controller.destroy=()=>{document.removeEventListener('input',filter);document.removeEventListener('click',select);};
  return controller;
 }
}));

/* The app supplies elements, labels and persistence keys; no product routes or APIs. */
window.VeloraFoundation.define('shell', 1, ['core'], () => ({
  mountSidebar({app, sidebar, toggle, profile=null, groups=[], storageKey='velora-sidebar-collapsed',
    breakpoint='(min-width: 761px)', labels={expand:'Expand sidebar',collapse:'Collapse sidebar'}}) {
    if(!app || !sidebar || !toggle) throw new Error('Sidebar requires app, sidebar and toggle elements');
    const desktop=matchMedia(breakpoint), cleanups=[];
    let preferred=false;
    try { preferred=localStorage.getItem(storageKey)==='true'; } catch {}
    const listen=(target,event,fn) => {
      if(!target) return;
      target.addEventListener(event,fn);
      cleanups.push(()=>target.removeEventListener(event,fn));
    };
    const collapsed=()=>app.classList.contains('sidebar-collapsed');
    function position(group) {
      if(!collapsed()) return;
      const top=Math.max(12,Math.min(group.trigger.getBoundingClientRect().top,innerHeight-410));
      group.panel.style.setProperty('--sidebar-menu-top',`${top}px`);
    }
    function expand(group, expanded) {
      position(group);
      group.trigger.setAttribute('aria-expanded',String(expanded));
      group.panel.classList.toggle('expanded',expanded);
      group.panel.inert=!expanded;
    }
    function apply() {
      const value=desktop.matches && preferred;
      app.classList.toggle('sidebar-collapsed',value);
      toggle.setAttribute('aria-expanded',String(!value));
      const label=value?labels.expand:labels.collapse;
      toggle.setAttribute('aria-label',label);toggle.title=label;
      const labelNode=toggle.querySelector('.sidebar-toggle-label');
      if(labelNode) labelNode.textContent=label;
      toggle.hidden=!desktop.matches;
      if(profile) profile.open=false;
      for(const group of groups) expand(group,!value && group.trigger.classList.contains('active'));
    }
    for(const group of groups) {
      if(!group.trigger || !group.panel) throw new Error('Each sidebar group requires a trigger and panel');
      group.trigger.setAttribute('data-sidebar-disclosure','');
      listen(group.trigger,'click',event=>{
        if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
        event.preventDefault();event.stopPropagation();
        if(profile) profile.open=false;
        const open=group.trigger.getAttribute('aria-expanded')!=='true';
        if(collapsed() && open) for(const other of groups) if(other!==group) expand(other,false);
        expand(group,open);
      });
      listen(group.trigger,'keydown',event=>{
        if(event.key===' ') {event.preventDefault();group.trigger.click();}
        if(event.key==='ArrowDown'||event.key==='ArrowRight') {
          event.preventDefault();expand(group,true);group.panel.querySelector('a,button')?.focus();
        }
      });
      listen(group.panel,'click',event=>{if(collapsed() && event.target.closest('a')) expand(group,false);});
    }
    listen(toggle,'click',()=>{
      preferred=!collapsed();
      try {localStorage.setItem(storageKey,String(preferred));} catch {}
      apply();profile?.querySelector('summary')?.focus({preventScroll:true});
    });
    listen(desktop,'change',apply);
    listen(window,'resize',()=>groups.forEach(position));
    listen(sidebar.querySelector('nav'),'scroll',()=>groups.forEach(position));
    listen(document,'pointerdown',event=>{
      if(collapsed()) for(const group of groups) {
        if(!group.panel.contains(event.target)&&!group.trigger.contains(event.target)) expand(group,false);
      }
    });
    listen(document,'keydown',event=>{
      if(event.key!=='Escape'||!collapsed()) return;
      for(const group of groups) if(group.trigger.getAttribute('aria-expanded')==='true') {
        expand(group,false);group.trigger.focus();
      }
    });
    listen(window,'popstate',()=>{if(collapsed()) groups.forEach(group=>expand(group,false));});
    apply();
    return {isCollapsed:collapsed, setExpanded:(index,value)=>{if(groups[index]) expand(groups[index],value);},
      destroy:()=>cleanups.splice(0).forEach(cleanup=>cleanup())};
  }
}));
