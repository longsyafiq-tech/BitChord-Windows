import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(root, 'dist'), { recursive: true });
await build({
  entryPoints: [path.join(root, 'src/main.mjs')], outfile: path.join(root, 'dist/main.cjs'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'],
  inject: [path.join(root, 'src/platform.mjs')],
  alias: { '@bitchord/shared/bridge': path.join(root, '../shared/src/bridge/index.ts') },
  define: { __SITE_ORIGINS__: JSON.stringify(['bitchord://app']), __DISCORD_PRESENCE__: 'true', 'import.meta.env.FIREFOX': 'false' },
  sourcemap: true,
});
await copyFile(path.join(root, 'src/preload.cjs'), path.join(root, 'dist/preload.cjs'));
console.log('Desktop main process and isolated preload built.');
