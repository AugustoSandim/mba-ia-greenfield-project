# phase-04-07 — Progress

**Status:** completed

## Fase 04 — Gerenciamento de vídeos e canal

- Categorias (`GET /categories`), visibilidade `public`/`unlisted`, publicação/despublicação
- Edição de vídeo (`PATCH /videos/:id`), thumbnail presign, painel studio (`/studio/**`)
- API de canal (`/channels/me`, `/channels/:nickname`), configurações de canal
- Página pública do canal (`/c/[nickname]`)

## Fase 05 — Página de visualização

- Watch page (`/watch/[publicId]`) com player HTML5, streaming via BFF
- Metadados, descrição expansível, download, vídeos relacionados
- Contagem de visualizações (`POST /videos/:publicId/views`)

## Fase 06 — Interações sociais

- Likes/dislikes em vídeos (`POST/DELETE /videos/:publicId/like`)
- Comentários com respostas (2 níveis), likes em comentários
- Inscrições em canais (`/channels/:nickname/subscribe`)
- Lista de canais seguidos (`/studio/subscriptions`)

## Fase 07 — Home, busca e finalização

- Home (`/`) com grid, filtro por categoria e paginação
- Busca (`/search?q=`), header com navbar e busca
- OpenAPI exportado e sincronizado (`scripts/sync-openapi.sh`)
- BFF alinhado com contratos reais da API NestJS

## Testes (última execução)

| Suite | Resultado |
|-------|-----------|
| Backend unit/integration | 191/191 |
| Backend e2e | 75/75 |
| Frontend Vitest | 71/71 |
| Frontend Playwright | 13/13 |

## Infra e scripts adicionais

- `compose.full.yaml` — stack local integrada (frontend + API + worker)
- `compose.prod.yaml` — imagens de produção (Next standalone + Nest build)
- `scripts/run-e2e.sh` — E2E com MSW (instala browser se necessário)
- `scripts/start-e2e-dev.sh` — sobe dev server com MSW para E2E
- `scripts/smoke-full-stack.sh` — smoke test com API real

## Retomada de upload

O formulário de upload do studio persiste o progresso multipart em `localStorage` e permite retomar ao selecionar o mesmo arquivo após falha de rede.

## Pendências conhecidas (baixa prioridade)

- Dívida de lint legada no backend (~151 avisos em specs de auth)
