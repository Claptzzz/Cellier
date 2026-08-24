package com.cellier.identity;

import com.cellier.identity.domain.User;
import com.cellier.shared.error.UnauthorizedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Acceso al usuario autenticado desde cualquier caso de uso. */
@Service
public class CurrentUserService {

    private final UserRepository users;

    public CurrentUserService(UserRepository users) {
        this.users = users;
    }

    /**
     * @return el usuario autenticado, releído de la base de datos
     * @throws UnauthorizedException si no hay nadie autenticado, o si la cuenta se borró
     *         después de emitirse el access token
     */
    @Transactional(readOnly = true)
    public User requireCurrentUser() {
        CellierUserPrincipal principal = requirePrincipal();
        return users.findByIdAndDeletedAtIsNull(principal.userId())
                .orElseThrow(() -> new UnauthorizedException("La cuenta ya no está activa."));
    }

    /**
     * @return la identidad que acredita el access token, sin tocar la base de datos
     * @throws UnauthorizedException si la petición es anónima
     */
    public CellierUserPrincipal requirePrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof CellierUserPrincipal principal)) {
            throw new UnauthorizedException("Se requiere un access token válido.");
        }
        return principal;
    }
}
