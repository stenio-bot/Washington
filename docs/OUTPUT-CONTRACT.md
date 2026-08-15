# Projeto Washington - contrato de output v1

Este documento é a referência de produto para o front-end, o back-end, a LLM e o PDF. O objetivo é gerar uma leitura útil para quem não domina mídia paga, sem transformar hipótese em fato ou expectativa em promessa.

## Fluxo obrigatório

`Meta somente leitura -> snapshot normalizado -> métricas calculadas -> classificação -> LLM -> validação -> revisão humana -> texto/PDF`

A LLM escreve e organiza. Ela não calcula as métricas centrais, não consulta diretamente o Meta e não altera a classificação ou os dados recebidos.

## Entradas do front-end

| Campo | Valores | Regra |
| --- | --- | --- |
| Destinatário | `client`, `internal` | Obrigatório; muda estrutura e linguagem. |
| Leitura do resultado | `auto`, `critical`, `attention`, `recovery`, `stable`, `strong` | `auto` é o padrão. A escolha manual deve ficar registrada. |
| Objetivo | `ecommerce`, `leads` | Define os indicadores centrais. |
| Tom | `executivo`, `consultivo`, `direto` | Atua dentro dos limites da régua de performance. |
| Foco | `geral`, `eficiencia`, `escala`, `criativos` | Prioriza a leitura, sem ocultar sinais relevantes. |
| Contexto do período | texto opcional | Promoção, oferta, página, CRM ou evento conhecido. |
| Ações realizadas | texto opcional | Única fonte autorizada para afirmar que uma ação foi aplicada. |
| Próximos passos | texto opcional | Plano já combinado pela equipe. |
| Pendências internas | texto opcional | Nunca aparece no relatório para cliente. |
| Próxima leitura | data opcional | Marco de acompanhamento; não é prazo de recuperação. |

## Régua de performance

| Estado | Regra automática inicial | Direção do tom |
| --- | --- | --- |
| Crítico | Resultado principal cai 35% ou mais, ou eficiência piora 25% ou mais. | Reconhecer a queda, explicar o que é conhecido, agir no controlável e não prometer recuperação. |
| Atenção | Resultado ou eficiência piora 10% ou mais. | Preventivo, proporcional ao sinal e com critério de acompanhamento. |
| Em recuperação | Resultado ou eficiência melhora 10% ou mais, sem força suficiente para “positivo”. | Otimismo cauteloso; a tendência ainda precisa se consolidar. |
| Estável | Variações abaixo dos limiares relevantes. | Sóbrio; proteger a base e evitar urgência artificial. |
| Positivo | Meta de eficiência atingida sem queda relevante, ou melhora forte combinada. | Confiante, sem triunfalismo; proteger alavancas e escalar gradualmente. |
| Dados insuficientes | Sem período comparável ou KPI central bloqueado. | Neutro; dizer o que falta para concluir. |

Para e-commerce, o resultado principal é receita atribuída e a eficiência é ROAS. Para leads, são volume de leads e custo por lead. Os limiares são configuração de produto e deverão ser calibráveis depois do piloto.

## Estrutura para cliente - cinco páginas

1. **Onde estamos:** estado, título curto, resumo objetivo e quatro indicadores.
2. **O que identificamos:** até três fatos ou leituras com evidência.
3. **Plano de ação:** ações confirmadas e próximos passos, com status explícito.
4. **O que esperar:** perspectiva condicional e até três decisões simples de mídia paga.
5. **Próxima leitura:** data ou condição para reavaliar, método e limitações.

Vocabulário técnico só entra quando necessário e deve ser explicado na mesma frase. A versão para cliente não mostra pendências internas, dúvidas da equipe ou linguagem como “não sabemos”.

## Estrutura interna - cinco páginas

1. **Resumo:** estado, headline, principais indicadores e nível de confiança.
2. **Indicadores:** fatos, interpretações e campanhas fora da curva.
3. **Ações:** executado, em andamento, planejado e recomendado.
4. **Hipóteses:** hipótese, sinal observado, risco e forma de validação.
5. **Pendências:** dados faltantes, perguntas para a equipe, próxima leitura e limitações.

