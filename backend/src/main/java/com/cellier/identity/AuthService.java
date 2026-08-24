package com.cellier.identity;

import com.cellier.identity.domain.User;
import com.cellier.identity.dto.AuthResponse;
import com.cellier.identity.dto.UpdateProfileRequest;
import com.cellier.identity.dto.UserProfileResponse;
import com.cellier.shared.error.UnauthorizedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Casos de uso de autenticación y de perfil propio. */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final GoogleTokenVerifier googleTokenVerifier;
    private final TokenService tokenService;
    private final CurrentUserService currentUserService;
    private final UserRepository users;
    private final UserMapper userMapper;

    public AuthService(GoogleTokenVerifier googleTokenVerifier,
                       TokenService tokenService,
                       CurrentUserService currentUserService,
                       UserRepository users,
                       UserMapper userMapper) {
        this.googleTokenVerifier = googleTokenVerifier;
        this.tokenService = tokenService;
        this.currentUserService = currentUserService;
        this.users = users;
        this.userMapper = userMapper;
    }

    /**
     * Verifica el ID token de Google y devuelve credenciales de Cellier.
     *
     * <p>El usuario se resuelve por `google_sub`: si ya existe se le refrescan nombre, avatar
     * y correo; si no, se da de alta.
     */
    @Transactional
    public AuthResponse loginWithGoogle(String idToken) {
        GoogleIdentity identity = googleTokenVerifier.verify(idToken);
        User user = upsert(identity);
        IssuedTokens tokens = tokenService.issueFor(user);
        return toResponse(tokens);
    }

    @Transactional
    public AuthResponse refresh(String refreshToken) {
        return toResponse(tokenService.rotate(refreshToken));
    }

    @Transactional
    public void logout(String refreshToken) {
        tokenService.revoke(refreshToken);
    }

    @Transactional(readOnly = true)
    public UserProfileResponse currentProfile() {
        return userMapper.toProfile(currentUserService.requireCurrentUser());
    }

    @Transactional
    public UserProfileResponse updateCurrentProfile(UpdateProfileRequest request) {
        User user = currentUserService.requireCurrentUser();
        user.updateProfile(request.displayName(), request.themePreference(), request.locale());
        return userMapper.toProfile(user);
    }

    private User upsert(GoogleIdentity identity) {
        return users.findByGoogleSubAndDeletedAtIsNull(identity.subject())
                .map(existing -> {
                    existing.syncFromGoogle(identity.email(), identity.displayName(), identity.pictureUrl());
                    return existing;
                })
                .orElseGet(() -> create(identity));
    }

    private User create(GoogleIdentity identity) {
        try {
            return users.saveAndFlush(User.fromGoogle(
                    identity.subject(), identity.email(), identity.displayName(), identity.pictureUrl()));
        } catch (DataIntegrityViolationException ex) {
            // El correo ya pertenece a otra cuenta de Google, o dos inicios de sesión
            // simultáneos crearon el mismo usuario. Reintentar la lectura resuelve el
            // segundo caso; el primero es un conflicto real de identidad.
            log.debug("Colisión al crear el usuario para google_sub {}", identity.subject(), ex);
            return users.findByGoogleSubAndDeletedAtIsNull(identity.subject())
                    .orElseThrow(() -> new UnauthorizedException(
                            "Ese correo ya está asociado a otra cuenta de Cellier."));
        }
    }

    private AuthResponse toResponse(IssuedTokens tokens) {
        return new AuthResponse(
                tokens.accessToken(),
                tokens.refreshToken(),
                tokens.expiresIn(),
                userMapper.toProfile(tokens.user()));
    }
}
