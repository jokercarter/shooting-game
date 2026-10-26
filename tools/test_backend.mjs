import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const localPython=resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const python=process.env.PYTHON_EXECUTABLE || (existsSync(localPython)?localPython:(process.platform==='win32'?'python':'python3'));
const result=spawnSync(python,['-B','-m','pytest','backend','-q',...process.argv.slice(2)],{stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status ?? 1);
