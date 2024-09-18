import { defineConfig } from "drizzle-kit"
import dotenv from "dotenv"

dotenv.config()

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})