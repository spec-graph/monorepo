/**
 * Read a YAML file and parse it
 */
export declare function readYaml<T>(filePath: string): Promise<T>;
/**
 * Write data to a YAML file
 */
export declare function writeYaml(filePath: string, data: any): Promise<void>;
/**
 * Try to read a YAML file, return null if it doesn't exist
 */
export declare function tryReadYaml<T>(filePath: string): Promise<T | null>;
