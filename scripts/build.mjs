// Dependency-free bundler for this project's named ES modules. No eval or external packages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = new Map();
const importsPattern = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g;
function visit(relativePath) {
    const key = relativePath.replaceAll(path.sep, '/');
    if (modules.has(key)) return;
    const source = fs.readFileSync(path.join(root, key), 'utf8');
    const imports = [...source.matchAll(importsPattern)].map(match => ({
        specifiers: match[1].trim(), dependency: path.posix.normalize(path.posix.join(path.posix.dirname(key), match[2]))
    }));
    for (const item of imports) {
        if (item.dependency.startsWith('../') || path.isAbsolute(item.dependency)) throw Error('Import outside the project.');
        visit(item.dependency);
    }
    const exported = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/gm)].map(match => match[1]);
    const importsCode = imports.map(item => `const { ${item.specifiers.replace(/\s+as\s+/g, ': ')} } = __modules[${JSON.stringify(item.dependency)}];`).join('\n');
    const body = source.replace(importsPattern, '').replace(/^export\s+/gm, '');
    modules.set(key, `__modules[${JSON.stringify(key)}] = (() => {\n${importsCode}\n${body}\nreturn { ${exported.join(', ')} };\n})();`);
}
visit('stakeout-assistant.js');
const script = `const __modules = Object.create(null);\n${[...modules.values()].join('\n')}`;
const css = fs.readFileSync(path.join(root, 'stakeout-assistant.css'), 'utf8');
const logo = fs.readFileSync(path.join(root, 'stakeout_assistant_logo_v.1.svg')).toString('base64');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="stakeout-assistant.css">', () => `<style>${css}</style>`)
    .replace('src="stakeout_assistant_logo_v.1.svg"', `src="data:image/svg+xml;base64,${logo}"`)
    .replace(/<script type="module" src="stakeout-assistant.js">\s*<\/script>/, () => `<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'stakeout-assistant.html'), html);
console.log(`Built dist/stakeout-assistant.html (${Buffer.byteLength(html)} bytes, no external dependencies).`);
