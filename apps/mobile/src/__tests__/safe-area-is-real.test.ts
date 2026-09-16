import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `SafeAreaView` MUST COME FROM `react-native-safe-area-context` — 012/FIX-1.
 *
 * React Native's own `SafeAreaView` is documented iOS-only. On Android it
 * renders a plain `View` and the inset is silently ZERO, so the app's content
 * sat under the status bar on every Android device while the code read as
 * though the case was handled.
 *
 * That is the worst shape a defect can take here, and this repository has a
 * name for it: a declared half with no other half. The import was present, the
 * component was used, the intent was legible — and on the only platform this
 * product has ever run on, it did nothing.
 *
 * NO TEST COULD HAVE SEEN IT. React Native Testing Library performs no layout,
 * so both versions "render". react-native-web has its own box model and no
 * status bar at all. It took a person holding a phone, which is why the guard
 * is structural: it asserts the IMPORT, which is the thing that was wrong.
 */
const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('the safe area is measured, not assumed (FIX-1)', () => {
  it('nothing imports SafeAreaView from react-native', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

      // Any import FROM 'react-native' that pulls in SafeAreaView.
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'react-native'/g)) {
        if (/\bSafeAreaView\b/.test(m[1] ?? '')) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${file.replace(SRC, 'src')}:${line}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the shell wraps the app in a SafeAreaProvider', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    // The context package's SafeAreaView reads insets from this provider and
    // reports zero without it — which would reproduce the original defect
    // exactly, while importing from the right package.
    expect(app).toContain("from 'react-native-safe-area-context'");
    expect(app).toContain('<SafeAreaProvider>');
  });
});
