# ADR 016 — TailwindCSS en vez de Angular Material

- **Estado:** aceptada
- **Fecha:** 2026-10-01
- **Ámbito:** `frontend/` en general; ver también `docs/design-system.md`

## Contexto

Angular tiene una librería de componentes oficial, Angular Material, que resuelve de fábrica
botones, campos, diálogos y demás con una implementación de Material Design ya accesible.
La alternativa es TailwindCSS: no trae componentes, sólo utilidades de CSS, y cada componente
de UI se construye a mano.

Cellier define su propio sistema de diseño (`docs/design-system.md`): once tokens semánticos
con contraste WCAG medido token por token, un acento azul elegido deliberadamente para no
competir con los colores de estado (verde/ámbar/rojo) del propio dominio, y una tipografía de
tres familias con reglas de uso específicas (Bricolage sólo ≥20px, Geist Mono para cantidades
por sus cifras tabulares).

## Decisión

**TailwindCSS**, sin Angular Material. Los componentes de UI (`ui-quantity-stepper`,
`ui-icon`, etc.) se construyen desde cero sobre los tokens propios y las utilidades de
Tailwind.

## Consecuencias

1. **El sistema de diseño propio no compite con el de una librería ajena.** Material Design
   trae su propia paleta, su propia escala tipográfica y sus propios supuestos de elevación y
   forma; adoptarlo habría significado o pelear contra esos supuestos en cada componente, o
   renunciar a las decisiones ya tomadas en `docs/design-system.md` (el azul de utillaje, los
   tokens `*-weak`, la regla de los 20px para Bricolage).
2. **Cada componente de interacción (el stepper de cantidad, el selector de tema) se construye
   y se audita a mano**, incluida su accesibilidad (roles ARIA, foco, contraste), en vez de
   heredarla de una librería ya probada. Es más trabajo por componente.
3. **El bundle no carga una librería de componentes completa.** Tailwind sólo emite las clases
   utilitarias que el código realmente usa; no hay JavaScript de componentes de Material que
   purgar ni que versionar junto a Angular.
4. **No hay control de versión Angular/Material que sincronizar.** Angular Material sigue el
   ciclo de versiones mayores de Angular; evitarlo quita una dependencia más que alinear en
   cada actualización.
