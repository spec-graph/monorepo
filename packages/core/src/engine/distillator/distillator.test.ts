/**
 * Tests for the Document Distillator
 */

import { describe, it, expect } from "vitest";
import { distillMarkdown } from "./index";

describe("distillator", () => {
  describe("distillMarkdown", () => {
    it("preserves headings", () => {
      const input = `# Title\n\nSome text\n\n## Section\n\nMore text`;
      const output = distillMarkdown(input);
      expect(output).toContain("# Title");
      expect(output).toContain("## Section");
    });

    it("preserves bullet points", () => {
      const input = `## Features\n\n- Item one\n- Item two\n  - Sub-item\n\nSome text`;
      const output = distillMarkdown(input);
      expect(output).toContain("- Item one");
      expect(output).toContain("- Item two");
      expect(output).toContain("- Sub-item");
    });

    it("preserves key sentences", () => {
      const input = `This is normal text.\nThis is a critical decision.\nMore normal text.`;
      const output = distillMarkdown(input);
      expect(output).toContain("critical decision");
    });

    it("preserves code blocks by default", () => {
      const input = `Text\n\n\`\`\`typescript\nconst x = 1;\n\`\`\`\n\nMore text`;
      const output = distillMarkdown(input);
      expect(output).toContain("const x = 1;");
    });

    it("can strip code blocks", () => {
      const input = `Text\n\n\`\`\`typescript\nconst x = 1;\n\`\`\`\n\nMore text`;
      const output = distillMarkdown(input, { preserveCode: false });
      expect(output).not.toContain("const x = 1;");
    });

    it("respects maxLength", () => {
      const input = "A".repeat(5000);
      const output = distillMarkdown(input, { maxLength: 100 });
      expect(output.length).toBeLessThanOrEqual(110); // 100 + truncation marker
    });

    it("preserves numbered lists", () => {
      const input = `1. First step\n2. Second step\n3. Third step`;
      const output = distillMarkdown(input);
      expect(output).toContain("1. First step");
      expect(output).toContain("2. Second step");
    });

    it("preserves warning/caution keywords", () => {
      const input = `Normal line.\nWarning: this is dangerous.\nCaution: handle carefully.`;
      const output = distillMarkdown(input);
      expect(output).toContain("Warning");
      expect(output).toContain("Caution");
    });

    it("removes normal paragraphs while keeping structure", () => {
      const input = `## Heading\n\nThis is a long paragraph of normal text that should be removed.\n\n- Bullet point kept\n\nAnother normal paragraph to remove.`;
      const output = distillMarkdown(input);
      expect(output).toContain("## Heading");
      expect(output).toContain("- Bullet point kept");
      expect(output).not.toContain("long paragraph");
    });
  });
});
