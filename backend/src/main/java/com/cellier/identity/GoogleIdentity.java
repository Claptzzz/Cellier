package com.cellier.identity;

/**
 * Identidad extraída de un ID token de Google **ya verificado**.
 *
 * @param subject       claim `sub`: identificador estable de la cuenta de Google
 * @param email         correo de la cuenta, ya confirmado como verificado
 * @param displayName   nombre para mostrar; si Google no lo envía, se cae al correo
 * @param pictureUrl    URL del avatar, puede ser nula
 */
public record GoogleIdentity(
        String subject,
        String email,
        String displayName,
        String pictureUrl
) {
}
