package com.cellier.pantry;

import com.cellier.shared.error.ConflictException;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Alguien escribió una cantidad absoluta partiendo de un estado que ya no es el actual.
 *
 * <p>El cuerpo lleva la versión y la cantidad de ahora para que el cliente pueda decir «otro
 * miembro lo dejó en 4» en lugar de «recarga y mira tú». Un conflicto que no dice contra qué
 * chocaste obliga a una segunda petición para ser accionable.
 */
public class StaleWriteException extends ConflictException {

    private final long currentVersion;
    private final BigDecimal currentQuantity;

    public StaleWriteException(long currentVersion, BigDecimal currentQuantity) {
        super("Otro miembro del hogar cambió este producto mientras lo editabas. "
                + "Ahora hay " + currentQuantity.stripTrailingZeros().toPlainString()
                + ". Revisa cómo quedó y vuelve a intentarlo.");
        this.currentVersion = currentVersion;
        this.currentQuantity = currentQuantity;
    }

    @Override
    public Map<String, Object> getProperties() {
        return Map.of("currentVersion", currentVersion, "currentQuantity", currentQuantity);
    }
}
