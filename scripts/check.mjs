import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

async function list(dir) { const out=[]; for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name); if(entry.isDirectory()) out.push(...await list(p)); else if(/\.(?:js|mjs)$/.test(p)) out.push(p);} return out; }
const files = ['index.js', ...await list('src'), ...await list('apps'), ...await list('scripts')];
for (const file of files) { const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'}); if(result.status!==0) process.exit(result.status||1); }
console.log('syntax ok');
