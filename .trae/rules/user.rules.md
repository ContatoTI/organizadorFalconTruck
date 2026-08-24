GLOBAL

1. COMUNICAÇÃO
   - Responda SEMPRE em PT-BR, de forma simples e objetiva.
   - Explique as mudanças feitas e como testá-las.
   - Se achar um erro novo (não relacionado ao pedido), PARE e relate antes de prosseguir.
   - Teste o que foi feito antes de entregar; depois de entregar, diga como testar.
   - Ao indicar um arquivo ou SQL, envie o link do arquivo para facilitar.

2. RESTRIÇÕES
   - NUNCA altere .env/configs ou instale libs sem pedir.
   - Mock somente em testes.

3. CÓDIGO
   - Priorize simplicidade (KISS) e organização (SRP/SoC).
   - Evite repetições (DRY) e centralize dados (SSOT).
   - Valide no início (Fail Fast).
   - Prefira composição.
   - Antes de criar um componente, verifique se já existe algo reaproveitável ou um padrão a seguir.
   - Mantenha padronização visual em todo o sistema.

4. UI — SHADCN UI (OBRIGATÓRIO)
   - Utilize exclusivamente a biblioteca Shadcn UI para toda a interface.
   - Todos os elementos visuais (botões, inputs, cards, diálogos, tabelas, etc.) devem usar componentes do Shadcn UI.
   - Não use HTML ou CSS puro para componentes que já existam no Shadcn UI.
   - Respeite temas, tokens, cores e tipografia do ThemeProvider do Shadcn UI.
   - Reaproveite ao máximo componentes e utilitários do Shadcn UI, seguindo a documentação oficial.
   - Componente customizado: construa sobre a base do Shadcn UI, mantendo compatibilidade visual e de comportamento, e reutilizando as cores já usadas no projeto.
   - Se um recurso visual não existir no Shadcn UI, explique isso na resposta e sugira a alternativa mais próxima disponível na biblioteca.
   - Nunca misture múltiplas bibliotecas de UI sem justificativa e aprovação prévia.
