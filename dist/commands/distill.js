"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.distillCommand = distillCommand;
const chalk_1 = __importDefault(require("chalk"));
const index_1 = require("../engine/distillator/index");
async function distillCommand(projectRoot, options) {
    try {
        const distillOpts = {};
        if (options.maxLength) {
            const parsed = parseInt(options.maxLength, 10);
            if (!isNaN(parsed) && parsed > 0) {
                distillOpts.maxLength = parsed;
            }
        }
        const result = await (0, index_1.distillArtifact)(projectRoot, options.artifact, distillOpts);
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        if (options.save) {
            const outputPath = await (0, index_1.saveDistilled)(projectRoot, options.artifact, result.output);
            console.log(chalk_1.default.green(`✓ Distilled artifact saved: ${outputPath}`));
        }
        else {
            console.log(chalk_1.default.gray(`Source: ${result.source}`));
            console.log(chalk_1.default.gray(`Original: ${result.original_length} chars → Compressed: ${result.compressed_length} chars (${result.compression_ratio}% reduction)`));
            console.log("");
            console.log(result.output);
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        process.exit(1);
    }
}
//# sourceMappingURL=distill.js.map