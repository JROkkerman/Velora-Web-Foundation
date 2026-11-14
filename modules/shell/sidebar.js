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
