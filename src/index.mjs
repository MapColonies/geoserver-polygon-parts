import * as chokidar from 'chokidar';
import { stat } from 'fs/promises';
import * as zx from 'zx';
import { strictEqual as assertEqual, ok as assertOk } from 'assert';
import env from 'env-var';
import 'dotenv/config';
import jsLogger from '@map-colonies/js-logger';
import { ProductType } from '@map-colonies/mc-model-types';

// *******************************************************************
// *************** initialization of environ variables ***************
// *******************************************************************
const logger = jsLogger.default({
  level: env.get('LOG_LEVEL').default('info').asString(),
  prettyPrint: env.get('LOG_PRETTY').default('false').asBool(),
});

const GEOSERVER_BASE_URL = env.get('GEOSERVER_BASE_URL').default('http://localhost:8080/geoserver').asString();

const GEOSERVER_API_BASE_URL = env.get('GEOSERVER_API_BASE_URL').default('http://localhost:8081').asString();
const CATALOG_MANAGER_SERVICE_URL = env.get('CATALOG_MANAGER_SERVICE_URL').default('http://localhost:8082').asString();

const WORKSPACE_NAME = env.get('WORKSPACE_NAME').default('polygonParts').asString();
const DATASTORE_NAME = env.get('DATASTORE_NAME').default('polygonParts').asString();
const DATASTORE_PATH = env.get('DATASTORE_PATH').default('/home/razbro/Desktop/test').asString();

const FEATURE_TYPES_STRINGS_BLACK_LIST = env.get('FEATURE_TYPES_STRINGS_BLACK_LIST').default(['*_parts']).asJson();
const FEATURE_TYPES_REGEX_BLACK_LIST = env.get('FEATURE_TYPES_REGEX_BLACK_LIST').default(['migrations', 'parts', 'polygon_parts', 'test_view']).asJson();

const WORKSPACE_API_URL = `${GEOSERVER_API_BASE_URL}/workspaces`;
const GEOSERVER_RELOAD_URL = `${GEOSERVER_API_BASE_URL}/geoserver/rest/reload`;
const DATA_STORE_API_URL = `${GEOSERVER_API_BASE_URL}/dataStores/${WORKSPACE_NAME}`;
const FEATURE_TYPES_API_URL = `${GEOSERVER_API_BASE_URL}/featureTypes/${WORKSPACE_NAME}/${DATASTORE_NAME}`;
const CATALOG_MANAGER_FIND_URL = `${CATALOG_MANAGER_SERVICE_URL}/records/find`;

const GLOBAL_WFS_SETTING_API_URL = `${GEOSERVER_API_BASE_URL}/services/wfs/settings`;


// *******************GEOSERVER INITIALIZATION************************************************

//Loop until validate geoserver is up
await checkGeoserverIsUp();

//set wfs mode
await setWfsAsBasic();

//check if workspace exists, if it doesnt - create one
const workspaceExists = await checkWorkspace();
if (!workspaceExists) {
  await createWorkspace();
}

//check if dataStore exists, if it doesnt - create one
const dataStoreExists = await checkDataStore();
if (!dataStoreExists) {
  await createDataStore();
}

//check featureLayers and publish them if needed
await checkFeatureTypes();

logger.info({ msg: `Env ready: Completed Geoserver initialization` });

//listen to nfs changes
if (await isDataDirExists()) {
  const watcher = chokidar.watch(DATASTORE_PATH, {
    persistent: true,
    ignoreInitial: true,
    usePolling: true,       // use polling to detect changes - optimized for NFS
    interval: 1000,         // how often to poll (in ms)
    binaryInterval: 1000,
  });

  logger.info({ msg: `starts watching ${DATASTORE_PATH} path` });
  watcher.on('add', path => {
    logger.info({ msg: `File added: ${path}` });
    reloadGeoServer();
  })
    .on('unlink', path => {
      logger.info({ msg: `File removed: ${path}` });
      reloadGeoServer();
    })
} else {
  logger.error({ msg: `Data directory ${DATASTORE_PATH} does not exist or is not accessible` });
  throw new Error(`Data directory ${DATASTORE_PATH} does not exist or is not accessible`);
}
// *******************************************************************

