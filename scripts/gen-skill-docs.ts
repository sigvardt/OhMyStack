#!/usr/bin/env bun
/**
 * Generate SKILL.md files from .tmpl templates.
 *
 * Pipeline:
 *   read .tmpl → find {{PLACEHOLDERS}} → resolve from source → format → write .md
 *
 * Supports --dry-run: generate to memory, exit 1 if different from committed file.
 * Used by skill:check and CI freshness checks.
 */

import { discoverTemplates } from './discover-skills';
import * as fs from 'fs';
import * as path from 'path';
import type { Host, TemplateContext } from './resolvers/types';
import { HOST_PATHS } from './resolvers/types';
import { RESOLVERS } from './resolvers/index';
import { ALL_HOST_NAMES, resolveHostArg, getHostConfig } from '../hosts/index';

const ROOT = path.resolve(import.meta.dir, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Host Detection (config-driven, single host execution) ──

const HOST_ARG = process.argv.find((a: string) => a.startsWith('--host'));
const HOST: Host = (() => {
  if (!HOST_ARG) return 'opencode';
  const val = HOST_ARG.includes('=') ? HOST_ARG.split('=')[1] : process.argv[process.argv.indexOf(HOST_ARG) + 1];
  if (val === 'all') {
    throw new Error(`Multi-host generation has been removed. Use one of: ${ALL_HOST_NAMES.join(', ')}`);
  }
  try {
    return resolveHostArg(val) as Host;
  } catch {
    throw new Error(`Unknown host: ${val}. Use ${ALL_HOST_NAMES.join(', ')}.`);
  }
})();

// HostPaths, HOST_PATHS, and TemplateContext imported from ./resolvers/types (line 7-8)

// ─── Host Helpers ────────────────────────────────────────────

// Accepts optional frontmatter name to support directory/invocation name divergence
function externalSkillName(skillDir: string, frontmatterName?: string): string {
  // Root skill (skillDir === '' or '.') always maps to 'ohmystack' regardless of frontmatter
  if (skillDir === '.' || skillDir === '') return 'ohmystack';
  // Use frontmatter name when it differs from directory name (e.g., run-tests/ with name: test)
  const baseName = frontmatterName && frontmatterName !== skillDir ? frontmatterName : skillDir;
  // Preserve ohmystack-upgrade as-is; never add a duplicate prefix.
  if (baseName.startsWith('ohmystack-')) return baseName;
  return `ohmystack-${baseName}`;
}

function extractNameAndDescription(content: string): { name: string; description: string } {
  const fmStart = content.indexOf('---\n');
  if (fmStart !== 0) return { name: '', description: '' };
  const fmEnd = content.indexOf('\n---', fmStart + 4);
  if (fmEnd === -1) return { name: '', description: '' };

  const frontmatter = content.slice(fmStart + 4, fmEnd);
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : '';

  let description = '';
  const lines = frontmatter.split('\n');
  let inDescription = false;
  const descLines: string[] = [];
  for (const line of lines) {
    if (line.match(/^description:\s*\|?\s*$/)) {
      inDescription = true;
      continue;
    }
    if (line.match(/^description:\s*\S/)) {
      description = line.replace(/^description:\s*/, '').trim();
      break;
    }
    if (inDescription) {
      if (line === '' || line.match(/^\s/)) {
        descLines.push(line.replace(/^  /, ''));
      } else {
        break;
      }
    }
  }
  if (descLines.length > 0) {
    description = descLines.join('\n').trim();
  }

  return { name, description };
}

// ─── Voice Trigger Processing ────────────────────────────────

/**
 * Extract voice-triggers YAML list from frontmatter.
 * Returns an array of trigger strings, or [] if no voice-triggers field.
 */
function extractVoiceTriggers(content: string): string[] {
  const fmStart = content.indexOf('---\n');
  if (fmStart !== 0) return [];
  const fmEnd = content.indexOf('\n---', fmStart + 4);
  if (fmEnd === -1) return [];
  const frontmatter = content.slice(fmStart + 4, fmEnd);

  const triggers: string[] = [];
  let inVoice = false;
  for (const line of frontmatter.split('\n')) {
    if (/^voice-triggers:/.test(line)) { inVoice = true; continue; }
    if (inVoice) {
      const m = line.match(/^\s+-\s+"(.+)"$/);
      if (m) triggers.push(m[1]);
      else if (!/^\s/.test(line)) break;
    }
  }
  return triggers;
}

/**
 * Preprocess voice triggers: fold voice-triggers YAML field into description,
 * then strip the field from frontmatter. Must run BEFORE transformFrontmatter
 * and extractNameAndDescription so all hosts see the updated description.
 */
function processVoiceTriggers(content: string): string {
  const triggers = extractVoiceTriggers(content);
  if (triggers.length === 0) return content;

  // Strip voice-triggers block from frontmatter
  content = content.replace(/^voice-triggers:\n(?:\s+-\s+"[^"]*"\n?)*/m, '');

  // Get current description (after stripping voice-triggers, so it's clean)
  const { description } = extractNameAndDescription(content);
  if (!description) return content;

  // Build new description with voice triggers appended
  const voiceLine = `Voice triggers (speech-to-text aliases): ${triggers.map(t => `"${t}"`).join(', ')}.`;
  const newDescription = description + '\n' + voiceLine;

  // Replace old indented description with new in frontmatter
  const oldIndented = description.split('\n').map(l => `  ${l}`).join('\n');
  const newIndented = newDescription.split('\n').map(l => `  ${l}`).join('\n');
  content = content.replace(oldIndented, newIndented);

  return content;
}

// Export for testing
export { extractVoiceTriggers, processVoiceTriggers };

const OPENAI_SHORT_DESCRIPTION_LIMIT = 120;

function condenseOpenAIShortDescription(description: string): string {
  const firstParagraph = description.split(/\n\s*\n/)[0] || description;
  const collapsed = firstParagraph.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= OPENAI_SHORT_DESCRIPTION_LIMIT) return collapsed;

  const truncated = collapsed.slice(0, OPENAI_SHORT_DESCRIPTION_LIMIT - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  const safe = lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated;
  return `${safe}...`;
}

function generateOpenAIYaml(displayName: string, shortDescription: string): string {
  return `interface:
  display_name: ${JSON.stringify(displayName)}
  short_description: ${JSON.stringify(shortDescription)}
  default_prompt: ${JSON.stringify(`Use ${displayName} for this task.`)}
policy:
  allow_implicit_invocation: true
`;
}

/**
 * Transform frontmatter for generated host output.
 */
function transformFrontmatter(content: string, host: Host): string {
  const hostConfig = getHostConfig(host);
  const fm = hostConfig.frontmatter;

  if (fm.mode === 'denylist') {
    // Denylist mode: strip listed fields, keep everything else
    for (const field of fm.stripFields || []) {
      if (field === 'voice-triggers') {
        content = content.replace(/^voice-triggers:\n(?:\s+-\s+"[^"]*"\n?)*/m, '');
      } else {
        content = content.replace(new RegExp(`^${field}:\\s*.*\\n`, 'm'), '');
      }
    }
    return content;
  }

  // Allowlist mode: reconstruct frontmatter with only allowed fields
  const fmStart = content.indexOf('---\n');
  if (fmStart !== 0) return content;
  const fmEnd = content.indexOf('\n---', fmStart + 4);
  if (fmEnd === -1) return content;
  const frontmatter = content.slice(fmStart + 4, fmEnd);
  const body = content.slice(fmEnd + 4);
  const { name, description } = extractNameAndDescription(content);

  // Description limit enforcement
  if (fm.descriptionLimit) {
    const behavior = fm.descriptionLimitBehavior || 'error';
    if (description.length > fm.descriptionLimit) {
      if (behavior === 'error') {
        throw new Error(
          `${hostConfig.displayName} description for "${name}" is ${description.length} chars (max ${fm.descriptionLimit}). ` +
          `Compress the description in the .tmpl file.`
        );
      } else if (behavior === 'warn') {
        console.warn(`WARNING: ${hostConfig.displayName} description for "${name}" exceeds ${fm.descriptionLimit} chars`);
      }
      // 'truncate' — silently proceed
    }
  }

  // Build frontmatter with allowed fields
  const indentedDesc = description.split('\n').map(l => `  ${l}`).join('\n');
  let newFm = `---\nname: ${name}\ndescription: |\n${indentedDesc}\n`;

  // Add extra fields (host-wide)
  if (fm.extraFields) {
    for (const [key, value] of Object.entries(fm.extraFields)) {
      if (key !== 'name' && key !== 'description') {
        newFm += `${key}: ${value}\n`;
      }
    }
  }

  // Add conditional fields
  if (fm.conditionalFields) {
    for (const rule of fm.conditionalFields) {
      const match = Object.entries(rule.if).every(([k, v]) =>
        new RegExp(`^${k}:\\s*${v}`, 'm').test(frontmatter)
      );
      if (match) {
        for (const [key, value] of Object.entries(rule.add)) {
          newFm += `${key}: ${value}\n`;
        }
      }
    }
  }

  // Rename fields (copy values from template frontmatter with new keys)
  if (fm.renameFields) {
    for (const [oldName, newName] of Object.entries(fm.renameFields)) {
      const fieldMatch = frontmatter.match(new RegExp(`^${oldName}:(.+(?:\\n(?:\\s+.+)*)?)`, 'm'));
      if (fieldMatch) {
        newFm += `${newName}:${fieldMatch[1]}\n`;
      }
    }
  }

  newFm += '---';
  return newFm + body;
}

/**
 * Extract hook descriptions from frontmatter for inline safety prose.
 * Returns a description of what the hooks do, or null if no hooks.
 */
function extractHookSafetyProse(tmplContent: string): string | null {
  if (!tmplContent.match(/^hooks:/m)) return null;

  // Parse the hook matchers to build a human-readable safety description
  const matchers: string[] = [];
  const matcherRegex = /matcher:\s*"(\w+)"/g;
  let m: RegExpExecArray | null;
  while ((m = matcherRegex.exec(tmplContent)) !== null) {
    if (!matchers.includes(m[1])) matchers.push(m[1]);
  }

  if (matchers.length === 0) return null;

  // Build safety prose based on what tools are hooked
  const toolDescriptions: Record<string, string> = {
    Bash: 'check bash commands for destructive operations (rm -rf, DROP TABLE, force-push, git reset --hard, etc.) before execution',
    Edit: 'verify file edits are within the allowed scope boundary before applying',
    Write: 'verify file writes are within the allowed scope boundary before applying',
  };

  const safetyChecks = matchers
    .map(t => toolDescriptions[t] || `check ${t} operations for safety`)
    .join(', and ');

  return `> **Safety Advisory:** This skill includes safety checks that ${safetyChecks}. When using this skill, always pause and verify before executing potentially destructive operations. If uncertain about a command's safety, ask the user for confirmation before proceeding.`;
}

// ─── Template Processing ────────────────────────────────────

const GENERATED_HEADER = `<!-- AUTO-GENERATED from {{SOURCE}} — do not edit directly -->\n<!-- Regenerate: bun run gen:skill-docs -->\n`;

/**
 * Process generated host output: routing, frontmatter, path rewrites, metadata.
 */
function processExternalHost(
  content: string,
  tmplContent: string,
  host: Host,
  skillDir: string,
  extractedDescription: string,
  ctx: TemplateContext,
  frontmatterName?: string,
): { content: string; outputPath: string; outputDir: string; symlinkLoop: boolean } {
  const hostConfig = getHostConfig(host);

  const name = externalSkillName(skillDir === '.' ? '' : skillDir, frontmatterName);
  const outputDir = path.join(ROOT, hostConfig.hostSubdir, 'skills', name);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'SKILL.md');

  // Guard against symlink loops
  let symlinkLoop = false;
  const sourcePath = ctx.tmplPath.replace(/\.tmpl$/, '');
  try {
    const resolvedSource = fs.realpathSync(sourcePath);
    const resolvedOutput = fs.realpathSync(path.dirname(outputPath)) + '/' + path.basename(outputPath);
    if (resolvedSource === resolvedOutput) {
      symlinkLoop = true;
    }
  } catch {
    // realpathSync fails if file doesn't exist yet — no symlink loop
  }

  // Extract hook safety prose BEFORE transforming frontmatter (which strips hooks)
  const safetyProse = extractHookSafetyProse(tmplContent);

  // Transform frontmatter (host-aware)
  let result = transformFrontmatter(content, host);

  // Insert safety advisory at the top of the body (after frontmatter)
  if (safetyProse) {
    const bodyStart = result.indexOf('\n---') + 4;
    result = result.slice(0, bodyStart) + '\n' + safetyProse + '\n' + result.slice(bodyStart);
  }

  // Config-driven path rewrites (order matters, replaceAll)
  for (const rewrite of hostConfig.pathRewrites) {
      result = result.split(rewrite.from).join(rewrite.to);
  }

  // Config-driven tool rewrites
  if (hostConfig.toolRewrites) {
    for (const [from, to] of Object.entries(hostConfig.toolRewrites)) {
        result = result.split(from).join(to);
    }
  }

  // Config-driven: generate metadata (e.g., openai.yaml for Codex)
  if (hostConfig.generation.generateMetadata && !symlinkLoop) {
    const agentsDir = path.join(outputDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    const shortDescription = condenseOpenAIShortDescription(extractedDescription);
    fs.writeFileSync(path.join(agentsDir, 'openai.yaml'), generateOpenAIYaml(name, shortDescription));
  }

  return { content: result, outputPath, outputDir, symlinkLoop };
}

function processTemplate(tmplPath: string, host: Host = 'opencode'): { outputPath: string; content: string; symlinkLoop?: boolean } {
  const tmplContent = fs.readFileSync(tmplPath, 'utf-8');
  const relTmplPath = path.relative(ROOT, tmplPath);
  let outputPath = tmplPath.replace(/\.tmpl$/, '');

  // Determine skill directory relative to ROOT
  const skillDir = path.relative(ROOT, path.dirname(tmplPath));

  // Extract skill name from frontmatter early — needed for both TemplateContext and external host output paths.
  // When frontmatter name: differs from directory name (e.g., run-tests/ with name: test),
  // the frontmatter name is used for external skill naming and setup script symlinks.
  const { name: extractedName } = extractNameAndDescription(tmplContent);
  const skillName = extractedName || path.basename(path.dirname(tmplPath));


  // Extract benefits-from list from frontmatter (inline YAML: benefits-from: [a, b])
  const benefitsMatch = tmplContent.match(/^benefits-from:\s*\[([^\]]*)\]/m);
  const benefitsFrom = benefitsMatch
    ? benefitsMatch[1].split(',').map((s: string) => s.trim()).filter(Boolean)
    : undefined;

  // Extract preamble-tier from frontmatter (1-4, controls which preamble sections are included)
  const tierMatch = tmplContent.match(/^preamble-tier:\s*(\d+)$/m);
  const preambleTier = tierMatch ? parseInt(tierMatch[1], 10) : undefined;

  const ctx: TemplateContext = { skillName, tmplPath, benefitsFrom, host, paths: HOST_PATHS[host], preambleTier };

  // Replace placeholders (supports parameterized: {{NAME:arg1:arg2}})
  // Config-driven: suppressedResolvers return empty string for this host
  const currentHostConfig = getHostConfig(host);
  const suppressed = new Set(currentHostConfig.suppressedResolvers || []);
  let content = tmplContent.replace(/\{\{(\w+(?::[^}]+)?)\}\}/g, (match: string, fullKey: string) => {
    void match;
    const parts = fullKey.split(':');
    const resolverName = parts[0];
    const args = parts.slice(1);
    if (suppressed.has(resolverName)) return '';
    const resolver = RESOLVERS[resolverName];
    if (!resolver) throw new Error(`Unknown placeholder {{${resolverName}}} in ${relTmplPath}`);
    return args.length > 0 ? resolver(ctx, args) : resolver(ctx);
  });

  // Check for any remaining unresolved placeholders
  const remaining = content.match(/\{\{(\w+(?::[^}]+)?)\}\}/g);
  if (remaining) {
    throw new Error(`Unresolved placeholders in ${relTmplPath}: ${remaining.join(', ')}`);
  }

  // Preprocess voice triggers: fold into description, strip field from frontmatter.
  // Must run BEFORE transformFrontmatter so all hosts see the updated description,
  // and BEFORE extractedDescription is used by external host metadata.
  content = processVoiceTriggers(content);

  // Re-extract description AFTER voice trigger preprocessing so generated metadata
  // gets the updated description with voice triggers included.
  const postProcessDescription = extractNameAndDescription(content).description;

  let symlinkLoop = false;
  const result = processExternalHost(content, tmplContent, host, skillDir, postProcessDescription, ctx, extractedName || undefined);
  content = result.content;
  outputPath = result.outputPath;
  symlinkLoop = result.symlinkLoop;

  // Prepend generated header (after frontmatter)
  const header = GENERATED_HEADER.replace('{{SOURCE}}', path.basename(tmplPath));
  const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
  if (fmEnd !== -1) {
    const insertAt = content.indexOf('\n', fmEnd) + 1;
    content = content.slice(0, insertAt) + header + content.slice(insertAt);
  } else {
    content = header + content;
  }

  return { outputPath, content, symlinkLoop };
}

