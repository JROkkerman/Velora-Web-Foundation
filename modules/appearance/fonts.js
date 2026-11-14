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
