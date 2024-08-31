# prereq: first do `yarn build` to compile typescript & etc.

FROM node:19-alpine
WORKDIR /usr/src/app

# first get dependencies in for efficient docker layering
COPY dist/package.json dist/yarn.lock ./
RUN yarn install --frozen-lockfile --production

# then copy over typescript payload
COPY dist ./

ENV PORT 80
EXPOSE 80/tcp

ENTRYPOINT [ "node", "--inspect", "--max-old-space-size=14336", "backend/scheduler/lib/index.js" ]
