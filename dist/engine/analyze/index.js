"use strict";
/**
 * Cross-Artifact Analysis Engine
 *
 * Compares content across multiple artifacts to detect:
 * - Duplication (same requirement in multiple docs)
 * - Coverage gaps (requirements with no corresponding design/story/task)
 * - Terminology drift (same concept named differently)
 * - AC gaps (stories with acceptance criteria not covered by tasks)
 * - Vague language (across all artifacts, not just one)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeArtifacts = analyzeArtifacts;
exports.formatAnalysisResult = formatAnalysisResult;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const yaml_1 = require("../../utils/yaml");
/**
 * Analyze all artifacts for cross-artifact consistency issues.
 */
async function analyzeArtifacts(projectRoot, graph) {
    const findings = [];
    const artifactsDir = node_path_1.default.join(projectRoot, ".spec-graph", "artifacts");
    // Load all artifact documents
    const docs = await loadAllArtifacts(artifactsDir);
    if (docs.length === 0) {
        return {
            findings: [],
            stats: { artifacts_analyzed: 0, critical: 0, high: 0, medium: 0, low: 0 },
        };
    }
    // Run each analysis
    findings.push(...detectDuplication(docs));
    findings.push(...detectCoverageGaps(docs, graph));
    findings.push(...detectTerminologyDrift(docs));
    findings.push(...detectVagueLanguage(docs));
    findings.push(...detectACGaps(docs));
    // Check per-artifact validation rules from config.yaml
    const config = await (0, yaml_1.tryReadYaml)(node_path_1.default.join(projectRoot, ".spec-graph", "config.yaml"));
    if (config?.artifact_rules) {
        findings.push(...detectRuleViolations(docs, config.artifact_rules));
    }
    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    return {
        findings,
        stats: {
            artifacts_analyzed: docs.length,
            critical: findings.filter((f) => f.severity === "critical").length,
            high: findings.filter((f) => f.severity === "high").length,
            medium: findings.filter((f) => f.severity === "medium").length,
            low: findings.filter((f) => f.severity === "low").length,
        },
    };
}
async function loadAllArtifacts(artifactsDir) {
    const docs = [];
    async function scanDir(dir) {
        try {
            const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = node_path_1.default.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await scanDir(fullPath);
                }
                else if (entry.name.endsWith(".md")) {
                    try {
                        const content = await promises_1.default.readFile(fullPath, "utf-8");
                        const sections = extractSections(content);
                        docs.push({
                            id: node_path_1.default.relative(artifactsDir, fullPath).replace(/\.md$/, ""),
                            path: fullPath,
                            kind: extractKind(content),
                            content,
                            sections,
                        });
                    }
                    catch {
                        // Skip unreadable
                    }
                }
            }
        }
        catch {
            // No directory
        }
    }
    await scanDir(artifactsDir);
    return docs;
}
function extractSections(content) {
    const sections = [];
    const lines = content.split("\n");
    let current = "";
    for (const line of lines) {
        if (line.startsWith("#")) {
            if (current)
                sections.push(current);
            current = line;
        }
        else {
            current += "\n" + line;
        }
    }
    if (current)
        sections.push(current);
    return sections;
}
function extractKind(content) {
    const match = content.match(/^kind:\s*(.+)$/m);
    return match ? match[1].trim() : "unknown";
}
/**
 * Detect duplicated content across artifacts.
 */
