# Resposta à DisparaAI — 23/11/2026

Recebemos a definição e a implementação. Está fechado dos dois lados, com
três coisas a acertar antes de ligar.

---

## 1. Confirmado e já implementado aqui

| Item | Situação |
| --- | --- |
| URL `https://api.disparaia.net/webhook/villaperi/whatsVilla` | Anotada; entra em `RIIA_WEBHOOK_URL` no deploy |
| Assinatura HMAC sobre o corpo cru, `t` de 5 min, tempo constante | Igual dos dois lados |
| `id` guardado 7 dias, repetição descartada | Confere |
| Janela de 24 horas não se aplica | **Resolvido** — era a única pendência |

### O que mudou aqui por causa da resposta de vocês

Eu tinha pedido no documento o sinal de "não adianta reenviar" e **não o
estava usando**: a fila tentava cinco vezes qualquer erro.

Agora:

- **`422` e `400`** → paramos na primeira. A mensagem vai para `falhou` com o
  motivo e aparece para a recepção hoje, não depois de cinco tentativas.
- **`503`, `409`, `401`, `404`** → continuamos tentando, até cinco vezes.

O `401` e o `404` ficam retentáveis de propósito: são configuração (segredo
ainda não cadastrado, integração ainda não ativa na instância). Alguém
conserta e a mensagem que estava na fila sai. Se desistíssemos na primeira,
ela se perderia justamente durante a configuração inicial.

O `409` de vocês ("ainda está sendo entregue") também entra como retentável —
é o comportamento certo. Veja a seção 3.

---

## 2. A ordem de ligar as coisas

Três passos, nesta ordem, porque cada um depende do anterior.

### Passo 1 — O endereço do sistema

`https://villaperi.com.br` **ainda não existe**. É por isso que a
`GET /api/v1/openapi.json` foi recusada na sessão de vocês: não é política de
rede, é que o host não responde ainda.

Até o domínio entrar, o sistema vive num endereço da Vercel. Mandamos o
endereço assim que o deploy subir, e ele vai no campo `base_url` de vocês.

> Vale um aviso: quando o domínio próprio entrar, **o endereço muda uma vez**.
> Como vocês já têm o `base_url` configurável na tela, é trocar lá.

### Passo 2 — A chave de API

A chave vive no banco de produção, que sobe junto com o sistema. Então ela só
existe depois do passo 1. Mandamos assim que houver.

**Será uma chave de NÍVEL 1**, não 2.

Vocês implementaram só ferramentas de nível 1 — disponibilidade, sugerir
datas, acomodações, políticas, base local e transferir — e deixaram
`criar_pre_reserva` de fora com um raciocínio que nos convenceu: sem function
calling não há sinal confiável de "o hóspede aceitou ESTAS datas", e uma
pré-reserva criada por engano segura as noites da casa por 12 horas.

Então a chave não precisa alcançar o nível 2. Uma chave que pode mais do que
se usa é exposição sem contrapartida — se um dia a pré-reserva automática
fizer sentido, o proprietário sobe o nível numa tela, sem trocar a chave.

No nível 1 vocês terão exatamente: `buscar_disponibilidade`, `sugerir_datas`,
`obter_acomodacoes`, `obter_politicas`, `consultar_base_local` e
`transferir_para_humano`.

### Passo 3 — O segredo do webhook

Este é independente dos outros dois e pode ser feito agora.

É uma string combinada, de 32 bytes em hexadecimal. **Não precisa trafegar
entre as empresas**: o proprietário da Villa Peri a tem em mãos e a digita
nos dois lugares — nas variáveis de ambiente do sistema dela
(`RIIA_WEBHOOK_SEGREDO`) e na tela de configuração de vocês. Assim ela não
passa por e-mail nem por WhatsApp, como vocês mesmos recomendaram.

---

## 3. Uma falha que encontramos no código de vocês

Lendo o `receberEnvio`, achamos um caso em que a mensagem nunca chega e
ninguém percebe. Mencionamos porque **é exatamente o mesmo buraco que tínhamos
aqui**, e que consertamos esta semana.

A reserva do `id` é feita assim:

