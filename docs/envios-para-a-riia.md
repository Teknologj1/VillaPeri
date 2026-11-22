# O que precisamos que a RIIA construa para os envios

**Para:** equipe da DisparaAI
**De:** Villa Peri — sistema de gestão
**Assunto:** o endpoint que recebe as mensagens que o sistema manda ao hóspede

---

## Em uma frase

Precisamos de **um endpoint HTTPS** no lado de vocês. Quando acontece um fato
na reserva — pedido recebido, reserva confirmada, ficha de registro a
preencher —, o sistema faz um `POST` nesse endereço com o texto pronto, e a
RIIA entrega no WhatsApp do hóspede.

Nada mais. Vocês não precisam consultar nada para entregar: o texto vem
escrito.

### Por que por vocês, e não direto pela Meta

A RIIA já atende o WhatsApp da casa. Um segundo caminho de envio significaria
dois números — ou duas vozes no mesmo número — e o hóspede respondendo a um
aviso automático cairia numa conversa que ninguém está acompanhando.

Passando por vocês, a resposta dele chega onde a RIIA está, com o contexto da
mensagem que acabou de sair.

---

## 1. O endpoint

| | |
| --- | --- |
| Método | `POST` |
| Conteúdo | `application/json` |
| Autenticação | assinatura HMAC no cabeçalho (seção 3) |
| Resposta esperada | qualquer `2xx` |

O endereço é de vocês. Mandem para nós e configuramos em
`RIIA_WEBHOOK_URL`.

### Corpo da requisição

```json
{
  "id": "11111111-2222-3333-4444-555555555555",
  "canal": "whatsapp",
  "telefone": "5562988887777",
  "nome": "Carla Souza",
  "texto": "Olá, Carla!\n\nSua reserva na Villa Peri está confirmada.\n\nCódigo: R-4K7P\n…",
  "evento": "reserva.confirmada",
  "tentativa": 1,
  "referencia": { "tipo": "reserva", "id": "aaaa1111-…" }
}
```

| Campo | O que é |
| --- | --- |
| `id` | **Identificador da mensagem.** Leiam a seção 2 — é o campo mais importante aqui |
| `canal` | Sempre `whatsapp` hoje |
| `telefone` | Só dígitos, com código do país (`55` + DDD + número) |
| `nome` | Nome do destinatário, ou `null` |
| `texto` | A mensagem pronta, em texto puro. Entregar como está |
| `evento` | O fato que originou (seção 5) |
| `tentativa` | Qual tentativa é esta, a partir de 1 |
| `referencia` | A reserva ou solicitação a que se refere, ou `null` |

**O `texto` já vem escrito e revisado.** Não reescrevam, não resumam e não
peçam a um modelo para "melhorar": ele contém código de reserva, valores e
horários que precisam sair exatos. Se quiserem acrescentar uma saudação da
RIIA antes ou depois, tudo bem — o miolo fica como está.

---

## 2. O `id`, e por que ele importa

**Guardem o `id` e descartem repetição.**

O sistema reenvia uma mensagem quando a entrega falha, até cinco vezes. Mas
"falhou para nós" não é a mesma coisa que "não chegou ao hóspede": se a
requisição der tempo esgotado **depois** de vocês já terem mandado no
WhatsApp, nós vemos uma falha e tentamos de novo — e o hóspede recebe duas
vezes a mesma confirmação de reserva.

O `id` é o mesmo em todas as tentativas da mesma mensagem. O `tentativa`
muda. Então:

```
se já entreguei esta id → responder 200 sem entregar de novo
senão                   → entregar, guardar a id, responder 200
```

Guardar por alguns dias basta.

---

## 3. A assinatura

Toda requisição leva:

```
X-VillaPeri-Assinatura: t=1763829011,v1=7b4d…64 caracteres em hexadecimal
```

Onde `v1` é:

