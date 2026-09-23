ARG GEOSERVER_BASE_IMAGE=kartoza/geoserver:3.0.1--v2026.09.04

FROM ${GEOSERVER_BASE_IMAGE}

ENV OTEL_SERVICE_NAME=geoserver
ENV RUN_AS_ROOT=true
ENV OTEL_LOGS_EXPORTER=none

# kartoza chowns the data dir and GWC cache at startup; the arbitrary UID on
# OpenShift owns neither. These are kartoza's own opt-outs.
ENV CHOWN_DATA_DIR=false
ENV CHOWN_GWC_DATA_DIR=false

USER root

RUN mkdir -p "${GEOSERVER_DATA_DIR}" \
    "${CERT_DIR}" \
    "${FOOTPRINTS_DATA_DIR}" \
    "${FONTS_DIR}" \
    "${GEOWEBCACHE_CACHE_DIR}" \
    "${GEOSERVER_HOME}" \
    "${EXTRA_CONFIG_DIR}" \
    "/docker-entrypoint-geoserver.d"

RUN chgrp -R 0 ${CATALINA_HOME} /opt /usr/local/tomcat /settings /etc/certs \
    /scripts /tmp/ /home /community_plugins/ \
    ${GEOSERVER_HOME} /usr/share/fonts/
RUN chmod -R g=u ${CATALINA_HOME} /opt /usr/local/tomcat /settings /etc/certs \
    /scripts /tmp/ /home /community_plugins/ \
    ${GEOSERVER_HOME} /usr/share/fonts/

# Drop the chmods fix_permissions() runs on paths the arbitrary UID does not own.
# The greps assert the patch applied -- sed exits 0 when it matches nothing.
RUN set -eux; \
    utils=/scripts/lib/utils.sh; \
    grep -q 'chmod o+rw "${CERT_DIR}"' "$utils"; \
    grep -q 'chmod 400' "$utils"; \
    sed -i 's|^[[:space:]]*chmod o+rw "${CERT_DIR}".*|true|' "$utils"; \
    sed -i 's|^[[:space:]]*find "${CATALINA_HOME}/conf/" -type f -exec chmod 400.*|true|' "$utils"; \
    ! grep -q 'chmod o+rw' "$utils"; \
    ! grep -q 'chmod 400' "$utils"

RUN mkdir /.postgresql && chmod g+w /.postgresql

COPY cert-start.sh /scripts/cert-start.sh

RUN useradd -ms /bin/bash user && usermod -a -G root user

USER user

ENTRYPOINT ["/bin/bash", "/scripts/cert-start.sh"]
