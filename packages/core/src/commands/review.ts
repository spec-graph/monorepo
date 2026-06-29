import path from "node:path";
import chalk from "chalk";
import {
  generateReviewPrompts,
  saveReviewPrompts,
  ReviewConfig,
} from "../engine/review/index";

export interface ReviewOptions {
  artifact: string;
  models?: string;
  focus?: string;
  save?: boolean;
  json?: boolean;
  full?: boolean;
}

export async function reviewCommand(
  projectRoot: string,
  options: ReviewOptions,
): Promise<void> {
  try {
    const models = options.models
      ? options.models.split(",").map((m) => m.trim())
      : ["claude", "codex"];

    const focusAreas = options.focus
      ? options.focus.split(",").map((f) => f.trim())
      : [];

    const config: ReviewConfig = {
      models,
      includeFull: options.full || false,
      focusAreas,
      format: options.save ? "files" : options.json ? "json" : "prompts",
    };

    const result = await generateReviewPrompts(
      projectRoot,
      options.artifact,
      config,
    );

    if (options.save) {
      const paths = await saveReviewPrompts(projectRoot, result);
      console.log(chalk.green(`✓ Review prompts saved:`));
      for (const p of paths) {
        console.log(chalk.gray(`  ${p}`));
      }
      console.log(
        chalk.gray(`\n  Send each file to the corresponding model for review.`),
      );
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Terminal output: show prompts inline
    console.log(chalk.bold(`\n📋 Multi-Model Review: ${options.artifact}\n`));
    console.log(chalk.gray(`Source: ${result.source_path}`));
    console.log(chalk.gray(`Models: ${models.join(", ")}`));
    console.log(chalk.gray(`Generated: ${result.generated_at}\n`));

    for (const review of result.reviews) {
      console.log(chalk.blue(`─── ${review.model.toUpperCase()} ───`));
      console.log(chalk.gray("System prompt:"));
      console.log(review.system_prompt);
      console.log(chalk.gray("\nUser prompt:"));
      console.log(review.user_prompt);
      console.log("");
    }

    console.log(chalk.yellow(`Tip: Use --save to write review files to .spec-graph/reviews/`));
    console.log(chalk.yellow(`     Use --full to include complete artifact content`));
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    process.exit(1);
  }
}
