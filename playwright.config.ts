import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

const projectPython = process.platform === 'win32'
  ? join(process.cwd(), '.venv', 'Scripts', 'python.exe')
  : join(process.cwd(), '.venv', 'bin', 'python');
const python = process.env.PYTHON_EXECUTABLE
  || (existsSync(projectPython) ? projectPython : (process.platform === 'win32' ? 'python' : 'python3'));
const commandPython = /\s/.test(python) ? `"${python}"` : python;

export default defineConfig({
  testDir: 'tests',
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    headless: true,
    viewport: {width: 1440, height: 1000},
  },
  reporter: [['list'], ['json', {outputFile: 'output/browser-test-results.json'}]],
  webServer: {
    command: `${commandPython} -B -m uvicorn backend.arena_public:app --host 127.0.0.1 --port 4174`,
    url: 'http://127.0.0.1:4174/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
