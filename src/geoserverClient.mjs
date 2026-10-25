import { createRequire } from 'node:module';

// raster-shared is published as commonjs only (its exports map has no "import" condition)
const { buildPolygonPartsFeatureTypeBody, parseFeatureTypeNames } = createRequire(import.meta.url)('@map-colonies/raster-shared');

/**
 * Body of POST /rest/workspaces/{workspace}/datastores - a postgis data store over the polygon parts schema
 */
export function buildDataStoreBody(name, connection) {
  const entry = [
    { '@key': 'host', $: connection.host },
    { '@key': 'port', $: String(connection.port) },
    { '@key': 'database', $: connection.dbName },
    { '@key': 'user', $: connection.username },
    { '@key': 'dbtype', $: connection.dbType },
    { '@key': 'schema', $: connection.schema },
    { '@key': 'SSL mode', $: connection.sslMode },
    { '@key': 'validate connections', $: 'true' },
    { '@key': 'Expose primary keys', $: 'true' },
  ];
  if (connection.password != null && connection.password.trim() !== '') {
    entry.push({ '@key': 'passwd', $: connection.password });
  }

  return {
    dataStore: {
      name,
      enabled: false,
      disableOnConnFailure: true,
      connectionParameters: { entry },
    },
  };
}

/**
 * Client for the geoserver REST API, scoped to the polygon parts workspace and data store
 */
export function createGeoserverClient({ baseUrl, auth, workspace, dataStore }) {
  const restUrl = `${baseUrl}/rest`;
  const workspaceUrl = `${restUrl}/workspaces/${workspace}`;
  const dataStoreUrl = `${workspaceUrl}/datastores/${dataStore}`;
  const featureTypesUrl = `${dataStoreUrl}/featuretypes`;
  const headers = {
    Authorization: 'Basic ' + Buffer.from(`${auth.username}:${auth.password}`).toString('base64'),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  async function request(method, url, body) {
    return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  async function expectStatus(response, status, action) {
    if (response.status !== status) {
      throw new Error(`Failed to ${action}: ${response.status} ${await response.text()}`);
    }
  }

  async function exists(url, resource) {
    const response = await request('GET', url);
    if (response.status === 200) {
      return true;
    }
    if (response.status === 404) {
      return false;
    }
    throw new Error(`Unexpected status code ${response.status} while checking ${resource}`);
  }

  return {
    async setWfsSettings({ serviceLevel, maxFeatures }) {
      const response = await request('PUT', `${restUrl}/services/wfs/settings`, { wfs: { serviceLevel, maxFeatures } });
      await expectStatus(response, 200, 'set wfs settings');
    },

    async workspaceExists() {
      return exists(workspaceUrl, `workspace ${workspace}`);
    },

    async createWorkspace() {
      const response = await request('POST', `${restUrl}/workspaces`, { workspace: { name: workspace } });
      await expectStatus(response, 201, `create workspace ${workspace}`);
    },

    async dataStoreExists() {
      return exists(dataStoreUrl, `data store ${dataStore}`);
    },

    async createDataStore(connection) {
      const response = await request('POST', `${workspaceUrl}/datastores`, buildDataStoreBody(dataStore, connection));
      await expectStatus(response, 201, `create data store ${dataStore}`);
    },

    async getFeatureTypeNames(list) {
      const response = await request('GET', `${featureTypesUrl}?${new URLSearchParams({ list })}`);
      await expectStatus(response, 200, `list ${list} feature types`);
      return parseFeatureTypeNames(await response.json(), list);
    },

    async createFeatureType({ nativeName, name }) {
      const response = await request('POST', featureTypesUrl, buildPolygonPartsFeatureTypeBody({ nativeName, name }));
      await expectStatus(response, 201, `publish table ${nativeName} as layer ${name}`);
    },
  };
}
