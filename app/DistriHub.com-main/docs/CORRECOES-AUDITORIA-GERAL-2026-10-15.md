# Correções da auditoria geral

Troca de operador: gate de confirmação impede solicitações simultâneas e descarta respostas de tentativas canceladas, seleções anteriores e outro contexto de conta/filial. Cancelar, fechar e trocar seleção invalidam a tentativa. Erro de rede libera uma nova confirmação. O campo PIN não recebe valor antes de interação e é limpo ao fechar/trocar, preservando validação no servidor e PIN ativo das operações autorizadas.

Aniversário do cliente: formatação direta de data civil, preservando o dia salvo em qualquer fuso do navegador.

Importação XML: migração 20261016013638_index_xml_receipts_branch aplicada e índice confirmado. Advisor não apresenta mais FK sem índice. Tabela tinha zero registros/16kB na aplicação; não alterou dados comerciais.

Inclui compactação pendente dos cartões de Cadastros e demais módulos no celular. Somente CSS, mantendo todos os campos e alvos de toque.

Validação final local: 553 testes passaram, nenhum falhou/foi ignorado; TypeScript, lint e build aprovados. Lint exclui bundles de revisão visual não versionados em docs/*-review. Cinco testes novos cobrem cancelamento com resposta tardia, nova seleção, clique repetido, mudança de contexto, erro e nova tentativa, além da data em diferentes fusos. Testes anteriores do PIN incluídos.

Limitação confirmada: organização cpriygaynyvnlnbjecwn está no plano free/tier_free. A proteção nativa contra senhas vazadas exige Pro ou superior, conforme https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Não foi contratado plano nem aplicada simulação de proteção no navegador. Esse ponto permanece pendente de decisão sobre o plano.
