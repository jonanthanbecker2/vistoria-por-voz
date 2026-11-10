/* Vistoria por Voz — painel de documentos: vencidos e a vencer dos veículos ativos, com filtro por centro de coletas. */
(function () {
  'use strict';
  var C = window.Central, el = C.el, api = C.api, raiz = C.raiz;
  var NOMES = { crlv: 'CRLV', civ: 'CIV', cipp: 'CIPP', tacografo: 'Certificado do tacógrafo', ctf: 'CTF', atipp: 'ATIPP', lic_estadual: 'Licença ambiental estadual', lic_municipal: 'Licença ambiental municipal' };
  var E = { centro: '', prazo: 30, docs: [] }, UI = {};
  function dataBr(iso) { return String(iso).split('-').reverse().join('/'); }
  function tile(rot, val, nota) { return el('div', { class: 'tile' }, el('div', { class: 'rot' }, rot), el('div', { class: 'val' }, val), el('div', { class: 'nota' }, nota)); }

  function iniciar(quem) {
    UI.centro = el('select', { id: 'f-centro', onchange: function () { E.centro = UI.centro.value; desenhar(); } });
    UI.prazo = el('select', { id: 'f-prazo', onchange: function () { E.prazo = +UI.prazo.value; desenhar(); } },
      [7, 15, 30, 60, 90].map(function (n) { return el('option', { value: n, selected: n === E.prazo }, 'Próximos ' + n + ' dias'); }));
    UI.aviso = el('div'); UI.tiles = el('div', { class: 'tiles', id: 'tiles' }); UI.lista = el('section', { class: 'tela-g', id: 'tela' });
    raiz.replaceChildren(C.topo('documentos', quem), el('main', { class: 'corpo' },
      el('div', { class: 'filtros' }, el('label', null, 'Centro de coletas', UI.centro), el('label', null, 'A vencer em', UI.prazo)), UI.aviso, UI.tiles, UI.lista));
    api('painel_documentos?select=*&order=vencimento.asc,frota.asc').then(function (r) {
      E.docs = r || [];
      var cs = {}; E.docs.forEach(function (d) { if (d.centro_coletas) cs[d.centro_coletas] = 1; });
      UI.centro.replaceChildren.apply(UI.centro, [el('option', { value: '' }, 'Todos os centros')].concat(Object.keys(cs).sort().map(function (c) { return el('option', { value: c }, c); })));
      desenhar();
    }).catch(function (e) {
      if (e.status === 401 || /sem sessão/.test(e.message)) { C.sair('Sua sessão terminou. Entre de novo.'); return; }
      UI.aviso.replaceChildren(el('div', { class: 'aviso', role: 'alert' }, e.status === 404 ? 'O painel de documentos ainda não foi instalado no servidor (script 006).' : 'Não foi possível carregar os documentos. Tente de novo.'));
    });
  }
  function desenhar() {
    var docs = E.docs.filter(function (d) { return !E.centro || d.centro_coletas === E.centro; });
    var venc = docs.filter(function (d) { return d.dias < 0; }), prox = docs.filter(function (d) { return d.dias >= 0 && d.dias <= E.prazo; });
    var frotas = {}; venc.forEach(function (d) { frotas[d.frota] = 1; });
    UI.tiles.replaceChildren(tile('Documentos vencidos', venc.length, Object.keys(frotas).length + ' veículo(s)'),
      tile('A vencer em ' + E.prazo + ' dias', prox.length, 'inclui os que vencem hoje'), tile('Documentos acompanhados', docs.length, 'veículos ativos do cadastro'));
    var linhas = venc.concat(prox);
    UI.lista.replaceChildren(el('h2', null, 'Vencidos e a vencer'), el('p', { class: 'dica' }, 'Do vencimento mais antigo para o mais distante. Vale a data mais recente lançada para cada documento.'),
      linhas.length ? el('table', { class: 'dados', id: 'tab-docs' },
        el('thead', null, el('tr', null, ['Situação', 'Frota', 'Centro de coletas', 'Documento', 'Número', 'Vencimento', 'Prazo'].map(function (c) { return el('th', null, c); }))),
        el('tbody', null, linhas.map(function (d) {
          var lugar = [d.municipio, d.uf].filter(Boolean).join(' / ');
          return el('tr', null, el('td', null, el('span', { class: 'sit' + (d.dias < 0 ? ' venc' : '') }, d.dias < 0 ? 'Vencido' : 'A vencer')),
            el('td', null, el('strong', null, d.frota), d.veiculo ? ' · ' + d.veiculo : ''), el('td', null, d.centro_coletas || '—'),
            el('td', null, (NOMES[d.documento] || d.documento) + (lugar ? ' (' + lugar + ')' : '')), el('td', null, d.numero || '—'), el('td', null, dataBr(d.vencimento)),
            el('td', null, d.dias < 0 ? 'há ' + (-d.dias) + ' dia(s)' : d.dias === 0 ? 'vence hoje' : 'em ' + d.dias + ' dia(s)'));
        }))) : el('p', { class: 'dica' }, 'Nenhum documento vencido ou a vencer neste prazo.'));
  }
  C.abrir(iniciar);
})();
