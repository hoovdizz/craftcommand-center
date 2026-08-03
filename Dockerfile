FROM node:20-alpine
LABEL org.opencontainers.image.title="CraftCommand Center" \
      org.opencontainers.image.description="Companion dashboard for binhex-minecraftbedrockserver on Unraid" \
      org.opencontainers.image.source="https://github.com/hoovdizz/craftcommand-center"
RUN apk add --no-cache docker-cli bash && mkdir -p /app/data
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
COPY config.example.json ./config.example.json
COPY tools ./tools
ENV PORT=8223 DATA_DIR=/app/data
EXPOSE 8223
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8223/api/auth/status >/dev/null || exit 1
CMD ["node", "server.js"]
