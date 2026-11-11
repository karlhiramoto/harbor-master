import { readFileSync } from 'node:fs';
import path from 'node:path';

const RAPIER_BUNDLE = '/@dimforge/rapier2d-compat/dist/rapier.mjs';

/**
 * Serve Rapier's physics engine as a separate `.wasm` file in production builds.
 *
 * `@dimforge/rapier2d-compat` inlines its 2.4 MB WebAssembly binary as a base64
 * string inside `rapier.mjs`, which makes the game bundle ~3.6 MB of JavaScript.
 * The package also ships the same binary as `rapier_wasm2d_bg.wasm`, and its
 * internal wasm-bindgen initializer accepts a URL. This plugin emits that file
 * as a hashed asset and rewrites the single `<decoder>.toByteArray("…").buffer`
 * argument into the asset URL, so the browser fetches and stream-compiles the
 * WASM on its own and caches it independently of the game code.
 *
 * Build-only: dev and Vitest keep the inline copy. If a Rapier upgrade changes
 * the bundle shape or file name, the build fails instead of silently shipping
 * the inline copy.
 *
 * The returned `map: null` is only accurate while sourcemaps stay disabled
 * (both build configs set `sourcemap: false`); enable them and this needs a
 * real map (e.g. MagicString) because the rewrite shifts columns on one line.
 */
export function rapierWasmFile() {
  let rapierSeen = false;
  let rewritten = false;
  return {
    name: 'rapier-wasm-file',
    apply: 'build',
    buildStart() {
      rapierSeen = false;
      rewritten = false;
    },
    buildEnd(error) {
      if (!error && rapierSeen && !rewritten) {
        throw new Error(
          `[rapier-wasm-file] @dimforge/rapier2d-compat was bundled but ${RAPIER_BUNDLE} was never rewritten; ` +
            'the inline 3 MB WASM would ship. Update harbor-master/rapier-wasm-plugin.mjs.',
        );
      }
    },
    transform(code, id) {
      const file = id.split('?')[0];
      const normalized = file.replace(/\\/g, '/');
      if (normalized.includes('/@dimforge/rapier2d-compat/')) rapierSeen = true;
      if (!normalized.endsWith(RAPIER_BUNDLE)) return null;

      const wasm = readFileSync(path.join(path.dirname(file), 'rapier_wasm2d_bg.wasm'));
      const literal = `"${wasm.toString('base64')}"`;

      const start = code.indexOf(literal);
      const fail = (why) => {
        throw new Error(
          `[rapier-wasm-file] ${why} in ${file}. The @dimforge/rapier2d-compat bundle layout changed; ` +
            'update harbor-master/rapier-wasm-plugin.mjs.',
        );
      };
      if (start === -1) fail('inlined rapier_wasm2d_bg.wasm not found');
      if (code.indexOf(literal, start + 1) !== -1) fail('more than one inlined rapier_wasm2d_bg.wasm');

      // Expect `<ident>.toByteArray(<literal>).buffer` around the literal.
      const head = /[A-Za-z_$][\w$]*\.toByteArray\($/.exec(code.slice(Math.max(0, start - 80), start));
      const tail = ').buffer';
      if (!head || code.slice(start + literal.length, start + literal.length + tail.length) !== tail) {
        fail('unexpected code around the inlined WASM');
      }

      rewritten = true;
      const ref = this.emitFile({ type: 'asset', name: 'rapier_wasm2d_bg.wasm', source: wasm });
      const from = start - head[0].length;
      const to = start + literal.length + tail.length;
      return { code: `${code.slice(0, from)}import.meta.ROLLUP_FILE_URL_${ref}${code.slice(to)}`, map: null };
    },
  };
}
