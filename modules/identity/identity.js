/* Identity UI, API 1. Apps own authentication, permissions, data and navigation. */
window.VeloraFoundation.define('identity', 1, ['core', 'components'], () => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function nameFields(person = {}, labels = {}) {
    const text = {first:'First name',prefix:'Name prefix',optional:'optional',last:'Last name',...labels};
    return `<div class="person-name-fields"><label>${escape(text.first)}<input name="first_name" autocomplete="given-name" value="${escape(person.first_name ?? person.name ?? '')}" maxlength="100" required></label><label>${escape(text.prefix)} ${text.optional?`<small>(${escape(text.optional)})</small>`:''}<input name="name_prefix" autocomplete="off" value="${escape(person.name_prefix)}" maxlength="50"></label><label>${escape(text.last)}<input name="last_name" autocomplete="family-name" value="${escape(person.last_name)}" maxlength="100" required></label></div>`;
  }
  function renderConnectedDevices({productName='Velora'}={}){return `<section class="connect-device"><div class="settings-section-heading"><h2>Connect your phone</h2><p class="muted">Open ${escape(productName)} on your phone and choose Scan QR code on the sign-in screen.</p></div><form id="device-pair-form"><label>${escape(productName)} server address<input name="server" type="url" required maxlength="2048" placeholder="http://192.168.1.20:8001" autocomplete="off"></label><p class="muted">Use an address your phone can reach. For a Tailscale address, connect Tailscale on your phone too.</p><button class="primary" type="submit">Generate QR code</button><button type="button" id="device-pair-cancel" hidden>Cancel code</button></form><div id="device-pair-code"></div><p id="device-pair-status" role="status" aria-live="polite"></p><p id="device-pair-scope" class="muted">The code works once and expires after two minutes. Keep it visible only to the person connecting.</p></section><section class="connected-devices"><div class="connected-devices-heading"><div><h2>Your devices</h2><p class="muted">Connected Apple apps. Devices may be offline.</p></div><button type="button" id="refresh-devices">Refresh</button></div><div id="connected-device-list" aria-live="polite">Loading devices…</div></section>`;}
  // One profile page for every app. App-only fields are data, never injected markup.
  function renderProfileSettings({profile={},labels={},csrfToken='',extraFields=[],extraTitle='Additional details',error='',saved=false}={}) {
    function field(item){
      if(!/^[a-z][a-z0-9_]*$/.test(item.name)||['first_name','name_prefix','last_name','current_pin','pin','confirm_pin','csrfmiddlewaretoken'].includes(item.name))throw new Error('Invalid additional profile field.');
      if(!['text','email','select'].includes(item.type))throw new Error('Unsupported profile field type.');
      const name=escape(item.name),value=escape(item.value),label=escape(item.label);
      if(item.type==='select')return `<label>${label}<select name="${name}">${(item.options||[]).map(option=>`<option value="${escape(option.value)}"${String(option.value)===String(item.value)?' selected':''}>${escape(option.label)}</option>`).join('')}</select></label>`;
      const max=Number.isInteger(item.maxlength)&&item.maxlength>0?Math.min(item.maxlength,1024):254;
      return `<label>${label}<input name="${name}" type="${item.type}" value="${value}" maxlength="${max}"></label>`;
    }
    const locked=Boolean(profile.pin_set||profile.password_required),password=Boolean(profile.password_required);
    return `<div class="vf-profile-settings">
      <section class="profile-panel" aria-labelledby="profile-details-heading"><h2 id="profile-details-heading">Your profile</h2><p class="muted">Your details and preferences belong to this profile.</p>
        <form id="profile-name-form" data-vf-profile-details method="post">${csrfToken?`<input type="hidden" name="csrfmiddlewaretoken" value="${escape(csrfToken)}">`:''}${nameFields(profile,{optional:'',...labels})}
          ${extraFields.length?`<details class="profile-extra-fields"${error?' open':''}><summary>${escape(extraTitle)}</summary><div>${extraFields.map(field).join('')}</div></details>`:''}
          <div class="profile-form-footer"><p class="form-feedback${error?' error':''}" role="status" aria-live="polite">${escape(error||(saved?'Personal details saved.':''))}</p><button class="primary" type="submit">Save changes</button></div>
        </form>
      </section>
      <section class="profile-panel" aria-labelledby="profile-security-heading"><h2 id="profile-security-heading">Security</h2><h3>Profile PIN</h3>
        <p class="muted" data-profile-protection>${password?'This profile still uses its previous password. Enter it below to set a PIN or remove this extra lock.':profile.pin_set?'Your profile is protected with a PIN.':'No PIN is set. Add one if you want to protect your profile.'}</p>
        <form id="profile-pin-settings-form"><label class="current-pin-field"${locked?'':' hidden'}><span>${password?'Current profile password':'Current PIN'}</span><input name="current_pin" type="password" inputmode="${password?'text':'numeric'}" autocomplete="${password?'current-password':'off'}" maxlength="${password?1024:8}"${locked?' required':''}></label>
          <div class="profile-pin-fields"><label>New PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password"></label><label>Confirm new PIN<input name="confirm_pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password"></label></div>
          <p class="muted">Use 4–8 digits. Leave the new PIN empty to remove your current profile protection.</p>
          <div class="profile-form-footer"><p class="form-feedback" role="status" aria-live="polite"></p><button class="primary" type="submit">Save profile PIN</button></div>
        </form>
      </section>
    </div>`;
  }
  function mountProfileSettings({root,saveDetails,savePin,onDetailsSaved,onPinSaved,context=()=>null,isCurrent=()=>true}) {
    const details=bindForms(root,{selector:'form[data-vf-profile-details]',context,isCurrent,
      submit:saveDetails?(values,operation)=>saveDetails(Object.fromEntries(values),operation):undefined,
      onSuccess:async(data,operation)=>{await onDetailsSaved?.(data);operation.message('Personal details saved.');}
    });
    const security=bindForms(root,{selector:'#profile-pin-settings-form',context,isCurrent,
      validate:(_,values)=>values.get('pin')!==values.get('confirm_pin')?'The PINs must match.':'',
      submit:(values,operation)=>savePin({current_pin:values.get('current_pin'),pin:values.get('pin'),confirm_pin:values.get('confirm_pin')},operation),
      onSuccess:async(data,{form,message})=>{
        form.reset();const label=form.querySelector('.current-pin-field'),input=form.elements.current_pin;
        label.hidden=!data.pin_set;label.querySelector('span').textContent='Current PIN';input.required=Boolean(data.pin_set);input.maxLength=8;input.inputMode='numeric';input.autocomplete='off';
        root.querySelector('[data-profile-protection]').textContent=data.pin_set?'Your profile is protected with a PIN.':'No PIN is set. Add one if you want to protect your profile.';
        await onPinSaved?.(data);
        message(data.pin_set?'Profile PIN saved. Other sessions for this profile were signed out.':'Profile protection removed.');
      }
    });
    return {destroy(){details.destroy();security.destroy();}};
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
      const password=value.password_required===true;
      input.inputMode=password?'text':'numeric'; input.maxLength=password?1024:8; input.minLength=password?1:4;
      if(password)input.removeAttribute('pattern');else input.pattern='[0-9]{4,8}';
      input.autocomplete=password?'current-password':'off';
      const label=form.querySelector('#profile-pin-label');if(label)label.textContent=password?'Existing profile password':'Profile PIN';
      if(password)heading.textContent=`Unlock ${value.name}`;
      form.querySelector('[type=submit]').textContent=submitLabel;dialog.showModal();input.focus();
    },close,destroy(){close();clear();forms.destroy();dialog.removeEventListener('close',clear);cancel?.removeEventListener('click',close);}};
  }

  function renderHouseholdManagement({items,currentId,login,memberLabel='Member',description='Personal data stays separate.',labels={}}) {
    const fields=person=>nameFields(person,{optional:'',...labels});
    return `<div class="family-layout"><section class="family-members"><p class="muted family-intro">Everyone signs in with one household login, then chooses their profile. ${escape(description)}</p>${items.map(account=>`<form class="family-account-card" data-account-id="${escape(account.id)}"><div class="family-account-heading"><span class="avatar">${escape(avatar(account).initial)}</span><div><strong>${escape(account.name)}</strong><small>${account.id===currentId?'Your profile':account.admin?'Administrator':escape(memberLabel)}${account.password_required?' · Password protected':account.pin_set?' · PIN protected':''}</small></div><span class="family-status">${account.active?'Active':'Disabled'}</span></div>${fields(account)}<div class="family-account-options"><label>Role<select name="admin" ${account.id===currentId?'disabled':''}><option value="false" ${!account.admin?'selected':''}>${escape(memberLabel)}</option><option value="true" ${account.admin?'selected':''}>Administrator</option></select></label><label>Access<select name="active" ${account.id===currentId?'disabled':''}><option value="true" ${account.active?'selected':''}>Active</option><option value="false" ${!account.active?'selected':''}>Disabled</option></select></label></div><button type="submit">Save profile</button><p role="status" aria-live="polite"></p></form>`).join('')}</section><aside class="family-household-settings"><section class="family-create"><span class="home-eyebrow">MAKE ROOM FOR SOMEONE</span><h2>Add a profile</h2><form id="family-create-form">${fields()}<label>Role<select name="admin"><option value="false">${escape(memberLabel)}</option><option value="true">Administrator</option></select></label><p class="muted">No separate login is needed. Each person can set an optional profile PIN on their Profile page under Security. Administrators can manage profiles and tools.</p><button type="submit" class="primary">Add profile ＋</button><p role="status" aria-live="polite"></p></form></section><section class="family-create household-login-settings"><h2>Household login</h2><form id="household-login-form"><label>Household username<input name="username" autocomplete="username" value="${escape(login.username)}" pattern="[A-Za-z0-9_.-]+" maxlength="150" required></label><label>Current household password<input name="current_password" type="password" autocomplete="current-password" maxlength="1024" required></label><label>New household password<input name="new_password" type="password" autocomplete="new-password" minlength="12" maxlength="1024"></label><label>Confirm new password<input name="confirm_password" type="password" autocomplete="new-password" minlength="12" maxlength="1024"></label><p class="muted">Leave the new password empty to keep it. Saving signs out all other devices. Your profile PIN is separate from this shared login.</p><button type="submit">Save household login</button><p role="status" aria-live="polite"></p></form></section></aside></div>`;
  }
  function mountHouseholdManagement({root,request,onChange=()=>{},context=()=>null,isCurrent=()=>true}) {
    return bindForms(root,{selector:'#family-create-form,.family-account-card,#household-login-form',context,isCurrent,
      validate:(form,values)=>form.id==='household-login-form'&&values.get('new_password')!==values.get('confirm_password')?'The new passwords must match.':'',
      submit:async(values,operation)=>{
        const form=operation.form,login=form.id==='household-login-form',creating=form.id==='family-create-form';
        const v=Object.fromEntries(values);
        const body=login?{username:v.username,current_password:v.current_password,new_password:v.new_password}:{first_name:v.first_name,name_prefix:v.name_prefix,last_name:v.last_name,admin:form.elements.admin.value==='true',...(!creating?{active:form.elements.active.value==='true'}:{})};
        return request(login?'login':creating?'create':'update',body,{...operation,id:form.dataset.accountId});
      },
      onSuccess:async(data,{form,message})=>{
        if(form.id==='household-login-form'){
          for(const name of ['current_password','new_password','confirm_password'])form.elements[name].value='';
          message('Household login saved. Other devices need to sign in again.');
        }else{if(form.id==='family-create-form')form.reset();message('Profile saved.');await onChange(data);}
      }
    });
  }
  function mountAddProfile({dialog,form,status,cancel,getProfiles,onCreate,onSuccess}) {
    let returnFocus;
    function sync(){
      const admin=getProfiles().find(p=>String(p.id)===form.elements.administrator.value&&p.admin);
      const input=form.elements.pin,password=admin?.password_required===true;
      input.required=Boolean(admin?.pin_set||password);input.closest('label').hidden=!input.required;input.value='';
      input.inputMode=password?'text':'numeric';input.maxLength=password?1024:8;input.minLength=password?1:4;
      if(password)input.removeAttribute('pattern');else input.pattern='[0-9]{4,8}';
      input.autocomplete=password?'current-password':'off';
      const label=input.closest('label');label.firstChild.textContent=password?'Administrator profile password':'Administrator profile PIN';
    }
    const forms=bindForms(form,{selector:'form',feedback:()=>status,isCurrent:()=>dialog.open,
      submit:(v,operation)=>onCreate({first_name:v.get('first_name').trim(),name_prefix:v.get('name_prefix').trim(),last_name:v.get('last_name').trim()}, {id:v.get('administrator'),secret:v.get('pin')||''},operation),
      onSuccess:async result=>{dialog.close();await onSuccess?.(result);}
    });
    const close=()=>dialog.close();
    const clear=()=>{forms.reset();form.reset();status.textContent='';returnFocus?.focus();};
    form.elements.administrator.addEventListener('change',sync);cancel.addEventListener('click',close);dialog.addEventListener('close',clear);
    return {open(){returnFocus=dialog.ownerDocument.activeElement;form.reset();status.textContent='';form.elements.administrator.replaceChildren(...getProfiles().filter(p=>p.admin).map(p=>{const o=dialog.ownerDocument.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));sync();dialog.showModal();form.elements.first_name.focus();},destroy(){close();forms.destroy();form.elements.administrator.removeEventListener('change',sync);cancel.removeEventListener('click',close);dialog.removeEventListener('close',clear);}};
  }
  return {renderConnectedDevices,renderProfileSettings,mountProfileSettings,bindForms,mountProfilePicker,mountPinDialog,mountAddProfile,renderHouseholdManagement,mountHouseholdManagement,nameFields,avatar};
});
