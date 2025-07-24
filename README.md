````markdown
# ⚡ Functions Runtime

A *drop‑in* HTTP gateway that turns every `.ts` or `.js` file in a **functions/**
folder into a POST endpoint &mdash; with Keycloak JWT verification, TypeScript
support via **@swc‑node/register**, and zero vendor lock‑in.

> **Why another “serverless” runner?**  
> You already have a database (PostgreSQL) and a job queue (Graphile Worker).
> All you need is a thin layer to host custom business logic without dragging in
> AWS Lambda, Vercel, or new pricing models.  
> **Ship this image, mount your code, done.**

---

## 🌟 Features

* **Just mount & run** – no repo cloning, no build step for handlers  
* **TypeScript out‑of‑the‑box** – SWC JIT‑compiles only what’s needed  
* **Keycloak / OIDC auth** – RS256 / ES256 via JWKS, decoded claims injected
  into every handler  
* **Hot‑pluggable** – drop a file → restart container → new route appears  
* **Extendable image** – build your own child image to bundle function
  dependencies or CI artifacts

---

## 🚀 Quick Start (one‑liner)

```bash
docker run -p 9010:9010 \
  -e JWKS_URL=https://keycloak.example.com/realms/demo/protocol/openid-connect/certs \
  -e JWT_ISSUER=https://keycloak.example.com/realms/demo \
  -v $(pwd)/functions:/functions \
  appria/functions-runtime:latest
````

* Create a `functions/hello.ts` file:

  ```ts
  export default async ({ req, user }) => {
    const { name = "world" } = req.body ?? {};
    return { msg: `Hello, ${name}!`, user };
  };
  ```

* Call it:

  ```bash
  curl -X POST http://localhost:9010/functions/hello \
       -H "Authorization: Bearer <keycloak‑token>" \
       -H "Content-Type: application/json" \
       -d '{"name":"Yasiru"}'
  ```

---

## 🗂 Function API

```ts
type Handler = (ctx: {
  req:  FastifyRequest;
  reply: FastifyReply;
  user: JWTPayload;        // decoded claims from Keycloak
}) => unknown | Promise<unknown>;
```

* Route = `/functions/<relative/path/to/file>` (extension stripped)
* Only **POST** is exposed by default (add GET/PUT in your copy if you wish).

---

## 📦 Adding dependencies to handlers

1. **Lightweight (bind‑mount):**

   ```
   functions/
   ├─ package.json   # add axios, uuid, etc.
   └─ *.ts
   ```

   Then inside the container:

   ```bash
   npm --prefix /functions ci --omit=dev
   ```

2. **Production‑grade (child image):**

   ```dockerfile
   FROM appria/functions-runtime:latest
   WORKDIR /functions
   COPY functions/package.json .
   RUN npm ci --omit=dev
   COPY functions .
   WORKDIR /app              # back to runtime dir
   ```

   ```bash
   docker build -t my‑org/my‑functions:prod -f Dockerfile.app .
   ```

---

## 🛠 Environment Variables

| Variable        | Description                                          |
| --------------- | ---------------------------------------------------- |
| `PORT`          | Port to expose (default **9010**)                    |
| `FUNCTIONS_DIR` | Folder to scan for handlers (default **/functions**) |
| `JWKS_URL`      | Keycloak JWKS endpoint                               |
| `JWT_ISSUER`    | Expected `iss` claim (realm URL)                     |

---

## 🧑‍💻 Local Dev

```bash
# Hot‑reload gateway and handlers
npm run dev
```

* Uses **nodemon** & **@swc‑node/register** – instant reloads, no compile step.

---

## 🏗 Compose Snippet

```yaml
services:
  functions:
    image: appria/functions-runtime:latest
    environment:
      JWKS_URL:  https://keycloak.example.com/realms/demo/protocol/openid-connect/certs
      JWT_ISSUER: https://keycloak.example.com/realms/demo
    volumes:
      - ./functions:/functions:ro
    networks: [internal]
    restart: unless-stopped
```
