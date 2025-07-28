/**
 * Lightweight Fastify gateway that:
 *   • Auto‑mounts every .ts|.js file inside FUNCTIONS_DIR as  POST /functions/<path>
 *   • Verifies Keycloak JWTs through JWKS (RS256, ES256 …)
 *   • Passes the decoded claims to each handler via a context object
 */

import 'dotenv/config';
import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import fg from 'fast-glob';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

const FUNCTIONS_DIR =
  process.env.FUNCTIONS_DIR ||
  path.resolve(process.cwd(), 'functions');

const PORT = Number(process.env.PORT || 9010);
const JWKS_URL = process.env.JWKS_URL!;
const JWT_ISSUER = process.env.JWT_ISSUER;

// ---- JWT helper ----------------------------------------------------------

const jwks = createRemoteJWKSet(new URL(JWKS_URL));

async function verifyJWT(auth?: string): Promise<JWTPayload> {
  if (!auth?.startsWith('Bearer ')) throw new Error('Missing token');
  const token = auth.slice(7);
  const { payload } = await jwtVerify(token, jwks, { issuer: JWT_ISSUER });
  return payload;
}

// ---- Fastify app ---------------------------------------------------------

const app = Fastify({ logger: true });

// decorate request with `user`
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

// mount each handler found in FUNCTIONS_DIR
async function mountRoutes() {
  // Ensure @swc-node/register is loaded for TypeScript compilation
  try {
    require('@swc-node/register');
  } catch (e) {
    console.warn('Failed to load @swc-node/register:', e.message);
  }

  const pattern = '**/*.{ts,js,mjs,cjs}';
  const files = await fg(pattern, {
    cwd: FUNCTIONS_DIR,
    absolute: true,
  });

  for (const file of files) {
    // URL: /functions/relative/path (no extension)
    const rel = path
      .relative(FUNCTIONS_DIR, file)
      .replace(path.extname(file), '')
      .split(path.sep)
      .join('/');

    const route = `/functions/${rel}`;
    
    // Use require for TypeScript files since @swc-node/register only works with require()
    let mod;
    if (file.endsWith('.ts')) {
      // Clear require cache for hot-reload capability
      delete require.cache[require.resolve(file)];
      mod = require(file);
    } else {
      // Use dynamic import for JS files
      mod = await import(file);
    }
    
    const handler =
      typeof mod.default === 'function'
        ? mod.default
        : typeof mod.handler === 'function'
        ? mod.handler
        : null;

    if (!handler) {
      app.log.warn(`❌  ${file} has no export`);
      continue;
    }

    app.post(
      route,
      async (req: FastifyRequest, reply: FastifyReply) => {
        try {
          // ① JWT validation
          req.user = await verifyJWT(
            req.headers.authorization as string | undefined,
          );
        } catch {
          reply.code(401).send({ error: 'Unauthorized' });
          return;
        }

        // ② Run handler ‑> ctx = { req, reply, user }
        return handler({ req, reply, user: req.user });
      },
    );

    app.log.info(`✅  Mounted ${route}`);
  }
}

(async () => {
  await mountRoutes();
  app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
    app.log.info(`🚀 Functions runtime listening on ${PORT}`);
  });
})();
