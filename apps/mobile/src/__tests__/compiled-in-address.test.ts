/**
 * THE COMPILED-IN ADDRESS REACHES THE APP.
 *
 * `settings-store.test.ts` already proves the resolution rule — stored wins, the
 * built-in default fills in — but it proves it by handing the store a fallback
 * directly. That is the second half of the chain. The FIRST half is what makes
 * an APK work without anybody typing an address:
 *
 *     EXPO_PUBLIC_API_BASE_URL   (inlined by Expo at build time)
 *       -> src/config.ts         (reads it)
 *         -> App.tsx             (passes it in as the fallback)
 *
 * Rename the variable, or stop passing it, and every existing test still passes
 * while every fresh install points at 127.0.0.1 — which on a phone is the PHONE.
 * A declared half with no other half, and this project has recorded that shape
 * seven times.
 *
 * So this asserts the chain itself, by NAME, because the name is the contract
 * between a build command and a running app.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('the address compiled in at build time', () => {
  it('config.ts reads EXPO_PUBLIC_API_BASE_URL', () => {
    /**
     * The literal, not a variable holding it. Expo inlines `process.env.X` by
     * TEXTUAL SUBSTITUTION at build time — `process.env[name]` where `name` is
     * computed reads nothing, silently, and only on a real build. That cannot
     * be caught by running the bundler's output in jest, where `process.env`
     * is a real object and the indirection works fine.
     */
    expect(read('config.ts')).toContain("process.env['EXPO_PUBLIC_API_BASE_URL']");
  });

  it('falls back to a loopback address only when nothing was compiled in', () => {
    const source = read('config.ts');
    expect(source).toMatch(/\?\?\s*'http:\/\/127\.0\.0\.1:3000\/v1'/);
  });

  it('App.tsx passes that value in as the store default, rather than a literal', () => {
    const app = read('App.tsx');
    expect(app).toContain("import { API_BASE_URL } from './config'");
    // The store is built FROM it. A literal here would leave config.ts exported
    // and unread — which is how `avatarKey` ended up with no writer.
    expect(app).toContain('createStores(API_BASE_URL)');
  });

  it('nothing else in the app hardcodes a backend address', () => {
    /**
     * A second address anywhere is a second source of truth for one fact, and
     * the one that is wrong will be the one that is read. 006 shipped exactly
     * this as "white cards inside dark green chrome".
     */
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of require('node:fs').readdirSync(join(__dirname, '..', dir), {
        withFileTypes: true,
      }) as { name: string; isDirectory: () => boolean }[]) {
        const rel = `${dir}/${entry.name}`;
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = read(...rel.split('/'));
          /**
           * COMMENTS STRIPPED — AND THE FIRST VERSION OF THIS STRIPPER MADE THE
           * GUARD VACUOUS, WHICH IS WHY THE RULE BELOW IS NOT THE OBVIOUS ONE.
           *
           * A pattern that strips from any double slash to end-of-line treats
           * the slashes in `http://` as the start of a line comment. (Written
           * out here in prose rather than as a regex literal: the literal
           * contains a star-slash, which closes THIS comment early — which is
           * how the first attempt at writing this note broke the file.)
           *
           * So it deleted `//10.0.2.2:3000/v1')` and left
           * `createStores('http:` — and this guard, whose whole job is to find
           * hardcoded `http://…` addresses, could never find one. It passed a
           * deliberate break with a hardcoded address sitting in the file.
           *
           * That is the shape this project records under "a guard that has only
           * ever passed is not a guard", with a twist worth keeping: the guard
           * was not too weak, it was SELF-DEFEATING. Its own preprocessing
           * removed its subject.
           *
           * Requiring a non-`:` before the slashes keeps `://` intact while
           * still stripping real comments. A doc comment naming an address as
           * an example is still removed, which is the case that motivated
           * stripping at all — the mirror of the failure that made
           * `text-has-colour` accuse the one file whose job was to prevent the
           * thing it was accusing it of.
           */
          const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
          if (rel !== '/config.ts' && /https?:\/\/\d+\.\d+\.\d+\.\d+:\d+/.test(code)) {
            offenders.push(rel);
          }
        }
      }
    };
    walk('');
    expect(offenders).toEqual([]);
  });
});
