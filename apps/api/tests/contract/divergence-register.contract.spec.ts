import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REGISTER = resolve(__dirname, '../../../../docs/verification/divergence-register.md');

/**
 * T064. DynamoDB must stay OUT of the divergence register.
 *
 * Principle V's second clause is explicit: where a local tool speaks the same API
 * as its production counterpart, the principle does not apply and no adapter
 * should be invented. DynamoDB Local speaks the DynamoDB API (001/D9).
 *
 * The test exists because a spurious entry is the subtler failure. A missing one
 * gets caught the moment somebody looks for it; an extra one quietly makes
 * "the register is complete" unfalsifiable, and completeness is the only property
 * the register has.
 */
describe('divergence register', () => {
  const register = readFileSync(REGISTER, 'utf8');
  const table = register.slice(register.indexOf('| id |'));

  it('does not list DynamoDB as a divergence (001/D9)', () => {
    const rows = table.split('\n').filter((l) => /^\| D-\d+ /.test(l));
    for (const row of rows) {
      expect(row.toLowerCase()).not.toContain('dynamo');
    }
  });

  it('records an implementation state for every entry (002/FR-031)', () => {
    const rows = table.split('\n').filter((l) => /^\| D-\d+ /.test(l));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toMatch(/`(real|stub|absent)`/);
    }
  });

  it('states plainly that nothing has been verified while no approval exists', () => {
    const approvals = readFileSync(resolve(__dirname, '../../../../docs/verification/approvals.md'), 'utf8');
    if (approvals.includes('_(none)_')) {
      const rows = table.split('\n').filter((l) => /^\| D-\d+ /.test(l));
      for (const row of rows) {
        expect(row).toContain('unverified');
      }
    }
  });
});
