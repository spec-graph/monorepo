import fs from "node:fs/promises";
import yaml from "js-yaml";

/**
 * Read a YAML file and parse it
 */
export async function readYaml<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf-8");
  return yaml.load(content) as T;
}

/**
 * Write data to a YAML file
 */
export async function writeYaml(filePath: string, data: any): Promise<void> {
  const content = yaml.dump(data, {
    indent: 2,
    lineWidth: -1, // Disable line wrapping
    noRefs: true, // Don't use YAML references
    quotingType: '"',
    forceQuotes: false,
  });
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Try to read a YAML file, return null if it doesn't exist
 */
export async function tryReadYaml<T>(filePath: string): Promise<T | null> {
  try {
    return await readYaml<T>(filePath);
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return null;
    }
    throw e;
  }
}
