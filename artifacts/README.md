# Layer static spec file
[home](../README.md)
* The artifact hold the entire layer spec and provided on layer creation as json body.
* On current version it support hard-coded only file 'polygonPartSpec.json'.
* used for featurestypes rest APIs [/workspaces](https://docs.geoserver.org/latest/en/api/#1.0.0/featuretypes.yaml).
* Not supports xml format on current version.

## Main Structures
1. Define the name of the layer.
```json
"name": "polygon_parts"
```

2. Project based on - uses world EPSG:4326
```json
"nativeCRS": "GEOGCS[\"WGS 84\", \n  DATUM[\"World Geodetic System 1984\", \n    SPHEROID[\"WGS 84\", 6378137.0, 298.257223563, AUTHORITY[\"EPSG\",\"7030\"]], \n    AUTHORITY[\"EPSG\",\"6326\"]], \n  PRIMEM[\"Greenwich\", 0.0, AUTHORITY[\"EPSG\",\"8901\"]], \n  UNIT[\"degree\", 0.017453292519943295], \n  AXIS[\"Geodetic longitude\", EAST], \n  AXIS[\"Geodetic latitude\", NORTH], \n  AUTHORITY[\"EPSG\",\"4326\"]]"
```

3. Define from which data store should create the layer
```json
"store": {
            "@class": "dataStore",
            "name": "polygon_parts:polygon_parts"
        }
```

4. Define all attributes as defined in [polygon-parts DB](https://github.com/MapColonies/polygon-parts-manager/blob/master/src/DAL/migration/fullSchema.sql)
```json
    "attributes": {
        "attribute": [
            {
                "name": "partId",
                "minOccurs": 1,
                "maxOccurs": 1,
                "nillable": false,
                "binding": "java.lang.Integer",
                "source": "part_id"
            },
            {
                "name": "recordId",
                "minOccurs": 1,
                "maxOccurs": 1,
                "nillable": false,
                "binding": "java.util.UUID",
                "source": "record_id"
            }
        ]
    }
```
> [!NOTE]
> provide "source" only if you map different name from the original column (source).
