// Compatibility entry point. Arbitrary unauthenticated Python execution was removed.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
const pythonPaths=process.platform==='win32'?[
  join(homedir(),'.codex','workspace-deps','SWE-AI','venv','Scripts','python.exe'),
  '.venv/Scripts/python.exe',
]:['.venv/bin/python'];
const python=pythonPaths.find(existsSync);
if(!python){console.error('Run .\\start.ps1 -Install first.');process.exit(1);}
const child=spawn(python,['-m','uvicorn','backend.run:app','--host','127.0.0.1','--port',process.env.PORT||'4173'],{stdio:'inherit',windowsHide:true});
child.on('exit',code=>process.exit(code||0));
process.on('SIGINT',()=>child.kill());
process.on('SIGTERM',()=>child.kill());
