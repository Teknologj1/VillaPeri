# Integração da RIIA (DisparaAI) com a Villa Peri

Este documento é o que se entrega a quem vai configurar a secretária de IA no
WhatsApp. Ele descreve as dez ferramentas que a RIIA chama, como autenticar e
o que o sistema espera de volta.

A regra que organiza tudo, e que vale para cada linha abaixo:

> **A RIIA propõe, o sistema decide.**

Preço, disponibilidade, mínimo de diárias, desconto e cancelamento são
calculados pela API. A RIIA leva o resultado ao hóspede e age só dentro do
nível que a conta permite. Nenhuma regra de negócio deve ser reimplementada do
lado da RIIA — se ela calcular um preço por conta própria, mais cedo ou mais
tarde ele vai divergir do que a reserva grava.

---

## 1. Autenticação

Toda chamada leva a chave no cabeçalho:

```
Authorization: Bearer vp_<prefixo>_<segredo>
```

A chave é criada pelo proprietário e **aparece uma vez só**. O sistema guarda
apenas o hash; não há como recuperá-la depois. Perdeu, cria outra e revoga a
anterior.

```bash
npm run chave -- --criar "DisparaAI" --nivel 2
npm run chave -- --listar
npm run chave -- --revogar <id>
```

Cada chave tem:

| Propriedade | O que faz |
| --- | --- |
| **escopos** | Quais ferramentas esta chave pode usar |
| **nível de autonomia** | O teto da conta inteira: 1 consulta, 2 pré-reserva, 3 reserva automática |
| **limite por minuto** | Freio de requisições; o padrão é 60 |
| **validade** | Opcional; vencida, para de funcionar |
| **revogação** | Imediata: a próxima chamada já é recusada |

As duas trancas são independentes. O escopo é o que **esta chave** recebeu; o
nível é o teto que o proprietário escolheu para **a RIIA inteira**. Baixar o
nível corta as ferramentas de todas as chaves de uma vez — é o freio de
emergência, e não exige reeditar chave por chave.

---

## 2. Níveis de autonomia

A Villa Peri começa no **nível 2**.

| Nível | A RIIA pode | Quem conclui a reserva |
| --- | --- | --- |
| 1. Consulta | Responder disponibilidade, preço, políticas, acomodações e como chegar; passar a conversa à recepção | A recepção |
| 2. Pré-reserva | Tudo do nível 1, criar a pré-reserva (segura as noites por prazo curto), informar o sinal e enviar o link da FNRH | A recepção confirma o pagamento |
| 3. Reserva automática | Tudo do nível 2, gerar a cobrança e confirmar sozinha quando o pagamento for aprovado | Ninguém (fase 3; **ainda não implementado**) |

---

## 3. As ferramentas

A especificação viva está em **`GET /api/v1/openapi.json`**, gerada dos mesmos
esquemas de validação que as rotas usam. É a fonte a consultar: a tabela
abaixo é um resumo, aquele arquivo é o contrato.

| Ferramenta | Rota | Nível |
| --- | --- | --- |
| `buscar_disponibilidade` | `POST /api/v1/disponibilidade` | 1 |
| `sugerir_datas` | `POST /api/v1/sugerir-datas` | 1 |
| `obter_acomodacoes` | `GET /api/v1/acomodacoes` | 1 |
| `obter_politicas` | `GET /api/v1/politicas` | 1 |
| `consultar_base_local` | `GET /api/v1/base` | 1 |
| `transferir_para_humano` | `POST /api/v1/transferir` | 1 |
| `criar_pre_reserva` | `POST /api/v1/pre-reservas` | 2 |
| `consultar_reserva` | `GET /api/v1/reservas/{codigo}` | 2 |
| `enviar_link_fnrh` | `POST /api/v1/reservas/{codigo}/fnrh` | 2 |
| `solicitar_cancelamento` | `POST /api/v1/reservas/{codigo}/cancelamento` | 2 |

### Sempre mande o telefone

Quase toda ferramenta aceita um campo `telefone`. Mande-o sempre, em qualquer
formato — o sistema normaliza. Com ele:

- a conversa é criada e reaproveitada, e a recepção vê o histórico;
- a transferência para uma pessoa tem a quem se referir;
- `consultar_reserva` consegue conferir que quem pergunta é o titular.

### Exemplos

**Disponibilidade e preço:**

