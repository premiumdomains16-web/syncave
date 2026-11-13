# Syncave production image.
#   docker build -t syncave .
#   docker run -p 3000:3000 --env-file .env.local -v syncave-data:/data syncave
# With Supabase configured, the /data volume only matters if you also keep local files.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

# Dependencies first so they're cached between code changes.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build && mkdir -p /data && chown -R node:node /data

# Don't run as root.
USER node
EXPOSE 3000

# The platform (Docker, Render, Railway, Cloud Run…) restarts the container when this fails.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# exec form so SIGTERM reaches Node directly and the graceful shutdown runs.
CMD ["node", "--import", "tsx", "server/index.ts"]
