import path from "node:path";
import fs from "node:fs/promises";
import chalk from "chalk";
import {
  distillArtifact,
  saveDistilled,
  DistillOptions,
} from "../engine/distillator/index";

export interface DistillCommandOptions {
  artifact: string;
  save?: boolean;
  maxLength?: string;
  json?: boolean;
}

export async function distillCommand(
  projectRoot: string,
  options: DistillCommandOptions,
): Promise<void> {
  try {
    const distillOpts: DistillOptions = {};
    if (options.maxLength) {
      const parsed = parseInt(options.maxLength, 10);
      if (!isNaN(parsed) && parsed > 0) {
        distillOpts.maxLength = parsed;
      }
    }

    const result = await distillArtifact(
      projectRoot,
      options.artifact,
      distillOpts,
    );

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (options.save) {
      const outputPath = await saveDistilled(
        projectRoot,
        options.artifact,
        result.output,
      );
      console.log(chalk.green(`✓ Distilled artifact saved: ${outputPath}`));
    } else {
      console.log(chalk.gray(`Source: ${result.source}`));
      console.log(chalk.gray(`Original: ${result.original_length} chars → Compressed: ${result.compressed_length} chars (${result.compression_ratio}% reduction)`));
      console.log("");
      console.log(result.output);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    process.exit(1);
  }
}