async function reloadGeoServer() {
  try {
    logger.info({ msg: `Triggering geoserver reload on ${GEOSERVER_RELOAD_URL}...` });
    await zx.fetch(`${GEOSERVER_RELOAD_URL}`, {
      method: 'POST',
    });
  } catch (error) {
    logger.warn({
      msg: `Failed connect to reload geoserver with error ${error}, will retry again`,
    });
    await zx.sleep(15000);
  }
}

async function isDataDirExists() {
  try {
    const stats = await stat(DATASTORE_PATH);
    const isDirectory = stats.isDirectory()
    if (isDirectory) {
      logger.info({ msg: `successfully checked ${DATASTORE_PATH} is a directory` });
      return true;
    } else {
      logger.error({ msg: `${DATASTORE_PATH} is not a directory` });
      return false;
    }
  } catch (err) {
    logger.error({ msg: `Error checking data directory ${DATASTORE_PATH}: ${err.message}` });
    throw err;
  }
}

/**
 * This function will check periodically till detect that geoserver is up and than exit the method
 */
async function checkGeoserverIsUp() {
  while (true) {
    try {
      const responseFromGs = await zx.fetch(`${GEOSERVER_BASE_URL}`, {
        method: 'GET',
      });
      logger.info({
        msg: `Got response from geoserver with status code: ${responseFromGs.status}`,
      });
      assertOk(responseFromGs.status === 200);
      break;
    } catch (error) {
      logger.warn({
        msg: `Failed connect to geoserver with error ${error}, will retry again`,
      });
      await zx.sleep(15000);
    }
  }
}

/**
 * Send api to check if the workspace exists
 */
async function checkWorkspace() {
  const getWorkspaceResp = await zx.fetch(`${WORKSPACE_API_URL}/${WORKSPACE_NAME}`, {
    method: 'GET',
  });

  logger.info({ msg: await getWorkspaceResp.text() });

  await zx.sleep(1000);
  if (getWorkspaceResp.status === 200) {
    return true;
  } else if (getWorkspaceResp.status === 404) {
    return false;
  } else {
    throw new Error(`Unexpected status code: ${getWorkspaceResp.status}`);
  }
}

async function createWorkspace() {
  const createWorkspaceBody = {
    name: WORKSPACE_NAME,
  };

  const createWorkspaceResp = await zx.fetch(`${WORKSPACE_API_URL}`, {
    method: 'POST',
    body: JSON.stringify(createWorkspaceBody),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  logger.info({ msg: await createWorkspaceResp.text() });

  assertOk(createWorkspaceResp.status === 201);
  logger.info({
    msg: `Created workspace: ${WORKSPACE_NAME}  successfully`,
  });

  await zx.sleep(1000);
}

/**
 * Send api to check if the workspace exists, if not create one
 */
async function checkDataStore() {
  const getDataStoreResp = await zx.fetch(`${DATA_STORE_API_URL}/${DATASTORE_NAME}`, {
    method: 'GET',
  });

  logger.debug({ msg: await getDataStoreResp.text() });

  await zx.sleep(1000);
  if (getDataStoreResp.status === 200) {
    return true;
  } else if (getDataStoreResp.status === 404) {
    return false;
  } else {
    throw new Error(`Unexpected status code: ${getDataStoreResp.status}`);
  }
}

async function createDataStore() {
  const createDataStoreBody = {
    name: DATASTORE_NAME,
  };

  const createDataStoreResp = await zx.fetch(`${DATA_STORE_API_URL}`, {
    method: 'POST',
    body: JSON.stringify(createDataStoreBody),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  logger.info({ msg: await createDataStoreResp.text() });

  assertOk(createDataStoreResp.status === 201);
  logger.info({
    msg: `Created dataStore: ${DATASTORE_NAME}  successfully`,
  });

  await zx.sleep(1000);
}

/**
 * compare get list configured and get available - if create feature types of all that are available and not configured
 */
async function checkFeatureTypes() {

  const availableNames = await getAvailableFeatureTypes();
  const mappedLayerNames = await mapNativeNameToLayerName(availableNames);

  if (mappedLayerNames.length === 0) {
    logger.info(' There are no layers to publish! ');
  } else {
    const postRequests = mappedLayerNames.map(async (entity) => {
      try {
        const response = await zx.fetch(FEATURE_TYPES_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nativeName: entity.nativeName, name: entity.layerName }),
        });
        if (!response.ok) {
          throw new Error(`Failed to POST for table:${entity.nativeName} with layerName: ${entity.layerName}: ${response.status} ${response.statusText}`);
        }
        logger.info(`Successfully posted for table:${entity.nativeName} with layerName: ${entity.layerName}`);
      } catch (error) {
        // Log detailed error message for the failed request
        logger.error(`Error posting for table:${entity.nativeName} with layerName: ${entity.layerName}:`, error);
        throw error; // Re-throw the error to ensure it is caught by Promise.all
      }
    });
    try {
      await Promise.all(postRequests);
      logger.info({ msg: 'All POST requests were successful' });
    } catch (error) {
      logger.error(`One or more POST requests failed: ${error}`);
      throw Error(error);
    }
  }
  await zx.sleep(1000);
}

/**
 * Send api request for global settings - restrict WFS protocol read-only (BASIC)
 */
async function setWfsAsBasic() {
  const wfsModeResponse = await zx.fetch(GLOBAL_WFS_SETTING_API_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ serviceLevel: 'BASIC' }),
  });

  logger.info({ msg: await wfsModeResponse.text() });
  assertEqual(wfsModeResponse.status, 200);
  logger.info({
    msg: `Set WFS service level into 'BASIC' - read only mode with status code: ${wfsModeResponse.status}`,
  });
}

