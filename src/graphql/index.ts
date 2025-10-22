import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { resolvers } from "./resolvers.js";

// Get the directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load GraphQL schema from schema.graphql file
 */
const typeDefs = readFileSync(join(__dirname, "schema.graphql"), "utf-8");

/**
 * Create executable GraphQL schema by combining type definitions and resolvers
 */
export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

export { resolvers } from "./resolvers.js";
