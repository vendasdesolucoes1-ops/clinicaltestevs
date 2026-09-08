// Copia os binários WASM do MediaPipe de node_modules para public/mediapipe/wasm.
//
// A detecção de landmarks roda no navegador e precisa desses arquivos servidos pela
// própria aplicação — hospedá-los aqui evita depender de CDN de terceiros em runtime,
// que foi exatamente o problema do pipeline n8n que este fluxo substitui.
//
// Os arquivos não são versionados (são ~19 MB e já vêm no pacote npm): este script roda
// no `prebuild`, então o build de produção sempre os coloca em dist/.

import { cp, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(projectRoot, 'node_modules/@mediapipe/tasks-vision/wasm');
const destination = resolve(projectRoot, 'public/mediapipe/wasm');

try {
  await access(source);
} catch {
  console.error(
    `[mediapipe] Não encontrei os binários WASM em ${source}.\n` +
    `            Rode "npm install" antes do build.`,
  );
  process.exit(1);
}

await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });

console.log(`[mediapipe] WASM copiado para ${destination}`);
