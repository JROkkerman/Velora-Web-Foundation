/* Velora Foundation API 1. Modules are bundled explicitly by the consuming app. */
(() => {
  'use strict';
  const modules = new Map([['core', {api:1, exports:{}}]]);
  const foundation = {
    api:1,
    version:'__VELORA_FOUNDATION_VERSION__',
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
