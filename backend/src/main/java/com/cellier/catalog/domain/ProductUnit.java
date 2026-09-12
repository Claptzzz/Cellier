package com.cellier.catalog.domain;

/**
 * Unidad canónica de un producto.
 *
 * <p><strong>No se convierte entre unidades.</strong> Cada producto declara la suya y todas
 * las cantidades del sistema —despensa, plantillas, recetas— se expresan en ella, de modo
 * que comparar lo que hay con lo que hace falta es una resta.
 *
 * <p>Es una restricción de alcance deliberada. Una tabla de conversiones traería factores
 * que dependen del producto (un kilo de harina no ocupa lo mismo que un kilo de arroz),
 * redondeos que se acumulan al sumar, y conversiones que sencillamente no existen: no hay
 * gramos en dos lechugas.
 *
 * <p>Por eso la unidad forma parte de la <em>identidad</em> del producto y no es un atributo
 * suyo: cambiarla reinterpreta todas las cantidades ya registradas.
 */
public enum ProductUnit {

    /** Piezas contables: huevos, lechugas, latas. */
    UNIT,

    G,
    KG,
    ML,
    L,

    /** Paquetes cerrados que se cuentan sin abrir: un pack de seis. */
    PACK
}
