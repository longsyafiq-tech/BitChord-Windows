import { cp, mkdir, copyFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = process.argv[2] ? path.resolve(process.argv[2]) : path.join(path.dirname(require.resolve('electron/package.json')), 'dist');
const output = process.argv[3] ? path.resolve(process.argv[3]) : path.join(here, 'release/BitChord-Windows-portable');
await access(path.join(runtime, 'electron.exe'));
await access(path.join(here, 'dist/main.cjs'));
await access(path.join(here, '../app/dist/index.html'));
try { await access(output); throw new Error(`Output already exists: ${output}. Choose a new directory.`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
await cp(runtime, output, {
  recursive: true,
  filter: file => !['electron.exe', 'default_app.asar', 'version'].includes(path.basename(file)),
});
await copyFile(path.join(runtime, 'electron.exe'), path.join(output, 'BitChord Windows.exe'));
const application = path.join(output, 'resources/app');
await mkdir(application, { recursive: true });
await cp(path.join(here, 'dist'), path.join(application, 'dist'), { recursive: true });
await writeFile(path.join(application, 'package.json'), JSON.stringify({ name: 'bitchord-windows', productName: 'BitChord Windows', version: '1.9.1-desktop.1', main: 'dist/main.cjs' }, null, 2));
await cp(path.join(here, '../app/dist'), path.join(output, 'resources/player'), { recursive: true });
await copyFile(path.join(here, '../../LICENSE'), path.join(output, 'resources/LICENSE-BitChord.txt'));
await copyFile(path.join(here, '../../Logo.png'), path.join(output, 'resources/icon.png'));
await copyFile(path.join(here, 'README.md'), path.join(output, 'README-Windows.md'));
await writeFile(path.join(output, 'portable.txt'), 'Keep this file beside the executable to save the profile in the adjacent data directory.\n');
console.log(`Portable Windows app assembled: ${output}`);
