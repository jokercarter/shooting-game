import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {defineConfig} from '@playwright/test';
const localPython=join(process.cwd(),'.venv','Scripts','python.exe');
const externalPython=join(homedir(),'.codex','workspace-deps','SWE-AI','venv','Scripts','python.exe');
const python=existsSync(externalPython)?externalPython:localPython;
export default defineConfig({testDir:'tests',timeout:90000,workers:1,use:{baseURL:'http://127.0.0.1:4174',headless:true,viewport:{width:1440,height:1000}},reporter:[['list'],['json',{outputFile:'output/browser-test-results.json'}]],webServer:{command:`"${python}" -B -m uvicorn backend.run:app --host 127.0.0.1 --port 4174`,url:'http://127.0.0.1:4174/api/health',reuseExistingServer:false,env:{WORKBENCH_DATA:'tmp/browser-'+Date.now()},timeout:30000}});
