# Vistoria por Voz — app piloto

Aplicativo web instalável (PWA) para a vistoria diária de veículos, conduzida por voz.
Abre no Chrome do celular, instala na tela inicial e funciona sem internet depois da primeira abertura.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Página do app |
| `app.js` | Motor de execução: identificação, checklist, voz, telemetria, histórico, exportação |
| `falas.js` | **Roteiro de voz** — tudo o que o app fala, em tom de conversa |
| `audio/` | Áudios gravados com voz neural + `indice.json` (gerados por `ferramentas/gerar_audios.py`) |
| `checklist.js` | **O checklist em si** — perguntas, opções, gravidade e ações. Para mudar o checklist, edite só este arquivo |
| `style.css` | Visual |
| `sw.js` | Guarda o app no aparelho (uso offline). Ao publicar versão nova, mude `VERSAO` |
| `manifest.webmanifest` + `icon-*.png` | Instalação na tela inicial |
| `exemplo-cadastro-veiculos.csv` | Modelo do cadastro de veículos |

## Fluxo

1. **Primeira abertura:** cadastra o motorista deste aparelho (no app definitivo virá do cadastro da empresa).
2. **Identificação:** saudação pelo nome → frota por voz ou teclado → confirmação → dados do veículo (se houver cadastro).
3. **Checklist (30 itens, 1 condicional):** o app anuncia o item e as opções; o motorista confere e responde por toque ou voz.
   - Documentos da pasta: só é perguntado se a pasta estiver no veículo. Lista por siglas (CRLV, CIV, CIPP, certificado do tacógrafo, CTF, ATIPP, licenças ambientais). "Não" → centro de coletas.
   - Quilometragem: teclado numérico ou voz, só aceita número inteiro de 1 a 999.999 (até 6 dígitos) e sempre pede confirmação ("Confira o número do KM na tela. Está correto?"). Vai para a coluna `quilometragem` da planilha.
   - Resposta por **voz** sempre pede confirmação (pode haver erro de reconhecimento).
   - Resposta por **toque** registra direto (configurável em Configurações).
   - Óleo ou água **muito baixo/seco** encerra a vistoria na hora: "não ligue o veículo".
   - Pneus **danificados ou sem condições de uso** ou parafusos de roda **soltos ou faltando** encerram a vistoria na hora: "risco de operação, não utilize o equipamento".
4. **Resumo:** pendências agrupadas por ação, da mais urgente à menos urgente.
5. Vistoria interrompida fica salva e pode ser **continuada** na tela inicial.

## Telemetria (auditoria de execução — fase 1: só registra)

Por item: `t_anuncio`, `t_prontidao` (primeiro toque do motorista no item), `t_resposta`,
`duracao_inspecao_seg` (= prontidão − anúncio), `duracao_resposta_seg`, `sinal` (toque/voz), transcrição e tentativas de voz.
Durações medidas por relógio monotônico (não mudam se alguém alterar o relógio do celular).
Horários gravados com fuso (`2026-10-05T16:56:12-03:00`). Nenhum áudio é armazenado.

## Dados

Nesta fase os dados ficam **no aparelho**. Exportação em CSV (`;`, compatível com Excel em português) pelo Histórico
ou Configurações — no Android abre a opção de compartilhar (WhatsApp, e-mail, Drive).
A ligação com a central fica no objeto `Envio` de `app.js` (próximo passo: planilha ou banco).

## Cadastro de veículos

Configurações → Cadastro de veículos → carregar CSV com cabeçalho
`Frota;Marca;Modelo;Tipo;Ano;Centro de Coletas`. O cadastro fica só no aparelho (não vai para o código publicado).
Sem cadastro, o app aceita qualquer número de frota.

## Requisitos

- Chrome no Android (reconhecimento de voz) e endereço **HTTPS** (exigência do navegador para o microfone).
- Reconhecimento de voz do Chrome precisa de internet; sem internet, o app segue por toque.

## Voz natural

O app fala com **áudios gravados com voz neural**, gerados uma única vez a partir do roteiro em `falas.js`
(96 falas). Se faltar algum áudio, ele lê o mesmo texto com a voz do celular, sem travar.

Para gerar ou atualizar os áudios (Windows, com Python instalado e internet):
1. `ferramentas\gerar_amostras.bat` — cria amostras de 4 vozes na pasta `amostras-de-voz` para escolher.
2. `ferramentas\gerar_audios.bat` — cria todos os áudios na pasta `audio` (voz padrão: Francisca).
   Outra voz: `ferramentas\gerar_audios.bat --voz pt-BR-AntonioNeural`.
3. Depois de editar `falas.js`, rode `node ferramentas/exportar_falas.js` e gere os áudios de novo.

Os áudios ficam guardados no celular junto com o app (funcionam sem internet).

## Auditoria e integridade (v0.7.0)

- **Localização** (configurável em `CFG.localizacao`, a validar pela empresa/LGPD): registrada só durante a vistoria, em três momentos — início, início do checklist e conclusão (lat, lon, precisão). Aviso ao motorista antes da primeira vistoria. Permissão negada não impede a vistoria; a recusa fica registrada.
- **Validações cruzadas** (neste aparelho; no servidor valerão entre todos): KM menor que o da última vistoria da frota (avisa e pede conferência) e frota já vistoriada no dia (avisa e registra). Tempo de vistoria: só registrado, sem limite nesta fase.
- **Imutabilidade:** cada vistoria concluída recebe um lacre SHA-256 encadeado ao da anterior. Alteração posterior é detectada no detalhe e na planilha. Informações posteriores entram como **complementos**, com data e lacre próprios. Apagar vistorias só no modo de teste (`?teste=1`).