async function getAvailableFeatureTypes() {
  const listAvailableParams = new URLSearchParams();
  listAvailableParams.append('list', 'available');
  const getAvailableFeatureTypes = await zx.fetch(`${FEATURE_TYPES_API_URL}?` + listAvailableParams, {
    method: 'GET',
  });
  const availableLayers = await getAvailableFeatureTypes.json();
  const availableNames = availableLayers.filter((layer) => {
    const isInBlacklist = FEATURE_TYPES_STRINGS_BLACK_LIST.includes(layer.name);
    const matchesRegexBlacklist = FEATURE_TYPES_REGEX_BLACK_LIST.some((regex) => (new RegExp(regex)).test(layer.name));
    return !isInBlacklist && !matchesRegexBlacklist;
  }).map((layer) => layer.name);
  logger.info({ msg: `availableNames: ${availableNames}` });
  await zx.sleep(1000);
  return availableNames;
}

async function getConfiguredFeatureTypes() {
  const listConfiguredParams = new URLSearchParams();
  listConfiguredParams.append('list', 'configured');
  const getConfiguredFeatureTypes = await zx.fetch(`${FEATURE_TYPES_API_URL}?` + listConfiguredParams, {
    method: 'GET',
  });
  const configuredLayers = await getConfiguredFeatureTypes.json();
  const configuredNames = configuredLayers.map((layer) => layer.name);

  logger.debug({ msg: `configuredNames: ${configuredNames}` });
  await zx.sleep(1000);
  return configuredNames;
}

async function mapNativeNameToLayerName(availableNames) {
  const configuredLayers = await getConfiguredFeatureTypes();
  const layersMapping = await Promise.all(availableNames.map(async (nativeName) => {
    const { productId, productType } = splitProductIdAndType(nativeName);
    try {
      const response = await zx.fetch(CATALOG_MANAGER_FIND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ metadata: { productId, productType } }),
      });
      const layerDetails = await response.json();
      if (layerDetails.length !== 1) {
        throw new Error(`Expected exactly one result for ${nativeName}, but got ${layerDetails.length}`);
      }
      const fetchedProductId = layerDetails[0].metadata.productId;
      const fetchedProductType = layerDetails[0].metadata.productType;

      const layerName = `${fetchedProductId}-${fetchedProductType}`;

      /* getAvailable returns the tableNames. 
      Due to the fact that we are publishing the features in a different name from 
      the tableName, the available returns  some already published layers
      so we want to get the configuredLayers and check that the layer name is not in it*/
      if (!configuredLayers.includes(layerName)) {
        return { nativeName, layerName };
      }
      return undefined;

    } catch (error) {
      logger.error(`Error processing ${nativeName}: ${error.message}`);
      return undefined;
    }
  }));
  //filter out undefined values returned from the mapping
  return layersMapping.filter((result) => result);
}


