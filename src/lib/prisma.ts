import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma/client.js"

try {
  process.loadEnvFile();
} catch {
  // no .env in production — the platform supplies the environment
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL is not set")
}

const adapter = new PrismaPg({ connectionString })

export const prisma = new PrismaClient({ adapter })
