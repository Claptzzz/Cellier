package com.cellier.template.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Alta de una plantilla, con sus líneas o sin ellas. */
@Schema(name = "CreateTemplateRequest", description = "Nueva plantilla del hogar.")
public record CreateTemplateRequest(

        @Schema(description = "Nombre, único en el hogar sin distinguir mayúsculas.",
                example = "Compra semanal")
        @NotBlank(message = "El nombre es obligatorio")
        @Size(max = 80, message = "El nombre no puede pasar de 80 caracteres")
        String name,

        @Schema(description = """
                Líneas iniciales. Se puede crear vacía y llenarla después: una plantilla sin \
                productos es un borrador legítimo, no un error.""")
        @Valid
        List<TemplateItemRequest> items
) {
}
