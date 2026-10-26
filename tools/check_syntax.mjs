import {spawnSync} from 'node:child_process';

for(const path of ['public/arena/game.js','build.mjs','tools/test_backend.mjs','tools/check_syntax.mjs']){
  const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status ?? 1);
}
console.log('JavaScript syntax checks passed.');
