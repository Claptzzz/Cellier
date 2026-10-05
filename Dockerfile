# syntax=docker/dockerfile:1
#
# Imagen de Cellier para Railway. Una sola imagen sirve la API y la SPA: el perfil
# `frontend` del pom construye Angular y deja el resultado en target/classes/static,
# dentro del propio JAR.
#
# Construir en local igual que lo hara Railway:
#   docker build --build-arg GOOGLE_CLIENT_ID=<el real> -t cellier .
#
# Java 25 en las dos etapas: es el <java.version> real de backend/pom.xml.

# ---------------------------------------------------------------------------
# 1. Compilacion: JDK + Maven wrapper + Node (lo baja frontend-maven-plugin)
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jdk AS build

# Imagen Debian a proposito, no Alpine: frontend-maven-plugin descarga un Node
# enlazado contra glibc y en musl no arranca.
WORKDIR /build

# Node 26 enlaza contra libatomic, que la imagen base de Temurin no trae: sin esto el
# binario que descarga frontend-maven-plugin muere con
# "error while loading shared libraries: libatomic.so.1" y el build falla en `npm ci`.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libatomic1 \
 && rm -rf /var/lib/apt/lists/*

# El client id de Google se INLINA en el bundle de Angular, asi que tiene que estar
# presente en tiempo de compilacion. Llega como build arg porque no es un secreto
# —viaja al navegador de todos modos— pero tampoco se versiona.
#
# Va tambien como ENV porque quien lo lee no es Docker: es
# frontend/scripts/sync-environment.mjs, que corre como subproceso de Maven y busca
# process.env.GOOGLE_CLIENT_ID. Sin .env en disco cae a la variable de entorno, que es
# justo el caso del contenedor (comprobado: "generado desde variable de entorno").
ARG GOOGLE_CLIENT_ID=""
ENV GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}

COPY . .

# El wrapper viene con modo 755 desde git, pero no se da por supuesto: en Windows o tras
# un `git archive` el bit se pierde y el build falla con "permission denied".
# distributionType=only-script, asi que no hace falta maven-wrapper.jar en el repo.
RUN chmod +x backend/mvnw

# -DskipTests: los tests necesitan una base de datos y ya se ejecutan en el repositorio.
RUN cd backend && ./mvnw -B -ntp -Pfrontend package -DskipTests

# ---------------------------------------------------------------------------
# 2. Ejecucion: solo el JRE y el JAR
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jre AS runtime

WORKDIR /app

# Sin esto la JVM mira la memoria del HOST, no la del contenedor, y calcula un heap que
# no cabe: el proceso muere por OOM del cgroup sin dejar ni un stacktrace.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"

# Usuario sin privilegios. La imagen no escribe en disco: el estado vive en Postgres.
RUN useradd --system --create-home --uid 10001 cellier
USER cellier

COPY --from=build --chown=cellier:cellier /build/backend/target/*.jar /app/cellier.jar

# Documental: el puerto real lo decide PORT en ejecucion (ver el perfil prod).
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/cellier.jar"]
