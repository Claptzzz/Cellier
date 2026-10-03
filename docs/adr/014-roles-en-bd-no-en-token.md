# ADR 014 — El rol vive en `household_members`, no en el token

- **Estado:** aceptada
- **Fecha:** 2026-10-01
- **Ámbito:** `household_members.role`, `HouseholdAccessService`

## Contexto

Cada usuario tiene un rol (`ADMIN` o `MEMBER`) distinto **por hogar**: puede ser administrador
de uno y miembro simple de otro. Hay que decidir dónde vive ese rol y cuándo se comprueba: si
se incluye como claim en el access token JWT al emitirlo, o si se consulta en base de datos en
cada petición.

## Decisión

El rol **no viaja en el token**. El access token JWT solo identifica al usuario (`sub`); el rol
efectivo se lee de `household_members` en cada petición que lo necesita, a través de
`HouseholdAccessService.requireMember` / `requireAdmin`.

## Consecuencias

1. **Un cambio de rol es efectivo en la siguiente petición, no en la siguiente hora.** Si un
   administrador degrada a otro miembro, o lo expulsa, el cambio aplica de inmediato. Si el rol
   viviera en el token, seguiría vigente hasta que caducara (hasta 15 minutos) o se forzara un
   refresco.
2. **El token es el mismo para todos los hogares del usuario.** No hace falta reemitirlo al
   cambiar de hogar activo en el frontend, ni codificar un mapa hogar→rol dentro del JWT que
   crecería con cada hogar al que la persona se une.
3. **El costo es una consulta a `household_members` en cada petición con `householdId`.** Es
   aceptable: la tabla está indexada por `(household_id, user_id)` y la consulta es parte del
   mismo guardia que ya decide el 404 frente al 403 (ver ADR 018).
4. **La autorización tiene una sola fuente de verdad.** Un token JWT no se puede revocar
   individualmente antes de su expiración; si el rol viviera ahí, un administrador degradado
   seguiría actuando como tal mientras el token viejo no caducara. Consultando siempre la base
   de datos, ese problema no existe.
