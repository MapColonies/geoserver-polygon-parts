import * as chokidar from 'chokidar';
import { stat } from 'fs/promises';
import * as zx from 'zx';
import { ok as assertOk } from 'assert';
import env from 'env-var';
import 'dotenv/config';
import jsLogger from '@map-colonies/js-logger';
import { ProductType } from '@map-colonies/mc-model-types';
import { createGeoserverClient } from './geoserverClient.mjs';

// *******************************************************************
// *************** initialization of environ variables ***************
// *******************************************************************
const logger = jsLogger.default({
  level: env.get('LOG_LEVEL').default('info').asString(),
  prettyPrint: env.get('LOG_PRETTY').default('false').asBool(),
});

const GEOSERVER_LOCAL_PORT = '8080'; // Default port for local GeoServer instance, hard coded in deployment.yaml containerPort
const POLLING_INTERVAL_MS = env.get('POLLING_INTERVAL_MS').default(3000).asIntPositive(); // Polling interval in milliseconds
const GEOSERVER_BASE_URL = env.get('GEOSERVER_BASE_URL').default('http://localhost:8080/geoserver').asString();
const GEOSERVER_LOCAL_BASE_URL = `http://localhost:${GEOSERVER_LOCAL_PORT}/geoserver`;

const CATALOG_MANAGER_SERVICE_URL = env.get('CATALOG_MANAGER_SERVICE_URL').default('http://localhost:8082').asString();

const WORKSPACE_NAME = env.get('WORKSPACE_NAME').default('polygonParts').asString();
const DATASTORE_NAME = env.get('DATASTORE_NAME').default('polygonParts').asString();
const GEOSERVER_DATA_DIR = env.get('GEOSERVER_DATA_DIR').default('/data_dir').asString();
const DATASTORE_PATH = `${GEOSERVER_DATA_DIR}/workspaces/${WORKSPACE_NAME}/${DATASTORE_NAME}`;

const FEATURE_TYPES_STRINGS_BLACK_LIST = env.get('FEATURE_TYPES_STRINGS_BLACK_LIST').default(['*history$']).asJson();
const FEATURE_TYPES_REGEX_BLACK_LIST = env
  .get('FEATURE_TYPES_REGEX_BLACK_LIST')
  .default(['migrations', 'history', 'polygon_parts', 'test_view'])
  .asJson();

// injected into the side-car from the geoserver secret
const GEOSERVER_USER = env.get('GEOSERVER_USER').default('admin').asString();
const GEOSERVER_PASS = env.get('GEOSERVER_PASS').default('geoserver').asString();
const WFS_MAX_FEATURES = env.get('WFS_MAX_FEATURES').default(1000).asIntPositive();
const GEOSERVER_LOCAL_RELOAD_URL = `${GEOSERVER_LOCAL_BASE_URL}/rest/reload`;
const CATALOG_MANAGER_FIND_URL = `${CATALOG_MANAGER_SERVICE_URL}/records/find`;

// polygon parts database, used only when the data store has to be created
const DB_CONNECTION = {
  host: env.get('DB_HOST').default('localhost').asString(),
  port: env.get('DB_PORT').default('5432').asString(),
  dbName: env.get('DB_NAME').default('postgres').asString(),
  schema: env.get('DB_SCHEMA').default('polygon_parts').asString(),
  dbType: env.get('DB_TYPE').default('postgis').asString(),
  sslMode: env.get('DB_SSL_MODE').default('DISABLE').asString(),
  username: env.get('DB_USERNAME').default('postgres').asString(),
  password: env.get('DB_PASSWORD').default('postgres').asString(),
};

const geoserverClient = createGeoserverClient({
  baseUrl: GEOSERVER_BASE_URL,
  auth: { username: GEOSERVER_USER, password: GEOSERVER_PASS },
  workspace: WORKSPACE_NAME,
  dataStore: DATASTORE_NAME,
});

// *******************GEOSERVER INITIALIZATION************************************************

//Loop until validate geoserver is up
await checkGeoserverIsUp();

//set wfs mode
await setWfsAsBasic();

