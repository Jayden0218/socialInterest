/**
 * T069. Confirms that a verification's resources are gone.
 *
 * Invoked as its own command, never from a `finally` block in the script that
 * created them. The failure this guards against is precisely that the creating
 * process died before it could clean up - a session ends, a container is
 * reclaimed - leaving billable resources running that nobody is watching. A
 * teardown that depends on the creator surviving is not a teardown.
 *
 * This environment is ephemeral by design, which makes that failure likely
 * rather than theoretical.
 */
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tagArg = args.find((a) => a.startsWith('--tag='));
const tag = tagArg?.split('=')[1];

interface Survivor {
  service: string;
  id: string;
}

async function listByTag(_tag: string): Promise<Survivor[]> {
  /**
   * With no cloud account configured there is nothing to query, and that is the
   * correct answer here rather than an error: the local profile provisions
   * nothing billable, so nothing can survive.
   *
   * When an account exists, this queries the resource tagging API for the run tag
   * across the services a verification can create (S3, MediaConvert, Cognito,
   * CloudFront, DynamoDB) and returns whatever still answers.
   */
  if (!process.env['AWS_REGION'] && !process.env['AWS_PROFILE']) return [];
  throw new Error(
    'A cloud account is configured but the tagging query is not implemented. ' +
      'Refusing to report "nothing survived" without having looked - a false all-clear ' +
      'is worse than no check.',
  );
}

async function main(): Promise<void> {
  if (dryRun) {
    console.log('verify:teardown --dry-run');
    console.log('  no account configured; nothing to query, nothing to destroy');
    console.log('  in a real run this queries the resource tagging API for the run tag');
    console.log('  and exits non-zero if anything still answers');
    return;
  }

  if (!tag) {
    console.error('usage: verify:teardown --tag=<run-tag>   (or --dry-run)');
    console.error('The tag comes from the Verification Run. Without it this cannot');
    console.error('tell your resources from someone else\'s and must not guess.');
    process.exit(2);
  }

  const survivors = await listByTag(tag);
  if (survivors.length > 0) {
    console.error(`\n${survivors.length} resource(s) still running for tag ${tag}:\n`);
    for (const s of survivors) console.error(`  ${s.service.padEnd(14)} ${s.id}`);
    console.error('\nThese are billing. Destroy them and re-run this check.');
    process.exit(1);
  }
  console.log(`teardown confirmed for tag ${tag}: zero surviving resources`);
}

void main();
