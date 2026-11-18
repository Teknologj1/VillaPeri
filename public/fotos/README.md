# Fotos da Villa Peri

Coloque as fotos aqui e faça commit normalmente. O site lê desta pasta.

## Onde colocar cada coisa

```
public/fotos/
  destaque/          fotos da página inicial (as melhores, horizontais)
  acomodacoes/
    <tipo>/          uma pasta por tipo de acomodação (ex.: chale-vista/)
  galeria/           área comum, piscina, café, vistas, entorno
  pirenopolis/       cidade, cachoeiras, passeios (página "Como chegar")
```

Se ainda não sabemos quais são os tipos de acomodação, crie uma pasta por
acomodação com o nome que você usa no dia a dia — eu ajusto depois para o nome
definitivo do cadastro.

## Como nomear os arquivos

Use nomes descritivos, em minúsculas, sem acento e com hífen. O nome vira o
texto alternativo da imagem, que é o que leitor de tela lê e o que o Google usa:

```
BOM:   chale-vista-varanda-manha.jpg
       piscina-fim-de-tarde.jpg
RUIM:  IMG_4821.jpg
       WhatsApp Image 2026-11-18 at 14.32.11.jpeg
```

Para controlar a ordem em que aparecem, prefixe com número:

```
01-fachada.jpg
02-sala.jpg
03-quarto-casal.jpg
```

## Formato e tamanho

- **Mande o arquivo original da câmera ou do celular**, o maior que tiver.
  O Next.js gera as versões menores sozinho — e não dá para recuperar
  qualidade de uma foto já reduzida.
- JPG ou PNG. HEIC (padrão do iPhone) **não funciona** na web: no iPhone,
  Ajustes → Câmera → Formatos → "Mais compatível", ou converta antes.
- Evite passar de ~8 MB por arquivo, para o repositório não ficar pesado.
- Horizontais (paisagem) funcionam melhor em destaque e capa; verticais
  servem bem para detalhes dentro da galeria.

## O que evitar

- Foto com marca d'água de outro site ou tirada de anúncio de terceiros.
- Imagem com rosto de hóspede identificável sem autorização por escrito (LGPD).
- Print de tela do Airbnb no lugar da foto original.

## Depois da v1

Na fase seguinte as fotos passam a ser enviadas pelo próprio painel (módulo
Conteúdo) e guardadas fora do repositório. O que estiver aqui continua
funcionando; esta pasta é o caminho rápido para o site sair do papel agora.
