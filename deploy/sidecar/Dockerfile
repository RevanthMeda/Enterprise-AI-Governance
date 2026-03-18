FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY script ./script
COPY packages ./packages
COPY docs ./docs
COPY examples ./examples
COPY *.json ./
COPY *.js ./
COPY *.ts ./

RUN npm ci
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/index.cjs"]
