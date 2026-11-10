/* Vistoria por Voz — indicadores de gestão. Um gráfico por tela, escolhido no menu; filtros de mês e centro de coletas.
   Lê tudo de uma vez da função indicadores_mes (scripts 005 e 006). */
(function () {
  'use strict';
  var C = window.Central, el = C.el, p2 = C.p2, api = C.api, raiz = C.raiz;
  var hoje = new Date(), E = { mes: hoje.getFullYear() + '-' + p2(hoje.getMonth() + 1), centro: '', tela: 'resumo', d: null };
  var UI = {};
  function num(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function minutos(m) { if (m == null) return '—'; m = Number(m); return m < 60 ? num(Math.round(m)) + ' min' : Math.floor(m / 60) + ' h ' + p2(Math.round(m % 60)) + ' min'; }
  function dataBr(iso) { return String(iso).split('-').reverse().join('/'); }

  // Colunas com o valor escrito em cima de cada uma. itens: [{ nome, n, rotulo?, nota?, dest? }]
  function colunas(itens, teto) {
    if (!itens.length) return el('p', { class: 'dica' }, 'Sem registros no período.');
    var max = teto || Math.max.apply(null, itens.map(function (x) { return x.n || 0; })) || 1;
    return el('div', { class: 'graf' },
      el('div', { class: 'colunas', role: 'img', 'aria-label': itens.map(function (x) { return x.nome + ': ' + (x.rotulo || x.n); }).join('; ') }, itens.map(function (x) {
        return el('div', { class: 'coluna' + (x.dest ? ' dest' : ''), title: x.nome + ': ' + (x.rotulo || num(x.n)) },
          el('div', { class: 'v' }, x.rotulo || num(x.n), x.nota ? el('small', null, x.nota) : null),
          el('div', { class: 'b', style: 'height:' + Math.max(0, (x.n || 0) / max * 100).toFixed(1) + '%' }));
      })),
      el('div', { class: 'nomes' }, itens.map(function (x) { return el('span', null, x.nome); })));
  }
  function barras(lista, extra) {
    if (!lista || !lista.length) return el('p', { class: 'dica' }, 'Sem registros no período.');
    var max = Math.max.apply(null, lista.map(function (x) { return x.n; })) || 1;
    return el('div', { class: 'barras' }, lista.map(function (x) {
      return el('div', { class: 'barra', title: x.nome + ': ' + x.n }, el('span', { class: 'nome' }, x.nome),
        el('div', { class: 'trilho' }, el('div', { class: 'cheio', style: 'width:' + (x.n / max * 100).toFixed(1) + '%' })),
        el('span', { class: 'num' }, num(x.n), extra ? el('small', null, extra(x)) : null));
    }));
  }
  function tabela(cab, linhas, vazio) {
    if (!linhas.length) return el('p', { class: 'dica' }, vazio);
    return el('table', { class: 'dados' }, el('thead', null, el('tr', null, cab.map(function (c) { return el('th', { class: c[1] ? 'n' : null }, c[0]); }))),
      el('tbody', null, linhas.map(function (l) { return el('tr', null, l.map(function (v, i) { return el('td', { class: cab[i][1] ? 'n' : null }, v); })); })));
  }
  function nota(t) { return el('p', { class: 'nota-g' }, t); }

  var TELAS = [
    ['resumo', 'Checklists do mês', 'Registrados, com itens de verificação, encaminhados para cada área e tratados pela central.', function (d) {
      return [colunas([{ nome: 'Registrados no mês', n: d.total, dest: true }, { nome: 'Com itens de verificação', n: d.com_itens, nota: pct(d.com_itens, d.total) + '% dos registrados' },
        { nome: 'Encaminhados para a central', n: d.para_central }, { nome: 'Encaminhados ao centro de coletas', n: d.para_coletas },
        { nome: 'Tratados pela central', n: d.tratados, nota: pct(d.tratados, d.para_central) + '% dos encaminhados' }]),
        nota('Um checklist pode ir para as duas áreas ao mesmo tempo. Aguardando atendimento da central: ' + num(d.pendentes) + '.')];
    }],
    ['itens', 'Falhas por item', 'Quantidade de apontamentos de cada item no mês e em quantos veículos diferentes.', function (d) {
      return [barras(d.falhas_por_item, function (x) { return ' · ' + x.veiculos + ' veículo(s)'; })];
    }],
    ['graves', 'Casos graves (não utilize)', 'Só os itens que impedem o uso: vistoria encerrada na hora e "não utilize o veículo".', function (d) {
      var t = (d.graves_por_item || []).reduce(function (s, x) { return s + x.n; }, 0);
      return [barras(d.graves_por_item, function (x) { return ' · ' + x.veiculos + ' veículo(s)'; }), nota('Total de itens graves no mês: ' + num(t) + '. Vistorias encerradas na hora: ' + num(d.encerradas_na_hora) + '.')];
    }],
    ['centros', 'Checklists por centro de coletas', 'Checklists efetuados no mês em cada centro.', function (d) {
      return [colunas((d.centros_detalhe || []).map(function (c) { return { nome: c.nome, n: c.checklists }; }))];
    }],
    ['aderencia', 'Aderência', 'Parte dos veículos ativos que fez pelo menos um checklist no mês.', function (d) {
      var cs = (d.centros_detalhe || []).filter(function (c) { return c.ativos; });
      var it = [{ nome: 'Nacional', n: pct(d.vistoriados_ativos, d.frotas_ativas), rotulo: pct(d.vistoriados_ativos, d.frotas_ativas) + '%', nota: num(d.vistoriados_ativos) + ' de ' + num(d.frotas_ativas), dest: true }]
        .concat(cs.map(function (c) { return { nome: c.nome, n: pct(c.vistoriados, c.ativos), rotulo: pct(c.vistoriados, c.ativos) + '%', nota: num(c.vistoriados) + ' de ' + num(c.ativos) }; }));
      return [colunas(E.centro ? it.slice(1) : it, 100), nota('Embaixo de cada percentual: veículos com checklist no mês, sobre os veículos ativos do cadastro.')];
    }],
    ['tempo', 'Tempo médio de atendimento', 'Da conclusão do checklist até o registro do atendimento pela central.', function (d) {
      var cs = (d.centros_detalhe || []).filter(function (c) { return c.tempo_medio_min != null; });
      var it = (d.tempo_medio_min != null ? [{ nome: 'Média nacional', n: +d.tempo_medio_min, rotulo: minutos(d.tempo_medio_min), nota: num(d.tratados) + ' atendimento(s)', dest: true }] : [])
        .concat(cs.map(function (c) { return { nome: c.nome, n: +c.tempo_medio_min, rotulo: minutos(c.tempo_medio_min), nota: num(c.tratados) + ' atendimento(s)' }; }));
      return [colunas(E.centro ? it.slice(1) : it), nota('Casos graves atendidos em até 15 minutos: ' + num(d.graves_na_meta) + ' de ' + num(d.graves_tratados) + '.')];
    }],
    ['imediato', 'Imediatas × programadas', 'Manutenções resolvidas no atendimento e manutenções agendadas para outra data.', function (d) {
      return [colunas([{ nome: 'Realizadas de imediato', n: d.imediatas, nota: 'no local ou em prestador' }, { nome: 'Programadas', n: d.agendadas, nota: 'agendamento futuro' }]),
        nota('Atendimentos fechados como "informação incorreta" (sem manutenção): ' + num(d.informacao_incorreta) + '.')];
    }],
    ['programadas', 'Programadas × executadas × pendentes', 'Manutenções agendadas a partir dos checklists do mês e o que já foi confirmado.', function (d) {
      return [colunas([{ nome: 'Programadas', n: d.agendadas, dest: true }, { nome: 'Executadas', n: d.prog_executadas, nota: pct(d.prog_executadas, d.agendadas) + '% das programadas' }, { nome: 'Pendentes', n: d.prog_pendentes }]),
        nota('Pendentes com a data já vencida: ' + num(d.prog_atrasadas) + '.')];
    }],
    ['reincidencia', 'Reincidências', 'Mesma frota com o mesmo item apontado em mais de um checklist no mês.', function (d) {
      return [tabela([['Frota'], ['Centro de coletas'], ['Item'], ['Vezes', 1], ['Primeira'], ['Última']],
        (d.reincidencias || []).map(function (r) { return [r.frota, r.centro, r.item, r.vezes, dataBr(r.primeira), dataBr(r.ultima)]; }), 'Nenhuma reincidência no período.')];
    }],
    ['atendentes', 'Atendimentos por atendente', 'Quantidade e tempo médio de cada pessoa da central.', function (d) {
      return [tabela([['Atendente'], ['Atendimentos', 1], ['Tempo médio', 1]], (d.por_atendente || []).map(function (x) { return [x.nome, num(x.n), minutos(x.tempo_medio_min)]; }), 'Sem atendimentos no período.')];
    }]
  ];

  function iniciar(quem) {
    UI.mes = el('input', { type: 'month', id: 'f-mes', value: E.mes, onchange: function () { if (UI.mes.value) { E.mes = UI.mes.value; carregar(); } } });
    UI.centro = el('select', { id: 'f-centro', onchange: function () { E.centro = UI.centro.value; carregar(); } }, el('option', { value: '' }, 'Todos os centros'));
    UI.aviso = el('div'); UI.tela = el('section', { class: 'tela-g', id: 'tela' });
    UI.menu = el('nav', { class: 'menu', 'aria-label': 'Indicadores' }, TELAS.map(function (t) {
      return el('button', { type: 'button', 'data-tela': t[0], onclick: function () { E.tela = t[0]; desenhar(); } }, t[1]);
    }));
    raiz.replaceChildren(C.topo('indicadores', quem), el('div', { class: 'duas viz' }, UI.menu,
      el('main', null, el('div', { class: 'filtros' }, el('label', null, 'Mês', UI.mes), el('label', null, 'Centro de coletas', UI.centro)), UI.aviso, UI.tela)));
    carregar();
  }
  function carregar() {
    api('rpc/indicadores_mes', { p_mes: E.mes + '-01', p_centro: E.centro || null }).then(function (d) {
      E.d = d; UI.aviso.replaceChildren();
      var ops = [el('option', { value: '' }, 'Todos os centros')].concat((d.centros || []).slice().sort().map(function (c) { return el('option', { value: c }, c); }));
      UI.centro.replaceChildren.apply(UI.centro, ops); UI.centro.value = E.centro;
      desenhar();
    }).catch(function (e) {
      if (e.status === 401 || /sem sessão/.test(e.message)) { C.sair('Sua sessão terminou. Entre de novo.'); return; }
      UI.aviso.replaceChildren(el('div', { class: 'aviso', role: 'alert' }, e.status === 404 ? 'Os indicadores ainda não foram instalados no servidor (scripts 005 e 006).' : 'Não foi possível carregar os indicadores. Tente de novo.'));
    });
  }
  function desenhar() {
    var d = E.d; if (!d) return;
    Array.prototype.forEach.call(UI.menu.children, function (b) { b.setAttribute('aria-current', b.getAttribute('data-tela') === E.tela); });
    var t = TELAS.filter(function (x) { return x[0] === E.tela; })[0];
    if (d.centros_detalhe === undefined) { UI.tela.replaceChildren(el('p', { class: 'aviso' }, 'Falta rodar o script 006 no servidor para ver estes gráficos.')); return; }
    UI.tela.replaceChildren.apply(UI.tela, [el('h2', null, t[1]), el('p', { class: 'dica' }, t[2])].concat(t[3](d)));
  }
  C.abrir(iniciar);
})();
