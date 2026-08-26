package com.cellier;

import me.paulschwarz.springdotenv.spring.DotenvApplicationInitializer;
import org.springframework.boot.builder.SpringApplicationBuilder;

/**
 * Punto de entrada.
 *
 * <p>El inicializador de dotenv añade el archivo {@code .env} de la raíz del repositorio
 * como PropertySource. Docker Compose lee ese archivo por su cuenta, pero la JVM no: sin
 * esto, un {@code DB_PORT} definido en {@code .env} nunca llegaba a Spring y la aplicación
 * caía al valor por defecto de {@code application.yml}, conectándose a otra base de datos.
 *
 * <p>spring-dotenv 5.x ya no se auto-registra (dejó de usar {@code spring.factories}), así
 * que el cableado va aquí a propósito. La biblioteca inserta su PropertySource **después**
 * de {@code systemEnvironment}, de modo que una variable real del entorno sigue teniendo
 * prioridad sobre el archivo: en CI o en producción manda el entorno, no el {@code .env}.
 */
public class CellierApplication {

    public static void main(String[] args) {
        new SpringApplicationBuilder(CellierApplicationConfiguration.class)
                .initializers(new DotenvApplicationInitializer())
                .run(args);
    }
}
