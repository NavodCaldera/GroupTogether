import { config } from "dotenv";
import { assertTestDatabase } from "../../scripts/test-database.mjs";

config({ quiet: true });

const url = assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
process.env.DATABASE_URL = url;
process.env.STORAGE_DIR = ".data/test-uploads-int";
