/**
 * CDK entry point. SYNTH ONLY.
 *
 * Deploying is not part of any task in tasks.md and requires explicit approval -
 * see plan.md Cost Posture. This prints the stack description so CI can validate
 * it without an account, without credentials, and without any chance of
 * provisioning something.
 */
import { synth } from '../lib/infra-stack';

const description = synth();
console.log(JSON.stringify(description, null, 2));
console.log(
  `\nsynth ok: table ${description.table.name} with ${description.table.indexes.length} GSIs, ` +
    `${description.buckets.length} buckets, ${description.compute.length} compute units.`,
);
console.log('NOT DEPLOYED. Deploying requires explicit approval (plan.md Cost Posture).\n');