```js
INSERT INTO villaperi_envios (id, ..., status) VALUES ($1, ..., 'entregando')
ON CONFLICT (id) DO NOTHING RETURNING id
```

E a linha volta a ficar disponível em dois lugares: no `DELETE` da falha
passageira, e no `UPDATE` para `entregue` ou `falhou`.

**Se o processo morrer entre o `INSERT` e qualquer um desses dois** — deploy
no meio de uma entrega, instância reiniciada, timeout que derruba o handler —
a linha fica em `entregando` para sempre. Daí em diante:

1. Nossa retentativa chega e recebe `409`.
2. Nós tentamos de novo. `409`.
3. Cinco vezes, e marcamos como `falhou`.
4. O hóspede nunca recebe a confirmação, e do lado de vocês o registro diz
   "entregando" indefinidamente.

A correção é dar prazo à reserva. Vocês já têm o `recebido_em` para a limpeza
de 7 dias; dá para usá-lo:

```sql
INSERT INTO villaperi_envios (id, tenant_id, instancia, evento, status, recebido_em)
VALUES ($1, $2, $3, $4, 'entregando', NOW())
ON CONFLICT (id) DO UPDATE
   SET status = 'entregando', recebido_em = NOW()
 WHERE villaperi_envios.status = 'entregando'
   AND villaperi_envios.recebido_em < NOW() - interval '5 minutes'
RETURNING id
```

Assim uma reserva presa é retomada pela tentativa seguinte, em vez de travar
a mensagem. O `WHERE` no `DO UPDATE` é o que garante que isso **só** acontece
com reserva velha: uma entrega realmente em curso continua devolvendo `409`,
que é o certo.

Do nosso lado o mecanismo é o mesmo — `reservada_em` e cinco minutos de
prazo. Chegamos nele depois de o teste de dois drenadores simultâneos mostrar
que "seleciona pendentes, envia, marca como enviada" manda a mesma mensagem
duas vezes.

---

## 4. Dois detalhes menores

**O `422` da nossa API nem sempre é "sem oferta".** No `buscarDisponibilidade`
de vocês, `409` e `422` caem no mesmo caminho e o bloco do prompt escreve
"NÃO há oferta para esse pedido".

- `409 sem_disponibilidade` → é sem oferta mesmo, com `dados.motivos`.
- `422 entrada_invalida` → são os **parâmetros** que não passaram na
  validação, com `dados.problemas`. Não quer dizer que a casa esteja cheia.

Vocês já carregam `problemas` para o prompt, então o modelo tem a informação.
Só vale distinguir a frase: num `422`, "não consegui consultar com esses
dados" é mais verdadeiro que "não há oferta" — e evita dizer ao hóspede que a
casa está cheia quando foi o leitor de datas que escorregou.

**O cache de 30 minutos em acomodações, políticas e base.** Está bom para o
uso normal. Só saibam que, se o proprietário corrigir uma política no painel,
a RIIA pode responder o texto antigo por até meia hora. Se algum dia isso
incomodar, a saída é um botão de "recarregar agora" na tela de vocês.

---

## 5. O que gostamos de ver

Três coisas valem ser ditas, porque não eram óbvias:

- **O texto sai byte a byte.** É o que mais importa nesse contrato: as
  mensagens levam código de reserva, valores e horários que precisam sair
  exatos, e vocês fizeram teste para isso.
- **A transferência acontece antes do modelo.** Assim o prompt pode afirmar
  que o pedido *foi* passado à recepção, em vez de prometer que será. É mais
  honesto com o hóspede.
- **A decisão de não implementar a pré-reserva.** Preferir não ter a
  ferramenta a tê-la disparando sem um sinal confiável é a escolha certa, e é
  o que nos fez mandar uma chave de nível 1.

---

## Resumo

**Nosso lado, pronto:** 422 e 400 param na primeira tentativa; o resto
reenvia. Documento atualizado.

**Nosso lado, depois do deploy:** endereço do sistema e chave de nível 1.

**Lado de vocês, se concordarem:** o prazo na reserva do `id` (seção 3) e a
frase do `422` (seção 4).

**Dos dois lados, agora:** o proprietário digita o mesmo segredo nas duas
telas.
