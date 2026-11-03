/*
 * ROTEIRO DE VOZ — tudo o que o app fala.
 *
 * Cada fala tem uma chave. O gerador (ferramentas/gerar_audios.py) cria um
 * arquivo audio/<chave>.mp3 com voz neural para cada uma. Se o áudio de uma
 * chave não existir, o app fala o mesmo texto com a voz do celular (reserva).
 *
 * Para mudar o que o app diz: edite aqui e gere os áudios de novo.
 * Escreva como se fala, não como se escreve: frases curtas, vírgulas onde
 * se respira. Números por extenso.
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
    inicio_checklist: 'Vamos lá. São vinte e dois itens, e eu vou te guiando. Confira cada um e me responda.',
    retomando: 'Vamos continuar de onde paramos.',
    conf_sim: 'Entendi: sim. Confirma?',
    conf_nao: 'Entendi: não. Confirma?',
    nao_entendi: 'Não entendi. Pode falar de novo, ou tocar na resposta.',
    encerrar_motor: 'Atenção! Não ligue o veículo: há risco de danificar o motor. Entre em contato com a central agora. A vistoria foi encerrada e salva.',
    relato_pedir: 'Pode relatar. Fale ou escreva o que você observou, e toque em concluir.',
    relato_ok: 'Relato registrado.',
    resultado_ok: 'Nenhuma não conformidade encontrada. Bom trabalho!',
    resultado_atencao: 'Atenção para os pontos a seguir.',
    despedida: 'Checklist finalizado. Lhe desejamos um excelente dia!',
    itens: 'Itens:',
    acao_NAO_UTILIZAR: 'Não utilize o veículo, e entre em contato com a central.',
    acao_CONTATO_CENTRAL: 'Recomendamos falar com a central antes de sair com o veículo.',
    acao_REPARO_CENTRAL: 'Solicite o reparo à central.',
    acao_APOIO_COLETAS: 'Solicite o reparo ou a troca no centro de coletas.',
    acao_COMPLETAR_NIVEL: 'Complete o nível, e acompanhe se volta a baixar.',
    acao_REPARO_RECOMENDADO: 'Recomendamos providenciar o reparo, mas o uso não está impedido.'
  };

  // Pergunta falada de cada item: o que conferir + as opções, em tom de conversa.
  var ITENS = {
    oleo_motor: 'Item um: óleo do motor. Olhando a vareta, o nível está no nível, baixou um pouco, ou está muito baixo ou seco?',
    agua_radiador: 'Item dois: água do radiador. O nível está no nível, baixou um pouco, ou está muito baixo ou seco?',
    piscas: 'Item três: piscas-alerta. Estão funcionando, tem algum item queimado, ou o sistema todo não funciona?',
    farol: 'Item quatro: faróis. Estão funcionando, tem algum item queimado, ou o sistema todo não funciona?',
    parabrisa: 'Item cinco: para-brisa. Está em boas condições, tem riscos que não atrapalham a visão, ou tem riscos ou trincas que atrapalham?',
    retrovisores: 'Item seis: retrovisores. Estão em boas condições, têm riscos que não atrapalham a visão, ou têm riscos ou trincas que atrapalham?',
    pneus: 'Item sete: pneus. Estão com sulco ideal e calibrados, precisam de calibragem ou estão com sulco baixo, ou tem pneu danificado, sem condições de uso?',
    parafusos_roda: 'Item oito: parafusos das rodas. Estão todos presentes e bem fixados, ou tem algum solto ou faltando?',
    calcos: 'Item nove: calços de roda. O veículo tem os calços, em boas condições?',
    cones: 'Item dez: cones. A quantidade de cones está completa, e em boas condições?',
    extintores: 'Item onze: extintores. Estão conservados, e dentro da validade?',
    conservacao_visual: 'Item doze: aparência do veículo. A conservação e a padronização visual estão em boas condições, com desgaste mas aceitáveis, ou não estão em boas condições?',
    cinto: 'Item treze: cinto de segurança. Está em boas condições de uso?',
    buzina: 'Item catorze: buzina. Está funcionando?',
    tacografo: 'Item quinze: tacógrafo. Está funcionando, e com o lacre?',
    pasta_documentos: 'Item dezesseis: documentos. A pasta de documentos está dentro do veículo?',
    kit_emergencia: 'Item dezessete: kit de emergência. Está completo, lacrado, e em boas condições?',
    palhetas: 'Item dezoito: palhetas do limpador. Estão funcionando, e em bom estado?',
    luz_painel: 'Item dezenove: painel. Tem alguma luz de falha acesa?',
    bomba_oluc: 'Item vinte: bomba de óluc. Ela está acionando normalmente?',
    vazamento_ar: 'Item vinte e um: sistema de ar. Tem vazamento de ar, o balão está baixando, ou está perdendo pressão?',
    relato_livre: 'Último item. Você quer relatar mais alguma coisa sobre manutenção, conservação ou dirigibilidade do veículo?'
  };

  // Nome falado de cada item, usado no resumo final ("Itens: pneus, buzina.")
  var ROTULOS = {
    oleo_motor: 'óleo do motor', agua_radiador: 'água do radiador', piscas: 'piscas-alerta', farol: 'faróis',
    parabrisa: 'para-brisa', retrovisores: 'retrovisores', pneus: 'pneus', parafusos_roda: 'parafusos das rodas',
    calcos: 'calços de roda', cones: 'cones', extintores: 'extintores', conservacao_visual: 'aparência do veículo',
    cinto: 'cinto de segurança', buzina: 'buzina', tacografo: 'tacógrafo', pasta_documentos: 'pasta de documentos',
    kit_emergencia: 'kit de emergência', palhetas: 'palhetas do limpador', luz_painel: 'luz de falha no painel',
    bomba_oluc: 'bomba de óluc', vazamento_ar: 'vazamento de ar', relato_livre: 'relato livre'
  };

  function minuscula(t) { return t.charAt(0).toLowerCase() + t.slice(1); }

  // Monta o mapa completo chave -> texto a partir do checklist
  function construir(checklist) {
    var f = {};
    Object.keys(FIXAS).forEach(function (k) { f[k] = FIXAS[k]; });
    checklist.itens.forEach(function (it) {
      f['item_' + it.id] = ITENS[it.id] || ('Item ' + it.ordem + '. ' + it.pergunta);
      f['rot_' + it.id] = (ROTULOS[it.id] || it.rotulo) + '.';
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

  var api = { construir: construir, chaveConfirmacao: chaveConfirmacao };
  if (typeof window !== 'undefined') {
    window.FALAS_API = api;
    if (window.CHECKLIST) window.FALAS = construir(window.CHECKLIST);
  }
  if (typeof module !== 'undefined') module.exports = api;
})();