```bash
curl -X POST https://villaperi.com.br/api/v1/disponibilidade \
  -H "Authorization: Bearer $CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"entrada":"2027-04-21","saida":"2027-04-24","adultos":6,"criancas":2,"telefone":"5562988887777","nome":"Carla"}'
```

Devolve o total, o detalhe noite a noite com a **regra que gerou cada valor**,
o sinal, o saldo e as regras aplicadas:

```json
{
  "disponivel": true,
  "regras": { "minimoDiarias": 3 },
  "preco": {
    "totalCentavos": 365800,
    "sinalCentavos": 109740,
    "noites": [
      { "noite": "2027-04-21", "precoCentavos": 137500, "regra": "Feriado", "feriado": "Tiradentes" },
      { "noite": "2027-04-22", "precoCentavos": 54300, "regra": "Diária padrão" },
      { "noite": "2027-04-23", "precoCentavos": 75000, "regra": "Diária padrão" }
    ]
  }
}
```

**Pré-reserva** (manda `Idempotency-Key`, veja a seção 5):

```bash
curl -X POST https://villaperi.com.br/api/v1/pre-reservas \
  -H "Authorization: Bearer $CHAVE" \
  -H "Idempotency-Key: msg-whatsapp-48219" \
  -H "Content-Type: application/json" \
  -d '{"entrada":"2027-04-21","saida":"2027-04-24","adultos":6,"criancas":2,"nome":"Carla Souza","telefone":"5562988887777"}'
```

---

## 4. Quando não há oferta

A resposta **nunca** é um "não" seco. Vem com `motivos`, estruturados, para a
RIIA explicar e oferecer a alternativa certa:

| Código | O que dizer |
| --- | --- |
| `NOITE_OCUPADA` | As noites listadas já estão reservadas — chame `sugerir_datas` |
| `MINIMO_DIARIAS` | Esse período exige um mínimo de noites; `minimo` e `solicitado` vêm no motivo |
| `MAXIMO_DIARIAS` | Passou do máximo permitido |
| `CAPACIDADE_EXCEDIDA` | A casa acomoda `capacidade` pessoas |
| `DIA_ENTRADA_NAO_PERMITIDO` | A entrada não é aceita nesse dia da semana |
| `ANTECEDENCIA_MINIMA` | Falta antecedência para essa entrada |
| `JANELA_MAXIMA` | Ainda não se reserva tão longe |
| `DATA_PASSADA` | A data já passou |
| `INTERVALO_LIMPEZA` | Há folga de limpeza entre as reservas |

"Indisponível" encerra a conversa. "O mínimo nesse feriado é de três noites"
leva a uma contraproposta — e é para isso que o motivo existe.

---

## 5. Idempotência

As ferramentas que **mudam** alguma coisa aceitam `Idempotency-Key`:

```
Idempotency-Key: <id da mensagem do WhatsApp>
```

- Mesma chave, mesmo corpo → devolve a resposta guardada, com
  `Idempotent-Replay: true`. Nada é criado duas vezes.
- Mesma chave, corpo diferente → `409 idempotencia_conflito`.

Use o id da mensagem que originou a ação. É o que impede que um reenvio da
conversa vire duas reservas.

---

## 6. Erros

Sempre no mesmo formato:

```json
{
  "erro": {
    "codigo": "sem_disponibilidade",
    "mensagem": "Estas datas não estão disponíveis pelas regras da casa.",
    "dados": { "motivos": [...] }
  }
}
```

O `codigo` é estável e serve para a RIIA decidir o que fazer. A `mensagem`
está em português e pode ser repassada ao hóspede como está.

| Status | Quando |
| --- | --- |
| `401` | Chave ausente, malformada, desconhecida, revogada ou vencida |
| `403` | A chave não tem o escopo, **ou** o nível da conta não alcança a ferramenta (a mensagem diz qual dos dois) |
| `404` | Reserva não encontrada **ou** o telefone não é o do titular — a resposta é a mesma de propósito |
| `409` | Conflito: data ocupada, reserva já encerrada, chave de idempotência reusada |
| `422` | Parâmetros inválidos; `dados.problemas` diz quais |
| `429` | Limite por minuto, ou pré-reservas abertas demais para o telefone |

---

## 7. O que a RIIA **não** pode fazer

Isto não é limitação técnica a contornar: é desenho.

