# ADR 009 — Versión de Spring Boot y de springdoc-openapi

- **Estado:** aceptada
- **Fecha:** 2026-08-24
- **Ámbito:** `backend/pom.xml`

## Contexto

El esqueleto del monorepo fija la línea de Spring Boot sobre la que se construye todo el
backend. El riesgo conocido es springdoc-openapi: históricamente ha ido por detrás de las
versiones mayores de Spring Framework, y sin él no hay documentación OpenAPI, que en este
proyecto es un requisito de cada endpoint, no un extra.

La duda concreta era si springdoc ya soportaba Spring Boot 4 / Spring Framework 7. Si no lo
soportaba, había que quedarse en Spring Boot 3.5.x.

## Verificación

Contrastado contra Maven Central el 2026-08-24, no contra documentación ni memoria:

| Artefacto | Última estable | Comprobación |
|---|---|---|
| `org.springframework.boot:spring-boot-starter-parent` | **4.1.1** | `maven-metadata.xml`; `4.2.0-M1` existe pero es *milestone*, no estable |
| `org.springdoc:springdoc-openapi-starter-webmvc-ui` | **3.1.0** | `maven-metadata.xml` |

El dato decisivo está en el POM padre de springdoc 3.1.0:

```xml
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>4.1.0</version>
</parent>
```

springdoc 3.1.0 **se compila y publica contra Spring Boot 4.1.0**. Sus dependencias internas
(`spring-boot-actuator-autoconfigure`, `spring-boot-starter-webmvc-test`, `spring-boot-health`)
son módulos que solo existen en la línea 4.x. El soporte es real, no incidental.

## Decisión

Usar **Spring Boot 4.1.1** con **springdoc-openapi 3.1.0**.

No se aplica el plan de contingencia de quedarse en Spring Boot 3.5.x: la condición que lo
motivaba —springdoc sin soporte para Spring Boot 4— no se cumple.

Versiones asociadas, todas verificadas en el registro:

| Dependencia | Versión | Origen |
|---|---|---|
| Java (`maven.compiler.release`) | 25 | compilado con JDK 26 instalado en la máquina |
| `org.mapstruct:mapstruct` | 1.6.3 | última estable; `1.7.0.Beta2` descartada por ser beta |
| `com.github.eirslett:frontend-maven-plugin` | 2.0.2 | última estable |
| Flyway, Lombok, PostgreSQL, Testcontainers | gestionadas por el BOM de Boot 4.1.1 | 12.4.0 / 1.18.46 / 42.7.13 / 2.0.5 |

## Consecuencias

Dos cambios de la línea 4.x que ya nos afectaron al levantar el esqueleto y conviene tener
presentes al añadir dependencias:

1. **Las autoconfiguraciones están troceadas por tecnología.** `flyway-core` ya no arrastra su
   propia autoconfiguración: hace falta `org.springframework.boot:spring-boot-flyway` de forma
   explícita. Sin él la aplicación arranca sin quejarse y las migraciones **no se ejecutan** —
   un fallo silencioso. Si una futura integración no se autoconfigura, buscar primero su módulo
   `spring-boot-<tecnología>`.
2. **Testcontainers 2.x renombró sus módulos.** El artefacto es
   `org.testcontainers:testcontainers-postgresql`, no `org.testcontainers:postgresql`.

Riesgo asumido: Spring Boot 4.1 es una línea reciente y parte del ecosistema de terceros aún
puede ir por detrás. La mitigación es la de esta ADR: verificar en Maven Central el POM de cada
dependencia nueva antes de fijarla, comprobando contra qué versión de Boot se publicó.

## Alternativa descartada

**Spring Boot 3.5.16 + springdoc 2.9.0.** Es la combinación conservadora y habría funcionado,
pero no hay razón para nacer una versión mayor por detrás en un proyecto que empieza hoy: solo
adelanta la migración a Boot 4 sin comprar nada a cambio.
