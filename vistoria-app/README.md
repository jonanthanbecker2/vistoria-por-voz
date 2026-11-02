# Vistoria por Voz — app piloto

Aplicativo web instalável (PWA) para a vistoria diária de veículos, conduzida por voz.
Abre no Chrome do celular, instala na tela inicial e funciona sem internet depois da primeira abertura.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Página do app |
| `app.js` | Motor de execução: identificação, checklist, voz, telemetria, histórico, exportação |
| `checklist.js` | **O checklist em si** — perguntas, opções, gravidade e ações. Para mudar o checklist, edite só este arquivo |
| `style.css` | Visual |
| `sw.js` | Guarda o app no aparelho (uso offline). Ao publicar versão nova, mude `VERSAO` |
| `manifest.webmanifest` + `icons/` | Instalação na tela inicial |
| `exemplo-cadastro-veiculos.csv` | Modelo do cadastro de veículos |

## Fluxo

1. **Primeira abertura:** cadastra o motorista deste aparelho (no app definitivo virá do cadastro da empresa).
2. **Identificação:** saudação pelo nome → frota por voz ou teclado → confirmação → dados do veículo (se houver cadastro).
3. **Checklist (22 itens):** o app anuncia o item e as opções; o motorista confere e responde por toque ou voz.
   - Resposta por **voz** sempre pede confirmação (pode haver erro de reconhecimento).
   - Resposta por **toque** registra direto (configurável em Configurações).
   - Óleo ou água **muito baixo/seco** encerra a vistoria na hora: "não ligue o veículo".
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
