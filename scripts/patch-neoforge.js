// Réapplique le correctif NeoForge 26.x après un `npm install`
const fs = require('fs'), path = require('path');
const p = path.join(__dirname, '..', 'node_modules', 'minecraft-java-core-azbetter', 'build', 'Minecraft-Loader', 'loader', 'neoForge', 'neoForge.js');
if (!fs.existsSync(p)) process.exit(0);
let s = fs.readFileSync(p, 'utf8');
if (s.includes('Nouveau schéma (26.x)')) process.exit(0);
const old = "const shortVersion = `${splitted[1]}.${splitted[2] || 0}`;";
const neu = "const shortVersion = parseInt(splitted[0], 10) >= 26 /* Nouveau schéma (26.x) */ ? (splitted.length >= 3 ? `${splitted[0]}.${splitted[1]}.${splitted[2]}.` : `${splitted[0]}.${splitted[1]}.0.`) : `${splitted[1]}.${splitted[2] || 0}`;";
if (s.includes(old)) { fs.writeFileSync(p, s.replace(old, neu)); console.log('[patch] NeoForge 26.x OK'); }
