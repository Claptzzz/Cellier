package com.cellier;

import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Clase de configuración raíz. Se separa de {@link CellierApplication} para que los tests
 * con {@code @SpringBootTest} la encuentren por escaneo sin pasar por {@code main()}: los
 * tests no deben cargar el {@code .env} de desarrollo, porque su fuente de datos la
 * proporciona Testcontainers.
 */
@SpringBootApplication
public class CellierApplicationConfiguration {
}
