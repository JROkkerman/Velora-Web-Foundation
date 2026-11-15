import {inspectPackage} from './build.mjs';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Build-time adapter: the layout is always identity/setup.html. Native server POST
// and static SPA forms differ only in transport and escaped validation feedback.
export async function renderSetup(root, {productName, logo, transport='static', hidden=false}={}) {
  if(typeof productName!=='string'||!productName.trim())throw new Error('A product name is required.');
  if(!logo || !/^\/(?!\/)[^\s<>"']+$/.test(logo.href)|| !/^-?[\d.]+(?: +-?[\d.]+){3}$/.test(logo.viewBox))throw new Error('Use a local SVG logo and numeric viewBox.');
  if(!['static','minijinja'].includes(transport))throw new Error('Unsupported setup transport.');
  const pkg=await inspectPackage(root,['identity']);
  const server=transport==='minijinja';
  const value=name=>server?`{{ setup_values.${name}|default('') }}`:'';
  const slots={PRODUCT:escape(productName),APP_NAME:escape(productName.replace(/^Velora\s+/,'')),LOGO_HREF:escape(logo.href),LOGO_VIEWBOX:escape(logo.viewBox),HIDDEN:hidden?' hidden':'',FORM_ATTRIBUTES:server?' method="post" data-vf-identity-form':'',CSRF:server?'<input type="hidden" name="csrfmiddlewaretoken" value="{{ csrf }}">':'',FIRST_NAME:value('first_name'),NAME_PREFIX:value('name_prefix'),LAST_NAME:value('last_name'),USERNAME:value('username'),ERROR:server?"{{ error|default('') }}":''};
  return pkg.files['modules/identity/setup.html'].replace(/%([A-Z_]+)%/g,(_,name)=>{
    if(!(name in slots))throw new Error(`Unknown setup slot: ${name}`);
    return slots[name];
  });
}