## Servidor central (v0.8.0)

- **Banco:** Supabase (PostgreSQL), região São Paulo. Estrutura em `servidor/001_estrutura.sql` e `servidor/002_ultimos_e_validacoes.sql`, executados em ordem no SQL Editor.
- **Envio:** toda vistoria concluída é lacrada, gravada no aparelho (IndexedDB) e entra na fila de envio. Sem sinal, a fila tenta de novo ao abrir o app, quando o sinal volta e a cada 2 minutos. O reenvio não duplica (o servidor reconhece o número da vistoria). Lacre divergente é recusado.
- **Cadastro:** veículos e vencimentos são baixados do servidor ao abrir o app e ficam no aparelho para uso sem sinal. Servidor sem veículos: vale o cadastro importado no aparelho.
- **Validações entre celulares:** o último KM e a última vistoria de cada frota vêm do servidor; o servidor também registra os alertas ao receber, se o celular não sabia.
- **Diagnóstico:** Configurações → Servidor central → Testar conexão.
- **Histórico no aparelho:** vistorias já confirmadas pelo servidor saem do aparelho depois de 30 dias.

## Cadastro da frota no servidor

1. `servidor/003_cadastro.sql` (uma vez): o app passa a ler dos documentos só frota, tipo, vencimento, UF e município (o número fica restrito ao painel), e a carga repetida não duplica documentos.
2. Preencher `Cadastro_Frota_Modelo.xlsx` (gerado por `ferramentas/modelo_cadastro.py`) e salvar como `Cadastro_Frota.xlsx` — **fora** desta pasta, que é pública.
3. `python ferramentas/gerar_carga_cadastro.py Cadastro_Frota.xlsx` confere a planilha (`relatorio_cadastro.txt`) e, sem erros, gera `carga_cadastro.sql` para o SQL Editor. Veículos são atualizados pela frota; para cada veículo da planilha, os documentos no servidor ficam iguais aos da planilha (correção substitui; renovação = linha nova, que fica como histórico). Veículos fora da planilha não são tocados.
4. No app: Configurações → Atualizar cadastro.

## Vencimento de documentos (v0.9.0)

- Ao concluir a vistoria, o app consulta os vencimentos da frota no cadastro guardado no celular (baixado do servidor).
- **Vencido** ou **vencendo em até 7 dias** (inclusive hoje) vira ponto de atenção no resumo final, num cartão próprio. A data aparece só na tela; a voz diz apenas "CRLV vencido", "CTF a vencer" etc.
- **CRLV, CIPP ou ATIPP vencido:** "Documento vencido. Não utilize o veículo e entre em contato com a central." Demais documentos vencidos ou a vencer: "Verifique com o centro de coletas os documentos vencidos ou a vencer."
- Licença em mais de um estado ou município: vale a que vence primeiro. Documento sem data no cadastro ou frota fora do cadastro: não há aviso.
- A consulta entra na vistoria antes do lacre (`documentos`: quando consultou, de quando era o cadastro e o que avisou) e as orientações vão ao servidor como pendências, com o detalhe da data.
- A frase final ("Checklist finalizado…") passou a ser só falada.

## Painel da central (script 004)

- `painel.html` (com `painel.js` e `painel.css`): vistorias que pedem intervenção da central, da mais crítica para a menos crítica, com cronômetro desde a vistoria. Meta de 15 minutos só para os graves (vistoria encerrada na hora e "não utilize o veículo").
- Atendimento **por veículo**: avaliação da central, ação realizada, executada de imediato ou programada (com data) e se o veículo foi liberado. Vistoria atendida sai da lista; a programada vai para a aba **Programadas** até alguém confirmar a execução.
- Acesso: login do Supabase (e-mail e senha) **e** e-mail liberado na tabela `usuarios_painel`. Atendimentos são somente inclusão, como as vistorias.
- `servidor/004_painel_central.sql` cria as tabelas, as consultas do painel e as funções de gravação.

## Protocolo e indicadores (script 005)

- Cada atendimento recebe um protocolo (`AT-aaaammdd-00001`) e guarda o e-mail de quem atendeu.
- "Ação realizada" é uma lista: atendimento no local, atendimento em prestador, informação incorreta, agendamento futuro (este pede a data e vai para Programadas).
- `indicadores.html` (com `indicadores.js`): totais do mês, encaminhados por área, tratados, enviados × tratados por dia, falhas por item, checklists por centro, ações realizadas, atendimentos por atendente, tempo médio, graves na meta de 15 minutos, frota vistoriada e agendamentos em aberto. Filtros de mês e centro de coletas.
- `painel.comum.js`: login e sessão, usados pelas duas páginas.

## Próximos passos (anotados)

1. Painel de manutenção programada (hoje é a aba Programadas do painel da central).
2. Painel do centro de coletas, para os itens encaminhados a ele; deve mostrar também as manutenções programadas, para acompanhamento.
3. Painel de controle de documentos, de um setor específico.
4. Login do motorista (matrícula + PIN) e limpeza das vistorias de teste, antes de usar dados reais.
