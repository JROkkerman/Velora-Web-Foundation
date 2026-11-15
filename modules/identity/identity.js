/* Identity UI, API 1. Apps own authentication, permissions, data and navigation. */
window.VeloraFoundation.define('identity', 1, ['core', 'components'], () => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function nameFields(person = {}, labels = {}) {
    const text = {first:'First name',prefix:'Name prefix',optional:'optional',last:'Last name',...labels};
    return `<div class="person-name-fields"><label>${escape(text.first)}<input name="first_name" autocomplete="given-name" value="${escape(person.first_name ?? person.name ?? '')}" maxlength="100" required></label><label>${escape(text.prefix)} <small>(${escape(text.optional)})</small><input name="name_prefix" autocomplete="off" value="${escape(person.name_prefix)}" maxlength="50"></label><label>${escape(text.last)}<input name="last_name" autocomplete="family-name" value="${escape(person.last_name)}" maxlength="100" required></label></div>`;
  }
  function avatar(profile) {
    let hash = 0;
    for (const character of String(profile.id ?? profile.name ?? '')) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
    return {className:`profile-color-${hash % 6}`, initial:Array.from(profile.first_name?.trim() || profile.name?.trim() || '?')[0].toUpperCase()};
  }
  // Delegation supports both SPA forms and progressively enhanced server-rendered forms.
  // With no submit callback, the browser performs its original POST, including CSRF fields.
  function bindForms(root, {selector='form[data-vf-identity-form]', submit, validate, feedback=form=>form.querySelector('[data-vf-feedback], [role=status], [role=alert]'), context=()=>null, isCurrent=()=>true, onSuccess, errorMessage='Something went wrong. Please try again.'} = {}) {
    const pending = new Map();
    let destroyed = false;
    function message(form, value, error=false) {
      const node = feedback(form);
      if (!node) return;
      node.textContent = value;
      node.classList.toggle('error', error);
      node.setAttribute('aria-live', 'polite');
    }
    function finish(form, operation) {
      if (pending.get(form) !== operation) return;
      pending.delete(form);
      if(operation.busy === null)form.removeAttribute('aria-busy');else form.setAttribute('aria-busy', operation.busy);
      for (const [button, disabled] of operation.buttons) button.disabled = disabled;
    }
    function reset() {
      for (const [form, operation] of pending) { operation.abort.abort(); finish(form, operation); }
    }
    async function handle(event) {
      const form = event.target;
      if (!form.matches?.(selector) || destroyed) return;
      if (pending.has(form)) { event.preventDefault(); return; }
      if (submit) event.preventDefault();
      const values = new FormData(form);
      const problem = validate?.(form, values);
      if (problem) { event.preventDefault(); message(form, problem, true); return; }
      const operation = {context:context(form),abort:new AbortController(),busy:form.getAttribute('aria-busy'),buttons:[]};
      pending.set(form, operation);
      form.setAttribute('aria-busy', 'true');
      // Native submission must retain the clicked submit button's name/value.
      if (!submit) return;
      message(form, '');
      for (const button of form.querySelectorAll('button[type=submit],button:not([type]),input[type=submit]')) {
        operation.buttons.push([button,button.disabled]); button.disabled = true;
      }
      const current = () => !destroyed && !operation.abort.signal.aborted && pending.get(form) === operation && isCurrent(operation.context, form);
      try {
        const result = await submit(values, {form,signal:operation.abort.signal,context:operation.context,isCurrent:current});
        if (current()) await onSuccess?.(result, {form,context:operation.context,values,message:value=>message(form,value)});
      } catch(error) {
        if(current()) message(form, error?.message || errorMessage, true);
      } finally { finish(form, operation); }
    }
    root.addEventListener('submit', handle);
    const view = (root.ownerDocument || root).defaultView;
    view?.addEventListener('pageshow', reset);
    return {reset, destroy(){destroyed=true;reset();root.removeEventListener('submit',handle);view?.removeEventListener('pageshow',reset);}};
  }
  function mountProfilePicker({grid,status,onSelect,onAdd,addLabel='Add profile',addDescription='Administrator required',emptyMessage='No profiles available.',errorMessage='Could not open this profile.'}) {
    const doc=grid.ownerDocument;
    let entries=[],busy=false,destroyed=false,revision=0;
    function setBusy(value) {busy=value;grid.setAttribute('aria-busy',String(value));for(const {button,profile} of entries)button.disabled=value||Boolean(profile.disabled);}
    function render(profiles,{allowAdd=false}={}) {
      const ids=profiles.map(profile=>String(profile.id));
      if(ids.some(id=>!id||id==='undefined'||id==='null')||new Set(ids).size!==ids.length)throw new Error('Profile IDs must be present and unique.');
      revision++;entries=[];grid.replaceChildren();setBusy(false);
      function card(profile,add=false) {
        const button=doc.createElement('button');button.type='button';button.className='profile-choice'+(add?' profile-add-choice':'');
        if(!add)button.dataset.selectProfile=String(profile.id);else button.dataset.addProfile='';
        const icon=doc.createElement('span'),appearance=avatar(profile);icon.className='profile-choice-avatar '+(add?'':appearance.className);icon.textContent=add?'+':appearance.initial;icon.setAttribute('aria-hidden','true');
        const name=doc.createElement('strong');name.textContent=profile.name;
        const description=doc.createElement('small');description.textContent=profile.description||'';
        button.append(icon,name,description);button.disabled=Boolean(profile.disabled);grid.append(button);entries.push({button,profile,add});
      }
      profiles.forEach(profile=>card(profile));
      if(allowAdd&&onAdd)card({name:addLabel,description:addDescription},true);
      if(status){status.textContent=profiles.length?'':emptyMessage;status.setAttribute('aria-live','polite');}
    }
    async function select(event) {
      const entry=entries.find(item=>item.button===event.target.closest('button'));
      if(!entry||entry.button.hidden||entry.button.disabled||busy||destroyed)return;
      const epoch=revision;setBusy(true);if(status)status.textContent='';
      try{await(entry.add?onAdd():onSelect(entry.profile));}
      catch(error){if(!destroyed&&epoch===revision&&status)status.textContent=error?.message||errorMessage;}
      finally{if(!destroyed&&epoch===revision)setBusy(false);}
    }
    grid.addEventListener('click',select);
    return {render,setBusy,filter(predicate,{allowAdd=false}={}){for(const entry of entries)entry.button.hidden=entry.add?!allowAdd:!predicate(entry.profile);},destroy(){destroyed=true;revision++;grid.removeEventListener('click',select);setBusy(false);}};
  }
  function mountPinDialog({dialog,form,input,heading,status,cancel,onSubmit,errorMessage='Could not open this profile.'}) {
    let profile=null,returnFocus=null;
    const forms=bindForms(form,{selector:'form',feedback:()=>status,context:()=>profile,isCurrent:value=>value===profile&&dialog.open,
      submit:(_,operation)=>onSubmit(operation.context,input.value,operation),
      onSuccess:result=>{if(result!==false)dialog.close();},errorMessage});
    function clear(){forms.reset();profile=null;input.value='';form.reset();status.textContent='';if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;}
    function close(){dialog.close();}
    dialog.addEventListener('close',clear);cancel?.addEventListener('click',close);
    return {open(value,{title=`Enter PIN for ${value.name}`,submitLabel='Open profile'}={}){
      forms.reset();profile=value;returnFocus=dialog.ownerDocument.activeElement;form.reset();status.textContent='';heading.textContent=title;
      form.querySelector('[type=submit]').textContent=submitLabel;dialog.showModal();input.focus();
    },close,destroy(){close();clear();forms.destroy();dialog.removeEventListener('close',clear);cancel?.removeEventListener('click',close);}};
  }
  return {bindForms,mountProfilePicker,mountPinDialog,nameFields,avatar};
});
