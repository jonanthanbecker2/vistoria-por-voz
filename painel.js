/* Vistoria por Voz — painel da central.
   Mostra as vistorias que pedem intervenção da central, da mais crítica para a menos crítica, com o tempo
   de espera, e registra o atendimento. Vistoria atendida sai da lista. Exige login (Supabase Auth) e
   e-mail liberado na tabela usuarios_painel (script 004). */
(function () {
  'use strict';

  var SERVIDOR = { url: 'https://udzegivmhhiopudnuxes.supabase.co', chave: 'sb_publishable_A6V_SpGYp1MmRIoLYCSNxg_WGdmaSHQ' };
  var META_GRAVE_MIN = 15;        // meta de atendimento, só para os graves (grupos 1 e 2)
  var ATUALIZA_SEG = 30;
  var GRUPOS = { 1: 'Vistoria encerrada · impeditivo', 2: 'Não utilizar o veículo', 3: 'Falar com a central', 4: 'Reparo' };
  var raiz = document.getElementById('raiz');
  var E = { aba: 'pendentes', pend: [], prog: [], desvio: 0, atualizado: null, erro: '', quem: null, relogio: null, ciclo: null };

  function el(tag, attrs) {
    var e = document.createElement(tag), i, k;
    for (k in (attrs || {})) {
      if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    var add = function (c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); };
    for (i = 2; i < arguments.length; i++) add(arguments[i]);
    return e;
  }
  function p2(n) { return String(n).padStart(2, '0'); }
  function hora(iso) { var d = new Date(iso); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function dataBr(iso) { var p = String(iso).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function duracao(seg) {
    seg = Math.max(0, Math.floor(seg));
    var d = Math.floor(seg / 86400), h = Math.floor(seg % 86400 / 3600), m = Math.floor(seg % 3600 / 60), s = seg % 60;
    if (d) return d + 'd ' + p2(h) + ':' + p2(m);
    return (h ? p2(h) + ':' : '') + p2(m) + ':' + p2(s);
  }

  /* ---------------- sessão ---------------- */
  var Sessao = {
    ler: function () { try { return JSON.parse(localStorage.getItem('vv_painel_sessao') || 'null'); } catch (e) { return null; } },
    gravar: function (j) {
      var s = { access_token: j.access_token, refresh_token: j.refresh_token, expira: Date.now() + (j.expires_in || 3600) * 1000, email: (j.user && j.user.email) || '' };
      try { localStorage.setItem('vv_painel_sessao', JSON.stringify(s)); } catch (e) {}
      return s;
    },
    limpar: function () { try { localStorage.removeItem('vv_painel_sessao'); } catch (e) {} },
    pedir: function (tipo, corpo) {
      return fetch(SERVIDOR.url + '/auth/v1/token?grant_type=' + tipo, { method: 'POST', headers: { apikey: SERVIDOR.chave, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.access_token) { var e = new Error(j.error_description || j.msg || j.message || 'falha'); e.status = r.status; throw e; } return Sessao.gravar(j); }); });
    },
    entrar: function (email, senha) { return this.pedir('password', { email: email, password: senha }); },
    renovando: null,
    renovar: function () {
      var self = this, s = this.ler();
      if (!s || !s.refresh_token) return Promise.reject(new Error('sem sessão'));
      if (!this.renovando) this.renovando = this.pedir('refresh_token', { refresh_token: s.refresh_token }).finally(function () { self.renovando = null; });
      return this.renovando;
    },
    // token válido; renova um pouco antes de vencer
    token: function () {
      var s = this.ler();
      if (!s) return Promise.reject(new Error('sem sessão'));
      if (s.expira - Date.now() > 60000) return Promise.resolve(s.access_token);
      return this.renovar().then(function (n) { return n.access_token; });
    }
  };

  function api(caminho, corpo, repetida) {
    return Sessao.token().then(function (tk) {
      return fetch(SERVIDOR.url + '/rest/v1/' + caminho, { method: corpo ? 'POST' : 'GET',
        headers: { apikey: SERVIDOR.chave, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined });
    }).then(function (r) {
      if (r.status === 401 && !repetida) return Sessao.renovar().then(function () { return api(caminho, corpo, true); });
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.message) || 'Erro ' + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /* ---------------- entrada ---------------- */
  function telaEntrada(msg) {
    parar();
    var email = el('input', { id: 'email', type: 'email', autocomplete: 'username', required: true });
    var senha = el('input', { id: 'senha', type: 'password', autocomplete: 'current-password', required: true });
    var erro = el('p', { class: 'erro', role: 'alert' }, msg || '');
    var botao = el('button', { class: 'btn pri', type: 'submit' }, 'Entrar');
    var form = el('form', { onsubmit: function (ev) {
      ev.preventDefault(); erro.textContent = ''; botao.disabled = true;
      Sessao.entrar(email.value.trim(), senha.value).then(iniciar).catch(function (e) {
        botao.disabled = false;
        erro.textContent = e.status === 400 ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Verifique a conexão e tente de novo.';
      });
    } }, el('h1', null, 'Painel da central'), el('p', { class: 'dica' }, 'Vistoria por Voz · acesso restrito'),
      el('label', { class: 'campo' }, 'E-mail', email), el('label', { class: 'campo' }, 'Senha', senha), botao, erro);
    raiz.replaceChildren(el('div', { class: 'entrada' }, form));
    email.focus();
  }
  function sair(msg) { Sessao.limpar(); telaEntrada(msg); }

  /* ---------------- painel ---------------- */
  function parar() { clearInterval(E.relogio); clearInterval(E.ciclo); E.relogio = E.ciclo = null; }
  function iniciar() {
    parar();
    raiz.replaceChildren(el('div', { class: 'entrada' }, el('p', { class: 'dica' }, 'Carregando…')));
    api('rpc/painel_quem_sou', {}).then(function (q) {
      E.quem = q || {};
      if (!E.quem.autorizado) { sair('O e-mail ' + (E.quem.email || '') + ' não está liberado para o painel. Fale com o responsável.'); return; }
      montar(); atualizar();
      E.ciclo = setInterval(atualizar, ATUALIZA_SEG * 1000);
      E.relogio = setInterval(tique, 1000);
    }).catch(function (e) {
      if (e.status === 401 || /sem sessão/.test(e.message)) sair('Sua sessão terminou. Entre de novo.');
      else if (e.status === 404) sair('O painel ainda não foi instalado no servidor (script 004).');
      else sair('Sem conexão com o servidor. Tente de novo.');
    });
  }
  var UI = {};
  function montar() {
    UI.nPend = el('span', { class: 'n' }, '0'); UI.nProg = el('span', { class: 'n' }, '0');
    UI.abaPend = el('button', { class: 'aba', type: 'button', role: 'tab', id: 'aba-pendentes', onclick: function () { E.aba = 'pendentes'; desenhar(); } }, 'Pendentes', UI.nPend);
    UI.abaProg = el('button', { class: 'aba', type: 'button', role: 'tab', id: 'aba-programadas', onclick: function () { E.aba = 'programadas'; desenhar(); } }, 'Programadas', UI.nProg);
    UI.info = el('span', { id: 'atualizado' }); UI.legenda = el('span'); UI.aviso = el('div'); UI.lista = el('div', { id: 'lista' });
    raiz.replaceChildren(
      el('header', { class: 'topo' }, el('h1', null, 'Painel da central'), el('div', { class: 'abas', role: 'tablist' }, UI.abaPend, UI.abaProg),
        el('div', { class: 'quem' }, el('span', null, E.quem.nome || E.quem.email), el('button', { class: 'btn', type: 'button', onclick: function () { sair(''); } }, 'Sair'))),
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
      el('div', null, listaItens(a), el('div', { class: 'sub' }, 'Ação: ' + a.acao),
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

  function abrirAtendimento(v) {
    var aval = el('textarea', { id: 'at-avaliacao', rows: '2', required: true }), acao = el('textarea', { id: 'at-acao', rows: '2', required: true });
    var data = el('input', { type: 'date', id: 'at-data', 'aria-label': 'Data programada' });
    var erro = el('span', { class: 'erro', role: 'alert' }), salvar = el('button', { class: 'btn pri', type: 'submit' }, 'Registrar atendimento');
    var d, form = el('form', { class: 'dlg', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      var sit = form.querySelector('input[name=situacao]:checked'), lib = form.querySelector('input[name=liberado]:checked');
      if (!aval.value.trim() || !acao.value.trim()) { erro.textContent = 'Preencha a avaliação e a ação realizada.'; return; }
      if (!sit) { erro.textContent = 'Informe se a manutenção foi executada ou programada.'; return; }
      if (sit.value === 'programada' && !data.value) { erro.textContent = 'Informe a data da manutenção programada.'; return; }
      if (!lib) { erro.textContent = 'Informe se o veículo foi liberado.'; return; }
      erro.textContent = ''; salvar.disabled = true;
      api('rpc/registrar_atendimento', { p_vistoria: v.vistoria_id, p_avaliacao: aval.value, p_acao: acao.value, p_situacao: sit.value,
        p_data_programada: sit.value === 'programada' ? data.value : null, p_veiculo_liberado: lib.value === 'sim' })
        .then(function () { d.close(); E.pend = E.pend.filter(function (x) { return x.vistoria_id !== v.vistoria_id; }); desenhar(); return atualizar(); })
        .catch(function (e) { salvar.disabled = false; erro.textContent = e.status ? e.message : 'Sem conexão. O atendimento não foi gravado; tente de novo.'; if (/já foi atendida|acabou de ser atendida/.test(e.message)) atualizar(); });
    } },
      el('h2', null, 'Atendimento · frota ' + (v.frota || '—')),
      el('div', { class: 'resumo' }, par('Veículo', v.veiculo || '—'), par('Motorista', v.motorista || '—'), par('Centro de coletas', v.centro_coletas || '—'),
        par('Vistoria', hora(v.hora_fim) + (v.quilometragem ? ' · ' + Number(v.quilometragem).toLocaleString('pt-BR') + ' km' : '')),
        par('Informado pelo motorista', listaItens(v)), v.relato_livre ? par('Relato livre', v.relato_livre) : null),
      el('label', { class: 'campo' }, 'Avaliação da central', aval),
      el('label', { class: 'campo' }, 'Ação realizada', acao),
      el('fieldset', null, el('legend', null, 'Manutenção'), radio('situacao', 'executada', 'Executada de imediato'), radio('situacao', 'programada', 'Programada para', data)),
      el('fieldset', null, el('legend', null, 'Veículo liberado para operar?'), radio('liberado', 'sim', 'Sim'), radio('liberado', 'nao', 'Não')),
      el('div', { class: 'rodape' }, erro, el('button', { class: 'btn', type: 'button', onclick: function () { d.close(); } }, 'Cancelar'), salvar));
    data.addEventListener('input', function () { form.querySelector('input[name=situacao][value=programada]').checked = true; });
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

  if (Sessao.ler()) iniciar(); else telaEntrada('');
})();
