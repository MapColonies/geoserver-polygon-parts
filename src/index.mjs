import * as zx from 'zx';
import { strictEqual as assertEqual, ok as assertOk } from 'assert';
import env from 'env-var';
import 'dotenv/config';
import jsLogger from '@map-colonies/js-logger';

// *******************************************************************
// *************** initialization of environ variables ***************
// *******************************************************************
const logger = jsLogger.default({
  level: env.get('LOG_LEVEL').default('info').asString(),
  prettyPrint: env.get('LOG_PRETTY').default('false').asBool(),
});

const GEOSERVER_BASE_URL = env.get('GEOSERVER_BASE_URL').asString();

const GEOSERVER_API_BASE_URL = env.get('GEOSERVER_API_BASE_URL').asString();

const WORKSPACE_NAME = env.get('WORKSPACE_NAME').asString();
const DATASTORE_NAME = env.get('DATASTORE_NAME').asString();

const FEATURE_TYPES_BLACK_LIST = env.get('FEATURE_TYPES_BLACK_LIST').asArray();

const WORKSPACE_API_URL = `${GEOSERVER_API_BASE_URL}/workspaces`;
const DATA_STORE_API_URL = `${GEOSERVER_API_BASE_URL}/dataStores/${WORKSPACE_NAME}`;
const FEATURE_TYPES_API_URL = `${GEOSERVER_API_BASE_URL}/featureTypes/${WORKSPACE_NAME}/${DATASTORE_NAME}`;

const GLOBAL_WFS_SETTING_API_URL = `${GEOSERVER_API_BASE_URL}/services/wfs/settings`;

// *******************GEOSERVER INITIALIZATION************************************************

// Loop until validate geoserver is up
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

// *******************************************************************

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
      await zx.sleep(60000);
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
  // Extract layer names from both arrays
  const availableNames = await getAvailableFeatureTypes();
  const configuredNames = await getConfiguredFeatureTypes();

  if (availableNames.length === 0) {
    logger.info(' There are no layers to publish! ');
  } else {
    const postRequests = availableNames.map(async (name) => {
      try {
        const response = await zx.fetch(FEATURE_TYPES_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nativeName: name }),
        });
        if (!response.ok) {
          throw new Error(`Failed to POST for ${name}: ${response.status} ${response.statusText}`);
        }
        logger.info(`Successfully posted for ${name}`);
      } catch (error) {
        // Log detailed error message for the failed request
        logger.error(`Error posting for ${name}:`, error);
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

  logger.debug({ msg: await wfsModeResponse.text() });
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
  logger.debug({ msg: `availableLayers: ${availableLayers}` });
  const availableNames = availableLayers.filter((layer) => !FEATURE_TYPES_BLACK_LIST.includes(layer.name)).map((layer) => layer.name);
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
