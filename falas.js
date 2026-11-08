/*
 * ROTEIRO DE VOZ — tudo o que o app fala.
 *
 * REGRA: o que a voz fala é exatamente o que aparece escrito na tela.
 * O motorista lê e ouve ao mesmo tempo; texto diferente da fala distrai.
 *
 * - As falas fixas estão em FIXAS (o mesmo texto aparece no balão da conversa).
 * - A pergunta de cada item é montada do checklist.js: a pergunta da tela +
 *   as opções dos botões, com as mesmas palavras.
 * - Sem contagem de itens (nada de "item um", "vinte e dois itens").
 *
 * Cada fala vira um arquivo audio/<chave>.mp3 (ferramentas/gerar_audios.py).
 * Sem o áudio, o app lê o mesmo texto com a voz do celular.
 */
(function () {
  'use strict';

  var FIXAS = {
    saud_manha: 'Bom dia! Vamos começar a vistoria do veículo.',
    saud_tarde: 'Boa tarde! Vamos começar a vistoria do veículo.',
    saud_noite: 'Boa noite! Vamos começar a vistoria do veículo.',
    pede_frota: 'Qual é o número da frota?',
    frota_repetir: 'Pode me dizer o número da frota de novo?',
    frota_confira: 'Confira o número da frota na tela. Está correto?',
    frota_registrada: 'Frota registrada. Quando estiver junto do veículo, é só tocar em iniciar o checklist.',
    frota_nao_localizada: 'Não encontrei essa frota no cadastro. Você pode informar de novo, ou seguir assim mesmo.',
    veiculo_confira: 'Confira os dados do veículo na tela. Se não for este, toque em corrigir.',
    inicio_checklist: 'Vamos lá. Eu vou te guiando. Confira cada item e me responda.',
    retomando: 'Vamos continuar de onde paramos.',
    conf_sim: 'Entendi: sim. Confirma?',
    conf_nao: 'Entendi: não. Confirma?',
    nao_entendi: 'Não entendi. Pode falar de novo, ou tocar na resposta.',
    encerrar_motor: 'Atenção! Não ligue o veículo: há risco de danificar o motor. Entre em contato com a central agora. A vistoria foi encerrada e salva.',
    encerrar_risco: 'Risco de operação! Não utilize o equipamento e entre em contato com a Central de Atendimento. A vistoria foi encerrada e salva.',
    km_confira: 'Confira o número do KM na tela. Está correto?',
    km_menor: 'O KM informado é menor que o da última vistoria desta frota. Confira o número na tela. Está correto?',
    frota_repetida: 'Esta frota já teve uma vistoria hoje neste aparelho.',
    km_zero: 'A quilometragem precisa ser maior que zero.',
    relato_pedir: 'Pode relatar. Fale ou escreva o que você observou, e toque em concluir.',
    relato_ok: 'Relato registrado.',
    resultado_ok: 'Nenhuma não conformidade encontrada. Bom trabalho!',
    resultado_atencao: 'Atenção para os pontos a seguir.',
    despedida: 'Checklist finalizado. Lhe desejamos um excelente dia!',
    itens: 'Itens:',
    acao_NAO_UTILIZAR: 'Não utilize o veículo, e entre em contato com a central.',
    acao_CONTATO_CENTRAL: 'Recomendamos falar com a central antes de sair com o veículo.',
    acao_REPARO_CENTRAL: 'Solicite o reparo à central.',
    acao_APOIO_COLETAS: 'Solicite o reparo, a troca ou os itens faltantes no centro de coletas.',
    acao_COMPLETAR_NIVEL: 'Complete o nível, e acompanhe se volta a baixar.',
    acao_REPARO_RECOMENDADO: 'Recomendamos providenciar o reparo, mas o uso não está impedido.'
  };

  function minuscula(t) { return t.charAt(0).toLowerCase() + t.slice(1); }
  function ehSimNao(it) { return it.opcoes.length === 2 && it.opcoes.every(function (o) { return /^(sim|não)$/i.test(o.texto); }); }

  // "Está no nível, baixou um pouco, ou muito baixo ou seco?" — as mesmas palavras dos botões
  function opcoesFaladas(it) {
    var t = it.opcoes.map(function (o, i) { return i ? minuscula(o.texto) : o.texto; });
    return t.length < 2 ? t.join('') : t.slice(0, -1).join(', ') + ', ou ' + t[t.length - 1] + '?';
  }

  // Monta o mapa completo chave -> texto a partir do checklist
  function construir(checklist) {
    var f = {};
    Object.keys(FIXAS).forEach(function (k) { f[k] = FIXAS[k]; });
    checklist.itens.forEach(function (it) {
      f['item_' + it.id] = (ehSimNao(it) || !it.opcoes.length) ? it.pergunta : it.pergunta + ' ' + opcoesFaladas(it);
      if (it.lista && it.lista.length) f['item_' + it.id] = it.pergunta + ' ' + it.lista.join(', ') + '.';
      f['rot_' + it.id] = it.rotulo + '.';
      it.opcoes.forEach(function (o, i) {
        if (!/^(sim|não)$/i.test(o.texto)) f['conf_' + it.id + '_' + i] = 'Entendi: ' + minuscula(o.texto) + '. Confirma?';
      });
    });
    return f;
  }

  // Chave da confirmação falada de uma opção
  function chaveConfirmacao(it, o) {
    if (/^sim$/i.test(o.texto)) return 'conf_sim';
    if (/^não$/i.test(o.texto)) return 'conf_nao';
    return 'conf_' + it.id + '_' + it.opcoes.indexOf(o);
  }

  var api = { construir: construir, chaveConfirmacao: chaveConfirmacao, opcoesFaladas: opcoesFaladas };
  if (typeof window !== 'undefined') {
    window.FALAS_API = api;
    if (window.CHECKLIST) window.FALAS = construir(window.CHECKLIST);
  }
  if (typeof module !== 'undefined') module.exports = api;
})();
