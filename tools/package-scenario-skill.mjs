// Build a portable skill using the current production Builder validator.
import { build } from '../Necto.UI/node_modules/vite/dist/node/index.js'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { copyFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const root = fileURLToPath(new URL('../', import.meta.url))
await build({ configFile: false, logLevel: 'warn', build: {
  outDir: resolve(root, 'skills/necto-scenarios/scripts/lib'), emptyOutDir: true,
  minify: false, lib: { entry: resolve(root, 'Necto.UI/src/features/scenario-builder/model.js'), formats: ['es'], fileName: () => 'blueprint.mjs' },
  rollupOptions: { external: ['@faker-js/faker'] }
}})
await copyFile(resolve(root,'LICENSE.txt'), resolve(root,'skills/necto-scenarios/LICENSE'))
if (process.argv[2]) {
 const output=resolve(process.argv[2])
 execFileSync('python3', ['-c', `import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]);target.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
 for path in sorted(root.rglob('*')):
  if path.is_file(): archive.write(path,path.relative_to(root.parent))
`, resolve(root,'skills/necto-scenarios'), output])
 console.log(output)
}
