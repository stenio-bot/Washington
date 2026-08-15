# Projeto Washington - nomenclatura de mídia v1

## Objetivo

Permitir que o sistema agregue investimento e eficiência por público e formato sem pedir que a LLM interprete nomes livremente.

A nomenclatura é uma etiqueta operacional. Ela não substitui o targeting configurado no Meta, não comprova a peça visual e não demonstra causalidade.

## Estrutura recomendada

### Campanha

`[OBJETIVO] [FUNIL] [OFERTA] [REGIÃO]`

Exemplo: `[VENDAS] [AQUISICAO] [LINHA-PREMIUM] [BR]`

### Conjunto de anúncios

`[PÚBLICO] [JANELA] [REGIÃO] [POSICIONAMENTO]`

Exemplos:

- `[FRIO] [BROAD] [BR] [AUTO]`
- `[RMKT] [30D] [BR] [AUTO]`
- `[QUENTE] [CARRINHO-7D] [BR] [AUTO]`

### Anúncio

`[FORMATO] [ÂNGULO] [GANCHO] [VARIAÇÃO]`

Exemplos:

- `[VIDEO] [PROVA-SOCIAL] [DEPOIMENTO] [V01]`
- `[STATIC] [BENEFICIO] [PRECO] [V02]`
- `[CARROSSEL] [PRODUTO] [COLECAO] [V01]`

## Categorias reconhecidas

| Dimensão | Categoria | Tokens aceitos inicialmente |
| --- | --- | --- |
| Público | Frio | `FRIO`, `COLD`, `PROSPECTING`, `PROSPECCAO`, `BROAD`, `ABERTO` |
| Público | Morno | `MORNO`, `WARM`, `ENGAJADOS`, `ENGAGED`, `LAL`, `LOOKALIKE` |
| Público | Quente | `QUENTE`, `HOT` |
| Público | Remarketing | `RMKT`, `REMARKETING`, `RETARGET`, `RETARGETING` |
| Formato | Vídeo | `VIDEO`, `VID` |
| Formato | Estático | `STATIC`, `ESTATICO`, `IMAGEM`, `IMAGE` |
| Formato | Carrossel | `CARROSSEL`, `CAROUSEL` |
| Formato | Reels | `REEL`, `REELS` |
| Formato | Stories | `STORY`, `STORIES` |
| Formato | Catálogo | `CATALOGO`, `CATALOG`, `DPA` |
| Formato | Coleção | `COLECAO`, `COLLECTION` |

Os tokens são reconhecidos como blocos separados por espaços, colchetes, hífens ou underscores. O sistema não usa correspondência parcial dentro de outras palavras.

## Regras de segurança

1. Público é procurado primeiro no nome do conjunto, depois na campanha e por último no anúncio.
2. Formato é procurado primeiro no anúncio, depois no nome do criativo e por último na campanha.
3. Se um mesmo campo contiver duas categorias conflitantes, o anúncio fica como `não classificado`.
4. Se nenhum token for encontrado, o anúncio fica como `não classificado`.
5. O recorte só pode entrar na narrativa quando cobrir pelo menos 70% do investimento no nível de anúncio.
6. `Não classificado` aparece no diagnóstico interno para correção da operação, mas nunca é tratado como segmento de performance.
7. A LLM recebe os agregados já calculados; ela não recebe autorização para reclassificar nomes.

## Dados que o back-end deve trazer do Meta

Para cada período atual e comparado:

- nível de campanha: ID, nome e métricas;
- nível de conjunto: ID, nome, campanha e métricas;
- nível de anúncio: ID, nome, conjunto, campanha e métricas;
- metadados do criativo: ID, nome e miniatura quando disponível;
- moeda, fuso e janela de atribuição da conta.

Métricas mínimas por anúncio: investimento, impressões, alcance, cliques, compras, receita atribuída e leads. ROAS, CPL, CPC, CTR e demais indicadores são calculados pelo Projeto Washington.

## Evolução recomendada

Depois do piloto, comparar a etiqueta da nomenclatura com a configuração real do conjunto no Meta. Divergências devem virar alerta de governança, não correção automática.