//check if workspace exists, if it doesnt - create one
const workspaceExists = await geoserverClient.workspaceExists();
if (!workspaceExists) {
  await geoserverClient.createWorkspace();
  logger.info({ msg: `Created workspace: ${WORKSPACE_NAME} successfully` });
  await zx.sleep(1000);
}

//check if dataStore exists, if it doesnt - create one
const dataStoreExists = await geoserverClient.dataStoreExists();
if (!dataStoreExists) {
  await geoserverClient.createDataStore(DB_CONNECTION);
  logger.info({ msg: `Created dataStore: ${DATASTORE_NAME} successfully` });
  await zx.sleep(1000);
}

//check featureLayers and publish them if needed
await checkFeatureTypes();

logger.info({ msg: `Env ready: Completed Geoserver initialization` });

//listen to nfs changes
if (await isDataDirExists()) {
  const watcher = chokidar.watch(DATASTORE_PATH, {
    persistent: true,
    ignoreInitial: true,
    usePolling: true, // use polling to detect changes - optimized for NFS
    interval: POLLING_INTERVAL_MS, // how often to poll (in ms)
    binaryInterval: POLLING_INTERVAL_MS,
  });

  logger.info({ msg: `starts watching ${DATASTORE_PATH} path` });
  watcher
    .on('add', async (path) => {
      logger.info({ msg: `File added: ${path}` });
      await reloadGeoServer();
    })
    .on('unlink', async (path) => {
      logger.info({ msg: `File removed: ${path}` });
      await reloadGeoServer();
    })
    .on('ready', () => logger.info('Initial scan complete. Ready for changes'))
    .on('error', (error) => logger.error({ msg: `Watcher error: ${error}` }));
} else {
  logger.error({ msg: `Data directory ${DATASTORE_PATH} does not exist or is not accessible` });
  throw new Error(`Data directory ${DATASTORE_PATH} does not exist or is not accessible`);
}
// *******************************************************************

async function reloadGeoServer() {
  try {
    logger.info({ msg: `Triggering geoserver reload on ${GEOSERVER_LOCAL_RELOAD_URL}...` });
    await zx.fetch(`${GEOSERVER_LOCAL_RELOAD_URL}`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${GEOSERVER_USER}:${GEOSERVER_PASS}`).toString('base64'),
      },
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
    const isDirectory = stats.isDirectory();
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
        await geoserverClient.createFeatureType({ nativeName: entity.nativeName, name: entity.layerName });
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
  await geoserverClient.setWfsSettings({ serviceLevel: 'BASIC', maxFeatures: WFS_MAX_FEATURES });
  logger.info({
    msg: `Set WFS service level into 'BASIC' - read only mode, with max features: ${WFS_MAX_FEATURES}`,
  });
}

async function getAvailableFeatureTypes() {
  const availableTableNames = await geoserverClient.getFeatureTypeNames('available');
  const availableNames = availableTableNames.filter((name) => {
    const isInBlacklist = FEATURE_TYPES_STRINGS_BLACK_LIST.includes(name);
    const matchesRegexBlacklist = FEATURE_TYPES_REGEX_BLACK_LIST.some((regex) => new RegExp(regex).test(name));
    return !isInBlacklist && !matchesRegexBlacklist;
  });
  logger.info({ msg: `availableNames: ${availableNames}` });
  await zx.sleep(1000);
  return availableNames;
}

async function getConfiguredFeatureTypes() {
  const configuredNames = await geoserverClient.getFeatureTypeNames('configured');

  logger.debug({ msg: `configuredNames: ${configuredNames}` });
  await zx.sleep(1000);
  return configuredNames;
}

async function mapNativeNameToLayerName(availableNames) {
  const configuredLayers = await getConfiguredFeatureTypes();
  const layersMapping = await Promise.all(
    availableNames.map(async (nativeName) => {
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
    })
  );
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
  return Object.values(ProductType).find((value) => {
    // Normalize the enum value by converting it to lowercase and removing underscores
    const normalizedEnumValue = value.toLowerCase().replace(/_/g, '');
    return normalizedEnumValue === formattedInput;
  });
}
