/**
 * Holds a JSON file to its schema (draft-07, in schemas/ as
 * `<name>.schema.json`). The generators check what they read and write, so a
 * wrong or misspelt key fails `npm run gen` and `npm run lint`.
 */
import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { Ajv } from 'ajv'

/** Each way `data` breaks the schema at `schemaPath`, one line each, labelled; empty when it fits. */
export async function schemaProblems(schemaPath: string, data: unknown, label: string): Promise<string[]> {
  // A union type (`["object", "null"]`) is plain draft-07; Ajv's strict mode only warns on it.
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true })
  // One schema can point into another (`figma-components.schema.json#/…`), so
  // every schema beside it is added under its file name.
  const schemaDir = dirname(schemaPath)
  for (const fileName of await readdir(schemaDir)) {
    if (!fileName.endsWith('.schema.json')) continue
    ajv.addSchema(JSON.parse(await readFile(join(schemaDir, fileName), 'utf8')) as object, fileName)
  }
  const validate = ajv.getSchema(basename(schemaPath))
  if (!validate) throw new Error(`no schema at ${schemaPath}`)
  if (validate(data)) return []
  return (validate.errors ?? []).map((error) => `${label}: ${error.instancePath || 'the top level'} ${error.message}`)
}
