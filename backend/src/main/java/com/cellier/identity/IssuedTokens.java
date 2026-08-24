package com.cellier.identity;

import com.cellier.identity.domain.User;

/**
 * Par de tokens recién emitido.
 *
 * @param accessToken  JWT firmado por Cellier
 * @param refreshToken valor opaco en claro; es la única vez que existe fuera del cliente
 * @param expiresIn    segundos de vigencia del access token
 * @param user         usuario al que pertenecen
 */
public record IssuedTokens(
        String accessToken,
        String refreshToken,
        long expiresIn,
        User user
) {
}