```
HMAC-SHA256( segredo, "<t>.<corpo cru da requisição>" )
```

O `t` é o instante do envio, em **segundos** desde 1970.

**Validem antes de entregar qualquer coisa.** Sem isso, quem descobrir a URL
manda mensagem em nome da Villa Peri para qualquer número.

Duas conferências:

1. O HMAC bate.
2. O `t` não está velho — sugerimos recusar acima de **5 minutos**. O
   timestamp está *dentro* do que é assinado justamente por isso: uma
   requisição capturada não pode ser reenviada depois com data nova.

Use comparação em tempo constante (`crypto.timingSafeEqual`, `hash_equals`),
não `==`.

### Node

```js
import crypto from "node:crypto";

function assinaturaValida(cabecalho, corpoCru, segredo) {
  const partes = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(cabecalho ?? "");
  if (!partes) return false;

  const [, t, recebida] = partes;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const esperada = crypto
    .createHmac("sha256", segredo)
    .update(`${t}.${corpoCru}`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(esperada, "hex"),
    Buffer.from(recebida, "hex"),
  );
}
```

### PHP

```php
function assinatura_valida(string $cabecalho, string $corpoCru, string $segredo): bool {
    if (!preg_match('/^t=(\d+),v1=([0-9a-f]{64})$/', $cabecalho, $m)) return false;
    [, $t, $recebida] = $m;
    if (abs(time() - (int) $t) > 300) return false;
    $esperada = hash_hmac('sha256', "$t.$corpoCru", $segredo);
    return hash_equals($esperada, $recebida);
}
```

### Python

```python
import hmac, hashlib, re, time

def assinatura_valida(cabecalho, corpo_cru, segredo):
    m = re.fullmatch(r"t=(\d+),v1=([0-9a-f]{64})", cabecalho or "")
    if not m:
        return False
    t, recebida = m.groups()
    if abs(time.time() - int(t)) > 300:
        return False
    esperada = hmac.new(
        segredo.encode(), f"{t}.{corpo_cru}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(esperada, recebida)
```

> **Atenção:** assinem o **corpo cru**, byte a byte, como chegou. Se o
> framework de vocês já transformou o JSON em objeto e vocês serializarem de
> volta, a ordem das chaves ou o espaçamento mudam e a assinatura não bate.
> No Express isso é `express.raw()`; no Laravel, `$request->getContent()`.

O segredo é combinado entre nós. Geramos com `openssl rand -hex 32` e
enviamos por canal seguro — **não por WhatsApp nem por e-mail**.

---

## 4. O que responder

| Resposta | O que fazemos |
| --- | --- |
| **`2xx`** | Marcamos como entregue e não mandamos de novo |
| **`4xx`** | Tentamos de novo até cinco vezes, depois paramos. O erro aparece no nosso painel |
| **`5xx`** | Idem |
| **tempo esgotado** | Idem — e é exatamente aqui que o `id` da seção 2 salva o hóspede de receber duas vezes |

Respondam `2xx` assim que a mensagem entrar na fila de vocês. **Não segurem a
conexão** esperando a confirmação da Meta: se a resposta demorar, nós
tratamos como falha e reenviamos.

Se houver um motivo claro para a mensagem nunca poder ser entregue — número
inválido, hóspede bloqueou —, respondam `4xx` com um texto curto no corpo. Ele
é guardado e aparece para a recepção, que decide o que fazer.

---

## 5. As mensagens que mandamos hoje

| `evento` | Quando | Para quem |
| --- | --- | --- |
| `solicitacao.criada` | Alguém pede reserva pelo site | Hóspede e anfitrião |
| `reserva.confirmada` | A recepção confirma a reserva | Hóspede e anfitrião |
| `fnrh.link_enviado` | Link da ficha de registro de hóspedes | Hóspede |

