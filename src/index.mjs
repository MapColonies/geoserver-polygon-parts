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

const GEOSERVER_USER = env.get('GEOSERVER_USER').default('admin').asString();
const GEOSERVER_PASS = env.get('GEOSERVER_PASS').default('geoserver').asString();

const DATA_STORE_CREDENTIALS = {
  host: env.get('DATA_STORE_HOST').default('localhost').asString(),
  port: env.get('DATA_STORE_PORT').default('5432').asString(),
  database: env.get('DATA_STORE_DATABASE').default('postgres').asString(),
  user: env.get('DATA_STORE_USER').default('postgres').asString(),
  password: env.get('DATA_STORE_PASSWORD').default('postgres').asString(),
  dbtype: env.get('DATA_STORE_DBTYPE').default('postgis').asString(),
  schema: env.get('DATA_STORE_SCHEMA').default('polygon_parts').asString(),
  ssl: env.get('DATA_STORE_SSL').default('DISABLE').asString(),
};

const GEOSERVER_BASE_URL = env.get('GEOSERVER_BASE_URL').default('http://localhost:8080/geoserver').asString();

const POLYGON_PARTS_WORKSPACE_NAME = env.get('POLYGON_PARTS_WORKSPACE_NAME').default('polygon_parts').asString();

const WORKSPACE_API_URL = `${GEOSERVER_BASE_URL}/rest/workspaces`;
const GLOBAL_WFS_SETTING_API_URL = `${GEOSERVER_BASE_URL}/rest/services/wfs/settings`;
const DATA_STORE_API_URL = `${WORKSPACE_API_URL}/${POLYGON_PARTS_WORKSPACE_NAME}/datastores`;
const DATA_STORE_NAME = env.get('DATA_STORE_NAME').default('polygon_parts').asString();

const FEATURE_TYPES_API_URL = `${DATA_STORE_API_URL}/${DATA_STORE_NAME}/featuretypes`;
const LAYER_BODY_JSON = './artifacts/polygonPartSpec.json';
const MAX_FEATURES = env.get('MAX_FEATURES').default('0').asInt();
const NUM_DECIMALS = env.get('NUM_DECIMALS').default('0').asInt();
const LAYER_TITLE_NAME = env.get('LAYER_TITLE_NAME').default('polygon_parts').asString();

// *******************************************************************

// Loop until validate geoserver is up
await checkGeoserverIsUp();

// Stage 1
// This stage will send api request to delete workspace if already exists
await deleteWorkspaceIfExists();

// Stage 2
// This stage will send api request to create workspace
await createWorkspace();

// Stage 3
// This stage will send api request to create data-store (connection to pg)
await createPgDatastore();

// Stage 4
// This stage will send api request to create wfs layer feature
await createWfsLayer();

// Stage 5
// This stage will send api request to change wfs as read only service
await setWfsAsBasic();

// Complete generating env, will loop as void mode
logger.info({ msg: `Env ready: Complete generating new WFS layer: ${LAYER_TITLE_NAME}` });
setInterval(() => {}, 1000000);

/**
 * This function will check periodically till detect that geoserver is up and than exit the method
 */