function detectDuplication(docs) {
    const findings = [];
    // Extract key phrases (lines with >20 chars, not headings)
    const phraseMap = new Map();
    for (const doc of docs) {
        const lines = doc.content
            .split("\n")
            .filter((l) => l.trim().length > 20 && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("```"));
        for (const line of lines) {
            const normalized = line.trim().toLowerCase().slice(0, 100);
            if (!phraseMap.has(normalized)) {
                phraseMap.set(normalized, []);
            }
            phraseMap.get(normalized).push(doc.id);
        }
    }
    // Find phrases appearing in 2+ docs
    for (const [phrase, docIds] of phraseMap) {
        const uniqueDocs = [...new Set(docIds)];
        if (uniqueDocs.length >= 2) {
            findings.push({
                severity: "medium",
                category: "duplication",
                message: `Duplicated content in ${uniqueDocs.length} artifacts`,
                artifacts: uniqueDocs,
                detail: `"${phrase.slice(0, 60)}..." appears in: ${uniqueDocs.join(", ")}`,
            });
        }
    }
    return findings;
}
/**
 * Detect coverage gaps: requirements with no corresponding design/story.
 */
function detectCoverageGaps(docs, graph) {
    const findings = [];
    const hasRequirement = docs.some((d) => d.kind.startsWith("requirement"));
    const hasDesign = docs.some((d) => d.kind.startsWith("design"));
    const hasPlan = docs.some((d) => d.kind.startsWith("plan"));
    if (hasRequirement && !hasDesign) {
        findings.push({
            severity: "high",
            category: "coverage-gap",
            message: "Requirements exist but no design documents found",
            artifacts: docs.filter((d) => d.kind.startsWith("requirement")).map((d) => d.id),
            detail: "Design documents should trace from requirements. Run `spec-graph dispatch` to produce design artifacts.",
        });
    }
    if (hasDesign && !hasPlan) {
        findings.push({
            severity: "high",
            category: "coverage-gap",
            message: "Design documents exist but no plan/stories found",
            artifacts: docs.filter((d) => d.kind.startsWith("design")).map((d) => d.id),
            detail: "Stories should trace from design. Run `spec-graph dispatch` to produce plan artifacts.",
        });
    }
    if (hasPlan && !docs.some((d) => d.kind.startsWith("verification"))) {
        findings.push({
            severity: "medium",
            category: "coverage-gap",
            message: "Plans exist but no verification documents found",
            artifacts: [],
            detail: "Verification reports (review/test/acceptance) should trace from plans.",
        });
    }
    return findings;
}
/**
 * Detect terminology drift: same concept named differently.
 */
function detectTerminologyDrift(docs) {
    const findings = [];
    const ambiguousTerms = [
        { variants: ["user-friendly", "user friendly", "userfriendly"], canonical: "user-friendly" },
        { variants: ["open-source", "open source", "opensource"], canonical: "open-source" },
        { variants: ["frontend", "front-end", "front end"], canonical: "frontend" },
        { variants: ["backend", "back-end", "back end"], canonical: "backend" },
        { variants: ["database", "data base", "data-base"], canonical: "database" },
    ];
    for (const term of ambiguousTerms) {
        const usedVariants = {};
        for (const variant of term.variants) {
            for (const doc of docs) {
                if (doc.content.toLowerCase().includes(variant.toLowerCase())) {
                    if (!usedVariants[variant])
                        usedVariants[variant] = [];
                    usedVariants[variant].push(doc.id);
                }
            }
        }
        if (Object.keys(usedVariants).length >= 2) {
            findings.push({
                severity: "low",
                category: "terminology-drift",
                message: `Inconsistent terminology: "${term.canonical}"`,
                artifacts: [...new Set(Object.values(usedVariants).flat())],
                detail: `Variants used: ${Object.entries(usedVariants).map(([v, docs]) => `"${v}" in ${docs.join(", ")}`).join("; ")}`,
            });
        }
    }
    return findings;
}
/**
 * Detect vague language across all artifacts.
 */
function detectVagueLanguage(docs) {
    const findings = [];
    const vagueWords = /\b(fast|robust|scalable|flexible|intuitive|seamless|powerful|performant)\b/gi;
    for (const doc of docs) {
        const matches = [...doc.content.matchAll(vagueWords)];
        if (matches.length > 0) {
            findings.push({
                severity: "medium",
                category: "vague-language",
                message: `${matches.length} vague adjective(s) in "${doc.id}"`,
                artifacts: [doc.id],
                detail: `Found: ${[...new Set(matches.map((m) => m[0]))].join(", ")}`,
            });
        }
    }
    return findings;
}
/**
 * Detect AC gaps: stories with acceptance criteria not covered by tasks.
 */
