"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readYaml = readYaml;
exports.writeYaml = writeYaml;
exports.tryReadYaml = tryReadYaml;
const promises_1 = __importDefault(require("node:fs/promises"));
const js_yaml_1 = __importDefault(require("js-yaml"));
/**
 * Read a YAML file and parse it
 */
async function readYaml(filePath) {
    const content = await promises_1.default.readFile(filePath, "utf-8");
    return js_yaml_1.default.load(content);
}
/**
 * Write data to a YAML file
 */
async function writeYaml(filePath, data) {
    const content = js_yaml_1.default.dump(data, {
        indent: 2,
        lineWidth: -1, // Disable line wrapping
        noRefs: true, // Don't use YAML references
        quotingType: '"',
        forceQuotes: false,
    });
    await promises_1.default.writeFile(filePath, content, "utf-8");
}
/**
 * Try to read a YAML file, return null if it doesn't exist
 */
async function tryReadYaml(filePath) {
    try {
        return await readYaml(filePath);
    }
    catch (e) {
        if (e.code === "ENOENT") {
            return null;
        }
        throw e;
    }
}
//# sourceMappingURL=yaml.js.map