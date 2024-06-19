# Polygon Parts serving - based on geoserver WFS protocol
This repo including entire suite of geoserver deployment including initial mechanism to configure WFS protocol for polygon parts service

## What the repo includes:
1. Side-car (Source code) that run procedures over geoserver rest API and create WFS layer with mapping taken from static artifacts file
2. Artifacts: "polygonPartSpec.json" represent how should be created the WFS layer - attributes based on [polygon-parts DB](https://github.com/MapColonies/polygon-parts-manager/blob/master/src/DAL/migration/fullSchema.sql)
3. Full deployment of kartoza-geoserver including initialization with side-car
4. Support deployment with proxy-nginx & opa-la authentication.
