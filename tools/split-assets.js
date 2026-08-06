/* one-shot: รวม effects + แยก CSS tools/howto */
const fs = require('fs');

const sets = ['sd01', 'sd02', 'sd03', 'sd04', 'sd05', 'sd06', 'sd07', 'sd08',
  'kd01', 'kd02', 'kd03', 'kd04',
  'bt01', 'bt02', 'bt03', 'bt04', 'bt05', 'bt06', 'bt07', 'bt08', 'bt09', 'bt10', 'bt11', 'cc01'];
const cards = [];
for (const s of sets) {
  const j = JSON.parse(fs.readFileSync('data/effects-' + s + '.json', 'utf8'));
  for (const c of (j.cards || [])) cards.push(c);
}
fs.writeFileSync('data/effects-all.json', JSON.stringify({ cards }));
console.log('effects-all', cards.length, 'cards', Math.round(fs.statSync('data/effects-all.json').size / 1024) + 'KB');

let css = fs.readFileSync('css/style.css', 'utf8');
const toolsStart = css.indexOf('/* ── Deck Builder / Gallery ── */');
const afterTools = css.indexOf('/* ── จอกว้างพิเศษ:');
if (toolsStart < 0 || afterTools < 0) throw new Error('tools markers missing');
const toolsBlock = css.slice(toolsStart, afterTools);
const mobDb = `
@media (max-width:920px){
  .db-side{position:fixed;left:0;top:42px;bottom:0;z-index:150;width:min(84vw,280px);transform:translateX(-105%);transition:transform .2s;box-shadow:8px 0 24px rgba(0,0,0,.5)}
  .db-side.open{transform:none}
  .db-deck{position:fixed;right:0;top:42px;bottom:0;z-index:150;width:min(88vw,320px);transform:translateX(105%);transition:transform .2s;box-shadow:-8px 0 24px rgba(0,0,0,.5)}
  .db-deck.open{transform:none}
  .db-result{flex-wrap:wrap;row-gap:4px}
  .db-grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}
  #glZoom,#dbZoom{overflow-y:auto;align-content:safe center}
  .gl-zoom-img{height:auto;width:68vw;max-width:340px}
  .gl-zoom-info{width:88vw}
}
`;
fs.writeFileSync('css/tools.css', toolsBlock.trim() + '\n' + mobDb);
css = css.slice(0, toolsStart) + css.slice(afterTools);
css = css.replace(/\s*\/\* Deck Builder บนมือถือ:[\s\S]*?\.gl-zoom-info\{width:88vw\}\n/, '\n');

const howtoStart = css.indexOf('/* ═══ 📖 หน้าวิธีเล่น ═══ */');
if (howtoStart < 0) throw new Error('howto missing');
fs.writeFileSync('css/howto.css', css.slice(howtoStart).trim() + '\n');
css = css.slice(0, howtoStart).trimEnd() + '\n';
if (!css.includes('.screen-page{')) {
  css += '\n/* โครงหน้าเครื่องมือ (สไตล์เต็มโหลดตอนเปิด) */\n.screen-page{position:fixed;inset:0;display:flex;flex-direction:column;background:#1e1610}\n';
}
fs.writeFileSync('css/style.css', css);
console.log('style', Math.round(fs.statSync('css/style.css').size / 1024) + 'KB');
console.log('tools', Math.round(fs.statSync('css/tools.css').size / 1024) + 'KB');
console.log('howto', Math.round(fs.statSync('css/howto.css').size / 1024) + 'KB');
