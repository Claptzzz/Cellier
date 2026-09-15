package com.cellier.template.dto;

/** Si esta línea ya está cubierta por la despensa o hay que comprar. */
public enum ReportItemStatus {

    /** No falta nada. También cuando sobra: tener de más no es un estado distinto. */
    COMPLETE,

    /** Falta algo. Es la única razón por la que una línea entra en la lista de la compra. */
    MISSING
}
