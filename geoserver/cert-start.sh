#!/usr/bin/env bash

set -e

POSTGRES_CERTIFICATES_PATH=/.postgresql

if [ "$POSTGRES_ENABLE_SSL_AUTH" = "true" ]
then
  cp $POSTGRES_CERTS_MOUNT_PATH/* $POSTGRES_CERTIFICATES_PATH
  chmod 400 $POSTGRES_CERTIFICATES_PATH/*.pk8
fi

if [ "$ADD_ROOT_CERTS" = "true" ]
then
  FILES="${ROOT_CERTS_PATH}/*"
  for f in $FILES
  do
    keytool -import -noprompt -file $f -keystore mystore -alias $f -storepass changeit
  done

  export JAVA_OPTS="${JAVA_OPTS} -Djavax.net.ssl.trustStore=mystore -Djavax.net.ssl.trustStorePassword=changeit"
fi

# kartoza's setup_geoserver_users() runs useradd/groupadd unless USER and
# GROUP_NAME already exist. The arbitrary UID on OpenShift has no passwd entry
# and cannot run useradd, so point it at the user/group created in the Dockerfile.
export USER=user
export GROUP_NAME=root

exec /scripts/entrypoint.sh
