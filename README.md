# Cranio Sculpt

Crie um aplicativo web profissional (front-end) chamado “InsgthsCirurgic” para planejamento e simulação de reconstrução facial (trauma e queimaduras) usado por médicos cirurgiões. O produto é uma ferramenta clínica interna (não é para consumidor final). Precisa ter UX excelente, interface limpa, rápida e com foco em produtividade em consultório, rodando em notebook.

Objetivo do app

Permitir que o médico:

Cadastre/gerencie casos clínicos com fotos padronizadas (múltiplos ângulos)

Execute simulações de “intervenção” no rosto do paciente com ferramentas tipo “paint + IA” (puxar pele, remover tecido, marcar corte, simular sutura/fechamento), com visualização 2D e 3D superficial

Compare versões A/B (técnica 1 vs técnica 2) e mantenha histórico versionado com auditoria básica

Exporte imagens e snapshots para documentação do caso

Regras gerais de UI/UX

Layout moderno, clínico, minimalista, com foco em legibilidade e precisão.

Componentes responsivos para notebook (desktop-first).

Tema claro e tema escuro.

Tipografia profissional, espaçamentos generosos, ícones discretos.

Evitar visual “brinquedo”; usar linguagem séria (medicina).

Acessibilidade: atalhos, navegação por teclado, estados de foco, tooltips, confirmação para ações destrutivas.

Tudo deve ser “muito usável”: poucos cliques, ações claras, feedback de processamento.

Estrutura de páginas

Crie estas rotas/telas:

Login

Login por e-mail e senha (placeholder para autenticação real depois).

Tela com branding “CranioSim”.

Aviso: “Ferramenta clínica interna — uso restrito a profissionais”.

Dashboard

Cards principais: “Casos ativos”, “Casos recentes”, “Simulações em processamento”, “Últimas exportações”.

Busca global por paciente/caso.

Botão “Novo Caso”.

Lista de Casos

Tabela com: ID do caso, iniciais do paciente (ou codinome), tipo (Queimadura/Trauma), status, data, responsável, tags.

Filtros: status, tipo, data, responsável, tags.

Ações rápidas: abrir, arquivar.

Criar/Editar Caso

Formulário com dados mínimos (sem dados sensíveis demais no front): codinome/ID interno, observações, tags.

Seção de consentimento (checkbox “consentimento registrado”) com data.

Upload de fotos padronizadas (frente, perfil direito, perfil esquerdo, 3/4, opcional).

Validação visual: mostrar checklist e avisar se falta ângulo.

Campo para adicionar notas clínicas.

Captura Guiada por Câmera

Página que abre câmera (WebRTC) e guia o usuário:

Mostra uma silhueta/overlay do rosto e instruções (“centralize”, “gire lentamente”).

Botão para capturar cada ângulo (Frente / Perfil D / Perfil E / 3/4).

Barra de progresso do protocolo de captura.

Pré-visualização e opção “refazer”.

Observação: se WebRTC não estiver disponível, permitir upload manual.

Workbench do Caso (Tela principal de simulação)
Essa é a tela mais importante. Layout em 3 painéis:

Painel esquerdo (Caso + Versões)

Dados do caso (codinome, tags).

“Versões / Histórico” com timeline:

Versão base (original)

Versão A

Versão B

Subversões (A1, A2…)

Cada versão mostra: data/hora, autor, breve descrição, status (“pronto”, “processando”, “falhou”).

Botões: “Criar Versão A”, “Criar Versão B”, “Duplicar versão”, “Reverter para versão”.

Botão “Exportar” (imagem e relatório simples).

Painel central (Viewer 2D/3D)

Alternância: 2D e 3D superficial (placeholder 3D).

Viewer 2D:

Canvas com zoom, pan, grid opcional, régua/medidas, linhas-guia.

Camadas: “Original”, “Marcações”, “Simulação”, “Comparação”.

Viewer 3D:

Um viewer 3D com controles básicos (rotacionar, zoom, reset view).

Placeholder de carregamento “Modelo 3D sendo gerado”.

Modo Comparação A/B:

Slider “antes/depois” (wipe)

Side-by-side

Toggle de sobreposição com opacidade

Status visível: “Processando simulação…”, com barra de progresso e logs resumidos.

