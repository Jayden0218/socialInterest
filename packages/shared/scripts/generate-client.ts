import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { resolveContract } from './contract';

// Generates the operation map from the RESOLVED contract - the base openapi.yaml
// with contracts/openapi.overlay.yaml merged in - so the client and server cannot
// drift: a path removed from the contract disappears from the generated file and
// every caller stops compiling. Run via `pnpm --filter @sih/shared generate:client`.
//
// Reading through the resolver rather than opening openapi.yaml directly is what
// keeps this generator and the API's contract suites reading the SAME document.
// See contracts/README.md.
const OUT = resolve(__dirname, '../src/client/operations.generated.ts');

const VERBS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const opName = (verb: string, path: string): string => {
  const parts = path
    .split('/')
    .filter(Boolean)
    .map((p) => (p.startsWith('{') ? 'By' + p.slice(1, -1).replace(/^\w/, (c) => c.toUpperCase()) : p))
    .map((p) => p.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : '')));
  return verb + parts.map((p) => p.replace(/^\w/, (c) => c.toUpperCase())).join('');
};

function main(): void {
  const spec = resolveContract();
  const ops: string[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const verb of VERBS) {
      const op = item[verb];
      if (!op) continue;
      const requiresAuth = op.security === undefined ? true : (op.security as unknown[]).length > 0;
      ops.push(
        `  ${opName(verb, path)}: { method: '${verb.toUpperCase()}', path: '${path}', auth: ${requiresAuth} },` +
          (op.summary ? ` // ${op.summary}` : ''),
      );
    }
  }
  const body = `// GENERATED from the resolved contract: specs/001-interest-media-sharing/contracts/openapi.yaml
// with contracts/openapi.overlay.yaml merged in (see contracts/README.md).
// Do not edit by hand. Run: pnpm --filter @sih/shared generate:client
//
// ${ops.length} operations across ${Object.keys(spec.paths).length} paths.

export const operations = {
${ops.join('\n')}
} as const;

export type OperationName = keyof typeof operations;
export type Operation = (typeof operations)[OperationName];
`;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body);
  console.log(`generated ${ops.length} operations -> ${OUT}`);
}

main();