async function checkGeoserverIsUp() {
  while (true) {
    try {
      const responseFromGs = await zx.fetch(`${GEOSERVER_BASE_URL}`, {
        method: 'GET',
        headers: {
          Authorization: 'Basic ' + btoa(GEOSERVER_USER + ':' + GEOSERVER_PASS),
        },
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
 * Send api to delete configured geoserver workspace - do nothing if not exists
 */
async function deleteWorkspaceIfExists() {
  const deleteApiParams = new URLSearchParams();
  deleteApiParams.append('recurse', true);

  const deleteWorkspaceResp = await zx.fetch(`${WORKSPACE_API_URL}/${POLYGON_PARTS_WORKSPACE_NAME}?` + deleteApiParams, {
    method: 'DELETE',
    headers: {
      Authorization: 'Basic ' + btoa(GEOSERVER_USER + ':' + GEOSERVER_PASS),
    },
  });

  logger.debug({ msg: await deleteWorkspaceResp.text() });

  assertOk(deleteWorkspaceResp.status === 200 || deleteWorkspaceResp.status === 404);
  logger.info({
    msg: `1. Complete validate & clean (if exists) workspace ${POLYGON_PARTS_WORKSPACE_NAME} with status code: ${deleteWorkspaceResp.status}`,
  });

  await zx.sleep(1000);
}

/**
 * Send api request to create new workspace
 */
async function createWorkspace() {
  const polygonPartWorkspaceBody = {
    workspace: {
      name: POLYGON_PARTS_WORKSPACE_NAME,
    },
  };

  const createWorkspaceResp = await zx.fetch(WORKSPACE_API_URL, {
    method: 'POST',
    body: JSON.stringify(polygonPartWorkspaceBody),
    headers: {
      Authorization: 'Basic ' + btoa(GEOSERVER_USER + ':' + GEOSERVER_PASS),
      'Content-Type': 'application/json',
    },
  });

  logger.debug({ msg: await createWorkspaceResp.text() });
  assertEqual(createWorkspaceResp.status, 201);
  logger.info({
    msg: `2. Complete creation workspace ${POLYGON_PARTS_WORKSPACE_NAME} with status code: ${createWorkspaceResp.status}`,
  });

  await zx.sleep(1000);
}

/**
 * Send api request to connect and create db connection by datastore of postgis type
 */
async function createPgDatastore() {
  const dataStoreCreationBody = {
    dataStore: {
      name: DATA_STORE_NAME,
      description: 'This store connect to polygon parts db',
      connectionParameters: {
        entry: [
          { '@key': 'host', $: DATA_STORE_CREDENTIALS.host },
          { '@key': 'port', $: DATA_STORE_CREDENTIALS.port },
          { '@key': 'database', $: DATA_STORE_CREDENTIALS.database },
          { '@key': 'user', $: DATA_STORE_CREDENTIALS.user },
          { '@key': 'passwd', $: DATA_STORE_CREDENTIALS.password },
          { '@key': 'dbtype', $: DATA_STORE_CREDENTIALS.dbtype },
          { '@key': 'schema', $: DATA_STORE_CREDENTIALS.schema },
          { '@key': 'Evictor run periodicity', $: '300' },
          { '@key': 'Max open prepared statements', $: '50' },
          { '@key': 'encode functions', $: 'true' },
          { '@key': 'Batch insert size', $: '1' },
          { '@key': 'preparedStatements', $: 'false' },
          { '@key': 'Loose bbox', $: 'true' },
          { '@key': 'SSL mode', $: DATA_STORE_CREDENTIALS.ssl },
          { '@key': 'Estimated extends', $: 'true' },
          { '@key': 'fetch size', $: '1000' },
          { '@key': 'Expose primary keys', $: 'false' },
          { '@key': 'validate connections', $: 'true' },
          { '@key': 'Support on the fly geometry simplification', $: 'true' },
          { '@key': 'Connection timeout', $: '20' },
          { '@key': 'create database', $: 'false' },
          {
            '@key': 'Method used to simplify geometries',
            $: 'PRESERVETOPOLOGY',
          },
          { '@key': 'min connections', $: '1' },
          { '@key': 'max connections', $: '10' },
          { '@key': 'Evictor tests per run', $: '3' },
          { '@key': 'Test while idle', $: 'true' },
          { '@key': 'Max connection idle time', $: '300' },
        ],
      },
    },
  };

  const createDataStoreResp = await zx.fetch(DATA_STORE_API_URL, {
    method: 'POST',
    body: JSON.stringify(dataStoreCreationBody),

    headers: {
      Authorization: 'Basic ' + btoa(GEOSERVER_USER + ':' + GEOSERVER_PASS),
      'Content-Type': 'application/json',
    },
  });

  logger.debug({ msg: await createDataStoreResp.text() });
  assertEqual(createDataStoreResp.status, 201);
  logger.info({
    msg: `3. Complete creation data-store ${DATA_STORE_NAME} with status code: ${createDataStoreResp.status}`,
  });

  await zx.sleep(1000);
}

/**
 * Send api request with layer json configuration and create new WFS layer according dbstore
 */
async function createWfsLayer() {
  const layerBody = JSON.parse(fs.readFileSync(LAYER_BODY_JSON));
  layerBody['featureType']['maxFeatures'] = MAX_FEATURES;
  layerBody['featureType']['numDecimals'] = NUM_DECIMALS;
  layerBody['featureType']['title'] = LAYER_TITLE_NAME;

  const createLayerResp = await zx.fetch(FEATURE_TYPES_API_URL, {
    method: 'POST',
    body: JSON.stringify(layerBody),
    headers: {
      Authorization: 'Basic ' + btoa(GEOSERVER_USER + ':' + GEOSERVER_PASS),
      'Content-Type': 'application/json',
    },
  });

  logger.debug({ msg: await createLayerResp.text() });
  assertEqual(createLayerResp.status, 201);
  logger.info({
    msg: `4. Complete creation layer ${LAYER_TITLE_NAME} with status code: ${createLayerResp.status}`,
  });
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
