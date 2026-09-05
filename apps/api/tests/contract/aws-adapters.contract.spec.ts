import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const AWS_DIR = resolve(__dirname, '../../src/adapters/aws');

/**
 * T076. Port parity: no aws adapter may be a stub.
 *
 * Three of the four production implementations were placeholders that threw
 * NOT_PROVISIONED from every method. The register could only ever say
 * "unverified", which reads as "written but untested" when the truth was "not
 * written". Nothing caught it because nothing ran them - that is the point of the
 * divergence, and it is exactly why this check is structural rather than
 * behavioural.
 *
 * This is not evidence the adapters work. It is evidence they exist.
 */
describe('aws adapters', () => {
  const files = readdirSync(AWS_DIR).filter((f) => f.endsWith('.ts'));

  it('has an adapter file for every production path', () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files)('%s does not throw NOT_PROVISIONED from its methods', (file) => {
    // Comments stripped first: these files explain the divergence at length and
    // several mention the placeholder they replaced. Matching prose would make
    // the check fail on its own documentation.
    const code = readFileSync(resolve(AWS_DIR, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('NOT_PROVISIONED');
    expect(code).not.toMatch(/is not provisioned/i);
  });

  it.each(files)('%s names its divergence so the register can be checked against it', (file) => {
    const source = readFileSync(resolve(AWS_DIR, file), 'utf8');
    // Every one of these is a different implementation from its local
    // counterpart, and the file must say so - a reader who does not know that
    // will treat a green local suite as evidence.
    expect(source).toMatch(/DIVERGENCE|divergence register|D-\d/);
  });
});
