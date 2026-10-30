# Deploy FestOS on Vercel

FestOS is a monorepo with a Vite frontend and an Express/MongoDB backend. Deploy it as two Vercel projects from the same Git repository.

## 1. Frontend project

- Import the repository into Vercel and set **Root Directory** to `frontend`.
- Select the Vite preset. Use `npm run build` as the build command and `dist` as the output directory.
- Add `VITE_API_BASE_URL` with the backend URL followed by `/api`, for example `https://festos-api.vercel.app/api`.
- The value is embedded in the browser bundle and is a public API address; never put secrets in a `VITE_` variable.
- `frontend/vercel.json` sends SPA paths to `index.html` so client-side routes survive refreshes.

## 2. Backend project

- Import the same repository again as a separate Vercel project and set **Root Directory** to `backend`.
- Vercel supports Express applications and detects the existing `src/server.js` entry point. The backend runs as a Vercel Function, not as a persistent local Node process.
- Configure these project environment variables:
  - `MONGODB_URI`: MongoDB Atlas connection string for a replica-set cluster.
  - `JWT_SECRET`: a newly generated, high-entropy secret; do not use the development fallback.
  - `AUTH_MODE`: `dev` for the existing password login, or `clerk` only after Clerk has been configured.
  - `CLIENT_ORIGIN`: exact production frontend origin, such as `https://festos.vercel.app`.
  - `SEED_PASSWORD`: set a unique value before creating any seeded accounts; never use the example/demo password for an internet-facing deployment.
  - `ANTHROPIC_API_KEY`: optional; leave unset if explanation rewriting is not needed.

## 3. Database and data

The deployed backend cannot connect to `127.0.0.1` on your computer. Create/configure an Atlas replica set, a database user with only the required database access, and network access for the Vercel backend. Use Atlas TLS credentials only in Vercel environment settings; do not commit them.

The current local MongoDB contents are not included in either Vercel project. Choose whether the deployment should start with an empty database or with a reviewed import. Festival participant data can contain personal information, so do not upload the local database or CSV pack until that transfer is explicitly approved and the destination access is configured.

## 4. Connect and verify

1. Deploy the backend and copy its production URL.
2. Set the frontend `VITE_API_BASE_URL` to `https://<backend-domain>/api` and redeploy the frontend.
3. Set backend `CLIENT_ORIGIN` to the frontend production origin and redeploy the backend.
4. Check `https://<backend-domain>/api/health`, then sign in and confirm the frontend can load live API data.

Vercel runs the Express backend as a Function, so its runtime and duration limits apply to the app's heavier schedule, accommodation and disruption calculations. Check the deployment's function logs if a request times out.
