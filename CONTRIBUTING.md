# Contribuir a Cellier

## Ramas: trunk-based development

`main` es la única rama larga y siempre tiene que quedar en un estado desplegable. No hay
`develop`, ni ramas de release, ni ramas por integrante.

Cada cambio vive en una rama corta, creada desde `main`, con el nombre `<tipo>/<slug-corto>`:

```
feat/settings-account
fix/pending-requests-empty-state
test/e2e-playwright
docs/openapi-readme
```

El `<tipo>` es el mismo prefijo que en Conventional Commits (`feat`, `fix`, `test`, `docs`,
`refactor`, `chore`). La rama se abre, se trabaja, se integra a `main` mediante Pull Request, y
se borra. Cuanto menos tiempo viva separada de `main`, menos conflictos acumula y antes se
entera el resto del equipo de lo que cambió.

No se hace rebase de commits ya subidos a una rama que otra persona pueda haber visto, ni
force-push sobre `main`.

## Mensajes de commit: Conventional Commits

```
<tipo>(<ámbito opcional>): <resumen en infinitivo o imperativo, sin punto final>

<cuerpo opcional: el porqué, no el qué — el diff ya dice qué cambió>
```

Tipos usados en este proyecto:

| Tipo | Cuándo |
|---|---|
| `feat` | Una funcionalidad nueva, visible para quien usa la app o la API |
| `fix` | Corrige un comportamiento incorrecto |
| `test` | Añade o cambia pruebas, sin tocar comportamiento de producción |
| `docs` | Documentación: README, ADRs, comentarios Javadoc, OpenAPI |
| `refactor` | Cambia la forma del código sin cambiar su comportamiento observable |
| `chore` | Mantenimiento que no entra en las anteriores: dependencias, configuración de build |

Ejemplos reales de este repositorio:

```
feat(settings): opciones de cuenta, apariencia y baja de usuario
test(e2e): pruebas end-to-end de los flujos críticos con Playwright
```

El ámbito entre paréntesis es opcional y nombra el módulo o la pantalla afectada
(`settings`, `pantry`, `e2e`, `openapi`); se omite cuando el cambio es transversal.

## Definición de "terminado"

Un cambio no se da por terminado — y por lo tanto no se abre el Pull Request para
integrarlo a `main` — hasta que cumple **todo** lo siguiente:

1. **Compila y pasa `./mvnw -Pfrontend clean verify` desde cero.** No "en mi máquina": desde un
   checkout limpio, sin estado previo de `target/` ni de `node_modules` a medio instalar.
2. **Tiene pruebas para el comportamiento nuevo.** Backend: pruebas de integración con
   Testcontainers para servicios y controladores. Frontend: pruebas unitarias para lógica no
   trivial; si el cambio toca un flujo crítico de usuario (login, alta de producto, generar
   reporte), también un escenario de Playwright en `frontend/e2e`.
3. **Si el cambio agrega o modifica un endpoint, lleva su documentación OpenAPI en el mismo
   cambio**: `@Operation` con `summary` y `description`, `@ApiResponses` con cada código de
   error real (incluyendo su `ProblemDetail`), y ejemplos de request/response. No se documenta
   "después".
4. **Si el cambio agrega o modifica una tabla, es una migración Flyway nueva**, nunca una
   edición de una migración ya aplicada ni un `ddl-auto` distinto de `validate`
   (ver [ADR 019](docs/adr/019-flyway-ddl-auto-validate.md)).
5. **Todo endpoint con `{householdId}` valida la membresía** del usuario autenticado antes de
   tocar datos, y un hogar ajeno responde `404`, nunca `403`
   (ver [ADR 018](docs/adr/018-404-en-vez-de-403.md)).
6. **Si la decisión no es obvia a partir del código**, queda un ADR nuevo en `docs/adr/` con
   el formato Contexto / Decisión / Consecuencias. Si ya hay uno vigente para esa decisión, se
   referencia en vez de repetirlo.
7. **No quedan `console.log` de depuración, `TODO` sin ticket asociado, ni `any` en código
   TypeScript nuevo.**
8. **El build de producción no incluye secretos.** Ninguna credencial real se hardcodea; los
   valores de desarrollo en `application.yml` están marcados como tales y documentados en
   `.env.example`.

El Pull Request describe qué cambia y por qué, enlaza el incremento o la tarea que lo motiva, y
se revisa antes de integrarse — no se hace merge directo a `main` sin revisión, ni se saltan
los hooks de commit (`--no-verify`) salvo acuerdo explícito del equipo.
