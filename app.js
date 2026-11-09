/*
 * Vistoria por Voz — aplicativo (PWA)
 * Fluxo: identificação → frota → checklist guiado pelo motorista → resumo.
 * Dados: salvos no aparelho (fase piloto). A camada Envio é o ponto de troca
 * para a central (planilha, banco ou infraestrutura da empresa).
 */
(function () {
  'use strict';

  var VERSAO_APP = '0.8.1';
  var C = window.CHECKLIST, ACOES = window.ACOES;
  // Modo de teste (abrir o app com ?teste=1): libera "apagar vistorias" para treinamento e testes
  try { if (/[?&]teste=1/.test(location.search)) localStorage.setItem('vv_modo_teste', '1'); if (/[?&]teste=0/.test(location.search)) localStorage.removeItem('vv_modo_teste'); } catch (e) {}
  var MODO_TESTE = (function () { try { return localStorage.getItem('vv_modo_teste') === '1'; } catch (e) { return false; } })();
  var CFG = {
    centralConectada: false,
    // Localização no início, no início do checklist e na conclusão (a validar pela empresa / LGPD).
    localizacao: true,
    // Servidor central (Supabase, São Paulo). A chave publicável é feita para ficar no app:
    // a segurança está nas regras do banco (o app só envia vistorias e lê o cadastro).
    servidor: { url: 'https://udzegivmhhiopudnuxes.supabase.co', chave: 'sb_publishable_A6V_SpGYp1MmRIoLYCSNxg_WGdmaSHQ' }
  };
  var app = document.getElementById('app');

  /* ---------------- utilidades ---------------- */
  var Store = {
    get: function (k, def) { try { var v = localStorage.getItem('vv_' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem('vv_' + k, JSON.stringify(v)); return true; } catch (e) { toast('Não foi possível salvar no aparelho.'); return false; } },
    del: function (k) { try { localStorage.removeItem('vv_' + k); } catch (e) {} }
  };
  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) adicionar(e, arguments[i]);
    return e;
  }
  function adicionar(e, k) {
    if (k == null || k === false) return;
    if (Array.isArray(k)) { k.forEach(function (x) { adicionar(e, x); }); return; }
    e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
  function limpar() { app.replaceChildren(); window.scrollTo(0, 0); }
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    if (!t) { t = el('div', { id: 'toast', role: 'status' }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, ms || 2800);
  }
  function chaveSaudacao() { var h = new Date().getHours(); return h < 12 ? 'saud_manha' : h < 18 ? 'saud_tarde' : 'saud_noite'; }
  function saudacao() { var h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
  function primeiroNome(n) { return (n || '').trim().split(/\s+/)[0] || ''; }
  function p2(n) { return String(n).padStart(2, '0'); }
  // Hora local com fuso, ex.: 2026-10-05T16:56:12-03:00 (legível e auditável)
  function isoLocal(d) {
    d = d || new Date();
    var off = -d.getTimezoneOffset(), s = off >= 0 ? '+' : '-', a = Math.abs(off);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' +
      p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + s + p2(Math.floor(a / 60)) + ':' + p2(a % 60);
  }
  // Relógio monotônico: durações não mudam se alguém alterar o relógio do celular
  function mono() { return performance.now(); }
  function seg(a, b) { return Math.round((b - a) / 100) / 10; }
  function fmt(isoStr) {
    if (!isoStr) return '—';
    var d = new Date(isoStr);
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function fmtDur(s) { if (s == null) return '—'; s = Math.round(s); var m = Math.floor(s / 60); return m ? m + ' min ' + p2(s % 60) + ' s' : s + ' s'; }
  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function listaFalada(arr) {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' ou ' + arr[arr.length - 1];
  }
  function chaveFrota(f) { var d = String(f).replace(/\D/g, ''); return d ? String(parseInt(d, 10)) : ''; }
  function dispositivo() {
    var ua = navigator.userAgent, m = ua.match(/Android [\d.]+; ([^;)]+)/);
    if (m) return 'Android · ' + m[1].trim();
    if (/iPhone|iPad/.test(ua)) return 'iOS';
    return 'Navegador';
  }

  /* ---------------- voz: fala do app ---------------- */
  var Fala = {
    voz: null, vozLocal: null,
    init: function () {
      if (!('speechSynthesis' in window)) return;
      var self = this;
      var escolher = function () {
        var vs = speechSynthesis.getVoices() || [];
        var pt = vs.filter(function (v) { return /pt[-_]BR/i.test(v.lang); });
        self.voz = pt.filter(function (v) { return /google/i.test(v.name); })[0] || pt[0] ||
          vs.filter(function (v) { return /^pt/i.test(v.lang); })[0] || null;
        self.vozLocal = pt.filter(function (v) { return v.localService; })[0] || null;
      };
      escolher();
      if ('onvoiceschanged' in speechSynthesis) speechSynthesis.onvoiceschanged = escolher;
    },
    falar: function (texto, fila) {
      if (!('speechSynthesis' in window) || !texto) return;
      var self = this;
      try {
        if (!fila) speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(texto);
        u.lang = 'pt-BR'; if (self.voz) u.voice = self.voz; u.rate = 1.02; u.pitch = 1;
        // Se a voz de rede falhar (sem internet), tenta a voz local do aparelho
        u.onerror = function (ev) {
          if (ev && ev.error !== 'interrupted' && ev.error !== 'canceled' && self.vozLocal && u.voice !== self.vozLocal) {
            var u2 = new SpeechSynthesisUtterance(texto); u2.lang = 'pt-BR'; u2.voice = self.vozLocal; speechSynthesis.speak(u2);
          }
        };
        speechSynthesis.speak(u);
      } catch (e) {}
    },
    parar: function () { try { speechSynthesis.cancel(); } catch (e) {} Player.parar(); },
    // Fala uma sequência de chaves do roteiro (falas.js): usa o áudio gravado
    // se existir para todas as chaves; senão, lê o mesmo texto com a voz do celular.
    dizer: function (chaves, fila) {
      chaves = (chaves || []).filter(Boolean);
      var F = window.FALAS || {};
      var texto = chaves.map(function (k) { return F[k] || ''; }).join(' ').trim();
      if (!fila) { Player.parar(); try { speechSynthesis.cancel(); } catch (e) {} }
      if (Clips.temTodas(chaves)) Player.enfileirar(chaves, texto);
      else if (texto) this.falar(texto, true);
    }
  };

  /* ---------------- áudios gravados (voz neural gerada uma vez) ---------------- */
  var Clips = {
    indice: null, voz: null,
    carregar: function () {
      var self = this;
      try {
        fetch('audio/indice.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { if (j && j.chaves) { self.indice = {}; j.chaves.forEach(function (k) { self.indice[k] = 1; }); self.voz = j.voz || null; } })
          .catch(function () {});
      } catch (e) {}
    },
    temTodas: function (chaves) { var ix = this.indice; return !!ix && chaves.length > 0 && chaves.every(function (k) { return ix[k]; }); }
  };
  // Um único elemento de áudio, reaproveitado para todas as falas.
  // Navegadores como o Samsung Internet e o Safari só deixam tocar som que nasce de um toque;
  // um elemento "destravado" num toque pode depois tocar uma fala atrás da outra.
  var SILENCIO = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
  var Player = {
    fila: [], el: null, tocando: false, travado: false, destravado: false,
    audio: function () { if (!this.el) { this.el = new Audio(); this.el.preload = 'auto'; } return this.el; },
    // chamado em todo toque na tela
    destravar: function () {
      var self = this, a = this.audio();
      if (this.travado && this.fila.length) { this.travado = false; this.proximo(); return; }
      if (this.destravado || this.tocando) return;
      try {
        a.onended = a.onerror = null; a.src = SILENCIO;
        var p = a.play(); this.destravado = true;
        if (p && p.catch) p.catch(function () { self.destravado = false; });
      } catch (e) {}
    },
    parar: function () {
      this.fila = []; this.tocando = false; this.travado = false;
      if (this.el) { this.el.onended = this.el.onerror = null; try { this.el.pause(); } catch (e) {} }
    },
    enfileirar: function (chaves, texto) {
      this.fila.push({ chaves: chaves.slice(), texto: texto });
      if (!this.tocando && !this.travado) this.proximo();
    },
    proximo: function () {
      var self = this, item = this.fila[0];
      if (!item) { this.tocando = false; return; }
      if (!item.chaves.length) { this.fila.shift(); this.proximo(); return; }
      var k = item.chaves[0], a = this.audio(), meu = {};
      this.atual = meu; this.tocando = true;
      a.onended = function () { if (self.atual !== meu) return; item.chaves.shift(); self.proximo(); };
      // Arquivo com problema: lê com a voz do celular o que falta e segue
      a.onerror = function () {
        if (self.atual !== meu) return;
        var resto = [item.chaves.map(function (c) { return (window.FALAS || {})[c] || ''; }).join(' ')]
          .concat(self.fila.slice(1).map(function (x) { return x.texto; })).join(' ');
        self.parar(); Fala.falar(resto, true);
      };
      a.src = 'audio/' + k + '.mp3';
      var p = a.play();
      // Navegador bloqueou (sem toque recente): guarda a fila e retoma no próximo toque
      if (p && p.catch) p.catch(function (e) {
        if (self.atual !== meu) return;
        if (e && e.name === 'NotAllowedError') { self.tocando = false; self.travado = true; self.destravado = false; }
        else if (a.onerror) a.onerror();
      });
    }
  };
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () { Player.destravar(); }, { capture: true, passive: true });
  });

  /* ---------------- voz: reconhecimento (o motorista fala) ---------------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var Ouvir = {
    disponivel: !!SR, ativo: null,
    iniciar: function (o) {
      if (!SR || !this.disponivel) { if (o.onFim) o.onFim('', [], 'indisponivel'); return; }
      this.parar(); Fala.parar();
      var self = this, r = new SR(), final = '', alts = [], erro = null;
      r.lang = 'pt-BR'; r.continuous = !!o.continuo; r.interimResults = !!o.onParcial; r.maxAlternatives = 3;
      r.onresult = function (e) {
        var interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var res = e.results[i];
          if (res.isFinal) { final += ' ' + res[0].transcript; for (var j = 0; j < res.length; j++) alts.push(res[j].transcript); }
          else interim += res[0].transcript;
        }
        if (o.onParcial) o.onParcial((final + ' ' + interim).trim());
      };
      r.onerror = function (e) {
        erro = e.error;
        if (erro === 'not-allowed' || erro === 'service-not-allowed') { self.disponivel = false; atualizarChipVoz(); }
      };
      r.onend = function () {
        self.ativo = null; document.body.classList.remove('ouvindo'); atualizarChipVoz();
        if (o.onFim) o.onFim(final.trim(), alts, final.trim() ? null : erro);
      };
      this.ativo = r; document.body.classList.add('ouvindo'); atualizarChipVoz();
      try { r.start(); } catch (e) { this.ativo = null; document.body.classList.remove('ouvindo'); if (o.onFim) o.onFim('', [], 'start'); }
    },
    parar: function () { if (this.ativo) { try { this.ativo.stop(); } catch (e) {} } }
  };
  var UI = {};
  function atualizarChipVoz() {
    if (!UI.chip) return;
    var ouvindo = document.body.classList.contains('ouvindo');
    UI.chip.className = 'chip-voz ' + (Ouvir.disponivel ? 'on' : 'off');
    UI.chip.textContent = ouvindo ? 'ouvindo…' : Ouvir.disponivel ? 'voz' : 'só toque';
  }
  function msgErroVoz(e) {
    return ({
      'not-allowed': 'Microfone bloqueado. Libere o microfone nas permissões do navegador ou responda pelos botões.',
      'service-not-allowed': 'Reconhecimento de voz indisponível neste aparelho. Responda pelos botões.',
      'network': 'Sem internet para reconhecer a voz agora. Responda pelos botões.',
      'no-speech': 'Não ouvi nada. Toque no microfone e fale de novo.',
      'audio-capture': 'Microfone não encontrado. Responda pelos botões.',
      'indisponivel': 'Voz indisponível. Responda pelos botões.',
      'aborted': ''
    })[e];
  }

  /* ---------------- interpretação das respostas faladas ---------------- */
  function simNao(t) {
    var n = ' ' + norm(t) + ' ';
    var ms = n.search(/ (sim|isso|positivo|afirmativo|correto|certo|confirmo|confirma|pode|ok|okay|exato|uhum) /);
    var mn = n.search(/ (nao|negativo|errado|incorreto) /);
    if (ms < 0 && mn < 0) return null;
    if (ms < 0) return 'nao';
    if (mn < 0) return 'sim';
    return mn < ms ? 'nao' : 'sim';
  }
  function ehSimNao(it) { return it.opcoes.length === 2 && it.opcoes.every(function (o) { return /^(sim|nao)$/.test(norm(o.texto)); }); }
  function casarUm(it, t) {
    var n = norm(t); if (!n) return null;
    if (ehSimNao(it)) {
      var r = simNao(t);
      if (r) return it.opcoes.filter(function (o) { return norm(o.texto) === r; })[0] || null;
    }
    var alvo = ' ' + n + ' ', melhor = null, pts = 0, empate = false;
    it.opcoes.forEach(function (o) {
      var s = 0;
      (o.chaves || []).concat([o.texto]).forEach(function (c) { c = norm(c); if (c && alvo.indexOf(' ' + c) >= 0) s += c.length; });
      if (s > pts) { pts = s; melhor = o; empate = false; } else if (s === pts && s > 0) empate = true;
    });
    return pts > 0 && !empate ? melhor : null;
  }
  function casarOpcao(it, texto, alts) {
    var cands = [texto].concat(alts || []);
    for (var i = 0; i < cands.length; i++) { var o = casarUm(it, cands[i]); if (o) return o; }
    return null;
  }
  var NUMW = { zero: '0', um: '1', uma: '1', dois: '2', duas: '2', tres: '3', quatro: '4', cinco: '5', seis: '6', meia: '6', sete: '7', oito: '8', nove: '9' };
  function paraDigitos(s) {
    var n = norm(s).split(' ').map(function (w) { return NUMW[w] != null ? NUMW[w] : w; }).join(' ');
    return (n.match(/\d/g) || []).join('');
  }

  var NUM_PT = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, meia: 6, sete: 7, oito: 8, nove: 9,
    dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
    vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
    cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
    quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
    oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900 };
  // Lê um número dito ou ditado. Devolve inteiro, ou null se não houver número.
  // Fala com casas decimais ("125,5", "125 vírgula 5", "e meio")
  function temDecimal(s) {
    var t = String(s || '');
    return /\d,\d/.test(t) || /\d\.\d{1,2}(?!\d)/.test(t) || /\b(virgula|meio)\b/.test(norm(t));
  }
  function paraNumero(s) {
    var t = norm(String(s).replace(/(\d)[.\s](?=\d{3}\b)/g, '$1')).replace(/km|quilometros?|quilometragem/g, ' ');
    var palavras = t.split(/\s+/).filter(Boolean), total = 0, grupo = 0, achou = false;
    // ditado dígito a dígito ("um dois cinco quatro três zero"): emenda os dígitos
    var soDig = palavras.filter(function (w) { return w !== 'e'; });
    if (soDig.length > 1 && soDig.every(function (w) { return /^\d$/.test(w) || (NUM_PT[w] != null && NUM_PT[w] < 10); }))
      return parseInt(soDig.map(function (w) { return /^\d$/.test(w) ? w : String(NUM_PT[w]); }).join(''), 10);
    for (var i = 0; i < palavras.length; i++) {
      var w = palavras[i];
      if (/^\d+$/.test(w)) { grupo += parseInt(w, 10); achou = true; }
      else if (NUM_PT[w] != null) { grupo += NUM_PT[w]; achou = true; }
      else if (w === 'mil') { total += (grupo || 1) * 1000; grupo = 0; achou = true; }
      else if (w === 'milhao' || w === 'milhoes') { total += (grupo || 1) * 1000000; grupo = 0; achou = true; }
    }
    return achou ? total + grupo : null;
  }
  function fmtMilhar(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  /* ---------------- tela ligada durante a vistoria ---------------- */
  var wake = null;
  function manterTelaLigada(on) {
    try {
      if (on && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {});
      else if (!on && wake) { wake.release().catch(function () {}); wake = null; }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && V && !V.reg.hora_fim) manterTelaLigada(true);
  });

  /* ---------------- histórico de vistorias (IndexedDB, com cópia em memória) ---------------- */
  // As vistorias concluídas ficam no IndexedDB, que comporta muito mais que o localStorage.
  // A lista é carregada na abertura do app; cada mudança é gravada em seguida.
  var Hist = {
    db: null, lista: [],
    abrir: function () {
      return new Promise(function (ok) {
        try {
          if (!('indexedDB' in window)) { ok(null); return; }
          var r = indexedDB.open('vistoria-por-voz', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('vistorias', { keyPath: 'id' }); };
          r.onsuccess = function () { ok(r.result); };
          r.onerror = r.onblocked = function () { ok(null); };
        } catch (e) { ok(null); }
      });
    },
    // mais recente primeiro (ordem em que foram lacradas)
    ordenar: function () {
      var t = function (v) { return Date.parse(v.hora_fim || v.hora_inicio) || 0; };
      this.lista.sort(function (a, b) { return t(b) - t(a); });
    },
    carregar: function () {
      var self = this, antigo = Store.get('historico', null);   // versões anteriores guardavam no localStorage
      return this.abrir().then(function (db) {
        self.db = db;
        if (!db) { self.lista = antigo || []; self.ordenar(); return; }
        return new Promise(function (ok) {
          try {
            var req = db.transaction('vistorias', 'readonly').objectStore('vistorias').getAll();
            req.onsuccess = function () { self.lista = req.result || []; ok(); };
            req.onerror = function () { self.lista = []; ok(); };
          } catch (e) { self.lista = []; ok(); }
        }).then(function () {
          if (!antigo || !antigo.length) return;
          var ja = {}; self.lista.forEach(function (v) { ja[v.id] = 1; });
          var novos = antigo.filter(function (v) { return !ja[v.id]; });
          self.lista = self.lista.concat(novos);
          return self.gravar(novos).then(function (ok) { if (ok) Store.del('historico'); });   // migração
        }).then(function () { self.ordenar(); });
      });
    },
    gravar: function (regs) {
      var self = this;
      if (!this.db) return Promise.resolve(Store.set('historico', this.lista));
      return new Promise(function (ok) {
        try {
          var tx = self.db.transaction('vistorias', 'readwrite'), st = tx.objectStore('vistorias');
          regs.forEach(function (v) { st.put(v); });
          tx.oncomplete = function () { ok(true); };
          tx.onerror = tx.onabort = function () { ok(false); };
        } catch (e) { ok(false); }
      });
    },
    todos: function () { return this.lista; },
    porId: function (id) { return this.lista.filter(function (v) { return v.id === id; })[0] || null; },
    adicionar: function (reg) { this.lista.unshift(reg); return this.gravar([reg]); },
    atualizar: function (reg) { return this.gravar([reg]); },
    remover: function (ids) {
      var self = this, mapa = {}; ids.forEach(function (i) { mapa[i] = 1; });
      this.lista = this.lista.filter(function (v) { return !mapa[v.id]; });
      if (!this.db) return Promise.resolve(Store.set('historico', this.lista));
      return new Promise(function (ok) {
        try {
          var tx = self.db.transaction('vistorias', 'readwrite'), st = tx.objectStore('vistorias');
          ids.forEach(function (i) { st.delete(i); });
          tx.oncomplete = function () { ok(true); }; tx.onerror = tx.onabort = function () { ok(false); };
        } catch (e) { ok(false); }
      });
    },
    // Vistorias que o servidor já confirmou saem do celular depois de 30 dias (a cópia definitiva está no servidor)
    limpar: function () {
      var lim = Date.now() - 30 * 864e5;
      var velhas = this.lista.filter(function (v) {
        return v.envio && v.envio.status === 'enviada' && !Fila.complementosPendentes(v).length && (Date.parse(v.hora_fim || v.hora_inicio) || 0) < lim;
      }).map(function (v) { return v.id; });
      return velhas.length ? this.remover(velhas) : Promise.resolve(true);
    },
    apagarTudo: function () { return this.remover(this.lista.map(function (v) { return v.id; })); }
  };

  /* ---------------- servidor central (Supabase) ---------------- */
  var Servidor = {
    ativo: function () { return !!(CFG.servidor && CFG.servidor.url && CFG.servidor.chave) && typeof fetch === 'function'; },
    req: function (caminho, op) {
      op = op || {};
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var relogio = ctrl ? setTimeout(function () { ctrl.abort(); }, op.tempo || 20000) : null;
      return fetch(CFG.servidor.url + caminho, {
        method: op.metodo || 'GET', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined,
        headers: { apikey: CFG.servidor.chave, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: op.corpo ? JSON.stringify(op.corpo) : undefined
      }).then(function (r) {
        if (relogio) clearTimeout(relogio);
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
          if (!r.ok) {
            var err = new Error((j && (j.message || j.msg || j.error_description || j.error)) || ('erro ' + r.status));
            err.status = r.status; err.codigo = j && j.code; throw err;
          }
          return j;
        });
      }, function () { if (relogio) clearTimeout(relogio); var err = new Error('sem conexão com o servidor'); err.rede = true; throw err; });
    },
    // listas longas vêm em páginas de 1.000 linhas
    paginado: function (caminho, metodo) {
      var tam = 1000, tudo = [];
      var pagina = function (desde) {
        var sep = caminho.indexOf('?') < 0 ? '?' : '&';
        return Servidor.req(caminho + sep + 'limit=' + tam + '&offset=' + desde, { metodo: metodo || 'GET', corpo: metodo === 'POST' ? {} : null })
          .then(function (linhas) { linhas = linhas || []; tudo = tudo.concat(linhas); return linhas.length === tam ? pagina(desde + tam) : tudo; });
      };
      return pagina(0);
    }
  };

  /* ---------------- fila de envio ---------------- */
  // Toda vistoria concluída fica na fila até o servidor confirmar. O reenvio não duplica:
  // o servidor reconhece o número da vistoria e responde "já recebida".
  var Fila = {
    rodando: false, ultimoErro: null, ultimaTentativa: null,
    precisaEnviar: function (v) { return !!v.integridade && !(v.envio && (v.envio.status === 'enviada' || v.envio.status === 'conflito')); },
    complementosPendentes: function (v) {
      if (!v.envio || v.envio.status !== 'enviada') return [];
      var ja = v.envio.complementos || [];
      return (v.complementos || []).filter(function (c) { return ja.indexOf(c.hash) < 0; });
    },
    pendentes: function () { var self = this; return Hist.todos().filter(function (v) { return self.precisaEnviar(v) || self.complementosPendentes(v).length; }); },
    // o que vai para o servidor é a vistoria lacrada (o estado do envio é só deste aparelho)
    corpo: function (v) { var c = {}; Object.keys(v).forEach(function (k) { if (k !== 'envio') c[k] = v[k]; }); return c; },
    processar: function () {
      var self = this;
      if (this.rodando || !Servidor.ativo()) return Promise.resolve(false);
      var fila = this.pendentes().slice().reverse();   // a mais antiga primeiro
      if (!fila.length) { atualizarStatusEnvio(); return Promise.resolve(true); }
      this.rodando = true; this.ultimaTentativa = isoLocal();
      var i = 0;
      var proxima = function () {
        if (i >= fila.length) return Promise.resolve();
        var v = fila[i++];
        return (self.precisaEnviar(v) ? self.enviarVistoria(v) : self.enviarComplementos(v))
          .then(proxima, function (e) { if (e && e.rede) throw e; return proxima(); });   // sem sinal: para e tenta depois
      };
      return proxima().then(function () { self.ultimoErro = null; return true; }, function (e) { self.ultimoErro = e.message; return false; })
        .then(function (r) { self.rodando = false; atualizarStatusEnvio(); return r; });
    },
    enviarVistoria: function (v) {
      var anterior = v.envio || {};
      return Servidor.req('/rest/v1/rpc/receber_vistoria', { metodo: 'POST', corpo: { p: this.corpo(v) } }).then(function (resp) {
        v.envio = { status: 'enviada', em: isoLocal(), resposta: resp && resp.status, tentativas: (anterior.tentativas || 0) + 1,
          complementos: (v.complementos || []).map(function (c) { return c.hash; }) };
        return Hist.atualizar(v);
      }, function (e) {
        v.envio = { status: /outro lacre/.test(e.message) ? 'conflito' : 'pendente', tentativas: (anterior.tentativas || 0) + 1,
          erro: e.message, ultima_tentativa: isoLocal() };
        return Hist.atualizar(v).then(function () { throw e; });
      });
    },
    enviarComplementos: function (v) {
      var pend = this.complementosPendentes(v), j = 0;
      var um = function () {
        if (j >= pend.length) return Promise.resolve();
        var c = pend[j++];
        return Servidor.req('/rest/v1/rpc/receber_complemento', { metodo: 'POST', corpo: { p_vistoria: v.id, c: { hash: c.hash, em: c.em, autor: c.autor, texto: c.texto } } })
          .then(function () { v.envio.complementos = (v.envio.complementos || []).concat([c.hash]); return Hist.atualizar(v); }).then(um);
      };
      return um();
    }
  };
  function textoEnvio() {
    if (!Servidor.ativo()) return 'salvos neste aparelho';
    var n = Fila.pendentes().length;
    if (!n) return Hist.todos().length ? 'tudo enviado' : 'nenhuma vistoria ainda';
    return n + (n === 1 ? ' vistoria aguardando envio' : ' vistorias aguardando envio');
  }
  function atualizarStatusEnvio() {
    var e = document.getElementById('status-envio'); if (e) e.textContent = textoEnvio();
    if (V && V.reg && V.reg.hora_fim && V.reg.envio && V.reg.envio.status === 'enviada') setPrompt('Vistoria salva e enviada.');
  }
  function rotuloEnvio(v) {
    if (!Servidor.ativo()) return '';
    var s = v.envio && v.envio.status;
    return s === 'enviada' ? 'enviada' : s === 'conflito' ? 'recusada no envio' : 'aguardando envio';
  }
  function descricaoEnvio(v) {
    if (!Servidor.ativo()) return 'Só neste aparelho';
    var e = v.envio || {};
    if (e.status === 'enviada') return 'Enviada em ' + fmt(e.em);
    if (e.status === 'conflito') return 'Recusada pelo servidor: ' + e.erro;
    return 'Aguardando envio' + (e.tentativas ? ' (' + e.tentativas + ' tentativa(s); ' + e.erro + ')' : '');
  }

  /* ---------------- sincronização do cadastro (servidor -> celular) ---------------- */
  var Sinc = {
    rodando: false, ultima: 0, atual: null,
    cadastro: function () {
      var self = this;
      if (!Servidor.ativo()) return Promise.resolve(null);
      if (this.rodando) return this.atual;   // já está sincronizando: espera a mesma
      this.rodando = true;
      return this.atual = Promise.all([
        Servidor.paginado('/rest/v1/veiculos?select=frota,marca,modelo,tipo,ano,centro_coletas&order=frota'),
        Servidor.paginado('/rest/v1/documentos_veiculo?select=frota,documento,vencimento,uf,municipio&order=id'),
        Servidor.paginado('/rest/v1/rpc/ultimos_por_frota?order=frota', 'POST').catch(function () { return null; })   // script 002
      ]).then(function (r) {
        var vs = r[0] || [], ds = r[1] || [], us = r[2];
        self.ultima = Date.now();
        if (us) { var m = {}; us.forEach(function (u) { var k = chaveFrota(u.frota); if (k) m[k] = u; }); Store.set('ultimos', { em: isoLocal(), frotas: m }); }
        if (!vs.length) { Store.set('cadastro_sync', { em: isoLocal(), veiculos: 0, origem: 'servidor_vazio' }); return { veiculos: 0 }; }   // mantém o cadastro do aparelho
        var cad = {};
        vs.forEach(function (v) { var k = chaveFrota(v.frota); if (k) cad[k] = { marca: v.marca || '', modelo: v.modelo || '', tipo: v.tipo || '', ano: v.ano || '', centro: v.centro_coletas || '' }; });
        // documentos: em cada (documento, estado, município) vale o vencimento mais recente (renovação = linha nova);
        // entre estados ou municípios diferentes, vale o que vence primeiro
        var grupos = {};
        ds.forEach(function (d) {
          var k = chaveFrota(d.frota); if (!cad[k] || !d.vencimento) return;
          var g = k + '|' + d.documento + '|' + (d.uf || '') + '|' + (d.municipio || '');
          if (!grupos[g] || d.vencimento > grupos[g].vencimento) grupos[g] = { frota: k, documento: d.documento, vencimento: d.vencimento };
        });
        Object.keys(grupos).forEach(function (g) {
          var d = grupos[g], venc = cad[d.frota].venc = cad[d.frota].venc || {};
          if (!venc[d.documento] || d.vencimento < venc[d.documento]) venc[d.documento] = d.vencimento;
        });
        Store.set('cadastro', cad); Store.set('cadastro_sync', { em: isoLocal(), veiculos: vs.length, origem: 'servidor' });
        return { veiculos: vs.length };
      }).catch(function () { return null; }).then(function (r) { self.rodando = false; return r; });
    },
    talvez: function () { return Date.now() - this.ultima > 10 * 60000 ? this.cadastro() : Promise.resolve(null); }
  };

  // Diagnóstico para a tela de Configurações: confere o que o script 001/002 criou no servidor
  function testarConexao(saida) {
    var linhas = [], add = function (ok, txt) { linhas.push((ok ? '✓ ' : '✗ ') + txt); saida.textContent = linhas.join('\n'); };
    saida.textContent = 'Testando…';
    var tudo = [];
    return Servidor.req('/rest/v1/veiculos?select=frota&limit=1').then(function () {
      add(true, 'Conexão com o servidor e tabelas do cadastro');
    }, function (e) { add(false, e.rede ? 'Sem conexão com o servidor' : 'Tabelas não encontradas — rode o script 001 no Supabase (' + e.message + ')'); throw e; })
      .then(function () {
        return Servidor.req('/rest/v1/rpc/receber_vistoria', { metodo: 'POST', corpo: { p: { id: 'TESTE-CONEXAO' } } })
          .then(function () { add(false, 'Recebimento de vistorias respondeu sem conferir o lacre'); },
            function (e) { add(/lacre/.test(e.message), /lacre/.test(e.message) ? 'Recebimento de vistorias' : 'Recebimento de vistorias não encontrado — rode o script 001 (' + e.message + ')'); });
      }).then(function () {
        return Servidor.req('/rest/v1/vistorias?select=id&limit=1')
          .then(function () { add(false, 'ATENÇÃO: o app consegue ler as vistorias — revise as regras de acesso'); },
            function (e) { add(e.status === 401 || e.status === 403 || /permission/.test(e.message), 'Vistorias protegidas (o app não consegue ler)'); });
      }).then(function () {
        return Servidor.req('/rest/v1/rpc/ultimos_por_frota?limit=1', { metodo: 'POST', corpo: {} })
          .then(function () { add(true, 'Último KM por frota (script 002)'); },
            function (e) { add(false, 'Último KM por frota não encontrado — rode o script 002 (' + e.message + ')'); });
      }).catch(function () {});
  }

  /* ---------------- componentes ---------------- */
  function btn(txt, cls, fn, attrs) {
    var a = { class: 'btn ' + (cls || ''), type: 'button', onclick: fn };
    if (attrs) Object.keys(attrs).forEach(function (k) { a[k] = attrs[k]; });
    return el('button', a, txt);
  }
  function linha() { return el('div', { class: 'linha' }, Array.prototype.slice.call(arguments)); }
  function topoSimples(titulo, voltar, direita) {
    return el('header', { class: 'topo' },
      voltar ? el('button', { class: 'btn-topo', type: 'button', onclick: voltar, 'aria-label': 'Voltar' }, '← Voltar') : null,
      el('div', { class: 'h-txt' }, el('span', { class: 'h-t' }, titulo)),
      direita || null);
  }
  function botaoMic(rotulo, aoOuvir, op) {
    op = op || {};
    if (!Ouvir.disponivel) return null;
    return btn('🎤  ' + rotulo, 'mic', function () {
      if (Ouvir.ativo) { Ouvir.parar(); return; }
      if (op.antes) op.antes();
      setPrompt(op.continuo ? 'Ouvindo… fale à vontade. Toque de novo para parar.' : 'Ouvindo… fale agora');
      Ouvir.iniciar({
        continuo: !!op.continuo, onParcial: op.onParcial,
        onFim: function (txt, alts, erro) {
          if (!txt) { var m = msgErroVoz(erro || 'no-speech'); if (m) setPrompt(m); if (!Ouvir.disponivel) redesenharAcoes(); return; }
          aoOuvir(txt, alts);
        }
      });
    });
  }

  /* ---------------- lacre digital (imutabilidade) ---------------- */
  // SHA-256 (síncrono) sobre o JSON canônico (chaves em ordem). Qualquer alteração no registro muda o lacre.
  function sha256(txt) {
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
      0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
      0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
      0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var b = unescape(encodeURIComponent(txt)), n = b.length, i, j;
    var w = new Array(((n + 9 + 63) >> 6) << 4).fill(0);
    for (i = 0; i < n; i++) w[i >> 2] |= b.charCodeAt(i) << (24 - (i % 4) * 8);
    w[n >> 2] |= 0x80 << (24 - (n % 4) * 8);
    w[w.length - 1] = n * 8;
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], W = new Array(64);
    var r = function (x, k) { return (x >>> k) | (x << (32 - k)); };
    for (i = 0; i < w.length; i += 16) {
      for (j = 0; j < 64; j++) W[j] = j < 16 ? w[i + j] : (((r(W[j-2],17) ^ r(W[j-2],19) ^ (W[j-2] >>> 10)) + W[j-7] + (r(W[j-15],7) ^ r(W[j-15],18) ^ (W[j-15] >>> 3)) + W[j-16]) | 0);
      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        var t1 = (h + (r(e,6) ^ r(e,11) ^ r(e,25)) + ((e & f) ^ (~e & g)) + K[j] + W[j]) | 0;
        var t2 = ((r(a,2) ^ r(a,13) ^ r(a,22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H = [H[0]+a|0, H[1]+bb|0, H[2]+c|0, H[3]+d|0, H[4]+e|0, H[5]+f|0, H[6]+g|0, H[7]+h|0];
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }
  function canonico(v) {
    if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ':' + canonico(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  // Conteúdo lacrado: tudo, menos o próprio lacre e os complementos (que têm lacre próprio)
  function conteudoLacrado(reg) {
    var c = {}; Object.keys(reg).forEach(function (k) { if (k !== 'integridade' && k !== 'complementos' && k !== 'envio') c[k] = reg[k]; });
    if (reg.integridade) c.integridade = { algoritmo: reg.integridade.algoritmo, hash_anterior: reg.integridade.hash_anterior, selado_em: reg.integridade.selado_em };
    return canonico(c);
  }
  function selar(reg, anterior) {
    reg.integridade = { algoritmo: 'SHA-256', hash_anterior: (anterior && anterior.integridade && anterior.integridade.hash) || null, selado_em: isoLocal() };
    reg.integridade.hash = sha256(conteudoLacrado(reg));
  }
  // 'ok' | 'alterado' | 'sem_lacre'
  function verificarLacre(reg) {
    if (!reg.integridade || !reg.integridade.hash) return 'sem_lacre';
    if (sha256(conteudoLacrado(reg)) !== reg.integridade.hash) return 'alterado';
    var ant = reg.integridade.hash;
    for (var i = 0; i < (reg.complementos || []).length; i++) {
      var c = reg.complementos[i];
      if (sha256(ant + '|' + c.em + '|' + c.autor + '|' + c.texto) !== c.hash) return 'alterado';
      ant = c.hash;
    }
    return 'ok';
  }
  function adicionarComplemento(id, texto) {
    var v = Hist.porId(id);
    if (!v || !v.integridade) return false;
    v.complementos = v.complementos || [];
    var ant = v.complementos.length ? v.complementos[v.complementos.length - 1].hash : v.integridade.hash;
    var c = { texto: texto, em: isoLocal(), autor: Store.get('motorista', '') };
    c.hash = sha256(ant + '|' + c.em + '|' + c.autor + '|' + c.texto);
    v.complementos.push(c);
    Hist.atualizar(v).then(function () { Fila.processar(); });
    return true;
  }

  /* ---------------- localização (só durante a vistoria) ---------------- */
  var Geo = {
    watch: null, ultima: null,
    ativo: function () { return CFG.localizacao && 'geolocation' in navigator; },
    iniciar: function (reg) {
      // na retomada, mantém o que já foi registrado
      reg.localizacao = reg.localizacao || { status: this.ativo() ? 'aguardando' : 'desativada', aviso_aceito_em: Store.get('aviso_localizacao', null), pontos: {} };
      if (!this.ativo()) return;
      var self = this; this.parar(); this.ultima = null;
      try {
        this.watch = navigator.geolocation.watchPosition(function (p) {
          self.ultima = { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), precisao_m: Math.round(p.coords.accuracy), em: isoLocal(), ms: Date.now() };
          if (!V || V.reg !== reg || reg.hora_fim) return;
          if (reg.localizacao.status !== 'ok') reg.localizacao.status = 'ok';
          // momentos que ficaram aguardando a primeira posição
          Object.keys(reg.localizacao.pontos).forEach(function (m) { if (reg.localizacao.pontos[m].aguardando) reg.localizacao.pontos[m] = self.copia(); });
          if (!reg.localizacao.pontos.inicio) reg.localizacao.pontos.inicio = self.copia();
          if (reg.frota) salvarAndamento();
        }, function (e) {
          if (!V || V.reg !== reg || reg.hora_fim) return;
          reg.localizacao.status = e.code === 1 ? 'negada' : (reg.localizacao.status === 'ok' ? 'ok' : 'indisponivel');
          if (e.code === 1) self.parar();
        }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
      } catch (e) { reg.localizacao.status = 'indisponivel'; }
    },
    copia: function () { var u = this.ultima; return u ? { lat: u.lat, lon: u.lon, precisao_m: u.precisao_m, em: u.em, idade_seg: Math.round((Date.now() - u.ms) / 1000) } : null; },
    // registra um momento: usa a última posição; se ainda não houver, fica aguardando a primeira
    marcar: function (reg, momento) {
      if (!reg.localizacao || reg.localizacao.status === 'desativada') return;
      reg.localizacao.pontos[momento] = this.copia() || (reg.localizacao.status === 'negada' ? { erro: 'negada' } : { aguardando: true, em: isoLocal() });
    },
    // fechamento: o que ainda estiver aguardando vira "sem_posicao" (o registro é lacrado em seguida)
    fechar: function (reg) {
      if (!reg.localizacao) return;
      this.marcar(reg, 'fim');
      Object.keys(reg.localizacao.pontos).forEach(function (m) { if (reg.localizacao.pontos[m].aguardando) reg.localizacao.pontos[m] = { erro: 'sem_posicao' }; });
      this.parar();
    },
    parar: function () { if (this.watch != null) { try { navigator.geolocation.clearWatch(this.watch); } catch (e) {} this.watch = null; } }
  };
  function fmtPonto(p) { return !p ? '' : p.erro ? p.erro : p.lat + ',' + p.lon + ' (±' + p.precisao_m + ' m)'; }

  /* ---------------- validações cruzadas (neste aparelho; no servidor, entre todos) ---------------- */
  function hoje() { return isoLocal().slice(0, 10); }
  function dataLocal(ts) { var d = new Date(ts); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  // Última vistoria e último KM da frota vindos do servidor (todos os celulares), baixados com o cadastro
  function ultimoNoServidor(frota) { var u = Store.get('ultimos', null); return (u && u.frotas && u.frotas[chaveFrota(frota)]) || null; }
  function vistoriaHojeDaFrota(frota) {
    var local = Hist.todos().filter(function (v) { return chaveFrota(v.frota) === chaveFrota(frota) && (v.hora_inicio || '').slice(0, 10) === hoje(); })[0];
    if (local) return local;
    var u = ultimoNoServidor(frota);
    return u && u.ultima_vistoria_em && dataLocal(u.ultima_vistoria_em) === hoje() ? { id: u.ultima_vistoria_id, hora_inicio: u.ultima_vistoria_em, origem: 'servidor' } : null;
  }
  function ultimoKmDaFrota(frota) {
    var v = Hist.todos().filter(function (x) { return chaveFrota(x.frota) === chaveFrota(frota) && x.quilometragem; })[0];
    var local = v ? { km: v.quilometragem, data: v.hora_inicio, vistoria: v.id } : null;
    var u = ultimoNoServidor(frota), srv = u && u.ultimo_km ? { km: u.ultimo_km, data: u.km_em, vistoria: u.km_vistoria_id, origem: 'servidor' } : null;
    if (!local) return srv;
    if (!srv) return local;
    return Date.parse(srv.data) > Date.parse(local.data) ? srv : local;   // vale a leitura mais recente
  }
  function alertar(tipo, dados) { V.reg.alertas = V.reg.alertas || []; V.reg.alertas.push(Object.assign({ tipo: tipo, em: isoLocal() }, dados || {})); }
  function descreverAlerta(a) {
    if (a.tipo === 'km_menor') return 'KM menor que a última vistoria (' + fmtMilhar(a.km) + ' < ' + fmtMilhar(a.km_anterior) + ')';
    if (a.tipo === 'frota_repetida_dia') return 'Frota já vistoriada hoje' + (a.origem === 'servidor' ? ', em outro aparelho' : '') + ' (vistoria ' + a.vistoria_anterior + ')';
    return a.tipo;
  }

  /* ================= TELAS ================= */
  function telaSetup() {
    limpar();
    var nome = el('input', { id: 'nome', type: 'text', autocomplete: 'name', placeholder: 'Nome do motorista', value: Store.get('motorista', '') });
    app.appendChild(el('div', { class: 'tela setup' },
      el('div', { class: 'marca' }, el('span', { class: 'tag' }, 'Piloto'), el('h1', null, 'Vistoria por Voz'),
        el('p', { class: 'sub' }, 'Checklist diário do veículo, conduzido por voz.')),
      el('label', { for: 'nome', class: 'rotulo' }, 'Motorista deste aparelho'),
      nome,
      el('p', { class: 'dica' }, 'No app definitivo, este nome virá do cadastro da empresa. Ele aparece na saudação e nos registros.'),
      btn('Salvar e continuar', 'pri grande', function () {
        var v = nome.value.trim();
        if (!v) { toast('Informe o nome do motorista.'); nome.focus(); return; }
        Store.set('motorista', v); telaInicio();
      })));
  }

  function telaInicio() {
    manterTelaLigada(false); V = null;
    var nome = Store.get('motorista', '');
    if (!nome) { telaSetup(); return; }
    limpar();
    TELA = 'inicio';
    var hist = Hist.todos(), andamento = Store.get('andamento', null), cad = Store.get('cadastro', null), sinc = Store.get('cadastro_sync', null);
    if (andamento && andamento.reg && Hist.porId(andamento.reg.id)) { Store.del('andamento'); andamento = null; }   // já concluída
    var nCad = cad ? Object.keys(cad).length : 0;
    var ult = hist[0];
    var corpo = el('div', { class: 'corpo' },
      el('div', { class: 'saud' }, el('h2', null, saudacao() + ', ' + primeiroNome(nome) + '.'),
        el('p', { class: 'sub' }, andamento ? 'Há uma vistoria em andamento.' : 'Pronto para a vistoria de hoje?')));
    if (andamento) {
      var a = andamento.reg;
      corpo.appendChild(el('div', { class: 'painel' }, el('span', { class: 'p-t' }, 'Em andamento'),
        el('div', null, 'Frota ' + (a.frota || '—') + ' · ' + a.respostas.length + ' de ' + C.itens.length + ' itens respondidos'),
        el('div', { class: 'dica' }, 'Iniciada em ' + fmt(a.hora_inicio))));
      corpo.appendChild(btn('Continuar vistoria', 'pri grande', retomar));
      corpo.appendChild(btn('Descartar e começar outra', 'sec', function (ev) {
        var b = ev.currentTarget;
        if (b.dataset.conf) { Store.del('andamento'); telaInicio(); return; }
        b.dataset.conf = '1'; b.textContent = 'Toque de novo para descartar'; b.classList.add('perigo');
      }));
    } else {
      corpo.appendChild(btn('Iniciar vistoria', 'pri grande', iniciarVistoria));
    }
    if (ult) {
      var pend = ult.pendencias.length;
      corpo.appendChild(el('div', { class: 'painel' }, el('span', { class: 'p-t' }, 'Última vistoria'),
        el('div', null, 'Frota ' + (ult.frota || '—') + ' · ' + fmt(ult.hora_inicio)),
        el('div', { class: 'dica' }, infoEncerramento(ult) ? infoEncerramento(ult).selo :
          pend ? pend + ' ponto(s) de atenção' : 'Sem não conformidades')));
    }
    corpo.appendChild(linha(btn('Histórico (' + hist.length + ')', 'sec', telaHistorico), btn('Configurações', 'sec', telaConfig)));
    corpo.appendChild(el('div', { class: 'status' },
      el('span', null, 'Voz: ', el('b', null, Ouvir.disponivel ? 'disponível' : 'indisponível — respostas por toque')),
      el('span', null, 'Cadastro de veículos: ', el('b', null, nCad ? nCad + ' veículos' + (sinc && sinc.origem === 'servidor' ? ' (do servidor)' : '') : 'não carregado')),
      el('span', null, 'Envio: ', el('b', { id: 'status-envio' }, textoEnvio()))));
    app.appendChild(el('div', { class: 'tela' }, topoSimples('Vistoria por Voz'), corpo));
  }

  /* ---------------- conversa ---------------- */
  var V = null, TELA = '';
  function montarConversa() {
    limpar(); TELA = 'conversa';
    UI.chip = el('span', { class: 'chip-voz' });
    UI.sub = el('span', { class: 'h-s' }, 'Identificação');
    UI.prog = el('div', { class: 'prog-barra' });
    UI.log = el('main', { class: 'log', id: 'log' });
    UI.prompt = el('div', { class: 'prompt', 'aria-live': 'polite' });
    UI.acoes = el('div', { class: 'acoes' });
    UI.rodape = el('footer', { class: 'rodape' }, UI.prompt, UI.acoes);
    // A conversa acompanha sempre a última mensagem, inclusive quando o rodapé muda de altura
    // (ex.: teclado da quilometragem). Se o motorista rolar para cima para reler, não puxa de volta.
    UI.colado = true;
    UI.log.addEventListener('scroll', function () { UI.colado = UI.log.scrollHeight - UI.log.clientHeight - UI.log.scrollTop < 40; }, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(function () { if (UI.colado) UI.log.scrollTop = UI.log.scrollHeight; }).observe(UI.log);
    app.appendChild(el('div', { class: 'tela conversa' },
      el('header', { class: 'topo' },
        el('button', { class: 'btn-topo', type: 'button', onclick: sairVistoria }, 'Sair'),
        el('div', { class: 'h-txt' }, el('span', { class: 'h-t' }, 'Vistoria'), UI.sub), UI.chip),
      el('div', { class: 'prog' }, UI.prog), UI.log,
      UI.rodape));
    atualizarChipVoz();
  }
  function rolar() { UI.colado = true; requestAnimationFrame(function () { UI.log.scrollTop = UI.log.scrollHeight; }); }
  function balao(cls, txt) { var b = el('div', { class: 'balao ' + cls }, txt); UI.log.appendChild(b); rolar(); return b; }
  // Com chaves do roteiro, o balão mostra exatamente o texto falado (a tela nunca difere da voz)
  function textoDasChaves(chaves) { var F = window.FALAS || {}; return (chaves || []).map(function (k) { return F[k] || ''; }).join(' ').trim(); }
  function appDiz(txt, chaves, fila) {
    var t = chaves && textoDasChaves(chaves);
    balao('app', t || txt);
    if (chaves && t) Fala.dizer(chaves, fila); else Fala.falar(txt);
  }
  function motDiz(txt) { balao('mot', txt); }
  function sistema(txt) { balao('sis', txt); }
  function cartao(cls, rot, val, extra) {
    var c = el('div', { class: 'cartao ' + (cls || '') }, el('div', { class: 'c-rot' }, rot), val ? el('div', { class: 'c-val' }, val) : null, extra || null);
    UI.log.appendChild(c); rolar(); return c;
  }
  function setPrompt(t) { if (UI.prompt) UI.prompt.textContent = t || ''; }
  var ultimoRender = null;
  function acoes() {
    var nodes = Array.prototype.slice.call(arguments).filter(Boolean);
    UI.acoes.replaceChildren.apply(UI.acoes, nodes);
    // rodapé compacto quando há teclado numérico (frota, quilometragem)
    if (UI.rodape) UI.rodape.classList.toggle('compacto', nodes.some(function (n) { return n.classList && n.classList.contains('teclado'); }));
    if (UI.colado) rolar();
  }
  function redesenharAcoes() { if (ultimoRender) ultimoRender(); }

  function novoRegistro() {
    return {
      id: 'V' + Date.now().toString(36).toUpperCase(), versao_checklist: C.versao, versao_app: VERSAO_APP,
      motorista: Store.get('motorista', ''), dispositivo: dispositivo(),
      hora_inicio: isoLocal(), hora_fim: null, duracao_total_seg: null, tipo_encerramento: null,
      frota: null, veiculo: null, frota_nao_cadastrada: false, respostas: [], relato_livre: '', pendencias: [], alertas: [],
      central_conectada: CFG.centralConectada, t_acao: null, retomada: false
    };
  }
  function salvarAndamento() { if (V && V.reg.frota) Store.set('andamento', { reg: V.reg, salvo: isoLocal() }); }

  function avisoLocalizacao(depois) {
    limpar();
    app.appendChild(el('div', { class: 'tela setup' },
      el('div', { class: 'marca' }, el('span', { class: 'tag' }, 'Aviso'), el('h1', null, 'Localização na vistoria')),
      el('p', null, 'Durante a vistoria, o aplicativo registra a localização do aparelho em três momentos: no início, ao começar o checklist e na conclusão. Isso confirma que a vistoria foi feita junto ao veículo.'),
      el('p', null, 'A localização não é acompanhada fora da vistoria e é usada somente para a auditoria interna da manutenção.'),
      el('p', { class: 'dica' }, 'Se você não permitir a localização, a vistoria funciona normalmente e a recusa fica registrada.'),
      btn('Entendi', 'pri grande', function () { Store.set('aviso_localizacao', isoLocal()); depois(); })));
  }

  function iniciarVistoria() {
    if (CFG.localizacao && !Store.get('aviso_localizacao', null)) { avisoLocalizacao(iniciarVistoria); return; }
    V = { reg: novoRegistro(), idx: 0, t: null, mono0: mono(), tentFrota: 0 };
    Geo.iniciar(V.reg);
    manterTelaLigada(true);
    montarConversa();
    var g = saudacao() + ', ' + primeiroNome(V.reg.motorista) + '. Vamos iniciar a vistoria do veículo.';
    appDiz(g, [chaveSaudacao()]); appDiz('Qual é o número da frota?', ['pede_frota'], true);
    pedirFrota(false);
  }

  function pedirFrota(repetir) {
    V.tentFrota++;
    UI.sub.textContent = 'Identificação do veículo';
    if (repetir) appDiz('Informe o número da frota novamente.', ['frota_repetir']);
    var dig = '';
    var visor = el('div', { class: 'visor vazio', 'aria-live': 'polite' }, '—');
    var atual = function () { visor.textContent = dig || '—'; visor.classList.toggle('vazio', !dig); };
    var tecla = function (d) { return btn(d, '', function () { if (dig.length < 8) { dig += d; atual(); } }); };
    var desenhar = function () {
      var teclado = el('div', { class: 'teclado' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(tecla),
        btn('⌫', '', function () { dig = dig.slice(0, -1); atual(); }, { 'aria-label': 'Apagar' }),
        tecla('0'),
        btn('OK', 'ok', function () { if (!dig) { toast('Digite o número da frota.'); return; } confirmarFrota(dig); }));
      var mic = botaoMic('Falar o número da frota', function (txt) {
        var d = paraDigitos(txt);
        if (d) confirmarFrota(d); else setPrompt('Não identifiquei um número em "' + txt + '". Fale de novo ou digite.');
      });
      setPrompt(Ouvir.disponivel ? 'Fale o número ou digite no teclado' : 'Digite o número da frota');
      acoes(visor, teclado, mic);
    };
    ultimoRender = desenhar; desenhar();
  }

  function confirmarFrota(num) {
    motDiz('Frota ' + num);
    appDiz('Você informou a frota ' + num + '. Confirma?', ['frota_confira']);
    var desenhar = function () {
      setPrompt('Confirma a frota ' + num + '?');
      acoes(linha(btn('Não, corrigir', 'sec', function () { motDiz('Não'); pedirFrota(true); }),
        btn('Sim, confirmo', 'pri', function () { motDiz('Sim'); identificarVeiculo(num); })),
        botaoMic('Responder por voz', function (txt) {
          var r = simNao(txt);
          if (r === 'sim') { motDiz('Sim'); identificarVeiculo(num); }
          else if (r === 'nao') { motDiz('Não'); pedirFrota(true); }
          else setPrompt('Não entendi. Diga sim ou não, ou toque.');
        }));
    };
    ultimoRender = desenhar; desenhar();
  }

  function identificarVeiculo(num) {
    var cad = Store.get('cadastro', null);
    V.reg.frota = num;
    V.reg.alertas = (V.reg.alertas || []).filter(function (x) { return x.tipo !== 'frota_repetida_dia'; });
    var rep = vistoriaHojeDaFrota(num), fila = false;
    if (rep) { alertar('frota_repetida_dia', { vistoria_anterior: rep.id, hora_anterior: rep.hora_inicio, origem: rep.origem || 'aparelho' }); appDiz(textoDasChaves(['frota_repetida']), ['frota_repetida']); fila = true; }
    if (cad && Object.keys(cad).length) {
      var v = cad[chaveFrota(num)];
      if (!v) {
        appDiz('Não localizei a frota ' + num + ' no cadastro de veículos.', ['frota_nao_localizada'], fila);
        ultimoRender = function () {
          setPrompt('O que deseja fazer?');
          acoes(btn('Informar a frota novamente', 'pri', function () { V.reg.frota = null; pedirFrota(true); }),
            btn('Seguir com a frota ' + num + ' mesmo assim', 'sec', function () {
              V.reg.frota_nao_cadastrada = true; sistema('Frota fora do cadastro — fica registrado na vistoria.'); prontoParaChecklist(false);
            }));
        };
        ultimoRender(); return;
      }
      V.reg.veiculo = v;
      var t = el('table', { class: 'dados' });
      [['Frota', num], ['Marca', v.marca], ['Modelo', v.modelo], ['Tipo', v.tipo], ['Ano', v.ano], ['Centro de coletas', v.centro]]
        .forEach(function (p) { if (p[1]) t.appendChild(el('tr', null, el('td', null, p[0]), el('td', null, p[1]))); });
      cartao('', 'Veículo identificado', null, t);
      appDiz('Confira os dados do veículo. Se não for este, toque em Corrigir.', ['veiculo_confira'], fila);
      prontoParaChecklist(true);
    } else {
      cartao('', 'Frota', num, el('p', { class: 'c-nota' }, 'Cadastro de veículos não carregado neste aparelho.'));
      appDiz('Frota ' + num + ' registrada.', ['frota_registrada'], fila);
      prontoParaChecklist(false);
    }
  }

  function prontoParaChecklist(comCorrigir) {
    UI.sub.textContent = 'Frota ' + V.reg.frota + ' · pronto para iniciar';
    salvarAndamento();
    ultimoRender = function () {
      setPrompt('Vá até o veículo. Toque para começar o checklist.');
      acoes(btn('Iniciar checklist', 'pri grande', function () {
        Geo.marcar(V.reg, 'checklist');
        perguntarItem(0, true);
      }), comCorrigir ? btn('Corrigir frota', 'sec', function () { V.reg.veiculo = null; V.reg.frota = null; pedirFrota(true); }) : null);
    };
    ultimoRender();
  }

  /* ---------------- itens do checklist ---------------- */
  // Pergunta condicional: só vale se a resposta do item de referência for a esperada
  function aplicavel(it) {
    if (!it || !it.condicao) return true;
    var r = V.reg.respostas.filter(function (x) { return x.item_id === it.condicao.item; })[0];
    return !!r && r.resposta === it.condicao.resposta;
  }
  function perguntarItem(i, comAbertura) {
    while (C.itens[i] && !aplicavel(C.itens[i])) i++;
    var it = C.itens[i];
    if (!it) { finalizar('normal'); return; }
    V.idx = i;
    UI.sub.textContent = it.rotulo;
    UI.prog.style.width = Math.round(i / C.itens.length * 100) + '%';
    // t_anuncio: momento em que o item foi anunciado. A janela de inspeção vai daqui até a prontidão.
    V.t = { t_anuncio: isoLocal(), m_anuncio: mono(), t_prontidao: null, m_prontidao: null, tentativas_voz: 0 };
    if (comAbertura) balao('app', textoDasChaves(['inicio_checklist']));
    cartao('item', it.rotulo, it.pergunta,
      it.lista ? el('ul', { class: 'c-lista' }, it.lista.map(function (d) { return el('li', null, d); })) : null);
    Fala.dizer(comAbertura ? ['inicio_checklist', 'item_' + it.id] : ['item_' + it.id]);
    if (it.tipo === 'numero') renderNumero(it); else renderOpcoes(it);
  }
  // Pergunta de número (quilometragem): teclado numérico ou voz; só aceita valor maior que zero; sempre confirma.
  function renderNumero(it, inicial) {
    var dig = inicial || '', max = it.maxDigitos || 7, un = it.unidade ? ' ' + it.unidade : '';
    var visor = el('div', { class: 'visor vazio', 'aria-live': 'polite' }, '—');
    var atual = function () { visor.textContent = dig ? fmtMilhar(dig) + un : '—'; visor.classList.toggle('vazio', !dig); };
    var zero = function () { setPrompt(textoDasChaves(['km_zero'])); Fala.dizer(['km_zero']); };
    var tecla = function (d) { return btn(d, '', function () {
      marcarProntidao();
      if (!dig && d === '0') return;            // não começa com zero
      if (dig.length < max) { dig += d; atual(); }
    }); };
    var enviar = function (valor, sinal, txt) {
      var n = parseInt(valor, 10);
      if (!n || n <= 0) { zero(); return; }
      if (String(n).length > max) { dig = ''; atual(); setPrompt('O máximo é ' + fmtMilhar(Math.pow(10, max) - 1) + un + '. Confira e informe de novo.'); return; }
      confirmarNumero(it, n, sinal, txt);
    };
    var desenhar = function () {
      atual();
      var teclado = el('div', { class: 'teclado' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(tecla),
        btn('⌫', '', function () { dig = dig.slice(0, -1); atual(); }, { 'aria-label': 'Apagar' }),
        tecla('0'),
        btn('OK', 'ok', function () { marcarProntidao(); if (!dig) { setPrompt('Digite a quilometragem.'); return; } enviar(dig, 'toque', ''); }));
      var mic = botaoMic('Falar a quilometragem', function (txt) {
        V.t.tentativas_voz++;
        if (temDecimal(txt)) { setPrompt('Informe somente números inteiros, sem vírgula.'); return; }
        var n = paraNumero(txt);
        if (n == null) { setPrompt('Não identifiquei um número em "' + txt + '". Fale de novo ou digite.'); return; }
        dig = String(n); atual(); enviar(dig, 'voz', txt);
      }, { antes: marcarProntidao });
      setPrompt(Ouvir.disponivel ? 'Digite no teclado ou fale o número.' : 'Digite a quilometragem.');
      var extra = linha(btn('↺ Repetir', 'sec peq', function () { Fala.dizer(['item_' + it.id]); }),
        V.idx > 0 ? btn('← Item anterior', 'sec peq', voltarItem) : null);
      acoes(visor, teclado, mic, extra);
    };
    ultimoRender = desenhar; desenhar();
  }
  function confirmarNumero(it, n, sinal, txt) {
    var un = it.unidade ? ' ' + it.unidade : '';
    motDiz(sinal === 'voz' ? '“' + txt + '”' : fmtMilhar(n) + un);
    // validação cruzada: KM menor que o da última vistoria desta frota
    var ant = it.id === 'quilometragem' ? ultimoKmDaFrota(V.reg.frota) : null, menor = !!(ant && n < ant.km);
    var chave = menor ? 'km_menor' : 'km_confira';
    appDiz(textoDasChaves([chave]), [chave]);
    var o = { texto: String(n), nivel: 'OK', acao: 'SEGUIR' };
    var ok = function () {
      motDiz('Sim'); V.reg.quilometragem = n;
      V.reg.alertas = (V.reg.alertas || []).filter(function (x) { return x.tipo !== 'km_menor'; });
      if (menor) alertar('km_menor', { km: n, km_anterior: ant.km, vistoria_anterior: ant.vistoria, data_anterior: ant.data, origem: ant.origem || 'aparelho' });
      registrar(it, o, sinal, txt);
    };
    var corrigir = function () { motDiz('Não'); renderNumero(it); };
    ultimoRender = function () {
      setPrompt(menor ? 'Última vistoria desta frota: ' + fmtMilhar(ant.km) + un + ' (' + fmt(ant.data) + ').' : 'KM: ' + fmtMilhar(n) + un + '. Está correto?');
      acoes(el('div', { class: 'visor' + (menor ? ' alerta' : '') }, fmtMilhar(n) + un),
        linha(btn('Não, corrigir', 'sec', corrigir), btn('Sim, confirmo', 'pri', ok)),
        botaoMic('Responder por voz', function (t) {
          var r = simNao(t);
          if (r === 'sim') ok(); else if (r === 'nao') corrigir(); else setPrompt('Diga sim ou não, ou toque.');
        }));
    };
    ultimoRender();
  }
  // Prontidão: primeiro toque do motorista no item (opção ou microfone). Fecha a janela de inspeção.
  function marcarProntidao() { if (V.t && V.t.m_prontidao == null) { V.t.m_prontidao = mono(); V.t.t_prontidao = isoLocal(); } }
  function renderOpcoes(it) {
    var desenhar = function () {
      setPrompt(Ouvir.disponivel ? 'Confira o item. Depois toque na resposta ou no microfone.' : 'Confira o item. Depois toque na resposta.');
      var ops = el('div', { class: 'opcoes' + (ehSimNao(it) ? ' sn' : '') },
        it.opcoes.map(function (o) { return el('button', { class: 'op', type: 'button', onclick: function () { marcarProntidao(); escolher(it, o, 'toque', ''); } }, o.texto); }));
      var mic = botaoMic('Responder por voz', function (txt, alts) {
        V.t.tentativas_voz++;
        var o = casarOpcao(it, txt, alts);
        if (o) escolher(it, o, 'voz', txt);
        else { setPrompt(textoDasChaves(['nao_entendi'])); Fala.dizer(['nao_entendi']); }
      }, { antes: marcarProntidao });
      var extra = linha(btn('↺ Repetir', 'sec peq', function () { Fala.dizer(['item_' + it.id]); }),
        V.idx > 0 ? btn('← Item anterior', 'sec peq', voltarItem) : null);
      acoes(ops, mic, extra);
    };
    ultimoRender = desenhar; desenhar();
  }
  function escolher(it, o, sinal, txt) {
    var confirmarToque = !!(Store.get('pref', {}) || {}).confirmarToque;
    if (sinal === 'voz' || confirmarToque) {
      motDiz(sinal === 'voz' ? '“' + txt + '”' : o.texto);
      appDiz('Entendi: ' + o.texto + '. Confirma?', [window.FALAS_API ? FALAS_API.chaveConfirmacao(it, o) : '']);
      ultimoRender = function () {
        setPrompt('Confirma a resposta?');
        acoes(linha(btn('Não, corrigir', 'sec', function () { motDiz('Não'); renderOpcoes(it); Fala.dizer(['item_' + it.id]); }),
          btn('Sim, confirmo', 'pri', function () { motDiz('Sim'); registrar(it, o, sinal, txt); })),
          botaoMic('Responder por voz', function (t) {
            var r = simNao(t);
            if (r === 'sim') { motDiz('Sim'); registrar(it, o, sinal, txt); }
            else if (r === 'nao') { motDiz('Não'); renderOpcoes(it); }
            else setPrompt('Diga sim ou não, ou toque.');
          }));
      };
      ultimoRender();
    } else {
      // Toque não tem erro de transcrição: registra direto (pode ser alterado em Configurações)
      motDiz(o.texto); registrar(it, o, sinal, txt);
    }
  }
  function registrar(it, o, sinal, txt) {
    var m = mono();
    V.reg.respostas.push({
      ordem: it.ordem, item_id: it.id, rotulo: it.rotulo, pergunta: it.pergunta, resposta: o.texto, nivel: o.nivel, acao: o.acao,
      sinal: sinal, transcricao: txt || '', tentativas_voz: V.t.tentativas_voz,
      t_anuncio: V.t.t_anuncio, t_prontidao: V.t.t_prontidao, t_resposta: isoLocal(),
      duracao_inspecao_seg: V.t.m_prontidao != null ? seg(V.t.m_anuncio, V.t.m_prontidao) : null,
      duracao_resposta_seg: V.t.m_prontidao != null ? seg(V.t.m_prontidao, m) : null
    });
    if ((ACOES[o.acao] || {}).imediata) { encerrarImediato(it, o); return; }
    if (o.acao === 'REGISTRAR_RELATO') { salvarAndamento(); pedirRelato(); return; }
    var a = ACOES[o.acao] || {};
    if (!a.silencioso && a.texto) V.reg.pendencias.push({ item_id: it.id, rotulo: it.rotulo, nivel: o.nivel, acao: o.acao });
    salvarAndamento();
    perguntarItem(proximoSemResposta(V.idx + 1));
  }
  // Próxima pergunta ainda não respondida (importa na retomada de vistoria de versão anterior)
  function proximoSemResposta(de) {
    var feitos = {}; V.reg.respostas.forEach(function (r) { feitos[r.item_id] = 1; });
    var i = de; while (i < CHECKLIST.itens.length && feitos[CHECKLIST.itens[i].id]) i++;
    return i;
  }
  function voltarItem() {
    if (!V.reg.respostas.length) return;
    var ult = V.reg.respostas.pop();
    if (ult.item_id === 'quilometragem') delete V.reg.quilometragem;
    V.reg.pendencias = V.reg.pendencias.filter(function (p) { return p.item_id !== ult.item_id; });
    sistema('Voltando ao item anterior.');
    salvarAndamento();
    var iv = idxDoItem(ult.item_id); perguntarItem(iv >= 0 ? iv : Math.max(0, V.idx - 1));
  }

  function encerrarImediato(it, o) {
    var ac = ACOES[o.acao], F = window.FALAS || {};
    V.reg.motivo_encerramento = ac.motivo;
    cartao('grave', 'Ação imediata · ' + it.rotulo, ac.cartao);
    V.reg.pendencias.push({ item_id: it.id, rotulo: it.rotulo, nivel: o.nivel, acao: o.acao });
    appDiz(F[ac.fala] || ac.cartao, [ac.fala]);
    finalizar('imediato');
  }
  function infoEncerramento(v) {
    if (v.tipo_encerramento !== 'imediato') return null;
    var ac = v.motivo_encerramento === 'risco_operacao' ? ACOES.ENCERRAR_RISCO : ACOES.ENCERRAR_MOTOR;
    return ac;
  }
  function idxDoItem(id) { var L = CHECKLIST.itens; for (var i = 0; i < L.length; i++) if (L[i].id === id) return i; return -1; }

  function pedirRelato() {
    UI.sub.textContent = 'Relato livre';
    appDiz('Pode relatar. Fale ou digite o que observou e toque em Concluir.', ['relato_pedir']);
    var area = el('textarea', { id: 'relato', rows: '5', placeholder: 'Descreva o que observou no veículo…' });
    area.value = V.reg.relato_livre || '';
    var base = '';
    ultimoRender = function () {
      setPrompt(Ouvir.disponivel ? 'Toque no microfone para ditar, ou digite' : 'Digite o relato');
      acoes(area,
        botaoMic('Ditar relato', function (txt) { area.value = (base + ' ' + txt).trim(); setPrompt('Relato captado. Revise e toque em Concluir.'); },
          { continuo: true, antes: function () { base = area.value; }, onParcial: function (p) { area.value = (base + ' ' + p).trim(); } }),
        linha(btn('Sem relato', 'sec', function () {
          Ouvir.parar(); V.reg.relato_livre = ''; sistema('Sem relato.'); finalizar('normal');
        }), btn('Concluir relato', 'pri', function () {
          var t = area.value.trim();
          if (!t) { toast('Escreva ou dite o relato, ou toque em "Sem relato".'); return; }
          Ouvir.parar(); V.reg.relato_livre = t; motDiz(t); appDiz('Relato registrado.', ['relato_ok']); finalizar('normal');
        })));
    };
    ultimoRender();
  }

  function finalizar(tipo) {
    var reg = V.reg;
    if (reg.hora_fim) return;
    reg.tipo_encerramento = tipo;
    reg.hora_fim = isoLocal(); reg.t_acao = reg.hora_fim;
    reg.duracao_total_seg = reg.retomada
      ? Math.round((new Date(reg.hora_fim) - new Date(reg.hora_inicio)) / 1000)
      : seg(V.mono0, mono());
    Geo.fechar(reg);
    selar(reg, Hist.todos()[0]);   // a partir daqui a vistoria não muda; só recebe complementos
    Hist.adicionar(reg).then(function (ok) {
      if (ok) Store.del('andamento'); else toast('Atenção: não foi possível salvar a vistoria no aparelho.', 6000);
      Fila.processar();
    });
    manterTelaLigada(false);
    UI.prog.style.width = '100%';
    UI.sub.textContent = tipo === 'imediato' ? 'Vistoria encerrada' : 'Vistoria concluída';
    if (tipo === 'normal') falarResumo(reg);
    ultimoRender = function () {
      setPrompt('Vistoria salva neste aparelho.');
      acoes(btn('Concluir', 'pri grande', telaInicio), btn('Ver detalhes', 'sec', function () { telaDetalhe(reg.id); }));
    };
    ultimoRender();
  }

  function falarResumo(reg) {
    var nome = primeiroNome(reg.motorista), grupos = {};
    reg.pendencias.forEach(function (p) { (grupos[p.acao] = grupos[p.acao] || []).push(p); });
    var ordem = Object.keys(grupos).sort(function (a, b) { return ACOES[a].prioridade - ACOES[b].prioridade; });
    if (!ordem.length) {
      cartao('ok', 'Resultado', 'Nenhuma não conformidade');
      appDiz('Nenhuma não conformidade encontrada. Bom trabalho, ' + nome + '.', ['resultado_ok'], true);
      despedir();
      return;
    }
    appDiz('Atenção aos pontos a seguir.', ['resultado_atencao'], true);
    ordem.forEach(function (ac) {
      var lista = grupos[ac], a = ACOES[ac];
      cartao(a.prioridade <= 2 ? 'grave' : 'leve', textoDasChaves(['acao_' + ac]) || a.texto, null, el('ul', { class: 'c-lista' }, lista.map(function (p) { return el('li', null, p.rotulo); })));
      Fala.dizer(['acao_' + ac, 'itens'].concat(lista.map(function (p) { return 'rot_' + p.item_id; })), true);
    });
    despedir();
  }
  // Fala final de toda vistoria concluída (não usada no encerramento imediato)
  function despedir() { appDiz('Checklist finalizado. Lhe desejamos um excelente dia!', ['despedida'], true); }

  function sairVistoria() {
    Fala.parar(); Ouvir.parar(); Geo.parar();
    if (!V || V.reg.hora_fim) { telaInicio(); return; }
    var voltar = ultimoRender;
    setPrompt(V.reg.frota ? 'A vistoria fica salva para continuar depois.' : 'A vistoria ainda não começou.');
    acoes(btn('Continuar a vistoria', 'pri', function () { if (voltar) { ultimoRender = voltar; voltar(); } }),
      btn(V.reg.frota ? 'Sair e continuar depois' : 'Sair', 'sec', function () { salvarAndamento(); telaInicio(); }));
  }

  function retomar() {
    var a = Store.get('andamento', null);
    if (!a || (a.reg && Hist.porId(a.reg.id))) { Store.del('andamento'); telaInicio(); return; }
    V = { reg: a.reg, idx: 0, t: null, mono0: mono(), tentFrota: 0 };
    V.reg.retomada = true; V.reg.alertas = V.reg.alertas || [];
    Geo.iniciar(V.reg);
    manterTelaLigada(true);
    montarConversa();
    appDiz('Retomando a vistoria da frota ' + V.reg.frota + '.', ['retomando']);
    var n = V.reg.respostas.length, ult = V.reg.respostas[n - 1];
    if (ult && ult.acao === 'REGISTRAR_RELATO') { pedirRelato(); return; }
    if (n === 0) { prontoParaChecklist(!!V.reg.veiculo); return; }
    V.reg.versao_checklist = CHECKLIST.versao;
    perguntarItem(proximoSemResposta(0));
  }

  /* ---------------- histórico e detalhe ---------------- */
  function statusVistoria(v) {
    if (infoEncerramento(v)) return ['grave', infoEncerramento(v).selo];
    return v.pendencias.length ? ['leve', v.pendencias.length + ' ponto(s) de atenção'] : ['ok', 'Sem não conformidade'];
  }
  function telaHistorico() {
    limpar();
    TELA = 'historico';
    var hist = Hist.todos();
    var lista = el('div', { class: 'lista' });
    if (!hist.length) lista.appendChild(el('p', { class: 'vazio-msg' }, 'Nenhuma vistoria registrada ainda.'));
    hist.forEach(function (v) {
      var st = statusVistoria(v);
      lista.appendChild(el('button', { class: 'linha-hist', type: 'button', onclick: function () { telaDetalhe(v.id); } },
        el('div', { class: 'lh-a' }, el('strong', null, 'Frota ' + (v.frota || '—')), el('span', null, fmt(v.hora_inicio) + ' · ' + fmtDur(v.duracao_total_seg) + (rotuloEnvio(v) ? ' · ' + rotuloEnvio(v) : ''))),
        el('span', { class: 'selo ' + st[0] }, st[1])));
    });
    app.appendChild(el('div', { class: 'tela' }, topoSimples('Histórico', telaInicio),
      el('div', { class: 'corpo' }, hist.length ? btn('Exportar planilha (CSV)', 'pri', function () { exportarCSV(hist); }) : null, lista)));
  }
  function telaDetalhe(id) {
    var v = Hist.porId(id);
    if (!v) { telaHistorico(); return; }
    TELA = 'detalhe';
    limpar();
    var st = statusVistoria(v), veic = v.veiculo || {};
    var resumo = el('table', { class: 'dados' });
    [['Motorista', v.motorista], ['Frota', (v.frota || '—') + (v.frota_nao_cadastrada ? ' (fora do cadastro)' : '')],
      ['Veículo', [veic.marca, veic.modelo].filter(Boolean).join(' ') || '—'], ['Centro de coletas', veic.centro || '—'],
      ['Início', fmt(v.hora_inicio)], ['Fim', fmt(v.hora_fim)], ['Duração total', fmtDur(v.duracao_total_seg)],
      ['Encerramento', infoEncerramento(v) ? infoEncerramento(v).detalhe : 'Normal'], ['Envio', descricaoEnvio(v)], ['Aparelho', v.dispositivo],
      ['Localização', !v.localizacao ? '—' : v.localizacao.status === 'ok' ? ['inicio', 'checklist', 'fim'].map(function (m) { return m + ': ' + (fmtPonto(v.localizacao.pontos[m]) || '—'); }).join(' · ') : v.localizacao.status],
      ['Alertas', (v.alertas || []).length ? v.alertas.map(descreverAlerta).join('; ') : '—'],
      ['Lacre', { ok: 'Íntegra ✓ ' + v.integridade.hash.slice(0, 12) + '…', alterado: '⚠ REGISTRO ALTERADO APÓS A CONCLUSÃO', sem_lacre: 'Sem lacre (versão anterior do app)' }[verificarLacre(v)] || '—']]
      .forEach(function (p) { resumo.appendChild(el('tr', null, el('td', null, p[0]), el('td', null, p[1]))); });
    var tab = el('table', { class: 'resp' }, el('thead', null, el('tr', null, el('th', null, 'Item'), el('th', null, 'Resposta'),
      el('th', null, 'Inspeção'), el('th', null, 'Via'))));
    var tb = el('tbody');
    v.respostas.forEach(function (r) {
      tb.appendChild(el('tr', null, el('td', null, r.ordem + '. ' + r.rotulo),
        el('td', null, el('span', { class: 'n-' + r.nivel }, r.nivel), ' ', r.resposta),
        el('td', { class: 'num' }, r.duracao_inspecao_seg != null ? String(r.duracao_inspecao_seg).replace('.', ',') + ' s' : '—'),
        el('td', null, r.sinal)));
    });
    tab.appendChild(tb);
    app.appendChild(el('div', { class: 'tela' }, topoSimples('Vistoria', telaHistorico),
      el('div', { class: 'corpo' },
        el('div', { class: 'painel' }, el('span', { class: 'p-t' }, 'Resultado'), el('span', { class: 'selo ' + st[0] }, st[1]), resumo),
        v.relato_livre ? el('div', { class: 'painel' }, el('span', { class: 'p-t' }, 'Relato livre'), el('div', null, v.relato_livre)) : null,
        painelComplementos(v),
        el('div', { class: 'painel' }, el('span', { class: 'p-t' }, 'Respostas e janela de inspeção'), el('div', { class: 'tabela-wrap' }, tab),
          el('p', { class: 'dica' }, 'Janela de inspeção = tempo entre o app anunciar o item e o primeiro toque do motorista. Registrada para análise (sem limite nesta fase).')),
        btn('Exportar esta vistoria (CSV)', 'sec', function () { exportarCSV([v], 'vistoria_' + v.id); }))));
  }

  // A vistoria concluída não é editável: observações posteriores entram como complemento, com data e lacre próprios
  function painelComplementos(v) {
    var lista = (v.complementos || []).map(function (c) { return el('div', { class: 'compl' }, el('div', { class: 'dica' }, fmt(c.em) + ' · ' + c.autor), el('div', null, c.texto)); });
    var area = el('textarea', { id: 'compl', rows: '3', placeholder: 'Observação posterior (não altera a vistoria)…' });
    return el('div', { class: 'painel' }, el('span', { class: 'p-t' }, 'Complementos'),
      lista.length ? lista : el('div', { class: 'dica' }, 'A vistoria concluída não pode ser alterada. Para acrescentar uma informação, use um complemento.'),
      v.integridade ? area : null,
      v.integridade ? btn('Adicionar complemento', 'sec', function () {
        var t = area.value.trim(); if (!t) { toast('Escreva o complemento.'); return; }
        if (adicionarComplemento(v.id, t)) { toast('Complemento registrado.'); telaDetalhe(v.id); }
      }) : null);
  }

  /* ---------------- exportação ---------------- */
  var COLS = ['vistoria_id', 'motorista', 'frota', 'quilometragem', 'frota_fora_cadastro', 'marca', 'modelo', 'tipo', 'centro_coletas', 'hora_inicio', 'hora_fim',
    'duracao_total_seg', 'tipo_encerramento', 'motivo_encerramento', 'retomada', 'dispositivo', 'versao_checklist', 'versao_app', 'item_ordem', 'item_id', 'item',
    'pergunta', 'resposta', 'nivel', 'acao', 'sinal', 'transcricao', 'tentativas_voz', 't_anuncio', 't_prontidao', 't_resposta',
    'duracao_inspecao_seg', 'duracao_resposta_seg', 'relato_livre', 'loc_status', 'loc_inicio', 'loc_checklist', 'loc_fim',
    'alertas', 'lacre', 'lacre_anterior', 'lacre_verificacao', 'complementos', 'envio_status', 'envio_em'];
  function gerarCSV(lista) {
    var esc = function (v) {
      if (v == null) return '';
      var s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
      if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    var linhas = [COLS.join(';')];
    lista.forEach(function (v) {
      var ve = v.veiculo || {};
      var base = { vistoria_id: v.id, motorista: v.motorista, frota: v.frota, quilometragem: v.quilometragem || '', frota_fora_cadastro: v.frota_nao_cadastrada ? 'sim' : '',
        marca: ve.marca, modelo: ve.modelo, tipo: ve.tipo, centro_coletas: ve.centro, hora_inicio: v.hora_inicio, hora_fim: v.hora_fim,
        duracao_total_seg: v.duracao_total_seg, tipo_encerramento: v.tipo_encerramento, motivo_encerramento: v.motivo_encerramento || '', retomada: v.retomada ? 'sim' : '',
        dispositivo: v.dispositivo, versao_checklist: v.versao_checklist, versao_app: v.versao_app, relato_livre: v.relato_livre,
        loc_status: v.localizacao ? v.localizacao.status : '', loc_inicio: v.localizacao ? fmtPonto(v.localizacao.pontos.inicio) : '',
        loc_checklist: v.localizacao ? fmtPonto(v.localizacao.pontos.checklist) : '', loc_fim: v.localizacao ? fmtPonto(v.localizacao.pontos.fim) : '',
        alertas: (v.alertas || []).map(descreverAlerta).join(' | '), lacre: v.integridade ? v.integridade.hash : '',
        lacre_anterior: v.integridade ? v.integridade.hash_anterior || '' : '', lacre_verificacao: verificarLacre(v),
        complementos: (v.complementos || []).map(function (c) { return c.em + ' ' + c.autor + ': ' + c.texto; }).join(' | '),
        envio_status: v.envio ? v.envio.status : (Servidor.ativo() ? 'pendente' : 'local'), envio_em: (v.envio && v.envio.em) || '' };
      (v.respostas.length ? v.respostas : [{}]).forEach(function (r) {
        var row = Object.assign({}, base, { item_ordem: r.ordem, item_id: r.item_id, item: r.rotulo, pergunta: r.pergunta, resposta: r.resposta,
          nivel: r.nivel, acao: r.acao, sinal: r.sinal, transcricao: r.transcricao, tentativas_voz: r.tentativas_voz, t_anuncio: r.t_anuncio,
          t_prontidao: r.t_prontidao, t_resposta: r.t_resposta, duracao_inspecao_seg: r.duracao_inspecao_seg, duracao_resposta_seg: r.duracao_resposta_seg });
        linhas.push(COLS.map(function (c) { return esc(row[c]); }).join(';'));
      });
    });
    return '﻿' + linhas.join('\r\n');
  }
  function exportarCSV(lista, nome) {
    var csv = gerarCSV(lista), arq = (nome || 'vistorias_' + isoLocal().slice(0, 10)) + '.csv';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var arquivo = null;
    try { arquivo = new File([blob], arq, { type: 'text/csv' }); } catch (e) {}
    if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      navigator.share({ files: [arquivo], title: 'Vistorias', text: 'Exportação de vistorias' }).catch(function () {});
      return;
    }
    var a = el('a', { href: URL.createObjectURL(blob), download: arq });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Arquivo ' + arq + ' gerado.');
  }

  /* ---------------- configurações e cadastro ---------------- */
  function dividirCSV(linha, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < linha.length; i++) {
      var ch = linha[i];
      if (q) { if (ch === '"') { if (linha[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }
  function importarCadastro(texto) {
    var linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (linhas.length < 2) return { erro: 'O arquivo precisa ter uma linha de cabeçalho e ao menos um veículo.' };
    var sep = linhas[0].split(';').length >= linhas[0].split(',').length ? ';' : ',';
    var cab = dividirCSV(linhas[0], sep).map(norm);
    var col = function () { var ns = Array.prototype.slice.call(arguments); return cab.findIndex(function (h) { return ns.some(function (n) { return h.indexOf(n) === 0; }); }); };
    var iF = col('frota'), iMa = col('marca'), iMo = col('modelo'), iT = col('tipo'), iA = col('ano'), iC = col('centro', 'unidade', 'filial');
    if (iF < 0) return { erro: 'Não encontrei a coluna "Frota" na primeira linha.' };
    var cad = {}, n = 0, val = function (c, i) { return i >= 0 ? (c[i] || '') : ''; };
    linhas.slice(1).forEach(function (l) {
      var c = dividirCSV(l, sep), f = chaveFrota(c[iF] || '');
      if (!f) return;
      cad[f] = { marca: val(c, iMa), modelo: val(c, iMo), tipo: val(c, iT), ano: val(c, iA), centro: val(c, iC) }; n++;
    });
    if (!n) return { erro: 'Nenhum veículo com número de frota válido foi encontrado.' };
    return { cad: cad, n: n };
  }
  function telaConfig() {
    limpar(); TELA = 'config';
    var pref = Store.get('pref', {}) || {}, cad = Store.get('cadastro', null), nCad = cad ? Object.keys(cad).length : 0;
    var nome = el('input', { id: 'cfg-nome', type: 'text', value: Store.get('motorista', '') });
    var arquivo = el('input', { id: 'cfg-arq', type: 'file', accept: '.csv,.txt,text/csv,text/plain' });
    var colado = el('textarea', { id: 'cfg-colado', rows: '4', placeholder: 'Frota;Marca;Modelo;Tipo;Ano;Centro de Coletas\n9001;Marca;Modelo;Tipo;2021;Centro de coletas' });
    var aplicar = function (texto) {
      var r = importarCadastro(texto);
      if (r.erro) { toast(r.erro, 4000); return; }
      Store.set('cadastro', r.cad); toast(r.n + ' veículos carregados.'); telaConfig();
    };
    arquivo.addEventListener('change', function () {
      var f = arquivo.files && arquivo.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () { aplicar(String(rd.result || '')); }; rd.readAsText(f, 'utf-8');
    });
    var conf = el('input', { id: 'cfg-conf', type: 'checkbox' }); conf.checked = !!pref.confirmarToque;
    conf.addEventListener('change', function () { pref.confirmarToque = conf.checked; Store.set('pref', pref); toast('Preferência salva.'); });
    var apagar = btn('Apagar todas as vistorias deste aparelho', 'perigo', function (ev) {
      var b = ev.currentTarget;
      if (b.dataset.conf) { Hist.apagarTudo().then(function () { Store.del('andamento'); toast('Vistorias apagadas.'); telaConfig(); }); return; }
      b.dataset.conf = '1'; b.textContent = 'Toque de novo para apagar definitivamente';
    });
    app.appendChild(el('div', { class: 'tela' }, topoSimples('Configurações', telaInicio),
      el('div', { class: 'corpo' },
        el('div', { class: 'painel' }, el('label', { class: 'p-t', for: 'cfg-nome' }, 'Motorista deste aparelho'), nome,
          btn('Salvar nome', 'sec', function () { var v = nome.value.trim(); if (!v) { toast('Informe o nome.'); return; } Store.set('motorista', v); toast('Nome salvo.'); })),
        painelServidor(),
        el('div', { class: 'painel' }, el('span', { class: 'p-t' }, 'Cadastro de veículos'),
          el('div', null, nCad ? nCad + ' veículos carregados neste aparelho.' : 'Nenhum cadastro carregado. Sem cadastro, o app aceita qualquer frota.'),
          el('p', { class: 'dica' }, 'Arquivo CSV com cabeçalho: Frota; Marca; Modelo; Tipo; Ano; Centro de Coletas. Os dados ficam só neste aparelho.'),
          el('label', { class: 'rotulo', for: 'cfg-arq' }, 'Carregar arquivo'), arquivo,
          el('label', { class: 'rotulo', for: 'cfg-colado' }, 'Ou cole o conteúdo'), colado,
          btn('Importar texto colado', 'sec', function () { if (!colado.value.trim()) { toast('Cole o conteúdo do cadastro.'); return; } aplicar(colado.value); }),
          nCad ? btn('Remover cadastro', 'sec', function () { Store.del('cadastro'); toast('Cadastro removido.'); telaConfig(); }) : null),
        el('div', { class: 'painel' }, el('span', { class: 'p-t' }, 'Respostas'),
          el('label', { class: 'check', for: 'cfg-conf' }, conf, el('span', null, 'Pedir confirmação também nas respostas por toque. (Respostas por voz sempre pedem confirmação.)'))),
        el('div', { class: 'painel' }, el('span', { class: 'p-t' }, 'Dados'),
          btn('Exportar todas as vistorias (CSV)', 'sec', function () { var h = Hist.todos(); if (!h.length) { toast('Nenhuma vistoria registrada.'); return; } exportarCSV(h); }),
          MODO_TESTE ? apagar : el('p', { class: 'dica' }, 'Vistorias concluídas são lacradas e não podem ser apagadas no uso normal.')),
        el('p', { class: 'dica' }, 'Versão do app ' + VERSAO_APP + ' · checklist ' + C.versao + ' · ' + C.itens.length + ' itens'))));
  }

  function painelServidor() {
    if (!Servidor.ativo()) return null;
    var sinc = Store.get('cadastro_sync', null), saida = el('pre', { class: 'diag', id: 'diag-servidor' });
    return el('div', { class: 'painel' }, el('span', { class: 'p-t' }, 'Servidor central'),
      el('div', null, 'Envio: ', el('b', { id: 'status-envio' }, textoEnvio())),
      Fila.ultimoErro ? el('div', { class: 'dica' }, 'Última tentativa: ' + Fila.ultimoErro) : null,
      el('div', { class: 'dica' }, !sinc ? 'Cadastro ainda não atualizado pelo servidor.' : sinc.origem === 'servidor'
        ? 'Cadastro atualizado pelo servidor em ' + fmt(sinc.em) + ' (' + sinc.veiculos + ' veículos).'
        : 'Servidor sem veículos cadastrados (' + fmt(sinc.em) + '); vale o cadastro deste aparelho.'),
      linha(btn('Enviar agora', 'sec', function () { Fila.processar().then(function () { telaConfig(); }); }),
        btn('Atualizar cadastro', 'sec', function () { Sinc.cadastro().then(function () { telaConfig(); }); })),
      btn('Testar conexão', 'sec', function () { testarConexao(saida); }), saida);
  }

  /* ---------------- início ---------------- */
  Fala.init();
  Clips.carregar();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  // Ganchos para testes automatizados
  window.__vv = { Clips: Clips, Player: Player, gerarCSV: gerarCSV, importarCadastro: importarCadastro, casarOpcao: casarOpcao, paraDigitos: paraDigitos, simNao: simNao, paraNumero: paraNumero, temDecimal: temDecimal, sha256: sha256, verificarLacre: verificarLacre, CFG: CFG,
    Hist: Hist, Fila: Fila, Servidor: Servidor, Sinc: Sinc };
  // Envio e cadastro: ao abrir, quando o sinal volta e a cada 2 minutos enquanto houver pendência
  window.addEventListener('online', function () { Fila.processar(); Sinc.talvez(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { Fila.processar(); Sinc.talvez(); } });
  setInterval(function () { if (Fila.pendentes().length) Fila.processar(); }, 120000);
  Hist.carregar().then(function () {
    telaInicio();
    Fila.processar();
    Sinc.cadastro().then(function (r) { if (r && TELA === 'inicio') telaInicio(); });
    Hist.limpar();
  });
})();
