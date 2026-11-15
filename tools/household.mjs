import {inspectPackage} from './build.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Trusted build-time options only. User data is rendered at runtime with textContent/escaping.
export async function renderHousehold(root,{productName,logo,transport='static',hidden=false,heading='Who’s here?',eyebrow='YOUR HOUSEHOLD, YOUR SPACE',actions='',connectDevices=false}={}){
 if(!productName||!logo||!/^\/(?!\/)[^\s<>"']+$/.test(logo.href)||!/^[-\d.]+(?: +[-\d.]+){3}$/.test(logo.viewBox))throw new Error('Provide product branding and a local SVG logo.');
 if(!['static','minijinja'].includes(transport))throw new Error('Unsupported household transport.');
 const pkg=await inspectPackage(root,['identity']),server=transport==='minijinja';
 const slots={PRODUCT:escape(productName),APP_NAME:escape(productName.replace(/^Velora\s+/,'')),LOGO_HREF:escape(logo.href),LOGO_VIEWBOX:escape(logo.viewBox),HIDDEN:hidden?' hidden':'',HEADING:escape(heading),EYEBROW:escape(eyebrow),ACTIONS:(connectDevices?"<button id=\"picker-connect-device\" class=\"picker-device-button\" type=\"button\" aria-label=\"Connected devices\" title=\"Connected devices\"><svg viewBox=\"0 0 24 24\" width=\"21\" height=\"21\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"2\" y=\"3\" width=\"14\" height=\"12\" rx=\"2\"/><path d=\"M6 21h6m-3-6v6\"/><rect x=\"16\" y=\"9\" width=\"6\" height=\"12\" rx=\"1.5\"/><path d=\"M18.5 18h1\"/></svg></button>":'')+actions,FORM_ATTRIBUTES:server?' method="post" data-vf-identity-form':'',CSRF:server?'<input type="hidden" name="csrfmiddlewaretoken" value="{{ csrf }}">':'',USERNAME:server?"{{ username|default('') }}":'',ERROR:server?"{{ error|default('') }}":''};
 const render=name=>pkg.files[`modules/identity/${name}.html`].replace(/%([A-Z_]+)%/g,(_,key)=>{if(!(key in slots))throw new Error(`Unknown household slot: ${key}`);return slots[key];});
 return {login:render('login'),picker:render('picker')};
}
