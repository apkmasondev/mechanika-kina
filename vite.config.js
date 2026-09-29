import { defineConfig, loadEnv } from 'vite';

// base './' keeps every asset URL relative, so the build works from a GitHub Pages sub-path
// (https://<user>.github.io/<repo>/) as well as from any static server.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const configuredUrl = (process.env.VITE_SITE_URL ?? env.VITE_SITE_URL ?? '').trim();
  const siteUrl = configuredUrl ? new URL(configuredUrl) : null;
  if (siteUrl && !['https:', 'http:'].includes(siteUrl.protocol)) throw new Error('VITE_SITE_URL must be an HTTP(S) URL');
  const baseUrl = siteUrl ? siteUrl.href.replace(/\/?$/, '/') : '';
  return {
    plugins: [{
      name: 'social-url',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          // A clean clone also builds without a machine-local .env file.
          if (!baseUrl) html = html.replace(/\s*<meta property="og:url"[^>]*\/>/, '');
          return html.replaceAll('%VITE_SITE_URL%', baseUrl);
        },
      },
    }],
    base: './',
    server: { port: 5173, open: false },
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // libraries change rarely: separate chunk = better caching between releases
          manualChunks: (id) => (id.includes('node_modules/three') || id.includes('node_modules/postprocessing') ? 'vendor' : undefined),
        },
      },
    },
  };
});
