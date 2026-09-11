import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

/**
 * ===========================================================================
 * THE CONTRACT, RESOLVED IN ONE PLACE: base + overlay.
 * ===========================================================================
 *
 * `specs/001-interest-media-sharing/contracts/openapi.yaml` is the base
 * contract and stays exactly where spec-kit put it. `contracts/openapi.overlay.yaml`
 * is a downstream fork's additions, and is EMPTY in this repository.
 *
 * Two consumers have to agree about what "the contract" is - the contract
 * suites in apps/api and the client generator in this package - and before this
 * file they agreed by each hard-coding the same four-deep relative path. That is
 * the shape of drift 002 recorded: both sides generated from one document agree
 * with each other by construction, right up until one of them reads a different
 * document. One resolver, imported twice.
 *
 * WHY AN OVERLAY AND NOT JUST EDITING THE BASE: a fork adding an endpoint would
 * otherwise edit openapi.yaml, which upstream also edits, so every sync
 * conflicts inside the contract - the one file where a bad merge is worst,
 * because the server and the generated client both come from it.
 */

export interface Operation {
  summary?: string;
  security?: unknown[];
  responses?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenApiDoc {
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}

const ROOT = resolve(__dirname, '../../..');

export const BASE_CONTRACT_PATH = resolve(
  ROOT,
  'specs/001-interest-media-sharing/contracts/openapi.yaml',
);
export const OVERLAY_CONTRACT_PATH = resolve(ROOT, 'contracts/openapi.overlay.yaml');

/**
 * The only keys an overlay may carry.
 *
 * Deliberately narrow. An overlay that could set `servers`, `info` or
 * `security` would not be an overlay - it would be a second contract quietly
 * replacing the first, and "which document describes this API" would have two
 * answers. Adding a path is additive; changing where the API lives is not.
 */
const ALLOWED_OVERLAY_KEYS = ['paths', 'components'];

/**
 * Merge an overlay into a base contract.
 *
 * Pure, and separated from the file reading ON PURPOSE: upstream's overlay is
 * empty, so `resolveContract()` alone would never once exercise a real merge -
 * the seam would be green forever and broken whenever a fork first used it.
 * This function is what `contract-overlay.spec.ts` drives with a NON-EMPTY
 * overlay. Principle V, in small.
 *
 * REFUSES rather than resolves every ambiguity:
 *
 *  - an operation (path + verb) defined on both sides. A silent override is the
 *    worst possible outcome here: the generated client and the contract suites
 *    would describe the overlay's version while the base's server code still
 *    implemented the other, and both would look right alone. That is 002's
 *    first defect exactly.
 *  - a schema name defined on both sides, for the same reason.
 *  - any top-level key outside ALLOWED_OVERLAY_KEYS.
 *
 * It does ALLOW adding a verb to a path the base already defines - `DELETE
 * /posts/{postId}` beside the base's `GET` is additive and unambiguous, so
 * refusing at path granularity would block a legitimate case to catch nothing.
 */
export function mergeContract(base: OpenApiDoc, overlay: Partial<OpenApiDoc>): OpenApiDoc {
  const stray = Object.keys(overlay).filter((k) => !ALLOWED_OVERLAY_KEYS.includes(k));
  if (stray.length > 0) {
    throw new Error(
      `contract overlay: may only contain ${ALLOWED_OVERLAY_KEYS.join(' and ')}, found ` +
        `${stray.join(', ')}. An overlay adds to the contract; it does not restate it.`,
    );
  }

  const paths: OpenApiDoc['paths'] = { ...base.paths };
  const operationCollisions: string[] = [];

  for (const [path, item] of Object.entries(overlay.paths ?? {})) {
    const existing = paths[path];
    if (!existing) {
      paths[path] = { ...item };
      continue;
    }
    for (const verb of Object.keys(item)) {
      if (verb in existing) operationCollisions.push(`${verb.toUpperCase()} ${path}`);
    }
    paths[path] = { ...existing, ...item };
  }

  if (operationCollisions.length > 0) {
    throw new Error(
      `contract overlay: redefines operation(s) the base contract already declares: ` +
        `${operationCollisions.join(', ')}. An overlay ADDS operations. Changing one the base ` +
        `declares would leave the generated client describing the overlay's version while the ` +
        `base's server still implemented the other - and each would look right on its own.`,
    );
  }

  const baseSchemas = base.components?.schemas ?? {};
  const overlaySchemas = overlay.components?.schemas ?? {};
  const schemaCollisions = Object.keys(overlaySchemas).filter((name) => name in baseSchemas);
  if (schemaCollisions.length > 0) {
    throw new Error(
      `contract overlay: redefines schema(s) the base contract already declares: ` +
        `${schemaCollisions.join(', ')}. Give the overlay's schema its own name.`,
    );
  }

  const strayComponents = Object.keys(overlay.components ?? {}).filter((k) => k !== 'schemas');
  if (strayComponents.length > 0) {
    throw new Error(
      `contract overlay: components may only contain schemas, found ` +
        `${strayComponents.join(', ')}. securitySchemes and responses belong to the base contract.`,
    );
  }

  return {
    ...base,
    paths,
    components: { ...base.components, schemas: { ...baseSchemas, ...overlaySchemas } },
  };
}

const load = (path: string): Partial<OpenApiDoc> =>
  // A YAML file holding only comments parses to null, which is the shape of the
  // empty overlay this repository ships. `?? {}` is what makes that the same
  // case as an overlay declaring `paths: {}` rather than a crash.
  (parse(readFileSync(path, 'utf8')) as Partial<OpenApiDoc> | null) ?? {};

/** The contract this build describes: base with the overlay merged in. */
export function resolveContract(): OpenApiDoc {
  const base = load(BASE_CONTRACT_PATH) as OpenApiDoc;
  return mergeContract(base, load(OVERLAY_CONTRACT_PATH));
}
