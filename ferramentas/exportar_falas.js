// Gera ferramentas/falas.json a partir de checklist.js + falas.js (rodar após editar o roteiro):
//   node ferramentas/exportar_falas.js
const path = require('path'), fs = require('fs');
global.window = {};
require(path.join(__dirname, '..', 'checklist.js'));
const api = require(path.join(__dirname, '..', 'falas.js'));
const falas = api.construir(window.CHECKLIST);
fs.writeFileSync(path.join(__dirname, 'falas.json'), JSON.stringify(falas, null, 1), 'utf8');
console.log(Object.keys(falas).length + ' falas exportadas para ferramentas/falas.json');
