// Builds a self-contained copy of the client for publishing as a claude.ai artifact:
// three.js from jsDelivr via the import map, CSS inlined, page body without the document skeleton.
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.argv[2] || path.join(ROOT, 'dist-artifact');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'js'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'public/js'))) if (f.endsWith('.js')) fs.copyFileSync(path.join(ROOT, 'public/js', f), path.join(out, 'js', f));
const css = fs.readFileSync(path.join(ROOT, 'public/css/style.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace('src="/js/main.js"', 'src="js/main.js"');
const page = `<title>Dropzone</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap">
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }</script>
<style>:root { color-scheme: dark; }
${css}</style>
${body.trim()}
`;
fs.writeFileSync(path.join(out, 'index.html'), page);
console.log('built', out, fs.readdirSync(path.join(out, 'js')).length, 'modules');
