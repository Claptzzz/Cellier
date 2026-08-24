package com.cellier.shared.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class ApplicationConfig {

    /**
     * Reloj inyectable. Tener el tiempo como dependencia permite comprobar caducidades y
     * rotaciones en los tests sin esperas reales.
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
