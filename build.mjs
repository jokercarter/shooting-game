import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const source = resolve(root, 'public', 'arena');
const destination = resolve(root, 'dist', 'arena');

await rm(resolve(root, 'dist'), {recursive: true, force: true});
await mkdir(destination, {recursive: true});
await cp(source, destination, {recursive: true, force: true});
await writeFile(
  resolve(root, 'dist', '404.html'),
  '<!doctype html><meta charset="utf-8"><title>Morrow Fields</title><p>Open <a href="/arena/">Morrow Fields</a>.</p>\n',
  'utf8',
);
console.log('Built Morrow Fields into dist/arena/');
