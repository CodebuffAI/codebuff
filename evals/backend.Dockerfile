FROM oven/bun:1.1.34 as base
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
EXPOSE 4242
CMD ["bun", "--cwd", "backend", "dev"]
