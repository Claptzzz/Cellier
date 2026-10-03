# ADR 015 — Una unidad canónica por producto, sin conversión

- **Estado:** aceptada
- **Fecha:** 2026-10-01
- **Ámbito:** `products.unit` (migración `V4__pantry.sql`), todas las cantidades del dominio

## Contexto

Cada producto del catálogo necesita una unidad de medida. La alternativa habitual es permitir
que cada cantidad registrada lleve su propia unidad (gramos aquí, kilos allá) y convertir al
compararlas o sumarlas. Eso exige una tabla de factores de conversión, redondeos consistentes,
y decidir qué hacer con unidades que no tienen una conversión sensata (¿cuántos gramos son dos
lechugas?).

## Decisión

**Cada producto define una única unidad canónica al crearse** (`UNIT`, `G`, `KG`, `ML`, `L`,
`PACK`), y esa unidad **no se puede cambiar después**: todas las cantidades asociadas a ese
producto —en la despensa, en plantillas, en recetas— se expresan siempre en ella. No existe
conversión entre unidades en ningún punto del sistema.

## Consecuencias

1. **Comparar "cuánto hay" contra "cuánto se quiere" es una resta, no una conversión.** El
   reporte de plantillas y la disponibilidad de recetas (ADR 017) se calculan sin tabla de
   factores ni errores de redondeo acumulados.
2. **Cambiar la unidad de un producto existente está prohibido**, porque reinterpretaría
   cantidades ya registradas: una fila que decía "2" en kilos no puede pasar a significar "2"
   en gramos sin falsear el historial. Si se necesita otra unidad, se crea un producto nuevo.
3. **No se pueden sumar cantidades de productos con unidades distintas**, ni mezclar unidades
   para el mismo producto. Es una limitación deliberada: el sistema no intenta resolver
   equivalencias ambiguas (como las lechugas) y deja esa decisión fuera de su alcance.
4. **La restricción es simétrica a ADR 011** (un vencimiento por producto, no por lote): ambas
   cambian precisión por que las preguntas más frecuentes del sistema —cuánto hay, qué falta—
   se respondan con una operación aritmética simple en vez de con una agregación o una
   conversión.
