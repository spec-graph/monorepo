"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewCommand = reviewCommand;
const chalk_1 = __importDefault(require("chalk"));
const index_1 = require("../engine/review/index");
async function reviewCommand(projectRoot, options) {
    try {
        const models = options.models
            ? options.models.split(",").map((m) => m.trim())
            : ["claude", "codex"];
        const focusAreas = options.focus
            ? options.focus.split(",").map((f) => f.trim())
            : [];
        const config = {
            models,
            includeFull: options.full || false,
            focusAreas,
            format: options.save ? "files" : options.json ? "json" : "prompts",
        };
        const result = await (0, index_1.generateReviewPrompts)(projectRoot, options.artifact, config);
        if (options.save) {
            const paths = await (0, index_1.saveReviewPrompts)(projectRoot, result);
            console.log(chalk_1.default.green(`✓ Review prompts saved:`));
            for (const p of paths) {
                console.log(chalk_1.default.gray(`  ${p}`));
            }
            console.log(chalk_1.default.gray(`\n  Send each file to the corresponding model for review.`));
            return;
        }
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        // Terminal output: show prompts inline
        console.log(chalk_1.default.bold(`\n📋 Multi-Model Review: ${options.artifact}\n`));
        console.log(chalk_1.default.gray(`Source: ${result.source_path}`));
        console.log(chalk_1.default.gray(`Models: ${models.join(", ")}`));
        console.log(chalk_1.default.gray(`Generated: ${result.generated_at}\n`));
        for (const review of result.reviews) {
            console.log(chalk_1.default.blue(`─── ${review.model.toUpperCase()} ───`));
            console.log(chalk_1.default.gray("System prompt:"));
            console.log(review.system_prompt);
            console.log(chalk_1.default.gray("\nUser prompt:"));
            console.log(review.user_prompt);
            console.log("");
        }
        console.log(chalk_1.default.yellow(`Tip: Use --save to write review files to .spec-graph/reviews/`));
        console.log(chalk_1.default.yellow(`     Use --full to include complete artifact content`));
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        process.exit(1);
    }
}
//# sourceMappingURL=review.js.map