package com.cellier.template.dto;

import com.cellier.catalog.domain.ProductUnit;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Una fila cruda del cruce entre la plantilla y la despensa.
 *
 * <p>Trae lo que la base sabe —lo deseado y lo que hay—, no lo que se deduce de ello. El
 * faltante y el estado se calculan después, en un solo sitio, porque son la misma resta
 * escrita una vez.
 */
public record TemplateReportRow(
        UUID productId,
        String productName,
        ProductUnit unit,
        String category,
        BigDecimal desiredQuantity,
        BigDecimal availableQuantity
) {
}
