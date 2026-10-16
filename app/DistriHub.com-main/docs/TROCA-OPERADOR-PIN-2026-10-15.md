# Campo PIN na troca de operador

O painel já limpava o estado ao abrir e ao selecionar outro operador, porém usava campo password com autocomplete off, reconhecido como senha de login por navegadores.

Novo OperatorPinInput: autocomplete new-password, indicação para gerenciadores de senha, valor vazio e somente leitura até interação deliberada. Clique libera a digitação; primeira tecla numérica é preservada para uso por teclado. Aceita somente números, no máximo oito. Remonta ao mudar o operador e limpa o PIN digitado ao fechar. O PIN ativo usado pelas operações autorizadas não muda e as validações de servidor continuam vigentes.

Dois testes verificam bloqueio de alterações não solicitadas, limpeza de valor anterior, primeira tecla, colagem e troca do operador. TypeScript, lint dos componentes e build aprovados. Nenhuma operação ou PIN real usado nos testes. Extensões de navegador podem variar, mas mudanças no campo antes da interação não alimentam o estado do PIN.

Pendente de publicação junto dos cartões de Cadastros mais compactos.
