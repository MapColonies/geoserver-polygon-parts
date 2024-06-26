# Helm suite for complete geoserver - polygon parts 
[Home](../README.md)
* The helm provides ready to use polygon parts serving by WFS protocol
* The initialization use side car to prepare the geoserver to be ready to uses with all relevant data
* Based on [kartoza/helm for geoserver](https://github.com/kartoza/charts/tree/develop/charts/geoserver/v0.3.3)
* Use kartoza based geoserver images [geoserver-os from mapcolonies github](https://github.com/MapColonies/geoserver)

## Main Features

### Layer Auto-Config 
* On deploy, once geoserver api is up, side-car will run and configure the WFS layer definitions.
* Readiness will be valid when it detects the featureDescribe of the polygon parts layer.

### B2B Support
* Deployment includes infra-nginx sub-chart to handle authentication and routing

> [!IMPORTANT]
> PROXY_BASE_URL must be changed according to deployed route.


## Deployment

1. create charts:
```bash
helm dependency build .
```
2. deploy:
```bash
helm install deployment-name .
```

> [!CAUTION]
> Validate route section at values false if you deploy with nginx.


## Dev-local mode
1. configure route on .Value level to true
```yaml
route:
  enabled: true
  tls: false
  path: /geoserver
```
2. configure PROXY_BASE_URL:
```yaml
extraGeoserverEnv: |
  - name: COMMUNITY_EXTENSIONS
    value: "cog-plugin"
  - name: JAVA_OPTS
    value: '-DALLOW_ENV_PARAMETRIZATION=true'
  - name: PROXY_BASE_URL
    value: /geoserver
```
3. validate nginx scope disables:
```yaml
nginx:
  enabled: false
```
