"""
Gera os áudios do app com voz neural, uma única vez.

Uso (num computador com internet):
    python ferramentas/gerar_audios.py                 -> todos os áudios com a voz padrão
    python ferramentas/gerar_audios.py --voz pt-BR-AntonioNeural
    python ferramentas/gerar_audios.py --amostras      -> só as amostras das vozes, para escolher
    python ferramentas/gerar_audios.py --refazer       -> regera também os que já existem

Lê ferramentas/falas.json e grava audio/<chave>.mp3 + audio/indice.json.
O app só usa os áudios listados no índice; o que faltar é lido pela voz do celular.

Vozes: serviço de leitura em voz alta do Microsoft Edge (pacote edge-tts), adequado
para o piloto. Para uso em produção, as mesmas vozes podem ser geradas pelo serviço
pago Azure Speech (custo de centavos para este roteiro, por ser gerado uma vez só).
"""
import argparse, asyncio, json, os, sys, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FALAS = os.path.join(RAIZ, 'ferramentas', 'falas.json')
SAIDA = os.path.join(RAIZ, 'audio')
VOZ_PADRAO = 'pt-BR-FranciscaNeural'
VOZES_AMOSTRA = ['pt-BR-FranciscaNeural', 'pt-BR-ThalitaMultilingualNeural', 'pt-BR-AntonioNeural', 'pt-BR-MacerioMultilingualNeural']
FRASE_AMOSTRA = ['saud_manha', 'item_oleo_motor', 'conf_oleo_motor_1', 'acao_CONTATO_CENTRAL']

# Só muda o som, não o texto da tela: siglas lidas do jeito que se fala no pátio
PRONUNCIA = {'OLUC': 'Óluc', ' KM ': ' ká éme ',
             # siglas dos documentos: soletradas como se fala no pátio
             'CRLV': 'cê érre éle vê', 'CIPP': 'cê í pê pê', 'CIV': 'cê í vê', 'CTF': 'cê tê éfe', 'ATIPP': 'á tê í pê pê'}


def para_fala(texto):
    for escrito, falado in PRONUNCIA.items():
        texto = texto.replace(escrito, falado)
    return texto

try:
    import edge_tts
except ImportError:
    print('Instalando o pacote edge-tts...')
    os.system(f'"{sys.executable}" -m pip install --quiet edge-tts')
    import edge_tts


async def gerar(texto, voz, destino, velocidade):
    await edge_tts.Communicate(para_fala(texto), voz, rate=velocidade).save(destino)


async def principal(a):
    falas = json.load(open(FALAS, encoding='utf-8'))
    os.makedirs(SAIDA, exist_ok=True)
    if a.amostras:
        pasta = os.path.join(RAIZ, 'amostras-de-voz')
        os.makedirs(pasta, exist_ok=True)
        texto = ' '.join(falas[k] for k in FRASE_AMOSTRA)
        for voz in VOZES_AMOSTRA:
            arq = os.path.join(pasta, voz.replace('pt-BR-', '').replace('Neural', '') + '.mp3')
            await gerar(texto, voz, arq, a.velocidade)
            print('amostra:', arq)
        return
    # Regera só o que mudou: compara o texto atual com o texto usado na última geração
    anterior = {}
    try:
        ind = json.load(open(os.path.join(SAIDA, 'indice.json'), encoding='utf-8'))
        if ind.get('voz') == a.voz and ind.get('velocidade') == a.velocidade:
            anterior = ind.get('textos', {})
    except Exception:
        pass
    feitas, erros, textos = [], [], {}
    for i, (k, texto) in enumerate(falas.items(), 1):
        arq = os.path.join(SAIDA, k + '.mp3')
        igual = anterior.get(k) == texto
        if igual and os.path.exists(arq) and os.path.getsize(arq) > 0 and not a.refazer:
            feitas.append(k); textos[k] = texto; continue
        try:
            await gerar(texto, a.voz, arq, a.velocidade)
            feitas.append(k); textos[k] = texto
            print(f'[{i}/{len(falas)}] {k}')
        except Exception as e:
            erros.append(k); print(f'[{i}/{len(falas)}] ERRO {k}: {e}')
    indice = {'voz': a.voz, 'velocidade': a.velocidade, 'gerado_em': datetime.datetime.now().isoformat(timespec='seconds'), 'chaves': sorted(feitas), 'textos': textos}
    json.dump(indice, open(os.path.join(SAIDA, 'indice.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\n{len(feitas)} áudios prontos em {SAIDA}' + (f' — {len(erros)} com erro: {erros}' if erros else ''))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--voz', default=VOZ_PADRAO)
    p.add_argument('--velocidade', default='-4%', help='ex.: -10%% mais devagar, +5%% mais rápido')
    p.add_argument('--amostras', action='store_true')
    p.add_argument('--refazer', action='store_true')
    asyncio.run(principal(p.parse_args()))
