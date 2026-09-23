# GeoServer image

OpenShift-ready GeoServer image, based on [kartoza/geoserver](https://hub.docker.com/r/kartoza/geoserver).
The chart's `image.geoserverRepository` / `image.geoserverTag` point at this image.

## What it patches

kartoza's entrypoint assumes it can create users and chmod/chown files at startup.
Under OpenShift's arbitrary UID (member of group 0 only) all of that fails, so:

- `cert-start.sh` exports `USER=user` / `GROUP_NAME=root` (created in the Dockerfile) so
  `setup_geoserver_users()` skips `useradd`/`groupadd`.
- The `chmod` lines in `fix_permissions()` (`/scripts/lib/utils.sh`) are replaced with `true`.
  The `grep` assertions around the `sed` fail the build if a kartoza upgrade moves them.
- `CHOWN_DATA_DIR` / `CHOWN_GWC_DATA_DIR` are set to `false`.

After bumping the kartoza version, run the image with an arbitrary UID before releasing -
a green build does not prove the entrypoint still works:

```bash
docker run --rm --user 1000680000:0 <image>
```

## Build and push

The tag convention is `v<image build version>-<kartoza tag>`.

```bash
KARTOZA_TAG=3.0.1--v2026.09.04
IMAGE=acrarolibotnonprod.azurecr.io/raster/geoserver-os:v1.0.0-${KARTOZA_TAG}

docker build --build-arg GEOSERVER_BASE_IMAGE=kartoza/geoserver:${KARTOZA_TAG} -t ${IMAGE} geoserver
docker push ${IMAGE}
```
