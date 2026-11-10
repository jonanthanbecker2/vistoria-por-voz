/* Vistoria por Voz — parte comum das páginas da central (painel e indicadores): login, sessão e chamadas ao servidor. */
(function () {
  'use strict';
  var SERVIDOR = { url: 'https://udzegivmhhiopudnuxes.supabase.co', chave: 'sb_publishable_A6V_SpGYp1MmRIoLYCSNxg_WGdmaSHQ' };
  var raiz = document.getElementById('raiz');
  var C = window.Central = { aoEntrar: function () {}, aoSair: function () {} };

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
    C.aoSair();
    var email = el('input', { id: 'email', type: 'email', autocomplete: 'username', required: true });
    var senha = el('input', { id: 'senha', type: 'password', autocomplete: 'current-password', required: true });
    var erro = el('p', { class: 'erro', role: 'alert' }, msg || '');
    var botao = el('button', { class: 'btn pri', type: 'submit' }, 'Entrar');
    var form = el('form', { onsubmit: function (ev) {
      ev.preventDefault(); erro.textContent = ''; botao.disabled = true;
      Sessao.entrar(email.value.trim(), senha.value).then(function () { C.aoEntrar(); }).catch(function (e) {
        botao.disabled = false;
        erro.textContent = e.status === 400 ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Verifique a conexão e tente de novo.';
      });
    } }, el('h1', null, 'Central · Vistoria por Voz'), el('p', { class: 'dica' }, 'Acesso restrito'),
      el('label', { class: 'campo' }, 'E-mail', email), el('label', { class: 'campo' }, 'Senha', senha), botao, erro);
    raiz.replaceChildren(el('div', { class: 'entrada' }, form));
    email.focus();
  }
  function sair(msg) { Sessao.limpar(); telaEntrada(msg); }

  // Confere o login e a liberação do e-mail; chama pronto(quem) quando pode mostrar a página
  function abrir(pronto) {
    C.aoEntrar = function () { abrir(pronto); };
    if (!Sessao.ler()) { telaEntrada(''); return; }
    raiz.replaceChildren(el('div', { class: 'entrada' }, el('p', { class: 'dica' }, 'Carregando…')));
    api('rpc/painel_quem_sou', {}).then(function (q) {
      q = q || {};
      if (!q.autorizado) { sair('O e-mail ' + (q.email || '') + ' não está liberado para o painel. Fale com o responsável.'); return; }
      pronto(q);
    }).catch(function (e) {
      if (e.status === 401 || /sem sessão/.test(e.message)) sair('Sua sessão terminou. Entre de novo.');
      else if (e.status === 404) sair('O painel ainda não foi instalado no servidor (script 004).');
      else sair('Sem conexão com o servidor. Tente de novo.');
    });
  }
  // Cabeçalho igual nas duas páginas, com a troca entre elas
  function topo(pagina, quem, meio) {
    var link = function (href, txt, id) { return el('a', { class: 'pag', href: href, 'aria-current': pagina === id ? 'page' : null }, txt); };
    return el('header', { class: 'topo' }, el('nav', { class: 'pags', 'aria-label': 'Páginas' }, link('painel.html', 'Painel da central', 'painel'), link('indicadores.html', 'Indicadores', 'indicadores'), link('documentos.html', 'Documentos', 'documentos')),
      meio || null, el('div', { class: 'quem' }, el('span', null, quem.nome || quem.email), el('button', { class: 'btn', type: 'button', onclick: function () { sair(''); } }, 'Sair')));
  }
  C.el = el; C.p2 = p2; C.api = api; C.sair = sair; C.abrir = abrir; C.topo = topo; C.raiz = raiz;
})();
