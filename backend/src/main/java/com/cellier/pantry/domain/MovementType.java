package com.cellier.pantry.domain;

/**
 * Qué clase de cambio registró un movimiento de stock.
 *
 * <p>El tipo y el signo del {@code delta} no pueden contradecirse, y la base lo impone con
 * {@code ck_stock_movements_sign}: una compra suma, un consumo resta, y un ajuste puede ir
 * en cualquier dirección pero nunca vale cero.
 */
public enum MovementType {

    /** Entró producto: una compra, o el alta inicial de un artículo con cantidad. */
    PURCHASE,

    /** Se gastó producto. */
    CONSUMPTION,

    /** Alguien corrigió la cantidad a mano, normalmente tras contar lo que hay de verdad. */
    ADJUSTMENT
}