Na fase 2 entram, por este mesmo endpoint: pré-reserva perto de vencer, saldo
a pagar, lembrete de chegada, check-in hoje, check-out concluído (agradecimento
e pedido de avaliação) e reserva cancelada. **Nenhum evento novo muda o
contrato acima** — só aparece um `evento` diferente.

Tratem `evento` desconhecido entregando a mensagem normalmente. É o
comportamento certo: o texto já vem pronto.

---

## 6. A janela de 24 horas — o ponto que precisa de decisão de vocês

Fora da janela de 24 horas desde a última mensagem do hóspede, a Meta só
entrega **modelo (template) aprovado**, não texto livre.

Boa parte das nossas mensagens cai fora dessa janela:

| Mensagem | Dentro da janela? |
| --- | --- |
| `solicitacao.criada` | Geralmente **não** — o hóspede preencheu um formulário no site, não escreveu no WhatsApp |
| `reserva.confirmada` | Talvez — depende de quando ele falou com a RIIA pela última vez |
| `fnrh.link_enviado` | Geralmente **não** — vai dias antes da chegada |

**Precisamos saber como vocês resolvem isso.** Duas saídas que vemos:

1. **Vocês mantêm modelos aprovados** e escolhem o modelo pelo campo `evento`,
   preenchendo os parâmetros a partir do `texto` ou de campos que a gente
   acrescenta. Se for esse o caminho, digam **quais parâmetros cada modelo
   precisa** e nós passamos a mandá-los estruturados, em vez de só o texto.
2. **Vocês respondem `4xx`** quando está fora da janela, e a mensagem fica
   pendente no nosso painel para a recepção mandar à mão.

A primeira é melhor para o hóspede. A segunda é aceitável para começar, desde
que a recepção veja a pendência — e vê.

Esta é a única parte deste documento que depende de uma resposta de vocês
antes de ligarmos em produção.

---

## 7. Volume e ritmo

Casa única, locada inteira. Na prática:

- **Algumas dezenas de mensagens por mês.** Não há pico de carga.
- A mensagem sai **logo depois do fato** que a origina — em segundos, não em
  lotes de horário.
- Uma varredura diária recolhe o que tiver falhado, em lotes de até 25.
- Raramente mandamos mais de uma requisição por vez, mas pode acontecer. O
  `id` da seção 2 é o que garante que isso não vire mensagem repetida.

Se por qualquer motivo isso mudar (mais casas no sistema), avisamos antes.

---

## 8. Como testamos juntos

1. Vocês nos mandam a **URL** e combinamos o **segredo**.
2. Configuramos em `RIIA_WEBHOOK_URL` e `RIIA_WEBHOOK_SEGREDO`.
3. Criamos uma solicitação de teste no nosso ambiente e acompanhamos:
   chegou? a assinatura validou? o `id` foi guardado?
4. Reenviamos **a mesma mensagem** de propósito, para conferir que o hóspede
   não recebe duas vezes.
5. Mandamos uma com o hóspede fora da janela de 24 horas, para ver o que
   acontece na prática.

Enquanto a URL não existir, as mensagens ficam **pendentes** na nossa fila —
não são descartadas nem marcadas como enviadas. Nada se perde no caminho.

---

## 9. O outro lado: a API que vocês chamam

Este documento é só sobre os **envios** — o que sai do sistema para vocês.

O caminho inverso — a RIIA consultando disponibilidade, preço, políticas e
criando pré-reserva — está em **`docs/integracao-riia.md`**, com as dez
ferramentas, a chave de API e a especificação OpenAPI viva em
`/api/v1/openapi.json`.

---

## Resumo do que precisamos de vocês

- [ ] A **URL** do endpoint que recebe as mensagens
- [ ] Confirmação de que validam a **assinatura** e o **`t`**
- [ ] Confirmação de que guardam o **`id`** e descartam repetição
- [ ] A resposta sobre a **janela de 24 horas** (seção 6) — a única que trava
- [ ] Um canal seguro para combinarmos o **segredo**
