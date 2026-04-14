import { describe, test, expect } from 'bun:test';
import { COMMAND_DESCRIPTIONS } from '../browse/src/commands';
import { SNAPSHOT_FLAGS } from '../browse/src/snapshot';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');
const OPENCODE_SKILLS_DIR = path.join(ROOT, 'opencode', 'skills');
const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

function extractDescription(content: string): string {
  const fmEnd = content.indexOf('\n---', 4);
  expect(fmEnd).toBeGreaterThan(0);
  const frontmatter = content.slice(4, fmEnd);
  const lines = frontmatter.split('\n');
  let inDescription = false;
  const descLines: string[] = [];

  for (const line of lines) {
    if (line.match(/^description:\s*\|?\s*$/)) {
      inDescription = true;
      continue;
    }
    if (line.match(/^description:\s*\S/)) {
      return line.replace(/^description:\s*/, '').trim();
    }
    if (inDescription) {
      if (line === '' || line.match(/^\s/)) {
        descLines.push(line.replace(/^  /, ''));
      } else {
        break;
      }
    }
  }

  return descLines.join('\n').trim();
}

function listGeneratedOpencodeSkills(): string[] {
  if (!fs.existsSync(OPENCODE_SKILLS_DIR)) return [];
  return fs.readdirSync(OPENCODE_SKILLS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => entry.name.startsWith('ohmystack'))
    .map(entry => entry.name)
    .sort();
}

describe('gen-skill-docs', () => {
  test('generated root SKILL.md contains command categories and commands', () => {
    const content = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf-8');
    const categories = new Set(Object.values(COMMAND_DESCRIPTIONS).map(d => d.category));
    for (const cat of categories) {
      expect(content).toContain(`### ${cat}`);
    }
    for (const [cmd, meta] of Object.entries(COMMAND_DESCRIPTIONS)) {
      expect(content).toContain(meta.usage || cmd);
    }
  });

  test('generated root SKILL.md contains snapshot flags reference', () => {
    const content = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf-8');
    for (const flag of SNAPSHOT_FLAGS) {
      expect(content).toContain(flag.short);
      expect(content).toContain(flag.description);
    }
  });

  test('generated files have auto-generated header and no unresolved placeholders', () => {
    const files = [path.join(ROOT, 'SKILL.md'), path.join(ROOT, 'browse', 'SKILL.md')];
    for (const skillDir of listGeneratedOpencodeSkills()) {
      files.push(path.join(OPENCODE_SKILLS_DIR, skillDir, 'SKILL.md'));
    }

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).toContain('AUTO-GENERATED from SKILL.md.tmpl');
      expect(content.match(/\{\{[A-Z_]+(?::[^}]*)?\}\}/g)).toBeNull();
    }
  });

  test('generated files have valid frontmatter with bounded descriptions', () => {
    const files = [path.join(ROOT, 'SKILL.md'), path.join(ROOT, 'browse', 'SKILL.md')];
    for (const skillDir of listGeneratedOpencodeSkills()) {
      files.push(path.join(OPENCODE_SKILLS_DIR, skillDir, 'SKILL.md'));
    }

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content.startsWith('---\n')).toBe(true);
      expect(content).toContain('name:');
      expect(content).toContain('description:');
      expect(extractDescription(content).length).toBeLessThanOrEqual(MAX_SKILL_DESCRIPTION_LENGTH);
    }
  });

  test('package.json version matches VERSION file', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf-8').trim();
    expect(pkg.version).toBe(version);
  });

  test('opencode dry-run reports fresh generated output only', () => {
    const result = Bun.spawnSync(['bun', 'run', 'scripts/gen-skill-docs.ts', '--host', 'opencode', '--dry-run'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString();
    for (const skillDir of listGeneratedOpencodeSkills()) {
      expect(output).toContain(`FRESH: opencode/skills/${skillDir}/SKILL.md`);
    }
    expect(output).not.toContain('STALE');
  });

  test('opencode generation output is namespaced and opencode-only', () => {
    const dirs = listGeneratedOpencodeSkills();
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect(dir.startsWith('ohmystack')).toBe(true);
    }
    expect(fs.existsSync(path.join(ROOT, '.agents', 'skills', 'ohmystack-ship', 'SKILL.md'))).toBe(false);
  });

  test('telemetry and pending-file preamble use safe find-based shell logic', () => {
    const content = fs.readFileSync(path.join(ROOT, 'opencode', 'skills', 'ohmystack-ship', 'SKILL.md'), 'utf-8');
    expect(content).toContain('skill-usage.jsonl');
    expect(content).toContain("find ~/.ohmystack/analytics -maxdepth 1 -name '.pending-*'");
    expect(content).not.toMatch(/for _PF in [^\n]*\/\.pending-\*/);
  });
});
