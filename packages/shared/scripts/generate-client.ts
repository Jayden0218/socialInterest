import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse } from 'yaml';

// Generates the operation map from contracts/openapi.yaml so the client and server
// cannot drift: a path removed from the contract disappears from the generated file
// and every caller stops compiling. Run via `pnpm --filter @sih/shared generate:client`.
const SPEC = resolve(__dirname, '../../../specs/001-interest-media-sharing/contracts/openapi.yaml');
const OUT = resolve(__dirname, '../src/client/operations.generated.ts');

type Spec = {
  paths: Record<string, Record<string, { summary?: string; security?: unknown[] }>>;
};

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
  const spec = parse(readFileSync(SPEC, 'utf8')) as Spec;
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
  const body = `// GENERATED from specs/001-interest-media-sharing/contracts/openapi.yaml
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
