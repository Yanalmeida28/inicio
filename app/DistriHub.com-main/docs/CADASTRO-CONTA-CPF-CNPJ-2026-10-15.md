# CPF/CNPJ na criação de conta

O cadastro inicial agora permite escolher pessoa física (CPF) ou jurídica (CNPJ), exige documento válido e mostra máscara correspondente. O nome se adapta ao tipo escolhido. A troca de tipo limpa o documento anterior.

O fluxo principal encaminha documento/tipo ao hook de autenticação, que valida antes de chamar Auth. Metadados armazenam somente dados cadastrais, nunca permissões. Ao concluir o perfil, inclusive após confirmação por e-mail, grava o documento normalizado no campo partner_profiles.document existente. Contas antigas sem documento continuam podendo entrar e seus perfis existentes não são sobrescritos.

Verificação: 18 testes de cadastro/autenticação/navegação passaram; TypeScript, lint sem avisos e build aprovados. Inclui CPF/CNPJ, documento inválido e persistência em sessão imediata e confirmação posterior. Nenhuma conta real criada nos testes.

Alteração local, ainda não publicada.
