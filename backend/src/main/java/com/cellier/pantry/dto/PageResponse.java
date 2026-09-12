package com.cellier.pantry.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Una página de resultados.
 *
 * <p>Se define aquí en vez de devolver el {@code Page} de Spring Data: ese tipo serializa
 * una veintena de campos internos —{@code pageable}, {@code sort}, {@code first},
 * {@code numberOfElements}— que no son contrato de nada y cambian entre versiones.
 */
@Schema(name = "Page", description = "Una página de resultados.")
public record PageResponse<T>(

        @Schema(description = "Los elementos de esta página.")
        List<T> content,

        @Schema(description = "Número de página, empezando en 0.", example = "0")
        int page,

        @Schema(description = "Cuántos elementos caben por página.", example = "20")
        int size,

        @Schema(description = "Total de elementos que cumplen la consulta.", example = "47")
        long totalElements,

        @Schema(description = "Cuántas páginas hay en total.", example = "3")
        int totalPages
) {

    public static <T> PageResponse<T> of(Page<T> page) {
        return new PageResponse<>(page.getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }
}