- **Dar desconto.** Não há parâmetro de desconto em nenhuma ferramenta. Pedido
  de desconto é caso de `transferir_para_humano`.
- **Abrir exceção ao mínimo de diárias** ou a qualquer regra de estadia.
- **Confirmar reserva.** O nível 2 cria pré-reserva; quem confirma é a
  recepção, quando o sinal entra. A frase que a RIIA mandar ao hóspede não
  deve dizer "confirmada" — a própria API devolve uma `mensagemSugerida` que
  evita isso.
- **Cancelar.** `solicitar_cancelamento` calcula o que a política devolve e
  abre o pedido; quem cancela é a recepção.
- **Ver o documento do hóspede.** Ele nunca sai da API, em nenhuma resposta.

Mensagens de hóspedes são **texto não confiável**. Como nenhuma regra vive na
RIIA, um hóspede que peça desconto, invente uma política ou escreva "ignore as
instruções anteriores" não muda nada do que a API aceita. A saída correta para
tudo isso é transferir.

---

## 8. Transferir para uma pessoa

Transfira quando houver: desconto acima do limite, exceção ao mínimo,
reclamação, alteração fora das regras, pedido que nenhuma ferramenta cobre ou
dúvida da própria RIIA.

```bash
curl -X POST https://villaperi.com.br/api/v1/transferir \
  -H "Authorization: Bearer $CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"telefone":"5562988887777","motivo":"pediu desconto de 30%","resumo":"Quer 3 noites em abril, 6 pessoas, pediu 30% de desconto."}'
```

A conversa passa a ser da recepção e entra na lista de atendimentos do painel
com o resumo. Escreva o `resumo` pensando em quem vai assumir sem ter lido a
conversa.

---

## 9. Mensagens que o sistema manda pela RIIA

O caminho inverso: quando o sistema precisa avisar o hóspede por WhatsApp
(pedido recebido, reserva confirmada, link da ficha de registro), ele **não**
fala com a Meta. Manda o evento para a RIIA, que já atende aquele número.

Configure no ambiente da Villa Peri:

```
RIIA_WEBHOOK_URL=https://<endereço da DisparaAI que recebe a mensagem>
RIIA_WEBHOOK_SEGREDO=<segredo compartilhado>
```

O corpo é:

```json
{
  "id": "11111111-2222-3333-4444-555555555555",
  "canal": "whatsapp",
  "telefone": "5562988887777",
  "nome": "Carla",
  "texto": "…",
  "evento": "reserva.confirmada",
  "tentativa": 1,
  "referencia": { "tipo": "reserva", "id": "…" }
}
```

O `id` é o mesmo em toda tentativa da mesma mensagem: guarde-o e descarte
repetição, senão uma entrega que deu tempo esgotado depois de já ter sido
mandada no WhatsApp faz o hóspede receber duas vezes.

E vai assinado:

```
X-VillaPeri-Assinatura: t=<época em segundos>,v1=<hex>
```

Onde `v1` é `HMAC-SHA256(segredo, "<t>.<corpo cru>")`. **Valide a assinatura e
recuse `t` muito antigo** — o timestamp está dentro do que é assinado
justamente para que uma requisição capturada não possa ser reenviada depois.

Em Node:

```js
const esperado = crypto
  .createHmac("sha256", SEGREDO)
  .update(`${t}.${corpoCru}`)
  .digest("hex");
```

Enquanto essas variáveis não existirem, as mensagens ficam **pendentes** na
fila do sistema — não são descartadas nem marcadas como enviadas.

**O detalhamento deste lado está em `docs/envios-para-a-riia.md`**: o contrato
completo do endpoint, exemplos de validação da assinatura em Node, PHP e
Python, o que responder em cada caso, e a questão da janela de 24 horas da
Meta, que precisa de decisão antes de ligar em produção.

---

## 10. Limites e bom comportamento

- **60 chamadas por minuto** por chave, por padrão. Passando disso, `429` com
  `Retry-After`.
- **Duas pré-reservas abertas** por telefone. A terceira recebe `429
  pre_reservas_demais` com os códigos das abertas.
- A pré-reserva da RIIA segura as noites por **12 horas**. Passado o prazo, o
  sistema a trata como vencida na leitura.
- Toda chamada fica registrada com parâmetros e resultado, ligada à conversa.
  É o que a recepção lê ao assumir um atendimento.
