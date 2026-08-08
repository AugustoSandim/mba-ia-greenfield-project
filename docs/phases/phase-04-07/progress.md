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
| Frontend Vitest | 69/69 |
| Frontend Playwright | specs em `tests/home-watch.e2e-spec.ts`, `tests/studio-navigation.e2e-spec.ts` |

## Pendências conhecidas (fora do escopo imediato)

- Retomada de upload multipart após falha de rede (upload de até 10GB)
- Deploy multi-stage em produção (ver `docs/deploy.md`)
- Dívida de lint legada no backend (~151 avisos em specs de auth)
