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

### CORS
Two layers can emit CORS response headers: the nginx sub-chart (which always adds them at
server level) and GeoServer itself (Tomcat's `CorsFilter`, enabled by default in the
kartoza-based image). Behind nginx that yields two `Access-Control-Allow-Origin` headers.

`disableCors` turns GeoServer's own handling off, so only nginx's headers remain:

```yaml
disableCors: true
```

It renders the `DISABLE_CORS` env var into the ConfigMap, which the geoserver container
consumes via `envFrom`. The image's entrypoint comments the `CorsFilter` out of
`conf/web.xml` when it is `true`. It also adds `proxy_hide_header` for the CORS headers
in `config/geoserver-location.conf`, so anything GeoServer still sends is dropped at
nginx rather than reaching the client. Defaults to `false`, preserving current behaviour.

> [!NOTE]
> Both halves are delivered through ConfigMaps, and neither pod spec changes when the
> value does — so `helm upgrade` alone will not apply it. The geoserver pod must restart
> for the entrypoint to rewrite `web.xml`, and the nginx pod must restart because the
> snippet is a `subPath` mount, which kubelet never refreshes.

> [!CAUTION]
> nginx is not an equivalent replacement for `CorsFilter`. It emits only
> `Access-Control-Allow-Origin`, `-Allow-Headers` and `-Max-Age`, never
> `-Expose-Headers`; and because those `add_header` directives lack the `always`
> parameter, **no CORS headers are sent on 4xx/5xx responses**. Cross-origin callers
> will see GeoServer errors as opaque CORS failures rather than real status codes.
> Only enable this where nginx actually fronts GeoServer — with `nginx.enabled: false`
> or the Dev-local route below, the flag removes CORS altogether.


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