Painel direito (Ferramentas)

Seção “Ferramentas”

Puxar pele (Warp/Drag): intensidade, raio, suavização

Remover/Adicionar volume: brush com intensidade (+/-), suavização

Incisão (Corte): desenhar linha, profundidade (conceitual), espessura, tipo de corte (lista), “instrumento” (lista) — apenas UI

Sutura / Fechamento: desenhar pontos/linha, tipo de sutura (lista), espaçamento, tensão (slider)

Anotar: texto, setas, marcações

Borracha / desfazer/refazer

Seção “Parâmetros da Simulação (IA)”

Restrições/limites (checkboxes) tipo: “preservar simetria”, “evitar distorção de olhos”, “manter linha de boca”

Campo “Objetivo clínico” (texto curto) para orientar o processamento

Botão principal “Rodar Simulação (IA)” com seleção:

Aplicar na Versão A ou B

Opção “rápido” vs “qualidade”

“Fila e Execuções”

Lista das últimas execuções com status

Botão “reexecutar”

Exports

Lista de exports por caso/versão:

PNG/JPG + snapshot

PDF básico (placeholder)

Download e registro de data/hora

Configurações

Usuário, preferências (tema, atalhos).

Configurações de privacidade (texto) e aviso LGPD.

Componentes essenciais

Topbar com:

Seletor de caso

Botão “Novo Caso”

Busca

Perfil

Breadcrumbs dentro do caso

Modais de confirmação para ações destrutivas

Toasts de sucesso/erro

Skeleton loaders em telas e viewers

Tooltips em ferramentas (bem didático)

Dados e estados (mock)

Implemente um mock de dados no front para:

Casos, fotos, versões, execuções, exports

Estados de processamento (processando/finalizado/falhou)

Um “fake API layer” centralizado para depois conectar no back

Integrações (placeholders)

Prepare o front para integrar com backend via REST:

POST /cases (criar)

GET /cases, GET /cases/:id

POST /cases/:id/photos

POST /cases/:id/simulations (iniciar simulação; retorna jobId)

GET /jobs/:jobId (status)

GET /cases/:id/versions

POST /exports

Não precisa implementar backend real, mas deixe claro no código onde conectar.

Requisitos técnicos do front

Use React com componentes organizados (pages/components/hooks).

Viewer 2D: use canvas (ou biblioteca adequada) para desenhar/editar com zoom/pan.

Viewer 3D: use uma abordagem web (ex: Three.js) como placeholder para exibir um modelo 3D quando existir URL.

Sem dependência de assets externos obrigatórios.

Código limpo, com comentários úteis e estrutura de pastas.

Copy/linguagem (português)

Textos do app em pt-BR, tom profissional.

Avisos claros: “Simulação para planejamento — não substitui avaliação clínica”.

Entregue o app com rotas prontas, navegação funcional, dados mock, e um Workbench robusto e bonito.

3 prompts curtos para você usar depois (iterar no Lovable)
1) Melhorar o Workbench (mais “software médico”)

“Melhore a tela Workbench para ficar com aparência de software médico premium: ajuste espaçamentos, hierarquia visual, atalhos de teclado (Z desfazer, Y refazer, espaço para pan), tooltips com micro-explicações clínicas, e um painel de ‘Comparação A/B’ mais evidente.”

2) Captura guiada mais forte

“Deixe a Captura Guiada mais profissional: adicione checklist de qualidade (iluminação, foco, face centralizada), overlay com guias por ângulo, e uma barra de progresso com etapas obrigatórias. Mostre aviso se a foto ficou tremida.”

3) Histórico e auditoria (para clínica)

“No Workbench, adicione um ‘Log do caso’ com eventos: upload de foto, criação de versão, execução de simulação, export. Cada evento com data/hora e usuário. Inclua opção de filtrar por tipo de evento.”

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://clinicaltestevs.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/23484736-4708-49db-a838-f856aba0abf1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Acesso e contas

O cadastro aberto foi removido (S-2): esta é uma ferramenta clínica de uso restrito a
profissionais autorizados. Novas contas devem ser criadas manualmente no painel do
Supabase (**Authentication → Users**) até existir um fluxo formal de convite/aprovação.

A tela de login não oferece mais criação de conta — apenas autenticação por e-mail e senha.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