// ─── Main ───────────────────────────────────────────────────

function findTemplates(): string[] {
  return discoverTemplates(ROOT).map(t => path.join(ROOT, t.tmpl));
}

try {
  let hasChanges = false;
  const tokenBudget: Array<{ skill: string; lines: number; tokens: number }> = [];

  const hostConfig = getHostConfig(HOST);
  for (const tmplPath of findTemplates()) {
    const dir = path.basename(path.dirname(tmplPath));

    // includeSkills allowlist (union logic: include minus skip)
    if (hostConfig.generation.includeSkills?.length) {
      if (!hostConfig.generation.includeSkills.includes(dir)) continue;
    }
    // skipSkills denylist (subtracts from includeSkills or full set)
    if (hostConfig.generation.skipSkills?.length) {
      if (hostConfig.generation.skipSkills.includes(dir)) continue;
    }

    const { outputPath, content, symlinkLoop } = processTemplate(tmplPath, HOST);
    const relOutput = path.relative(ROOT, outputPath);

    if (symlinkLoop) {
      console.log(`SKIPPED (symlink loop): ${relOutput}`);
    } else if (DRY_RUN) {
      const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';
      if (existing !== content) {
        console.log(`STALE: ${relOutput}`);
        hasChanges = true;
      } else {
        console.log(`FRESH: ${relOutput}`);
      }
    } else {
      fs.writeFileSync(outputPath, content);
      console.log(`GENERATED: ${relOutput}`);
    }

    // Track token budget
    const lines = content.split('\n').length;
    const tokens = Math.round(content.length / 4); // ~4 chars per token
    tokenBudget.push({ skill: relOutput, lines, tokens });
  }

  if (DRY_RUN && hasChanges) {
    console.error(`\nGenerated SKILL.md files are stale (${HOST} host). Run: bun run gen:skill-docs --host ${HOST}`);
    process.exit(1);
  }

  // Print token budget summary
  if (!DRY_RUN && tokenBudget.length > 0) {
    tokenBudget.sort((a, b) => b.lines - a.lines);
    const totalLines = tokenBudget.reduce((sum, item) => sum + item.lines, 0);
    const totalTokens = tokenBudget.reduce((sum, item) => sum + item.tokens, 0);
    const escapedHostPrefix = `${hostConfig.hostSubdir}/skills/`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    console.log('');
    console.log(`Token Budget (${HOST} host)`);
    console.log('═'.repeat(60));
    for (const item of tokenBudget) {
      const name = item.skill.replace(/\/SKILL\.md$/, '').replace(new RegExp(`^${escapedHostPrefix}`), '');
      console.log(`  ${name.padEnd(30)} ${String(item.lines).padStart(5)} lines  ~${String(item.tokens).padStart(6)} tokens`);
    }
    console.log('─'.repeat(60));
    console.log(`  ${'TOTAL'.padEnd(30)} ${String(totalLines).padStart(5)} lines  ~${String(totalTokens).padStart(6)} tokens`);
    console.log('');
  }
} catch (e) {
  console.error(`Generation failed for ${HOST}: ${(e as Error).message}`);
  process.exit(1);
}

// After generation completes, warn if prefix patches may need re-applying
if (!DRY_RUN) {
  try {
    const configPath = path.join(process.env.HOME || '', '.ohmystack', 'config.yaml');
    if (fs.existsSync(configPath)) {
      const config = fs.readFileSync(configPath, 'utf-8');
      if (/^skill_prefix:\s*true/m.test(config)) {
        console.log('\nNote: skill_prefix is true. Run ohmystack-relink to re-apply name: patches.');
      }
    }
  } catch { /* non-fatal */ }
}