function splitProductIdAndType(name) {
  const lastUnderscoreIndex = name.lastIndexOf('_');

  const productId = name.slice(0, lastUnderscoreIndex);
  const productType = findProductType(name.slice(lastUnderscoreIndex + 1));

  return { productId, productType };
}

function findProductType(input) {
  // Normalize the input by converting it to lowercase
  const formattedInput = input.toLowerCase();

  // Loop through the enum values
  return Object.values(ProductType).find(value => {
    // Normalize the enum value by converting it to lowercase and removing underscores
    const normalizedEnumValue = value.toLowerCase().replace(/_/g, '');
    return normalizedEnumValue === formattedInput;
  });
}


function printAvocado() {
  console.log(`
                                                                                                    
                                                                                                    
                                                                                                    
  ........  .............................                                    
  ........  .............::::............                                    
  ........  ..........+***++***++*+**=.......                                   
.......... ........*+++*+=--------+****+=....     .                             
.................***+=----------------+***+.........                            
.......... ....-**+=--------------------++*+:.......                            
..............+**+------:::::::::.:-------***:......                            
.............+**=-----::::.::.::::::.:-----+*+-.....                            
............=*++-----.:::::::::::::::::-----+**:....                            
..........-**+-----.:::::::::::::::::::-----++*...                             
..........***-----::::::::::::::::::::::-----**+..                             
.........***-=---.:::::::::::::::::::::::----=**=. .                           
........=**+----::::::::::::::::::::::::::----+*+........                      
........**+----::.:::::::::::::::::::::.::-----***.......                      
.......++*-----::::::::::::::::::::::::::::----=+*=.......                     
......=+*=----::.:--::::::::::::::::.:--::::----++*:......                     
.....=**+----:::+%%=.%:.:::::::::.::@%@..#.:-----*+*.....                      
....-+++-----:..%%-*@%+.:::::::::.:=%%.@@%::.-----*+*....                      
...-+*+-----:::::@@@%#::.::::::::::.*%%@@-::::-----+*+...                      
..-*++-----:::.:::::.:::::::.::::::..:::::::..:-----++*......                  
..***-----.::::::::::.::-%...::.%+::::::::::::::-----***.....                  
.***-----..:::::::::::::::+@%%@*:::::::::::::::::----=***.... ..               
.+**=----::::::::::::::::::::.:..::::::::::::::::::----++*-... ...              
-**+----::::::::::::.:..:...::.::.:::::.:::::::::::-----+**.......              
.+**-----.:::::::::::::.::**#**#***+:::.::::::::::::.----=**=......              
:*++----:.::::::::::.::#******+++++***#::::.::::::::.:=---+**......              
=+*=----:::::::::::.:*********++++++++***::.::::::::.:----+**:.....              
***----:::::::::::.=************++++++++**-:.:::::::::-----**=.....              
***----:::::::::::+***************+++++++**-.::::::::.-----**=.. ..              
*+*----::::::.::::#******************++++*#*::::::::::-----**=.. ..              
+**-----:::::::::+#***********************#*-:::::::.:----=**=.. ..              
+*+-----:.:::::.:+##************************=:::::::.:----+**:....               
-**+----:::::::.-=###***********************-::::::::-----**+......              
:+**-----::::::.::###*********************#*.::::::::----=**=......              
:-**+-----:::::.:--####******************#*::::::.::-----***.......              
.::+**+-----.::::::--######*************#*#:::::::.:-----+++:...                  
..::+*+=-----:::::.-::########**********#*..:.:::::-----+*+:. ..                  
..:::+*++------::::::--:*##############+:::::::::------+**-.                      
...:::=+**=------::::::-:::=*#####**=::::.:::::------=+**:...                     
.:...:::***+-------:.:::::::::::::::::.::::.:-------*+++.....                     
.....::::=***+--------:::::::::::::::::::---------+*+*:.....                      
.......::::+*+*+------------::::::::-----------=*++*:.......                      
.........::::=***++=------------------------=+*+**:..........                     
............:::::=**+**+=----------------=+**++*-......                            
..............::::::-++*+**+******++++++**+++:........                             
.......... ...:::::::::=+***++*****+=:::...........                             
...............::::::::::::::::::...............                             
        ...............                                              
        .............                                                
                                                                     
                                                                     
`);

}
