# Projeto Washington - ativação do P0

## Resultado esperado

O P0 está pronto para uso real quando o fluxo abaixo funcionar com duas contas-piloto e os números forem reconciliados com o Gerenciador de Anúncios:

`Meta somente leitura -> snapshot imutável -> métricas determinísticas -> LLM -> validação factual -> aprovação humana -> PDF de 5 páginas`

## 1. Escolher a conexão Meta

Escolher apenas uma opção para a primeira ativação:

### Opção A - Marketing API direta (recomendada para o piloto)

- Configurar `META_PROVIDER=marketing_api`.
- Registrar `META_ACCESS_TOKEN` como segredo do ambiente hospedado.
- Informar explicitamente `META_GRAPH_API_VERSION`.
- O token deve permitir somente a leitura das contas aprovadas para o piloto.

### Opção B - MCP remoto ou self-hosted

- Configurar `META_PROVIDER=mcp`.
- Informar o endpoint real em `META_MCP_ENDPOINT`.
- Registrar o bearer token em `META_ACCESS_TOKEN` como segredo.
- Quando a descoberta automática não reconhecer os nomes das ferramentas, informar `META_MCP_LIST_ACCOUNTS_TOOL` e `META_MCP_INSIGHTS_TOOL`.
- O adapter recusa ferramentas cujo nome ou descrição indiquem criação, edição, pausa, publicação ou exclusão.

## 2. Ativar a LLM

- Registrar `OPENAI_API_KEY` como segredo do ambiente hospedado.
- Manter inicialmente `OPENAI_MODEL=gpt-5.6-terra`.
- A LLM recebe somente o snapshot normalizado e as evidências calculadas pelo sistema.
- A LLM não calcula métricas centrais e não acessa diretamente a conta Meta.

## 3. Escolher as contas-piloto

Usar duas contas com operação ativa:

1. Uma conta de e-commerce com compras e valor de conversão.
2. Uma conta de leads com volume suficiente para avaliar custo por lead.

Para cada conta, registrar:

- ID da conta;
- nome do cliente;
- objetivo;
- moeda e fuso;
- janela de atribuição usada no Gerenciador de Anúncios;
- período atual e período comparado;
- pessoa responsável pela conferência.

## 4. Régua de reconciliação

Comparar o snapshot do Projeto Washington com uma visualização salva ou exportação do Gerenciador de Anúncios usando exatamente o mesmo período, fuso, atribuição e nível de agregação.

Validar:

- investimento;
- impressões, alcance e cliques;
- compras e receita atribuída para e-commerce;
- leads para geração de leads;
- campanhas presentes e nomes;
- moeda, fuso e atribuição.

Não aprovar o piloto quando houver:

- diferença não explicada em uma métrica central;
- dado ausente tratado como zero;
- soma duplicada de eventos equivalentes;
- recomendação com número sem evidência;
- divergência de moeda, fuso ou atribuição.

## 5. Teste de aceite por conta

O responsável deve conseguir:

1. Selecionar a conta e o período.
2. Gerar o relatório sob demanda.
3. Identificar claramente fatos, interpretações e limitações.
4. Editar o resumo e as ações sem alterar as métricas calculadas.
5. Aprovar a versão.
6. Baixar um PDF A4 com exatamente cinco páginas.
7. Repetir a exportação sem criar inconsistência no histórico.

## 6. Liberação gradual

Após as duas contas-piloto aprovadas:

1. Adicionar as demais contas em lotes de cinco.
2. Conferir ao menos um relatório por lote.
3. Liberar acesso somente aos dois ou três usuários definidos pela equipe.
4. Manter todas as contas visíveis para esses usuários.
5. Revisar logs, falhas e custo da LLM após os primeiros 20 relatórios.

## Critério final de pronto

O P0 pode ser considerado pronto quando:

- duas contas reais passaram pela reconciliação;
- Meta e OpenAI estão configurados por segredo, sem credenciais no repositório;
- o relatório real passa pela validação factual;
- aprovação e PDF funcionam no ambiente privado;
- os usuários autorizados conseguem repetir o processo sem suporte técnico.
