/* Vistoria por Voz — painel da central.
   Mostra as vistorias que pedem intervenção da central, da mais crítica para a menos crítica, com o tempo
   de espera, e registra o atendimento. Vistoria atendida sai da lista. Exige login (Supabase Auth) e
   e-mail liberado na tabela usuarios_painel (script 004). */
(function () {
  'use strict';

  var C = window.Central, el = C.el, p2 = C.p2, api = C.api, sair = C.sair, raiz = C.raiz;
  var META_GRAVE_MIN = 15;        // meta de atendimento, só para os graves (grupos 1 e 2)
  var ATUALIZA_SEG = 30;
  var GRUPOS = { 1: 'Vistoria encerrada · impeditivo', 2: 'Não utilizar o veículo', 3: 'Falar com a central', 4: 'Reparo' };
  var E = { aba: 'pendentes', pend: [], prog: [], desvio: 0, atualizado: null, erro: '', quem: null, relogio: null, ciclo: null };

  function hora(iso) { var d = new Date(iso); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function dataBr(iso) { var p = String(iso).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function duracao(seg) {
    seg = Math.max(0, Math.floor(seg));
    var d = Math.floor(seg / 86400), h = Math.floor(seg % 86400 / 3600), m = Math.floor(seg % 3600 / 60), s = seg % 60;
    if (d) return d + 'd ' + p2(h) + ':' + p2(m);
    return (h ? p2(h) + ':' : '') + p2(m) + ':' + p2(s);
  }

  /* ---------------- painel ---------------- */
  function parar() { clearInterval(E.relogio); clearInterval(E.ciclo); E.relogio = E.ciclo = null; }
  function iniciar(quem) {
    parar(); E.quem = quem;
    montar(); atualizar();
    E.ciclo = setInterval(atualizar, ATUALIZA_SEG * 1000);
    E.relogio = setInterval(tique, 1000);
  }
  var UI = {};
  function montar() {
    UI.nPend = el('span', { class: 'n' }, '0'); UI.nProg = el('span', { class: 'n' }, '0');
    UI.abaPend = el('button', { class: 'aba', type: 'button', role: 'tab', id: 'aba-pendentes', onclick: function () { E.aba = 'pendentes'; desenhar(); } }, 'Pendentes', UI.nPend);
    UI.abaProg = el('button', { class: 'aba', type: 'button', role: 'tab', id: 'aba-programadas', onclick: function () { E.aba = 'programadas'; desenhar(); } }, 'Programadas', UI.nProg);
    UI.info = el('span', { id: 'atualizado' }); UI.legenda = el('span'); UI.aviso = el('div'); UI.lista = el('div', { id: 'lista' });
    raiz.replaceChildren(
      C.topo('painel', E.quem, el('div', { class: 'abas', role: 'tablist' }, UI.abaPend, UI.abaProg)),
      el('main', { class: 'corpo' }, UI.aviso, el('div', { class: 'linha-info' }, UI.legenda, UI.info), UI.lista));
  }
  function atualizar() {
    return Promise.all([api('painel_central?select=*&order=grupo.asc,hora_fim.asc'), api('painel_programadas?select=*&order=data_programada.asc')]).then(function (r) {
      E.pend = r[0] || []; E.prog = r[1] || []; E.erro = ''; E.atualizado = new Date();
      if (E.pend.length && E.pend[0].agora) E.desvio = new Date(E.pend[0].agora).getTime() - Date.now();
      desenhar();
    }).catch(function (e) {
      if (e.status === 401 || /sem sessão/.test(e.message)) { sair('Sua sessão terminou. Entre de novo.'); return; }
      E.erro = 'Sem conexão com o servidor — a lista pode estar desatualizada. Tentando de novo…'; desenhar();
    });
  }
  function espera(v) { return (Date.now() + E.desvio - new Date(v.hora_fim).getTime()) / 1000; }
  function grave(v) { return v.grupo <= 2; }
  function pintarCrono(no, v) {
    var s = espera(v), fora = grave(v) && s > META_GRAVE_MIN * 60;
    no.className = 'crono' + (fora ? ' fora' : '');
    no.firstChild.textContent = duracao(s);
    no.lastChild.textContent = fora ? 'fora da meta de ' + META_GRAVE_MIN + ' min' : grave(v) ? 'meta: ' + META_GRAVE_MIN + ' min' : 'desde a vistoria';
  }
  function tique() { (UI.cronos || []).forEach(function (c) { pintarCrono(c.no, c.v); }); }
  function listaItens(v) {
    return el('ul', { class: 'itens' }, (v.itens || []).map(function (i) {
      var d = i.resposta || i.detalhe;
      return el('li', { class: 'i' + i.grupo }, i.item, d ? el('span', null, ' — ' + d) : null);
    }));
  }
  function desenhar() {
    UI.nPend.textContent = E.pend.length; UI.nProg.textContent = E.prog.length;
    UI.abaPend.setAttribute('aria-selected', E.aba === 'pendentes'); UI.abaProg.setAttribute('aria-selected', E.aba === 'programadas');
    UI.aviso.replaceChildren(E.erro ? el('div', { class: 'aviso', role: 'alert' }, E.erro) : '');
    UI.info.textContent = E.atualizado ? 'Atualizado às ' + p2(E.atualizado.getHours()) + ':' + p2(E.atualizado.getMinutes()) + ':' + p2(E.atualizado.getSeconds()) + ' · atualiza sozinho a cada ' + ATUALIZA_SEG + ' s' : '';
    UI.cronos = [];
    if (E.aba === 'pendentes') {
      UI.legenda.textContent = 'Do mais crítico para o menos crítico; dentro de cada grupo, o mais antigo primeiro.';
      UI.lista.replaceChildren.apply(UI.lista, E.pend.length ? E.pend.map(cartaoPendente) : [el('div', { class: 'vazio' }, 'Nenhuma vistoria aguardando atendimento.')]);
      tique();
    } else {
      UI.legenda.textContent = 'Manutenções marcadas para outra data, até alguém confirmar que foram executadas.';
      UI.lista.replaceChildren.apply(UI.lista, E.prog.length ? E.prog.map(cartaoProgramada) : [el('div', { class: 'vazio' }, 'Nenhuma manutenção programada em aberto.')]);
    }
  }
  function cartaoPendente(v) {
    var crono = el('div', { class: 'crono' }, el('span', null, ''), el('small', null, ''));
    UI.cronos.push({ no: crono, v: v });
    return el('article', { class: 'pend g' + v.grupo, 'data-vistoria': v.vistoria_id },
      el('div', null, el('div', { class: 'frota' }, el('small', null, 'Frota'), v.frota || '—'), el('div', { class: 'sub' }, v.veiculo || '')),
      el('div', null, el('span', { class: 'selo' }, GRUPOS[v.grupo]), listaItens(v),
        el('div', { class: 'sub' }, [v.motorista, v.centro_coletas, 'vistoria ' + hora(v.hora_fim)].filter(Boolean).join(' · '))),
      el('div', { class: 'lado' }, crono, el('button', { class: 'btn pri', type: 'button', onclick: function () { abrirAtendimento(v); } }, 'Atender')));
  }
  function cartaoProgramada(a) {
    var atrasada = a.data_programada < a.hoje;
    return el('article', { class: 'pend g' + a.grupo, 'data-atendimento': a.atendimento_id },
      el('div', null, el('div', { class: 'frota' }, el('small', null, 'Frota'), a.frota || '—'), el('div', { class: 'sub' }, a.veiculo || '')),
      el('div', null, listaItens(a), el('div', { class: 'sub' }, 'Protocolo ' + (a.protocolo || '—') + ' · ' + a.acao),
        el('div', { class: 'sub' }, [a.centro_coletas, 'atendido por ' + a.atendente + ' em ' + hora(a.atendido_em), a.veiculo_liberado ? 'veículo liberado' : 'veículo NÃO liberado'].filter(Boolean).join(' · '))),
      el('div', { class: 'lado' }, el('div', { class: 'crono' + (atrasada ? ' fora' : '') }, el('span', null, dataBr(a.data_programada)), el('small', null, atrasada ? 'data vencida' : 'data programada')),
        el('button', { class: 'btn pri', type: 'button', onclick: function () { abrirConclusao(a); } }, 'Confirmar execução')));
  }

  /* ---------------- diálogos ---------------- */
  function dialogo(conteudo) {
    var d = el('dialog', null, conteudo);
    d.addEventListener('close', function () { d.remove(); });
    document.body.appendChild(d); d.showModal(); return d;
  }
  function par(rot, val) { return el('div', { class: 'par' }, el('b', null, rot), el('span', null, val)); }
  function radio(nome, valor, rotulo, extra) { return el('label', { class: 'opc' }, el('input', { type: 'radio', name: nome, value: valor }), rotulo, extra || null); }

  var ACOES = [['local', 'Atendimento no local'], ['prestador', 'Atendimento em prestador'], ['informacao_incorreta', 'Informação incorreta'], ['agendamento', 'Agendamento futuro']];
  function abrirAtendimento(v) {
    var aval = el('textarea', { id: 'at-avaliacao', rows: '3' });
    var data = el('input', { type: 'date', id: 'at-data', 'aria-label': 'Data do agendamento' });
    var erro = el('span', { class: 'erro', role: 'alert' }), salvar = el('button', { class: 'btn pri', type: 'submit' }, 'Registrar atendimento');
    var d, form = el('form', { class: 'dlg', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      var ac = form.querySelector('input[name=acao]:checked'), lib = form.querySelector('input[name=liberado]:checked');
      if (!aval.value.trim()) { erro.textContent = 'Preencha a avaliação da central.'; return; }
      if (!ac) { erro.textContent = 'Escolha a ação realizada.'; return; }
      if (ac.value === 'agendamento' && !data.value) { erro.textContent = 'Informe a data do agendamento.'; return; }
      if (!lib) { erro.textContent = 'Informe se o veículo foi liberado.'; return; }
      erro.textContent = ''; salvar.disabled = true;
      api('rpc/registrar_atendimento', { p_vistoria: v.vistoria_id, p_avaliacao: aval.value, p_acao: ac.value,
        p_data_programada: ac.value === 'agendamento' ? data.value : null, p_veiculo_liberado: lib.value === 'sim' })
        .then(function (r) {
          d.close(); E.pend = E.pend.filter(function (x) { return x.vistoria_id !== v.vistoria_id; }); desenhar();
          var ok, fim = el('div', { class: 'dlg' }, el('h2', null, 'Atendimento registrado'),
            el('p', null, 'Frota ' + (v.frota || '—') + ' · protocolo ', el('strong', { id: 'protocolo', class: 'prot' }, (r && r.protocolo) || '—')),
            el('div', { class: 'rodape' }, el('button', { class: 'btn pri', type: 'button', onclick: function () { ok.close(); } }, 'OK')));
          ok = dialogo(fim);
          return atualizar();
        })
        .catch(function (e) { salvar.disabled = false; erro.textContent = e.status ? e.message : 'Sem conexão. O atendimento não foi gravado; tente de novo.'; if (/já foi atendida|acabou de ser atendida/.test(e.message)) atualizar(); });
    } },
      el('h2', null, 'Atendimento · frota ' + (v.frota || '—')),
      el('div', { class: 'resumo' }, par('Veículo', v.veiculo || '—'), par('Motorista', v.motorista || '—'), par('Centro de coletas', v.centro_coletas || '—'),
        par('Vistoria', hora(v.hora_fim) + (v.quilometragem ? ' · ' + Number(v.quilometragem).toLocaleString('pt-BR') + ' km' : '')),
        par('Informado pelo motorista', listaItens(v)), v.relato_livre ? par('Relato livre', v.relato_livre) : null),
      el('label', { class: 'campo' }, 'Avaliação da central', aval),
      el('fieldset', null, el('legend', null, 'Ação realizada'), ACOES.map(function (a) { return radio('acao', a[0], a[1], a[0] === 'agendamento' ? data : null); })),
      el('fieldset', null, el('legend', null, 'Veículo liberado para operar?'), radio('liberado', 'sim', 'Sim'), radio('liberado', 'nao', 'Não')),
      el('div', { class: 'rodape' }, erro, el('button', { class: 'btn', type: 'button', onclick: function () { d.close(); } }, 'Cancelar'), salvar));
    data.addEventListener('input', function () { form.querySelector('input[name=acao][value=agendamento]').checked = true; });
    d = dialogo(form); aval.focus();
  }
  function abrirConclusao(a) {
    var obs = el('textarea', { id: 'co-obs', rows: '3' }), erro = el('span', { class: 'erro', role: 'alert' }), salvar = el('button', { class: 'btn pri', type: 'submit' }, 'Confirmar execução');
    var d, form = el('form', { class: 'dlg', onsubmit: function (ev) {
      ev.preventDefault(); salvar.disabled = true; erro.textContent = '';
      api('rpc/concluir_programada', { p_atendimento: a.atendimento_id, p_observacao: obs.value })
        .then(function () { d.close(); return atualizar(); })
        .catch(function (e) { salvar.disabled = false; erro.textContent = e.status ? e.message : 'Sem conexão. Tente de novo.'; });
    } },
      el('h2', null, 'Manutenção programada · frota ' + (a.frota || '—')),
      el('div', { class: 'resumo' }, par('Itens', listaItens(a)), par('Avaliação', a.avaliacao), par('Ação', a.acao), par('Programada para', dataBr(a.data_programada))),
      el('label', { class: 'campo' }, 'Observação (opcional)', obs),
      el('div', { class: 'rodape' }, erro, el('button', { class: 'btn', type: 'button', onclick: function () { d.close(); } }, 'Cancelar'), salvar));
    d = dialogo(form); obs.focus();
  }

  C.aoSair = parar;
  C.abrir(iniciar);
})();
