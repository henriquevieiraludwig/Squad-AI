// Junta o build de demonstração num único HTML (CSS e JS embutidos) para publicar como página.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-demo';
const assets = join(dir, 'assets');
const files = readdirSync(assets);
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const jsFiles = files.filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error(`Esperava 1 arquivo JS, encontrei ${jsFiles.length}: ${jsFiles}`);
const js = readFileSync(join(assets, jsFiles[0]), 'utf8').replace(/<\/script/gi, '<\\/script');

const html = `<title>Ofício</title>
<meta name="description" content="Ofício: plataforma para empresas criarem e treinarem agentes de IA.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
writeFileSync(join(dir, 'oficio-demo.html'), html);
console.log(`oficio-demo.html: ${(html.length / 1024).toFixed(0)} KB`);
