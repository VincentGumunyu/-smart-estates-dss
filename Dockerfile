# Full stack on Fly.io: build React dashboard + serve with FastAPI (API + static SPA).
#   fly launch && fly secrets set OPENAI_API_KEY=sk-...
FROM node:22-alpine AS frontend
WORKDIR /fe
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
# Supabase config must be available at build time (Vite bakes VITE_* into the bundle).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
# Same origin as API — use relative /api in the browser
ENV VITE_API_BASE_URL=
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements-ai.txt .
RUN pip install --no-cache-dir -r requirements-ai.txt
COPY ai_api.py .
COPY --from=frontend /fe/dist ./static
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uvicorn ai_api:app --host 0.0.0.0 --port ${PORT:-8080}"]
