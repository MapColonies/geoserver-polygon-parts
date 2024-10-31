# Polygon Parts serving - based on geoserver WFS protocol <img src="https://avatars.githubusercontent.com/u/186522?s=280&v=4" width="20" height="20" alt="gs logo"> <img src="https://pf-emoji-service--cdn.us-east-1.prod.public.atl-paas.net/standard/caa27a19-fc09-4452-b2b4-a301552fd69c/64x64/1f9e9.png" width="20" height="20" alt="gs logo">

This repo including entire suite of geoserver deployment including initial mechanism to configure [WFS protocol](https://docs.geoserver.org/latest/en/user/services/wfs/reference.html) for polygon parts service

## What the repo includes:
1. <img src="https://cdn.iconscout.com/icon/premium/png-512-thumb/sidecar-10451424-8438367.png?f=webp&w=256" width="30" height="30" alt="gs logo"><img src="https://www.svgrepo.com/show/439238/nodejs.svg" width="30" height="30" alt="gs logo"> Side-car (Source code) that run procedures over geoserver-api service that initializes the geoserver in new environments.
2. <img src="https://avatars.githubusercontent.com/u/7395888?s=200&v=4" width="30" height="30" alt="gs logo"><img src="https://icon.icepanel.io/Technology/svg/Helm.svg" width="30" height="30" alt="gs logo"> Full helm deployment of kartoza-geoserver including initialization with side-car
3. <img src="https://www.svgrepo.com/show/373924/nginx.svg" width="30" height="30" alt="gs logo"><img src="https://www.svgrepo.com/show/448547/opa.svg" width="30" height="30" alt="gs logo"> Support deployment with proxy-nginx & opa-la authentication.


<br>

## Detailed information:
1. [Sidecar](src/README.md)
3. [Helm](helm/README.md)
