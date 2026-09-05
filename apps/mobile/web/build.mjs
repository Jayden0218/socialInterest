import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * react-native -> react-native-web is the only aliasing needed: the screens use
 * View, Text, FlatList, Image, TextInput, ScrollView, Pressable and friends, all
 * of which react-native-web implements. If a screen ever imports a native-only
 * module, this build fails loudly rather than the journey passing against a
 * different component tree.
 */
await build({
  entryPoints: [resolve(here, 'index.web.tsx')],
  bundle: true,
  outfile: resolve(here, 'dist/bundle.js'),
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.ts': 'ts', '.tsx': 'tsx' },
  alias: { 'react-native': 'react-native-web' },
  define: {
    'process.env.NODE_ENV': '"development"',
    __DEV__: 'true',
    'process.env.EXPO_PUBLIC_API_BASE_URL': JSON.stringify(
      process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000/v1',
    ),
  },
  resolveExtensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js', '.json'],
  logLevel: 'info',
});
