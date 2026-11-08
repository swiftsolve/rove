/**
 * Holds a JSON file to its schema (draft-07, in schemas/ as
 * `<name>.schema.json`). The generators check what they read and write, so a
 * wrong or misspelt key fails `npm run gen` and `npm run lint`.
 */
import { readFile } from 'node:fs/promises'

import Ajv from 'ajv'

/** Each way `data` breaks the schema at `schemaPath`, one line each, labelled; empty when it fits. */
export async function schemaProblems(schemaPath, data, label) {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
  // A union type (`["object", "null"]`) is plain draft-07; Ajv's strict mode only warns on it.
  const validate = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(schema)
  if (validate(data)) return []
  return validate.errors.map((error) => `${label}: ${error.instancePath || 'the top level'} ${error.message}`)
}