## Contrato da narrativa

O JSON retornado pela LLM deve conter:

- `narrative.status`: igual à classificação determinística;
- `narrative.headline`: no máximo 12 palavras;
- `narrative.whereWeAre`: até 80 palavras e idêntico ao `executiveSummary`;
- `narrative.findings`: no máximo três itens;
- `narrative.actionsTaken`: somente quando houver `context.actions_taken`;
- `narrative.nextSteps`: ações de mídia ou acompanhamento;
- `narrative.outlook`: no máximo três razões ou condições, sem promessa;
- `narrative.nextReview`: data/condição e finalidade da próxima leitura;
- `narrative.internalNeeds`: vazio quando o destinatário for `client`.

Toda afirmação recebe `evidenceRefs`. Números escritos devem existir nas evidências citadas. A validação bloqueia a exportação se houver referência inexistente, número não verificável, promessa de recuperação ou exposição de pendência interna.

## Leitura por público e criativo

A análise usa o padrão descrito em `docs/NAMING-CONVENTION.md`.

- A classificação é determinística e acontece antes da LLM.
- Público é derivado prioritariamente do nome do conjunto; formato, do nome do anúncio.
- Nomes ambíguos ou sem token conhecido ficam como `não classificado`.
- O output mostra investimento, resultados e eficiência por grupo.
- Um recorte só entra na narrativa quando a nomenclatura cobre ao menos 70% do investimento.
- A versão interna mostra a cobertura e os itens não classificados; a versão para cliente omite conclusões quando a cobertura é insuficiente.
- A nomenclatura não comprova targeting, visual da peça ou causalidade.

Frase aceitável: “Pela nomenclatura, público frio concentrou X de investimento e registrou Y de eficiência.”

Frase bloqueada: “O público frio causou a queda.”

## Status operacional

- `aplicado`: execução confirmada pela equipe;
- `em_andamento`: execução iniciada e confirmada;
- `planejado`: ação combinada, ainda não iniciada;
- `recomendado`: sugestão da análise;
- `a_confirmar`: existe menção, mas falta detalhe suficiente.

## Exemplo crítico inspirado no caso Duracril

O relatório deve reconhecer uma queda forte logo no início. Depois, separa claramente:

- o que os dados da mídia comprovam;
- o que a equipe informou que já alterou;
- o que ainda é hipótese, inclusive problemas entre clique e compra;
- o que será observado na próxima janela.

Frase aceitável: “As correções criam uma base melhor para buscar recuperação, mas a direção precisa ser confirmada na próxima leitura.”

Frase bloqueada: “Restam dias suficientes para recuperar o resultado.”

## Critérios de aceite

- A mesma entrada gera o mesmo status e as mesmas métricas.
- Alterar o destinatário muda linguagem e estrutura, não os números.
- Alterar o estado manualmente registra a origem manual e não altera métricas.
- Nenhuma ação aparece como concluída sem confirmação da equipe.
- Nenhuma pendência interna aparece na versão para cliente.
- Nenhum recorte de público ou formato aparece sem cobertura e evidência suficientes.
- Nomes ambíguos permanecem não classificados; a LLM não pode reclassificá-los.
- Cada recomendação tem justificativa, risco e forma de validação.
- O PDF possui exatamente cinco páginas e corresponde à prévia aprovada.
- A exportação é bloqueada quando a validação factual falha.

## Responsabilidades do desenvolvedor de back-end

1. Conectar Meta/MCP em modo somente leitura e reconciliar duas contas-piloto.
2. Persistir snapshot bruto, snapshot normalizado, configuração, prompt, resposta da LLM, validação, versão aprovada e PDF.
3. Implementar segredos e autenticação do ambiente privado.
4. Manter métricas e classificação fora da LLM.
5. Retornar erros acionáveis para conta, período, permissão, Meta, LLM e validação.
6. Garantir histórico por cliente e reexportação da versão aprovada.
