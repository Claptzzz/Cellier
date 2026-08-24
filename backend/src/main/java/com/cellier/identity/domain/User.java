package com.cellier.identity.domain;

import com.cellier.shared.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Usuario de Cellier. La identidad la aporta Google: {@code googleSub} es el claim `sub`
 * del ID token, estable e inmutable aunque el usuario cambie de correo o de nombre.
 */
@Entity
@Table(name = "users")
public class User extends AuditableEntity {

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "google_sub", nullable = false, updatable = false)
    private String googleSub;

    /** Columna `citext`: la unicidad ignora mayúsculas y minúsculas. */
    @Column(name = "email", nullable = false, columnDefinition = "citext")
    private String email;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "locale", nullable = false)
    private String locale;

    @Enumerated(EnumType.STRING)
    @Column(name = "theme_preference", nullable = false)
    private ThemePreference themePreference;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected User() {
        // Requerido por JPA.
    }

    private User(String googleSub, String email, String displayName, String avatarUrl) {
        this.googleSub = googleSub;
        this.email = email;
        this.displayName = displayName;
        this.avatarUrl = avatarUrl;
        this.locale = "es-CL";
        this.themePreference = ThemePreference.SYSTEM;
    }

    /** Crea un usuario a partir de la identidad recién verificada de Google. */
    public static User fromGoogle(String googleSub, String email, String displayName, String avatarUrl) {
        return new User(googleSub, email, displayName, avatarUrl);
    }

    /**
     * Refresca los datos que Google considera autoritativos en cada inicio de sesión.
     * El nombre y el avatar que el usuario haya personalizado en Cellier se sobrescriben
     * a propósito: la fuente de verdad del perfil es la cuenta de Google.
     */
    public void syncFromGoogle(String email, String displayName, String avatarUrl) {
        this.email = email;
        this.displayName = displayName;
        this.avatarUrl = avatarUrl;
    }

    public void updateProfile(String displayName, ThemePreference themePreference, String locale) {
        if (displayName != null) {
            this.displayName = displayName;
        }
        if (themePreference != null) {
            this.themePreference = themePreference;
        }
        if (locale != null) {
            this.locale = locale;
        }
    }

    public boolean isActive() {
        return deletedAt == null;
    }

    public UUID getId() {
        return id;
    }

    public String getGoogleSub() {
        return googleSub;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public String getLocale() {
        return locale;
    }

    public ThemePreference getThemePreference() {
        return themePreference;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}
