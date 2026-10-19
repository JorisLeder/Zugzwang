/**
 * Vite plugin (build only): starts loading the current route's page chunk together with the app entry.
 *
 * Without it the page chunk of a lazy route is requested only after the entry chunk has downloaded and run (one more
 * round trip before anything of the page is visible – on a slow 4G connection 150 ms and more). The plugin reads the
 * route table (`ROUTE_PATTERNS` and the `lazy: () => import('./pages/…')` entries of `src/features/<feature>/routes.tsx`),
 * maps every page module to its output chunk plus the chunks it imports statically (minus those of the entry), and
 * injects a small inline script into `index.html` that adds `<link rel="modulepreload">` for the chunks of
 * `location.pathname`. Nothing else changes: React Router still imports the page lazily, the import just finds the
 * module already loaded.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin, Rollup } from 'vite';
import { ROUTE_PATTERNS } from '../../src/app/paths.ts';

interface LazyRoute {
  pattern: string;
  /** Absolute path of the page module without extension. */
  module: string;
}

const ROUTE_RE = /path:\s*ROUTE_PATTERNS\.(\w+)(?:(?!path:)[\s\S])*?lazy:\s*\(\)\s*=>\s*import\(\s*'([^']+)'\s*\)/g;

/** Lazy routes declared in `src/features/<feature>/routes.tsx`. */
export function lazyRoutes(root: string): LazyRoute[] {
  const features = join(root, 'src', 'features');
  const out: LazyRoute[] = [];
  for (const feature of readdirSync(features)) {
    let source: string;
    const file = join(features, feature, 'routes.tsx');
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of source.matchAll(ROUTE_RE)) {
      const pattern = (ROUTE_PATTERNS as Record<string, string>)[m[1]!];
      if (!pattern) continue;
      out.push({ pattern, module: resolve(dirname(file), m[2]!).replace(/\.tsx?$/, '') });
    }
  }
  return out;
}

/** `/learn/:courseId/:lessonId` → `^/learn/[^/]+/[^/]+/?$`. */
export function patternToRegExp(pattern: string): string {
  const body = pattern
    .split('/')
    .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return `^${body === '' ? '/' : body}${pattern === '/' ? '' : '/?'}$`;
}

type OutputBundle = Rollup.OutputBundle;
type OutputChunk = Rollup.OutputChunk;

function staticClosure(bundle: OutputBundle, start: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...start];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const chunk = bundle[file];
    if (chunk?.type === 'chunk') stack.push(...chunk.imports);
  }
  return seen;
}

/** Inline script source for the given routes (exported for tests). */
export function preloadScript(routes: Array<{ re: string; files: string[] }>, base: string): string {
  const files = [...new Set(routes.flatMap((r) => r.files))];
  const table = routes.map((r) => [r.re, r.files.map((f) => files.indexOf(f))]);
  return (
    `(function(){var f=${JSON.stringify(files)},r=${JSON.stringify(table)},p=location.pathname;` +
    `for(var i=0;i<r.length;i++)if(new RegExp(r[i][0]).test(p)){r[i][1].forEach(function(n){` +
    `var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=${JSON.stringify(base)}+f[n];` +
    `document.head.appendChild(l)});break}})();`
  );
}

/** The plugin. */
export function routePreload(): Plugin {
  let root = process.cwd();
  let base = '/';
  return {
    name: 'zugzwang:route-preload',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const bundle = ctx.bundle as OutputBundle | undefined;
        if (!bundle) return undefined;
        const chunks = Object.values(bundle).filter((c): c is OutputChunk => c.type === 'chunk');
        const entry = chunks.filter((c) => c.isEntry).map((c) => c.fileName);
        const loaded = staticClosure(bundle, entry);
        const byModule = new Map<string, OutputChunk>();
        for (const c of chunks) if (c.facadeModuleId) byModule.set(c.facadeModuleId.replace(/\.tsx?$/, ''), c);
        const routes = lazyRoutes(root)
          // Static segments win over parameters (`/analysis/import` before `/analysis/:gameId`), like React Router.
          .sort((a, b) => (a.pattern.match(/:/g)?.length ?? 0) - (b.pattern.match(/:/g)?.length ?? 0))
          .flatMap((r) => {
            const chunk = byModule.get(r.module);
            if (!chunk) return [];
            const files = [...staticClosure(bundle, [chunk.fileName])].filter((f) => !loaded.has(f) && f.endsWith('.js'));
            return [{ re: patternToRegExp(r.pattern), files }];
          });
        if (routes.length === 0) return undefined;
        return [{ tag: 'script', children: preloadScript(routes, base), injectTo: 'head' }];
      },
    },
  };
}
