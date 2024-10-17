import * as zx from 'zx';
import { strictEqual as assertEqual, ok as assertOk } from 'assert';
import fs from 'fs';
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

const GEOSERVER_BASE_URL = env.get('GEOSERVER_BASE_URL').default('http://localhost:8080/geoserver').asString();

const GEOSERVER_API_BASE_URL = env.get('GEOSERVER_API_BASE_URL').default('http://localhost:8081').asString();

const WORKSPACE_NAME = env.get('WORKSPACE_NAME').default('string1').asString();
const DATASTORE_NAME = env.get('DATASTORE_NAME').default('string').asString();

const WORKSPACE_API_URL = `${GEOSERVER_API_BASE_URL}/workspaces`;
const DATA_STORE_API_URL = `${GEOSERVER_API_BASE_URL}/dataStores/${WORKSPACE_NAME}`;
const FEATURE_TYPES_API_URL = `${GEOSERVER_API_BASE_URL}/featureTypes/${WORKSPACE_NAME}/${DATASTORE_NAME}`;

const GLOBAL_WFS_SETTING_API_URL = `${GEOSERVER_API_BASE_URL}/rest/services/wfs/settings`;

// *******************************************************************

// Loop until validate geoserver is up
await checkGeoserverIsUp();


// check if a workspace exists , if not , create one
await checkGeoserverIsUp();
const workspaceExists = await checkWorkspace();
if(!workspaceExists){
  await createWorkspace();
}
console.log(`workspaceExists: ${workspaceExists}`);
const dataStoreExists = await checkDataStore();

console.log(`dataStoreExists: ${dataStoreExists}`);
if(!dataStoreExists){
  await createDataStore();
}

await checkFeatureTypes();

// Stage 1
// This stage will send api request to delete workspace if already exists
// await deleteWorkspaceIfExists();

// // Stage 2
// // This stage will send api request to create workspace
// await createWorkspace();

// // Stage 3
// // This stage will send api request to create data-store (connection to pg)
// await createPgDatastore();

// // Stage 4
// // This stage will send api request to create wfs layer feature
// await createWfsLayer();

// Stage 5
// This stage will send api request to change wfs as read only service
//await setWfsAsBasic();

// Complete generating env, will loop as void mode
logger.info({ msg: `Env ready: Complete generating new WFS layer:` });
//setInterval(() => {}, 1000000);

/**
 * This function will check periodically till detect that geoserver is up and than exit the method - TODO: go to readiness through service
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
      await zx.sleep(5000);
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
  // logger.info({
  //   msg: `1. Complete validate & clean (if exists) workspace ${POLYGON_PARTS_WORKSPACE_NAME} with status code: ${deleteWorkspaceResp.status}`,
  // });

  await zx.sleep(1000);
}

/**
 * Send api to check if the workspace exists, if not create one
 */
async function checkDataStore() {
  const getDataStoreResp = await zx.fetch(`${DATA_STORE_API_URL}/${DATASTORE_NAME}`, {
    method: 'GET',
  });

  logger.info({ msg: await getDataStoreResp.text() });

  await zx.sleep(1000);
  if (getDataStoreResp.status === 200) {
    return true;
  } else if (getDataStoreResp.status === 404) {
    return false;
  } else {
    throw new Error(`Unexpected status code: ${getDataStoreResp.status}`);
  }
  // logger.info({
  //   msg: `1. Complete validate & clean (if exists) workspace ${POLYGON_PARTS_WORKSPACE_NAME} with status code: ${deleteWorkspaceResp.status}`,
  // });
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
  // logger.info({
  //   msg: `1. Complete validate & clean (if exists) workspace ${POLYGON_PARTS_WORKSPACE_NAME} with status code: ${deleteWorkspaceResp.status}`,
  // });

  await zx.sleep(1000);
}

/**
 * compare get list configured and get available - if create feature types of all that are available and not configured
 */
async function checkFeatureTypes() {
  const listAvailableParams = new URLSearchParams();
  listAvailableParams.append('list', 'available');

  const listConfiguredParams = new URLSearchParams();
  listConfiguredParams.append('list', 'configured');

  const getAvailableFeatureTypes = await zx.fetch(`${FEATURE_TYPES_API_URL}?` + listAvailableParams, {
    method: 'GET',
  });

  const availableLayers = await getAvailableFeatureTypes.json();
  logger.info({ msg: availableLayers });

  const getConfiguredFeatureTypes = await zx.fetch(`${FEATURE_TYPES_API_URL}?` + listConfiguredParams, {
    method: 'GET',
  });
  const configuredLayers = await getConfiguredFeatureTypes.json();

  logger.info({ msg: configuredLayers });

  // Extract layer names from both arrays
  const availableNames = availableLayers.map((layer) => layer.name);
  const configuredNames = configuredLayers.map((layer) => layer.name);

  // Case: Available and Configured are the same
  if (availableNames.length === configuredNames.length && availableNames.every((name) => configuredNames.includes(name))) {
    logger.info({ msg: 'All available Layers are configured ' });
    return;
  }

  // Case: Available is empty
  if (availableNames.length === 0) {
    logger.warn({ msg: `NOTE! There are no available layers ` });
    //return;
  }

  //Case: Some configured layers are not available
  const notInAvailable = configuredNames.filter((name) => !availableNames.includes(name));
  if (notInAvailable.length > 0) {
    const message = `Some configured layers are not available in DB:  ${notInAvailable}`;
    logger.error(message);
    throw new Error(message);
  }

  // Case: Available has values and Configured is empty - iterate on available and post them
  if (availableNames.length > 0 && configuredNames.length === 0) {
    logger.debug({ msg: `there are no configured layers but there are available - posting all available` });
    //TODO: iterate over name lists and create featureLayers
    // Create an array of POST request promises for each availableName
    const postRequests = availableNames.map(async (name) =>{
      try {
        const response = await zx.fetch(FEATURE_TYPES_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nativeName:name }),
        });
  
        // Check if the response was successful (status 2xx)
        if (!response.ok) {
          throw new Error(`Failed to POST for ${name}: ${response.status} ${response.statusText}`);
        }
  
        console.log(`Successfully posted for ${name}`);
      } catch (error) {
        // Log detailed error message for the failed request
        console.error(`Error posting for ${name}:`, error);
        throw error; // Re-throw the error to ensure it is caught by Promise.all
      }
    });

    try {
      // Wait for all promises to resolve using Promise.all()
      await Promise.all(postRequests);

      // If all succeed, notify success
      console.log('All POST requests were successful');
    } catch (error) {
      // If any request fails, handle the error
      console.error('One or more POST requests failed', error);
    }
  }

  await zx.sleep(1000);
}

/**
 * Send api request for global settings - restrict WFS protocol read-only (BASIC)
 */
async function setWfsAsBasic() {
  const setBody = {
    wfs: {
      serviceLevel: 'BASIC',
    },
  };

  const setWfsResp = await zx.fetch(GLOBAL_WFS_SETTING_API_URL, {
    method: 'PUT',
    body: JSON.stringify(setBody),
    headers: {
      Authorization: 'Basic ' + btoa(GEOSERVER_USER + ':' + GEOSERVER_PASS),
      'Content-Type': 'application/json',
    },
  });

  logger.debug({ msg: await setWfsResp.text() });
  assertEqual(setWfsResp.status, 200);
  logger.info({
    msg: `5. Changed WFS service level into 'BASIC' - read only mode with status code: ${setWfsResp.status}`,
  });
}