function detectACGaps(docs) {
    const findings = [];
    const stories = docs.filter((d) => d.kind.includes("story"));
    const tasks = docs.filter((d) => d.kind.includes("task"));
    for (const story of stories) {
        // Count ACs in story
        const acMatches = story.content.match(/###\s+AC-\d+/g);
        const acCount = acMatches ? acMatches.length : 0;
        if (acCount === 0) {
            findings.push({
                severity: "high",
                category: "ac-gap",
                message: `Story "${story.id}" has no acceptance criteria`,
                artifacts: [story.id],
            });
        }
        else if (tasks.length === 0 && acCount > 0) {
            findings.push({
                severity: "medium",
                category: "ac-gap",
                message: `Story "${story.id}" has ${acCount} AC(s) but no tasks found`,
                artifacts: [story.id],
                detail: "Each AC should have at least one corresponding task.",
            });
        }
    }
    return findings;
}
/**
 * Check artifacts against per-artifact validation rules from config.yaml.
 * Rules can specify: min_sections, min_length, required_fields, forbidden_words.
 */
function detectRuleViolations(docs, rules) {
    if (!rules)
        return [];
    const findings = [];
    for (const doc of docs) {
        const rule = rules[doc.kind];
        if (!rule)
            continue;
        // Check min_sections
        if (rule.min_sections) {
            for (const section of rule.min_sections) {
                if (!doc.content.includes(`## ${section}`)) {
                    findings.push({
                        severity: "high",
                        category: "rule-violation",
                        message: `"${doc.id}" missing required section: "${section}"`,
                        artifacts: [doc.id],
                    });
                }
            }
        }
        // Check min_length
        if (rule.min_length && doc.content.length < rule.min_length) {
            findings.push({
                severity: "medium",
                category: "rule-violation",
                message: `"${doc.id}" too short: ${doc.content.length} chars (min: ${rule.min_length})`,
                artifacts: [doc.id],
            });
        }
        // Check forbidden_words
        if (rule.forbidden_words) {
            for (const word of rule.forbidden_words) {
                if (doc.content.toLowerCase().includes(word.toLowerCase())) {
                    findings.push({
                        severity: "medium",
                        category: "rule-violation",
                        message: `"${doc.id}" contains forbidden word: "${word}"`,
                        artifacts: [doc.id],
                    });
                }
            }
        }
    }
    return findings;
}
/**
 * Format analysis result for display.
 */
function formatAnalysisResult(result) {
    const lines = [];
    lines.push("## Cross-Artifact Analysis");
    lines.push("");
    lines.push(`**Analyzed**: ${result.stats.artifacts_analyzed} artifacts`);
    lines.push(`**Findings**: ${result.stats.critical} critical, ${result.stats.high} high, ${result.stats.medium} medium, ${result.stats.low} low`);
    lines.push("");
    if (result.findings.length === 0) {
        lines.push("✅ No issues detected. All artifacts are consistent.");
        return lines.join("\n");
    }
    for (const finding of result.findings) {
        const icon = finding.severity === "critical" ? "🔴" :
            finding.severity === "high" ? "🟠" :
                finding.severity === "medium" ? "🟡" :
                    "🔵";
        lines.push(`### ${icon} [${finding.severity.toUpperCase()}] ${finding.category}`);
        lines.push(finding.message);
        if (finding.detail) {
            lines.push("");
            lines.push(finding.detail);
        }
        if (finding.artifacts.length > 0) {
            lines.push("");
            lines.push(`**Affected**: ${finding.artifacts.join(", ")}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
//# sourceMappingURL=index.js.map