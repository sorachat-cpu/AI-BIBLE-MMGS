import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = path.resolve(__dirname, "../../schemas");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const compiledCache = new Map();

export async function validateAgainstSchema(schemaFileName, data) {
  let validate = compiledCache.get(schemaFileName);
  if (!validate) {
    const schemaPath = path.join(SCHEMAS_DIR, schemaFileName);
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    validate = ajv.compile(schema);
    compiledCache.set(schemaFileName, validate);
  }
  const valid = validate(data);
  return { valid, errors: valid ? [] : validate.errors };
}
