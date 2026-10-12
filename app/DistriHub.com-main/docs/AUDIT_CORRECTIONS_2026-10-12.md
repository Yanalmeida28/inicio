# Correções da auditoria — 12/10/2026

## Implementado

- Reposição de estoque com identificação persistente da tentativa, bloqueio de cliques simultâneos e repetição sem somar estoque novamente.
- Curva ABC classifica antes de acumular a receita do produto. Produtos sem receita ficam no grupo sem classificação.
- OS com criação atômica e repetível, autorização de colaboradores por filial, baixa de peças uma vez, recuperação de arquivos preservados no navegador e verificação do upload e do vínculo das fotos.
- Detalhes de OS com responsável técnico, aprovação, etapas, histórico, fotos de entrada/saída e fatura única. Cancelamento devolve peças identificadas e bloqueia OS com recebimentos. OS antigas sem identificação da baixa precisam de conferência do estoque.
- Escritas diretas em OS e em totais do fluxo B2B antigo revogadas; operações comerciais novas passam pelas funções autorizadas. As funções antigas de criação de OS e reposição deixaram de ser APIs de cliente.
- Catálogo público acessível em `/catalogo?loja=slug`, seletor de filial, busca, carrinho, autenticação e pedido enviado à loja. O servidor calcula preços e totais a partir do cadastro. O pedido é uma solicitação; a venda e o recebimento são registrados no PDV/Financeiro.
- Loja acompanha pedidos de catálogo com filtros, paginação e mudança de situação.
- Suporte carrega 50 mensagens por página, com recuperação do histórico; Super Admin recebe 25 conversas por página. Resumo de pendências atualiza junto com o painel e limpa erros recuperados.
- Custos históricos ausentes são informados como estimados nos relatórios e nas exportações; os custos antigos não foram inventados.
- E-mail da conta aparece somente para leitura, e o importador geral anuncia apenas CSV/XLS/XLSX. Importação específica de XML fiscal permanece separada.
- Ações fiscais indicam preparação de NF-e/NFC-e, com transmissão pendente de integração.
- `robots.txt` e `sitemap.xml` válidos incluídos no build. A página inicial já tem título, descrição e canonical.
- Dependências atualizadas, migração para Vite 8/Tailwind 4, Supabase fixado em 2.57.4 e lockfile atualizado. Auditoria npm do aplicativo: zero vulnerabilidades conhecidas.
- Rotina SaaS agendada a cada minuto, com token privado no Vault e execução somente quando há pendências. Sem credencial do gateway, as tarefas não são reivindicadas nem anunciadas como concluídas.
- Criados índices para as 19 chaves estrangeiras indicadas pelo advisor; verificação posterior sem alertas de chaves estrangeiras sem índice.

## Validação

- TypeScript, lint e build de produção.
- Testes de banco com Postgres local: repetição de reposição/OS/pedido, rejeição de payload diferente, acesso entre empresas/filiais, devolução de peças, fatura única e bloqueio de cancelamento com recebimentos.
- Testes de interface/serviços: identidade preservada após recarregar, falhas de upload/vínculo, recuperação de erros do resumo, paginação de 120 mensagens, classificação ABC e preços validados pelo servidor.
- Edge Functions: autenticação do agendador e credencial ausente não reivindicam trabalhos.
- Edge headless: 32 verificações de abas do Super Admin e 12 de catálogo/OS/detalhes, em 320, 390, 768 e 1366 px. Sem erros de execução ou página ultrapassando a largura da tela.
- Banco remoto: criação/repetição/cancelamento de OS, fatura única, reposição única e pedido com preço do servidor verificados em transações terminadas em ROLLBACK. Nenhuma operação comercial de teste permaneceu gravada.
- Cron ativo, token inválido rejeitado, fila vazia sem chamada externa. Verificação autorizada da função confirmou a ausência de `MERCADO_PAGO_ACCESS_TOKEN` com HTTP 503 e nenhuma tarefa reivindicada.

## Configurações externas pendentes

1. **Mercado Pago:** o titular confirmou que já possui conta. Cadastrar o Access Token de produção como `MERCADO_PAGO_ACCESS_TOKEN` em [Edge Function Secrets do projeto](https://supabase.com/dashboard/project/kcxefjgchxhvcfppglvp/functions/secrets). Não colocar a credencial em variáveis `VITE_`, no repositório ou no chat. [Documentação de secrets](https://supabase.com/docs/guides/functions/secrets) e [credenciais do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials).
2. **Emissão fiscal:** o titular ainda não tem provedor de NF-e/NFC-e. Transmissão e autorização real permanecem pendentes da contratação, credenciais e homologação da integração.
3. **Senhas comprometidas:** o advisor ainda informa proteção contra senhas vazadas desativada. O conector disponível não altera as configurações de Auth; ativação precisa ocorrer nas configurações de segurança do projeto. [Orientação do Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
4. **Google:** os arquivos de rastreamento corrigem a preparação técnica. Verificar a propriedade no Search Console e enviar o sitemap requer acesso à conta do titular; a indexação depende do Google.

Avisos de funções SECURITY DEFINER públicas foram revisados: catálogo anônimo é intencional e retorna campos públicos; operações autenticadas conferem identidade, empresa, filial e assinatura. Tabelas internas sem políticas de leitura continuam bloqueadas. As otimizações de identificação e consolidação de RLS foram concluídas em 12/10/2026; veja [o relatório de desempenho](PERFORMANCE_CORRECTIONS_2026-10-12.md). Índices sem uso observado ficam sujeitos a medição sob carga; não foram removidos índices por ausência de uso recente.
