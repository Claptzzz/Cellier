package com.cellier.household.domain;

/**
 * Ciclo de vida de una solicitud de ingreso. Solo {@link #PENDING} es un estado vivo: los
 * otros tres son finales y llevan siempre constancia de quién y cuándo los provocó.
 */
public enum JoinRequestStatus {

    /** Enviada y a la espera de que un administrador la resuelva. */
    PENDING,

    /** Un administrador la aceptó; en ese momento nació la membresía. */
    APPROVED,

    /** Un administrador la denegó. El solicitante puede volver a pedir. */
    REJECTED,

    /** El propio solicitante se echó atrás antes de que nadie la resolviera. */
    CANCELLED
}
