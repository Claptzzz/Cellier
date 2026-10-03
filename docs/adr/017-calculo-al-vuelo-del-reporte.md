# ADR 017 — El reporte de compras se calcula al vuelo, no se guarda

- **Estado:** aceptada
- **Fecha:** 2026-10-01
- **Ámbito:** `TemplateReportService`, `GET /households/{householdId}/templates/{templateId}/report`

## Contexto

Una plantilla (`pantry_templates` + `template_items`) declara cuánto se quiere tener de cada
producto. El reporte de compras cruza esa lista contra la despensa actual (`pantry_items`) y
calcula qué falta. La alternativa a discutir es persistir ese resultado —una tabla
`purchase_reports` o similar, recalculada en algún momento— frente a calcularlo en el instante
de cada `GET`.

## Decisión

**El reporte no se guarda en ningún lado.** Cada llamada a `.../report` recorre los ítems de
la plantilla, consulta la cantidad actual de cada producto en `pantry_items`, y devuelve
`disponible`, `deseado` y `falta = max(0, deseado - disponible)` recién calculados. Lo mismo
aplica a la disponibilidad de una receta (`GET /recipes/{id}/availability`), que es el mismo
cruce con ingredientes en vez de ítems de plantilla.

## Consecuencias

1. **El reporte nunca puede quedar desactualizado respecto de la despensa.** No existe el caso
   de "el reporte decía que faltaba leche, pero ya se compró": si alguien consume o repone
   stock, la siguiente llamada al reporte ya lo refleja, porque no hay una copia que
   sincronizar.
2. **No hay tabla que invalidar ni evento que disparar.** Cambiar una cantidad en la despensa,
   editar una plantilla o borrar un producto no requiere ningún paso adicional para mantener el
   reporte consistente, porque el reporte no es un estado — es una vista derivada en el
   momento.
3. **El costo se paga en cada lectura, no en cada escritura.** Generar el reporte de una
   plantilla grande recorre todos sus ítems y consulta la despensa por cada uno; es aceptable
   para el tamaño de una despensa doméstica, pero no escalaría igual a catálogos de miles de
   productos sin paginar o indexar de otra forma.
4. **Es la misma decisión, aplicada dos veces**, en plantillas y en recetas: ambas son "lista
   de lo que se quiere/necesita" cruzada contra "lo que hay ahora", y ninguna de las dos
   persiste el cruce.
