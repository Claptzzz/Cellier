package com.cellier.template.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Lo único que se edita de la plantilla en sí. Sus líneas van por su propio endpoint. */
@Schema(name = "RenameTemplateRequest", description = "Nuevo nombre de la plantilla.")
public record RenameTemplateRequest(

        @Schema(description = "Nombre, único en el hogar sin distinguir mayúsculas.",
                example = "Compra quincenal")
        @NotBlank(message = "El nombre es obligatorio")
        @Size(max = 80, message = "El nombre no puede pasar de 80 caracteres")
        String name
) {
}
