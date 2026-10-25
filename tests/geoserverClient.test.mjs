import { after, before, beforeEach, describe, it } from 'node:test';
import { deepStrictEqual, rejects, strictEqual } from 'node:assert';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { buildDataStoreBody, createGeoserverClient } from '../src/geoserverClient.mjs';

const { buildPolygonPartsFeatureTypeBody } = createRequire(import.meta.url)('@map-colonies/raster-shared');

const auth = { username: 'testUser', password: 'testPassword' };
const expectedAuthorization = `Basic ${Buffer.from('testUser:testPassword').toString('base64')}`;
const workspace = 'polygonParts';
const dataStore = 'polygonPartsDS';
const connection = {
  host: 'db-host',
  port: '5432',
  dbName: 'raster-dev',
  schema: 'polygon_parts',
  dbType: 'postgis',
  sslMode: 'DISABLE',
  username: 'dbUser',
  password: 'dbPassword',
};

// fake geoserver: replies with the next queued response and records every request it gets
let requests;
let responses;
let server;
let client;

const reply = (status, body) => responses.push({ status, body });

before(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: raw === '' ? undefined : JSON.parse(raw) });
      const { status, body } = responses.shift() ?? { status: 500 };
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://localhost:${server.address().port}/geoserver`;
  client = createGeoserverClient({ baseUrl, auth, workspace, dataStore });
});

after(() => server.close());

beforeEach(() => {
  requests = [];
  responses = [];
});

describe('geoserver client', () => {
  it('should authenticate every request and ask for json', async () => {
    reply(404);

    await client.workspaceExists();

    strictEqual(requests[0].headers.authorization, expectedAuthorization);
    strictEqual(requests[0].headers.accept, 'application/json');
  });

  it('should set the wfs service level and max features', async () => {
    reply(200);

    await client.setWfsSettings({ serviceLevel: 'BASIC', maxFeatures: 1000 });

    strictEqual(requests[0].method, 'PUT');
    strictEqual(requests[0].url, '/geoserver/rest/services/wfs/settings');
    deepStrictEqual(requests[0].body, { wfs: { serviceLevel: 'BASIC', maxFeatures: 1000 } });
  });

  it('should throw when geoserver rejects the wfs settings', async () => {
    reply(500);

    await rejects(client.setWfsSettings({ serviceLevel: 'BASIC', maxFeatures: 1000 }));
  });

  it('should tell whether the workspace exists', async () => {
    reply(200, { workspace: { name: workspace } });
    reply(404);

    strictEqual(await client.workspaceExists(), true);
    strictEqual(await client.workspaceExists(), false);
    strictEqual(requests[0].url, `/geoserver/rest/workspaces/${workspace}`);
  });

  it('should throw on an unexpected status when checking the workspace', async () => {
    reply(401);

    await rejects(client.workspaceExists(), /401/);
  });

  it('should create the workspace', async () => {
    reply(201);

    await client.createWorkspace();

    strictEqual(requests[0].method, 'POST');
    strictEqual(requests[0].url, '/geoserver/rest/workspaces');
    deepStrictEqual(requests[0].body, { workspace: { name: workspace } });
  });

  it('should tell whether the data store exists', async () => {
    reply(200, {});
    reply(404);

    strictEqual(await client.dataStoreExists(), true);
    strictEqual(await client.dataStoreExists(), false);
    strictEqual(requests[0].url, `/geoserver/rest/workspaces/${workspace}/datastores/${dataStore}`);
  });

  it('should create the data store with the polygon parts connection', async () => {
    reply(201);

    await client.createDataStore(connection);

    strictEqual(requests[0].method, 'POST');
    strictEqual(requests[0].url, `/geoserver/rest/workspaces/${workspace}/datastores`);
    deepStrictEqual(requests[0].body, buildDataStoreBody(dataStore, connection));
  });

  it('should parse the feature type names of a list', async () => {
    reply(200, { list: { string: 'abc_orthophoto' } });
    reply(200, { featureTypes: { featureType: [{ name: 'abc-Orthophoto', href: 'x' }] } });

    deepStrictEqual(await client.getFeatureTypeNames('available'), ['abc_orthophoto']);
    deepStrictEqual(await client.getFeatureTypeNames('configured'), ['abc-Orthophoto']);
    strictEqual(requests[0].url, `/geoserver/rest/workspaces/${workspace}/datastores/${dataStore}/featuretypes?list=available`);
    strictEqual(requests[1].url, `/geoserver/rest/workspaces/${workspace}/datastores/${dataStore}/featuretypes?list=configured`);
  });

  it('should publish a feature type with the polygon parts mapping', async () => {
    reply(201);

    await client.createFeatureType({ nativeName: 'abc_orthophoto', name: 'abc-Orthophoto' });

    strictEqual(requests[0].method, 'POST');
    strictEqual(requests[0].url, `/geoserver/rest/workspaces/${workspace}/datastores/${dataStore}/featuretypes`);
    deepStrictEqual(requests[0].body, buildPolygonPartsFeatureTypeBody({ nativeName: 'abc_orthophoto', name: 'abc-Orthophoto' }));
  });

  it('should throw when geoserver fails to publish a feature type', async () => {
    reply(500);

    await rejects(client.createFeatureType({ nativeName: 'abc_orthophoto', name: 'abc-Orthophoto' }), /abc_orthophoto/);
  });
});

describe('buildDataStoreBody', () => {
  it('should build the same data store body geoserver-api sends to geoserver', () => {
    deepStrictEqual(buildDataStoreBody(dataStore, connection), {
      dataStore: {
        name: dataStore,
        enabled: false,
        disableOnConnFailure: true,
        connectionParameters: {
          entry: [
            { '@key': 'host', $: 'db-host' },
            { '@key': 'port', $: '5432' },
            { '@key': 'database', $: 'raster-dev' },
            { '@key': 'user', $: 'dbUser' },
            { '@key': 'dbtype', $: 'postgis' },
            { '@key': 'schema', $: 'polygon_parts' },
            { '@key': 'SSL mode', $: 'DISABLE' },
            { '@key': 'validate connections', $: 'true' },
            { '@key': 'Expose primary keys', $: 'true' },
            { '@key': 'passwd', $: 'dbPassword' },
          ],
        },
      },
    });
  });

  it('should leave the password out when it is empty', () => {
    const { entry } = buildDataStoreBody(dataStore, { ...connection, password: ' ' }).dataStore.connectionParameters;

    strictEqual(
      entry.some((parameter) => parameter['@key'] === 'passwd'),
      false
    );
  });
});
