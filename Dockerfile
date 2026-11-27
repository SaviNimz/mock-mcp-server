FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
# Non-root user
USER 10014
EXPOSE 3000
CMD ["node", "src/server.mjs"]
