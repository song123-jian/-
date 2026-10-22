// Generate Qt SVG assets from the existing, locally bundled Lucide library.
const fs = require('node:fs');
const path = require('node:path');
const icons = require('./static/lucide.min.js');
const output = path.join(__dirname, 'ui', 'icons');
fs.mkdirSync(output, { recursive: true });
const names = { search: 'Search', plus: 'Plus', history: 'History', upload: 'Upload',
  download: 'Download', database: 'Database', menu: 'Menu', refresh: 'RefreshCw',
  'chevron-down': 'ChevronDown' };
function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
function element(node) {
  const [tag, attributes, children = []] = node;
  const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${xml(value)}"`).join(' ');
  return `<${tag} ${attrs}>${children.map(element).join('')}</${tag}>`;
}
for (const [filename, name] of Object.entries(names)) {
  const [tag, attributes, children] = icons[name];
  const svg = element([tag, { ...attributes, stroke: '#2f6b54', 'stroke-width': 1.8 }, children]);
  fs.writeFileSync(path.join(output, filename + '.svg'), svg, 'utf8');
  fs.writeFileSync(path.join(output, filename + '-white.svg'), element([tag, { ...attributes, stroke: '#ffffff', 'stroke-width': 1.8 }, children]), 'utf8');
}
fs.copyFileSync(path.join(__dirname, 'static', 'LUCIDE-LICENSE.txt'), path.join(output, 'LUCIDE-LICENSE.txt'));
