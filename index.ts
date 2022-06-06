import config from 'config';
import express, { Request } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import LRUCache from "lru-cache";
import { default as axios } from "axios";

enum Service {
  DataStore = 'data-store',
  Gateway = 'gateway',
  DefinitionStore = 'definition-store',
  UserProfile = 'user-profile',
  CaseDocumentAccess = 'case-document-access',
  CaseAccess = 'case-access',
  RoleAssignment = 'role-assignment'
}

type CaseTypeExtractor = (req: Request) => Promise<string> | string;
type ProxyOptions = { source: string | string[], target: Service, getCaseType?: CaseTypeExtractor };

const app = express();
const port = 4000;
const caseTypes = config.get('proxies') as Record<string, Record<Service, string>>;
const caseTypeIds = Object.keys(caseTypes);

const applyProxy = (options: ProxyOptions) => {
  const router = async (req: Request) => {
    const caseType = options.getCaseType && await options.getCaseType(req) || 'default';
    const proxies = caseTypes[caseType.toLowerCase()] || caseTypes['default'];

    console.log(`${req.originalUrl} -> ${proxies[options.target]}`);

    return proxies[options.target];
  };

  app.use(options.source, createProxyMiddleware({ router, changeOrigin: true }));
}

const cache = new LRUCache({ max: 100 });

const getCaseTypeFromId = async (id: string, req: Request) => {
  const getCaseFromCcd = async (caseType: string) => {
    const url = caseTypes[caseType][Service.DataStore] + req.path.replace('/data/internal', '').replace('/data', '');
    const headers = {
      ServiceAuthorization: req.headers.serviceauthorization as string,
      Authorization: req.headers.authorization as string,
      Experimental: 'true',
      'Content-Type': 'application/json',
    }

    await axios.get(url, { headers });

    return caseType;
  }

  if (!cache.get(id)) {
    const results = await Promise.allSettled(caseTypeIds.map(getCaseFromCcd));
    const firstSuccessfulResult: any = results.find(result => result.status === 'fulfilled');

    cache.set(id, firstSuccessfulResult?.value);
  }

  return cache.get(id) as string;
};

applyProxy({
  source: ['/data/internal/searchCases'],
  target: Service.Gateway,
  getCaseType: req => req.query.ctid as string
});

applyProxy({
  source: ['/data/internal/case-types/**'],
  target: Service.Gateway,
  getCaseType: req => req.path.split('/')[4] as string
});

applyProxy({
  source: ['/data/case-types/**'],
  target: Service.Gateway,
  getCaseType: req => req.path.split('/')[3] as string
});

applyProxy({
  source: ['/data/cases/**'],
  target: Service.Gateway,
  getCaseType: req => getCaseTypeFromId(req.path.split('/')[3] as string, req)
});

applyProxy({
  source: ['/data/internal/cases/**'],
  target: Service.Gateway,
  getCaseType: req => getCaseTypeFromId(req.path.split('/').pop() as string, req)
});

applyProxy({
  source: ['/case-types', '/searchCases', '/cases', '/case-users', '/caseworkers', '/citizens'],
  target: Service.DataStore
});

applyProxy({
  source: ['/aggregated', '/data', '/definition_import', '/addresses', '/em-anno', '/print', '/activity', '/payments'],
  target: Service.Gateway
});

applyProxy({
  source: ['/import', '/api/import-audits', '/api/user-role'],
  target: Service.DefinitionStore
});

applyProxy({
  source: ['/users', '/user-profile'],
  target: Service.UserProfile
});

applyProxy({
  source: ['/cases/documents'],
  target: Service.CaseDocumentAccess
});

applyProxy({
  source: ['/case-users', '/case-assignments', '/noc'],
  target: Service.CaseAccess
});

applyProxy({
  source: ['/am'],
  target: Service.RoleAssignment
});

// health endpoint
app.use((req, res, next) => {
  if (req.path === '/health') {
    res.send({ status: "UP" });
  } else {
    next();
  }
});

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found: ' + req.path) as Error & { status: number };
  err.status = 404;
  next(err);
});

app.listen(port, () => console.log(`CCD Gateway listening on port ${port}`));
