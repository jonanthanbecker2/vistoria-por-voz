/*
 * MOTOR DO CHECKLIST DIÁRIO — dados executados pelo app.
 * Fonte: motor-checklist-diario-v1.md (lista do Jonathan, normalizada).
 *
 * Para mudar uma pergunta, uma opção, a gravidade ou a ação de um item,
 * edite somente este arquivo. O app lê tudo daqui.
 *
 * nivel:  OK | LEVE | GRAVE | RELATO
 * acao:   ver ACOES no fim do arquivo
 * chaves: palavras que o reconhecimento de voz usa para identificar a opção
 */
(function () {
  'use strict';

  // Palavras genéricas para perguntas de sim/não
  var POS = ['tudo certo', 'tudo ok', 'tudo bem', 'em ordem', 'esta ok', 'ta ok', 'funcionando',
    'funciona', 'completo', 'completa', 'dentro', 'tem', 'bom', 'boa', 'boas', 'bons', 'normal'];
  var NEG = ['nao tem', 'nao funciona', 'nao esta', 'faltando', 'falta', 'vencido', 'vencida',
    'vencidos', 'quebrado', 'quebrada', 'ruim', 'estragado', 'estragada', 'rasgado', 'rasgada',
    'incompleto', 'incompleta', 'sem'];

  // Sim = conforme; Não = não conformidade (padrão)
  function sn(acaoProblema, nivelProblema) {
    return [
      { texto: 'Sim', nivel: 'OK', acao: 'SEGUIR', chaves: POS },
      { texto: 'Não', nivel: nivelProblema || 'GRAVE', acao: acaoProblema, chaves: NEG }
    ];
  }
  // Invertido: Sim = não conformidade (luz no painel, vazamento de ar)
  function snInv(acaoProblema) {
    return [
      { texto: 'Sim', nivel: 'GRAVE', acao: acaoProblema,
        chaves: ['tem', 'acesa', 'aceso', 'acendeu', 'vazando', 'vazamento', 'perdendo', 'perda', 'baixando'] },
      { texto: 'Não', nivel: 'OK', acao: 'SEGUIR',
        chaves: ['nenhuma', 'nenhum', 'apagada', 'apagado', 'sem luz', 'nao tem', 'sem vazamento', 'tudo certo', 'normal'] }
    ];
  }
  var nivelOpcoes = function (oTxt, lTxt, gTxt, acaoLeve, acaoGrave, chOk, chLeve, chGrave) {
    return [
      { texto: oTxt, nivel: 'OK', acao: 'SEGUIR', chaves: chOk },
      { texto: lTxt, nivel: 'LEVE', acao: acaoLeve, chaves: chLeve },
      { texto: gTxt, nivel: 'GRAVE', acao: acaoGrave, chaves: chGrave }
    ];
  };

  var CH_NIVEL_OK = ['no nivel', 'nivel certo', 'normal', 'cheio', 'completo', 'ok', 'bom', 'certo'];
  var CH_NIVEL_LEVE = ['baixou um pouco', 'um pouco', 'pouco', 'baixou', 'abaixo', 'baixinho'];
  var CH_LUZ_OK = ['funcionando', 'funciona', 'tudo certo', 'ok', 'normal', 'bom'];
  var CH_LUZ_LEVE = ['queimado', 'queimada', 'lampada', 'algum item', 'alguma', 'um item'];
  var CH_LUZ_GRAVE = ['nao funciona', 'nenhum', 'nenhuma', 'todo o sistema', 'sistema todo', 'tudo apagado', 'nada funciona', 'sistema'];
  var CH_VIS_OK = ['bom', 'boa', 'boas', 'bons', 'otimo', 'normal', 'sem risco', 'perfeito', 'ok'];
  var CH_VIS_LEVE = ['risco', 'riscado', 'riscos', 'nao atrapalha', 'pequeno'];
  var CH_VIS_GRAVE = ['trinca', 'trincado', 'quebrado', 'atrapalha', 'rachado', 'nao da pra ver', 'prejudica'];

  var itens = [
    { id: 'oleo_motor', rotulo: 'Nível de óleo do motor', pergunta: 'Como está o nível de óleo do motor?',
      opcoes: nivelOpcoes('Está no nível', 'Baixou um pouco', 'Muito baixo ou seco', 'COMPLETAR_NIVEL', 'ENCERRAR_MOTOR',
        CH_NIVEL_OK, CH_NIVEL_LEVE, ['muito baixo', 'seco', 'seca', 'vazio', 'sem oleo', 'secou', 'nada', 'muito']) },
    { id: 'vazamento_oleo', rotulo: 'Vazamento de óleo do motor', pergunta: 'Existe sinal de vazamento de óleo do motor abaixo do veículo?',
      opcoes: [
        { texto: 'Não apresenta vazamento', nivel: 'OK', acao: 'SEGUIR',
          chaves: ['nao apresenta', 'sem vazamento', 'nenhum', 'nao tem', 'nao', 'seco', 'limpo', 'tudo certo', 'normal'] },
        { texto: 'Tem pequeno vazamento', nivel: 'LEVE', acao: 'CONTATO_CENTRAL',
          chaves: ['pequeno', 'pouco', 'pouquinho', 'gotejando', 'gota', 'gotas', 'leve', 'umido', 'mancha'] },
        { texto: 'Possui grande vazamento', nivel: 'GRAVE', acao: 'CONTATO_CENTRAL',
          chaves: ['grande', 'muito', 'bastante', 'escorrendo', 'pingando muito', 'poca'] }
      ] },
    { id: 'agua_radiador', rotulo: 'Nível de água do radiador', pergunta: 'Como está o nível de água do radiador?',
      opcoes: nivelOpcoes('Está no nível', 'Baixou um pouco', 'Muito baixo ou seco', 'COMPLETAR_NIVEL', 'ENCERRAR_MOTOR',
        CH_NIVEL_OK, CH_NIVEL_LEVE, ['muito baixo', 'seco', 'seca', 'vazio', 'sem agua', 'secou', 'nada', 'muito']) },
    { id: 'piscas', rotulo: 'Piscas-alerta', pergunta: 'Os piscas-alerta estão funcionando corretamente?',
      opcoes: nivelOpcoes('Estão funcionando', 'Algum item queimado', 'Todo o sistema não funciona', 'REPARO_CENTRAL', 'REPARO_CENTRAL',
        CH_LUZ_OK, CH_LUZ_LEVE, CH_LUZ_GRAVE) },
    { id: 'farol', rotulo: 'Farol', pergunta: 'O farol está funcionando corretamente?',
      opcoes: nivelOpcoes('Está funcionando', 'Algum item queimado', 'Todo o sistema não funciona', 'REPARO_CENTRAL', 'REPARO_CENTRAL',
        CH_LUZ_OK, CH_LUZ_LEVE, CH_LUZ_GRAVE) },
    { id: 'parabrisa', rotulo: 'Para-brisa', pergunta: 'Quais as condições do para-brisa?',
      opcoes: nivelOpcoes('Boas condições', 'Riscos que não atrapalham a visão', 'Riscos ou trincas que atrapalham a visão', 'SO_REGISTRA', 'CONTATO_CENTRAL',
        CH_VIS_OK, CH_VIS_LEVE, CH_VIS_GRAVE) },
    { id: 'retrovisores', rotulo: 'Retrovisores', pergunta: 'Quais as condições dos retrovisores?',
      opcoes: nivelOpcoes('Boas condições', 'Riscos que não atrapalham a visão', 'Riscos ou trincas que atrapalham a visão', 'SO_REGISTRA', 'CONTATO_CENTRAL',
        CH_VIS_OK, CH_VIS_LEVE, CH_VIS_GRAVE) },
    { id: 'pneus', rotulo: 'Pneus', pergunta: 'Quais as condições dos pneus?',
      opcoes: nivelOpcoes('Sulco ideal e calibrados', 'Sulco baixo ou precisam de calibragem', 'Danificados ou sem condições de uso', 'REPARO_RECOMENDADO', 'ENCERRAR_RISCO',
        ['bom', 'bons', 'ideal', 'calibrado', 'normal', 'ok', 'tudo certo'],
        ['sulco baixo', 'calibrar', 'calibragem', 'calibracao', 'baixo', 'rodizio', 'murcho', 'pouco'],
        ['danificado', 'rasgado', 'estourado', 'furado', 'sem condicoes', 'careca', 'bolha', 'cortado']) },
    { id: 'parafusos_roda', rotulo: 'Parafusos de roda', pergunta: 'Como estão os parafusos de roda?',
      opcoes: [
        { texto: 'Todos presentes e bem fixados', nivel: 'OK', acao: 'SEGUIR',
          chaves: ['boa fixacao', 'bem fixado', 'firme', 'firmes', 'fixados', 'apertado', 'apertados', 'ok', 'normal', 'todos', 'tudo certo', 'bom'] },
        { texto: 'Algum solto ou faltando', nivel: 'GRAVE', acao: 'ENCERRAR_RISCO',
          chaves: ['solto', 'soltos', 'faltando', 'falta', 'frouxo', 'sem parafuso'] }
      ] },
    { id: 'calcos', rotulo: 'Calços de roda', pergunta: 'O veículo possui calços de roda em boas condições?', opcoes: sn('APOIO_COLETAS') },
    { id: 'cones', rotulo: 'Cones', pergunta: 'O veículo possui a quantidade de cones necessária, em boas condições?', opcoes: sn('APOIO_COLETAS') },
    { id: 'carrinho_tambor', rotulo: 'Carrinho auxiliar', pergunta: 'O veículo possui o carrinho auxiliar para movimentação de tambor?', opcoes: sn('APOIO_COLETAS') },
    { id: 'extintores', rotulo: 'Extintores', pergunta: 'Os extintores estão conservados e dentro da validade?', opcoes: sn('APOIO_COLETAS') },
    { id: 'conservacao_visual', rotulo: 'Conservação visual', pergunta: 'Como está a conservação externa e a padronização visual do veículo?',
      opcoes: [
        { texto: 'Boas condições', nivel: 'OK', acao: 'SEGUIR', chaves: ['boa', 'boas', 'bom', 'conservado', 'bem', 'otimo'] },
        { texto: 'Desgaste, mas padrão aceitável', nivel: 'LEVE', acao: 'SO_REGISTRA', chaves: ['desgaste', 'gasto', 'aceitavel', 'razoavel', 'mais ou menos'] },
        { texto: 'Não está em boas condições', nivel: 'LEVE', acao: 'REPARO_RECOMENDADO', chaves: ['ruim', 'nao esta', 'mal', 'feio', 'precisa', 'sujo', 'amassado', 'danificado'] }
      ] },
    { id: 'cinto', rotulo: 'Cinto de segurança', pergunta: 'O cinto de segurança está em boas condições de uso?', opcoes: sn('NAO_UTILIZAR') },
    { id: 'buzina', rotulo: 'Buzina', pergunta: 'A buzina está funcionando?', opcoes: sn('CONTATO_CENTRAL') },
    { id: 'tacografo', rotulo: 'Tacógrafo', pergunta: 'O tacógrafo está funcionando e com lacre?', opcoes: sn('CONTATO_CENTRAL') },
    { id: 'pasta_documentos', rotulo: 'Pasta de documentos', pergunta: 'A pasta de documentos está dentro do veículo?', opcoes: sn('APOIO_COLETAS') },
    // Condicional: só pergunta se a pasta de documentos estiver no veículo
    { id: 'documentos_pasta', rotulo: 'Documentos da pasta', pergunta: 'Dentro da pasta de documentos, constam todos os documentos abaixo?',
      condicao: { item: 'pasta_documentos', resposta: 'Sim' },
      lista: ['CRLV', 'CIV', 'CIPP', 'Certificado do tacógrafo', 'CTF', 'ATIPP', 'Licenças ambientais estadual e municipal, se a rota exigir'],
      opcoes: sn('APOIO_COLETAS') },
    { id: 'kit_emergencia', rotulo: 'Kit de emergência', pergunta: 'O kit de emergência está completo, lacrado e em boas condições?', opcoes: sn('APOIO_COLETAS') },
    { id: 'palhetas', rotulo: 'Palhetas do para-brisa', pergunta: 'As palhetas do para-brisa estão funcionando e em bom estado?', opcoes: sn('REPARO_RECOMENDADO', 'LEVE') },
    { id: 'luz_painel', rotulo: 'Luz de falha no painel', pergunta: 'Existe alguma luz de falha acesa no painel?', opcoes: snInv('CONTATO_CENTRAL') },
    // Pergunta de número: teclado numérico, só aceita valor maior que zero
    { id: 'quilometragem', rotulo: 'Quilometragem', pergunta: 'Qual a quilometragem atual do veículo?',
      tipo: 'numero', unidade: 'km', maxDigitos: 6, opcoes: [] },  // máximo 999.999 km, só inteiros
    { id: 'bomba_oluc', rotulo: 'Bomba de OLUC', pergunta: 'A bomba de OLUC está acionando?', opcoes: sn('CONTATO_CENTRAL') },
    { id: 'vazamento_ar', rotulo: 'Vazamento de ar', pergunta: 'O veículo apresenta vazamento de ar, baixa do balão ou perda de pressão?', opcoes: snInv('CONTATO_CENTRAL') },
    { id: 'relato_livre', rotulo: 'Relato livre', pergunta: 'Gostaria de relatar alguma condição de manutenção, conservação ou dirigibilidade não descrita?',
      opcoes: [
        { texto: 'Sim', nivel: 'RELATO', acao: 'REGISTRAR_RELATO', chaves: ['quero', 'tenho', 'gostaria'] },
        { texto: 'Não', nivel: 'OK', acao: 'SEGUIR', chaves: ['nada', 'nenhuma', 'tudo certo'] }
      ] }
  ];
  itens.forEach(function (it, i) { it.ordem = i + 1; });

  window.CHECKLIST = { versao: 'diario-v4', itens: itens };

  // Ações: o que o app faz com cada resposta.
  // prioridade ordena o resumo final (menor = mais urgente).
  window.ACOES = {
    // Ações imediatas: encerram a vistoria na hora. fala = chave em falas.js
    ENCERRAR_MOTOR: { prioridade: 0, imediata: true, motivo: 'motor', fala: 'encerrar_motor',
      cartao: 'Não ligue o veículo', selo: 'Encerrada · não ligar', detalhe: 'Imediato (não ligar)' },
    ENCERRAR_RISCO: { prioridade: 0, imediata: true, motivo: 'risco_operacao', fala: 'encerrar_risco',
      cartao: 'Não utilize o equipamento', selo: 'Encerrada · risco de operação', detalhe: 'Imediato (risco de operação)' },
    NAO_UTILIZAR: { prioridade: 1, texto: 'Não utilize o veículo e entre em contato com a central.' },
    CONTATO_CENTRAL: { prioridade: 2, texto: 'Recomendamos entrar em contato com a central antes de iniciar o deslocamento.' },
    REPARO_CENTRAL: { prioridade: 3, texto: 'Solicite o reparo à central.' },
    APOIO_COLETAS: { prioridade: 4, texto: 'Solicite o reparo, a troca ou os itens faltantes no centro de coletas.' },
    COMPLETAR_NIVEL: { prioridade: 5, texto: 'Complete o nível e acompanhe se voltará a baixar.' },
    REPARO_RECOMENDADO: { prioridade: 6, texto: 'Recomendamos providenciar o reparo, sem impedir o uso agora.' },
    SO_REGISTRA: { prioridade: 9, silencioso: true },
    REGISTRAR_RELATO: { prioridade: 9, silencioso: true },
    SEGUIR: { prioridade: 99, silencioso: true }
  };
})();
