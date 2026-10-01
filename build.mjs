import { build } from 'esbuild';

// Bundle bare imports and dynamic codec imports for the static /ui/niivue host.
await build({
  stdin: { contents: "export * from '@niivue/niivue';", resolveDir: process.cwd(), sourcefile: 'niivue-entry.js' },
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/index.js',
  legalComments: 'eof',
});
