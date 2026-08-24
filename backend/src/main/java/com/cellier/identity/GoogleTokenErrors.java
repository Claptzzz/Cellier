package com.cellier.identity;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;

/** Errores estándar para los fallos de validación del ID token de Google. */
final class GoogleTokenErrors {

    private GoogleTokenErrors() {
    }

    static OAuth2Error invalidToken(String description) {
        return new OAuth2Error(
                OAuth2ErrorCodes.INVALID_TOKEN,
                description,
                "https://datatracker.ietf.org/doc/html/rfc6750#section-3.1");
    }
}
