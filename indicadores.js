/* Vistoria por Voz — indicadores de gestão (mês e centro de coletas). Lê tudo de uma vez da função indicadores_mes (script 005). */
(function () {
  'use strict';
  var C = window.Central, el = C.el, p2 = C.p2, api = C.api, raiz = C.raiz;
  var hoje = new Date(), E = { mes: hoje.getFullYear() + '-' + p2(hoje.getMonth() + 1), centro: '', quem: null, d: null };
  var UI = {};
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) { var e = document.createElementNS(NS, tag), k; for (k in (attrs || {})) e.setAttribute(k, attrs[k]); for (var i = 2; i < arguments.length; i++) if (arguments[i] != null) e.appendChild(typeof arguments[i] === 'object' ? arguments[i] : document.createTextNode(arguments[i])); return e; }
  function num(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function pct(a, b) { return b ? Math.round(a / b * 100) + '%' : '—'; }
  function minutos(m) { if (m == null) return '—'; m = Number(m); return m < 60 ? num(Math.round(m)) + ' min' : Math.floor(m / 60) + ' h ' + p2(Math.round(m % 60)) + ' min'; }

  function iniciar(quem) {
    E.quem = quem;
    UI.mes = el('input', { type: 'month', id: 'f-mes', value: E.mes, onchange: function () { if (UI.mes.value) { E.mes = UI.mes.value; carregar(); } } });
    UI.centro = el('select', { id: 'f-centro', onchange: function () { E.centro = UI.centro.value; carregar(); } }, el('option', { value: '' }, 'Todos os centros'));
    UI.aviso = el('div'); UI.corpo = el('div', { id: 'indicadores' });
    raiz.replaceChildren(C.topo('indicadores', quem),
      el('main', { class: 'corpo viz' }, el('div', { class: 'filtros' }, el('label', null, 'Mês', UI.mes), el('label', null, 'Centro de coletas', UI.centro)), UI.aviso, UI.corpo));
    carregar();
  }
  function carregar() {
    api('rpc/indicadores_mes', { p_mes: E.mes + '-01', p_centro: E.centro || null }).then(function (d) {
      E.d = d; UI.aviso.replaceChildren();
      var atual = E.centro, ops = [el('option', { value: '' }, 'Todos os centros')].concat((d.centros || []).slice().sort().map(function (c) { return el('option', { value: c }, c); }));
      UI.centro.replaceChildren.apply(UI.centro, ops); UI.centro.value = atual;
      desenhar(d);
    }).catch(function (e) {
      if (e.status === 401 || /sem sessão/.test(e.message)) { C.sair('Sua sessão terminou. Entre de novo.'); return; }
      UI.aviso.replaceChildren(el('div', { class: 'aviso', role: 'alert' }, e.status === 404 ? 'Os indicadores ainda não foram instalados no servidor (script 005).' : 'Não foi possível carregar os indicadores. Tente de novo.'));
    });
  }

  function tile(rot, val, nota) { return el('div', { class: 'tile' }, el('div', { class: 'rot' }, rot), el('div', { class: 'val' }, val), nota ? el('div', { class: 'nota' }, nota) : null); }
  function bloco(titulo, dica, conteudo, largo) { return el('section', { class: 'bloco' + (largo ? ' largo' : '') }, el('h2', null, titulo), el('p', { class: 'dica' }, dica), conteudo); }
  function barras(lista, extra) {
    if (!lista || !lista.length) return el('p', { class: 'dica' }, 'Sem registros no período.');
    var max = Math.max.apply(null, lista.map(function (x) { return x.n; })) || 1;
    return el('div', { class: 'barras' }, lista.map(function (x) {
      return el('div', { class: 'barra', title: x.nome + ': ' + x.n }, el('span', { class: 'nome' }, x.nome),
        el('div', { class: 'trilho' }, el('div', { class: 'cheio', style: 'width:' + (x.n / max * 100).toFixed(1) + '%' })),
        el('span', { class: 'num' }, num(x.n), extra ? el('small', null, extra(x)) : null));
    }));
  }
  // Enviados × tratados por dia: duas barras por dia, mesma escala, com legenda e dica ao passar o mouse
  function graficoDias(dias) {
    var W = 920, H = 230, esq = 30, base = H - 24, topo = 12, n = dias.length || 1, passo = (W - esq) / n, larg = Math.max(3, Math.min(13, passo / 2 - 2));
    var max = Math.max(1, Math.max.apply(null, dias.map(function (x) { return Math.max(x.enviados, x.tratados); })));
    var teto = max <= 4 ? max : Math.ceil(max / 4) * 4, y = function (v) { return base - (base - topo) * v / teto; };
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Vistorias enviadas para a central e tratadas, por dia' });
    for (var i = 0; i <= 4; i++) { var v = teto * i / 4; if (v % 1) continue; g.appendChild(svg('line', { class: 'linha', x1: esq, x2: W, y1: y(v), y2: y(v) })); g.appendChild(svg('text', { class: 'eixo', x: esq - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v))); }
    var dica = el('div', { class: 'dica-flut', hidden: true }); document.body.appendChild(dica);
    dias.forEach(function (d, k) {
      var x = esq + k * passo, dia = +String(d.dia).slice(8), col = svg('g', { class: 'col' });
      col.appendChild(svg('rect', { class: 'fundo', x: x, y: 0, width: passo, height: base, fill: 'transparent' }));
      var barra = function (valor, dx, cor) { if (valor) { var h = base - y(valor); col.appendChild(svg('path', { fill: cor, d: 'M' + (x + dx) + ' ' + base + 'v' + -(h - Math.min(3, h)) + 'q0 -3 3 -3h' + (larg - 6) + 'q3 0 3 3v' + (h - Math.min(3, h)) + 'z' })); } };
      barra(d.enviados, passo / 2 - larg - 1, 'var(--serie-1)'); barra(d.tratados, passo / 2 + 1, 'var(--serie-2)');
      col.appendChild(svg('text', { class: 'eixo', x: x + passo / 2, y: H - 7, 'text-anchor': 'middle' }, String(dia)));
      col.addEventListener('mousemove', function (ev) { dica.hidden = false; dica.textContent = 'Dia ' + p2(dia) + '\nEnviados: ' + d.enviados + '\nTratados: ' + d.tratados + '\nChecklists: ' + d.total; dica.style.left = Math.min(ev.clientX + 14, innerWidth - 150) + 'px'; dica.style.top = (ev.clientY + 14) + 'px'; });
      col.addEventListener('mouseleave', function () { dica.hidden = true; });
      g.appendChild(col);
    });
    var tabela = el('details', null, el('summary', { class: 'dica' }, 'Ver em tabela'), el('table', { class: 'dados' },
      el('thead', null, el('tr', null, el('th', null, 'Dia'), el('th', { class: 'n' }, 'Checklists'), el('th', { class: 'n' }, 'Enviados'), el('th', { class: 'n' }, 'Tratados'))),
      el('tbody', null, dias.filter(function (d) { return d.total || d.enviados || d.tratados; }).map(function (d) { return el('tr', null, el('td', null, String(d.dia).split('-').reverse().join('/')), el('td', { class: 'n' }, d.total), el('td', { class: 'n' }, d.enviados), el('td', { class: 'n' }, d.tratados)); }))));
    return el('div', { class: 'dias' }, el('div', { class: 'legenda' }, el('span', null, el('i', { style: 'background:var(--serie-1)' }), 'Enviados para a central'), el('span', null, el('i', { style: 'background:var(--serie-2)' }), 'Tratados pela central')), g, tabela);
  }

  function desenhar(d) {
    Array.prototype.forEach.call(document.querySelectorAll('.dica-flut'), function (x) { x.remove(); });
    var at = d.por_atendente || [];
    UI.corpo.replaceChildren(
      el('div', { class: 'tiles', id: 'tiles' },
        tile('Checklists no mês', num(d.total), 'total da frota'),
        tile('Com itens de verificação', num(d.com_itens), pct(d.com_itens, d.total) + ' dos checklists'),
        tile('Encaminhados para a central', num(d.para_central), pct(d.para_central, d.total) + ' dos checklists'),
        tile('Encaminhados ao centro de coletas', num(d.para_coletas), pct(d.para_coletas, d.total) + ' dos checklists'),
        tile('Tratados pela central', num(d.tratados), pct(d.tratados, d.para_central) + ' dos encaminhados · ' + num(d.pendentes) + ' pendente(s)'),
        tile('Tempo médio de atendimento', minutos(d.tempo_medio_min), 'da vistoria até o registro'),
        tile('Graves dentro da meta', pct(d.graves_na_meta, d.graves_tratados), num(d.graves_na_meta) + ' de ' + num(d.graves_tratados) + ' em até 15 min'),
        tile('Vistorias encerradas na hora', num(d.encerradas_na_hora), 'veículo impedido de operar'),
        tile('Frota vistoriada no mês', pct(d.frotas_vistoriadas, d.frotas_ativas), num(d.frotas_vistoriadas) + ' de ' + num(d.frotas_ativas) + ' veículos ativos'),
        tile('Agendamentos em aberto', num(d.programadas_abertas), 'manutenção marcada e não confirmada')),
      el('div', { class: 'grade' },
        bloco('Enviados para a central × tratados', 'Por dia: vistorias que subiram para a central e atendimentos registrados.', graficoDias(d.por_dia || []), true),
        bloco('Checklists por centro de coletas', 'Vistorias registradas no mês.', barras(d.por_centro)),
        bloco('Falhas por item', 'Apontamentos no mês, com o número de veículos diferentes.', barras(d.falhas_por_item, function (x) { return ' · ' + x.veiculos + ' veíc.'; })),
        bloco('Ação realizada pela central', 'Como os atendimentos foram resolvidos.', barras(d.por_acao)),
        bloco('Frotas com mais apontamentos', 'As 10 frotas com mais itens apontados no mês.', barras((d.frotas_mais_apontamentos || []).map(function (x) { return { nome: 'Frota ' + x.nome, n: x.n }; }))),
        bloco('Atendimentos por atendente', 'Quantidade e tempo médio de cada pessoa da central.', at.length ? el('table', { class: 'dados', id: 'tab-atendentes' },
          el('thead', null, el('tr', null, el('th', null, 'Atendente'), el('th', { class: 'n' }, 'Atendimentos'), el('th', { class: 'n' }, 'Tempo médio'))),
          el('tbody', null, at.map(function (x) { return el('tr', null, el('td', null, x.nome), el('td', { class: 'n' }, num(x.n)), el('td', { class: 'n' }, minutos(x.tempo_medio_min))); }))) : el('p', { class: 'dica' }, 'Sem atendimentos no período.'))));
  }
  C.abrir(iniciar);
})();
