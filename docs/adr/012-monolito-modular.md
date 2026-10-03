# ADR 012 — Monolito modular, no microservicios

- **Estado:** aceptada
- **Fecha:** 2026-10-01
- **Ámbito:** estructura general del backend (`com.cellier.{identity,household,catalog,pantry,template,recipe,shared}`)

## Contexto

Cellier tiene siete dominios razonablemente separables (identidad, hogares, catálogo,
despensa, plantillas, recetas, más lo transversal) y un único equipo pequeño construyéndolos
como proyecto universitario, con un plazo de entrega fijo y sin necesidad de escalar ni
desplegar cada dominio por separado.

La alternativa obvia a discutir es microservicios: un servicio por dominio, cada uno con su
propia base de datos y su propio despliegue.

## Decisión

**Un solo proceso, un solo JAR, una sola base de datos.** El backend se organiza por paquete
de dominio (package-by-feature), con el acoplamiento entre dominios resuelto mediante
interfaces "puerto" (p. ej. `UserHouseholdsView`, `UserHouseholdOffboarding`) para que un
módulo de bajo nivel como `identity` no dependa directamente de uno de más alto nivel como
`household`.

El frontend se empaqueta dentro del mismo JAR (`./mvnw -Pfrontend clean package`): el backend
sirve tanto la API como los estáticos de la SPA.

## Consecuencias

1. **Una sola transacción de base de datos cruza dominios sin coordinación distribuida.** Dar
   de baja a un usuario, por ejemplo, toca `identity` y `household` en el mismo commit; en
   microservicios eso exigiría sagas o un bus de eventos.
2. **Un solo despliegue.** No hay versionado de contratos entre servicios ni compatibilidad
   hacia atrás que mantener entre releases de dominios distintos.
3. **El acoplamiento se contiene con convenciones de paquete y revisión, no con un límite de
   red.** Nada impide en tiempo de compilación que un desarrollador importe una clase de otro
   módulo sin pasar por su puerto; se confía en que el patrón se respete.
4. **Escalar horizontalmente escala todo el proceso, no un dominio concreto.** Para el tamaño y
   el propósito de este proyecto no es una limitación real: no hay tráfico que justifique
   escalar `recipe` sin escalar `pantry`.
5. **Migrar a microservicios más adelante, si hiciera falta, parte de límites de dominio ya
   trazados** (los mismos paquetes), aunque exigiría separar las bases de datos y sustituir las
   interfaces puerto por llamadas de red.
