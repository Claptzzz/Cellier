package com.cellier.identity;

import java.util.UUID;

/**
 * Identidad del usuario autenticado tal y como vive en el SecurityContext.
 *
 * <p>Deliberadamente mínima: lleva lo que el access token acredita y nada más. Cuando un
 * caso de uso necesita el usuario completo, lo pide a {@link CurrentUserService}, que lo lee
 * de la base de datos.
 */
public record CellierUserPrincipal(UUID userId, String email) {
}
