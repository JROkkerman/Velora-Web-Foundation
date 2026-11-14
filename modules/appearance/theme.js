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

