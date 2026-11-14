import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {bundle} from './build.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await bundle(root);
await mkdir(new URL('../examples/workspace/assets/',import.meta.url),{recursive:true});
await writeFile(new URL('../examples/workspace/assets/foundation.css',import.meta.url),result.css);
await writeFile(new URL('../examples/workspace/assets/foundation.js',import.meta.url),result.js);
console.log('Built the standalone workspace example.');
