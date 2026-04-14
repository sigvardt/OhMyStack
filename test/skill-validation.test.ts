import { describe, test, expect } from 'bun:test';
import { validateSkill } from './helpers/skill-parser';
import { ALL_COMMANDS, COMMAND_DESCRIPTIONS, READ_COMMANDS, WRITE_COMMANDS, META_COMMANDS } from '../browse/src/commands';
import { SNAPSHOT_FLAGS } from '../browse/src/snapshot';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');

describe('SKILL.md command validation', () => {
  const skillFiles = [
    'SKILL.md',
    'browse/SKILL.md',
    'qa/SKILL.md',
    'qa-only/SKILL.md',
    'plan-design-review/SKILL.md',
    'design-review/SKILL.md',
    'design-consultation/SKILL.md',
    'autoplan/SKILL.md',
  ];

  for (const skill of skillFiles) {
    test(`${skill} has valid $B commands and snapshot flags`, () => {
      const fullPath = path.join(ROOT, skill);
      if (!fs.existsSync(fullPath)) return;
      const result = validateSkill(fullPath);
      expect(result.invalid).toHaveLength(0);
      expect(result.snapshotFlagErrors).toHaveLength(0);
    });
  }
});

describe('Command registry consistency', () => {
  test('COMMAND_DESCRIPTIONS covers all commands in sets', () => {
    const allCmds = new Set([...READ_COMMANDS, ...WRITE_COMMANDS, ...META_COMMANDS]);
    const descKeys = new Set(Object.keys(COMMAND_DESCRIPTIONS));
    for (const cmd of allCmds) {
      expect(descKeys.has(cmd)).toBe(true);
    }
  });

  test('COMMAND_DESCRIPTIONS has no extra commands not in sets', () => {
    const allCmds = new Set([...READ_COMMANDS, ...WRITE_COMMANDS, ...META_COMMANDS]);
    for (const key of Object.keys(COMMAND_DESCRIPTIONS)) {
      expect(allCmds.has(key)).toBe(true);
    }
  });

  test('ALL_COMMANDS matches union of all sets', () => {
    const union = new Set([...READ_COMMANDS, ...WRITE_COMMANDS, ...META_COMMANDS]);
    expect(ALL_COMMANDS.size).toBe(union.size);
    for (const cmd of union) {
      expect(ALL_COMMANDS.has(cmd)).toBe(true);
    }
  });

  test('SNAPSHOT_FLAGS option keys are valid SnapshotOptions fields', () => {
    const validKeys = new Set([
      'interactive', 'compact', 'depth', 'selector',
      'diff', 'annotate', 'outputPath', 'cursorInteractive',
    ]);
    for (const flag of SNAPSHOT_FLAGS) {
      expect(validKeys.has(flag.optionKey)).toBe(true);
    }
  });
});

describe('Usage string consistency', () => {
  function skeleton(usage: string): string {
    return usage
      .replace(/\(.*?\)/g, '')
      .replace(/<[^>]*>/g, '<>')
      .replace(/\[[^\]]*\]/g, '[]')
      .replace(/\s+/g, ' ')
      .trim();
  }

  test('implementation Usage: structural format matches COMMAND_DESCRIPTIONS', () => {
    const implFiles = [
      path.join(ROOT, 'browse', 'src', 'write-commands.ts'),
      path.join(ROOT, 'browse', 'src', 'read-commands.ts'),
      path.join(ROOT, 'browse', 'src', 'meta-commands.ts'),
    ];

    const usagePattern = /throw new Error\(['"`]Usage:\s*browse\s+(.+?)['"`]\)/g;
    const implUsages = new Map<string, string>();

    for (const file of implFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      let match;
      while ((match = usagePattern.exec(content)) !== null) {
        const usage = match[1].split('\\n')[0].trim();
        const cmd = usage.split(/\s/)[0];
        implUsages.set(cmd, usage);
      }
    }

    const mismatches: string[] = [];
    for (const [cmd, implUsage] of implUsages) {
      const desc = COMMAND_DESCRIPTIONS[cmd];
      if (!desc?.usage) continue;
      if (skeleton(desc.usage) !== skeleton(implUsage)) {
        mismatches.push(`${cmd}: docs "${desc.usage}" vs impl "${implUsage}"`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});

describe('Generated SKILL.md freshness', () => {
  test('no unresolved placeholders in generated root and browse skills', () => {
    for (const file of ['SKILL.md', 'browse/SKILL.md']) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
      expect(content.match(/\{\{\w+\}\}/g)).toBeNull();
    }
  });

  test('generated root SKILL.md has AUTO-GENERATED header', () => {
    const content = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf-8');
    expect(content).toContain('AUTO-GENERATED');
  });
});

describe('Update check preamble', () => {
  const skillsWithUpdateCheck = [
    'SKILL.md', 'browse/SKILL.md', 'qa/SKILL.md', 'qa-only/SKILL.md',
    'setup-browser-cookies/SKILL.md', 'ship/SKILL.md', 'review/SKILL.md',
    'plan-ceo-review/SKILL.md', 'plan-eng-review/SKILL.md', 'retro/SKILL.md',
    'office-hours/SKILL.md', 'investigate/SKILL.md', 'plan-design-review/SKILL.md',
    'design-review/SKILL.md', 'design-consultation/SKILL.md', 'document-release/SKILL.md',
    'canary/SKILL.md', 'benchmark/SKILL.md', 'land-and-deploy/SKILL.md',
    'setup-deploy/SKILL.md', 'cso/SKILL.md',
  ];

  for (const skill of skillsWithUpdateCheck) {
    test(`${skill} update check line ends with || true`, () => {
      const content = fs.readFileSync(path.join(ROOT, skill), 'utf-8');
      const match = content.match(/\[ -n "\$_UPD" \].*$/m);
      expect(match).not.toBeNull();
      expect(match![0]).toContain('|| true');
    });
  }

  test('all skills with update check are generated from .tmpl', () => {
    for (const skill of skillsWithUpdateCheck) {
      expect(fs.existsSync(path.join(ROOT, skill + '.tmpl'))).toBe(true);
    }
  });
});

describe('No hardcoded branch names in SKILL templates', () => {
  const tmplFiles = [
    'ship/SKILL.md.tmpl',
    'review/SKILL.md.tmpl',
    'qa/SKILL.md.tmpl',
    'plan-ceo-review/SKILL.md.tmpl',
    'retro/SKILL.md.tmpl',
    'document-release/SKILL.md.tmpl',
    'plan-eng-review/SKILL.md.tmpl',
    'plan-design-review/SKILL.md.tmpl',
    'codex/SKILL.md.tmpl',
  ];

  const gitMainPatterns = [
    /\bgit\s+diff\s+(?:origin\/)?main\b/,
    /\bgit\s+log\s+(?:origin\/)?main\b/,
    /\bgit\s+fetch\s+origin\s+main\b/,
    /\bgit\s+merge\s+origin\/main\b/,
    /\borigin\/main\b/,
  ];

  const allowlist = [
    /fall\s*back\s+to\s+`main`/i,
    /fall\s*back\s+to\s+`?main`?/i,
    /typically\s+`?main`?/i,
  ];

  for (const tmplFile of tmplFiles) {
    test(`${tmplFile} has no hardcoded main in git commands`, () => {
      const filePath = path.join(ROOT, tmplFile);
      if (!fs.existsSync(filePath)) return;
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (allowlist.some(p => p.test(line))) continue;
        for (const pattern of gitMainPatterns) {
          if (pattern.test(line)) {
            violations.push(`Line ${i + 1}: ${line.trim()}`);
            break;
          }
        }
      }

      expect(violations).toEqual([]);
    });
  }
});

describe('Skill frontmatter trigger phrases', () => {
  const skillsRequiringTriggers = [
    'qa', 'qa-only', 'ship', 'review', 'investigate', 'office-hours',
    'plan-ceo-review', 'plan-eng-review', 'plan-design-review',
    'design-review', 'design-consultation', 'retro', 'document-release',
    'browse', 'setup-browser-cookies',
  ];

  for (const skill of skillsRequiringTriggers) {
    test(`${skill}/SKILL.md has Use when trigger phrases`, () => {
      const skillPath = path.join(ROOT, skill, 'SKILL.md');
      if (!fs.existsSync(skillPath)) return;
      const content = fs.readFileSync(skillPath, 'utf-8');
      const frontmatterEnd = content.indexOf('---', 4);
      const frontmatter = content.slice(0, frontmatterEnd);
      expect(frontmatter).toMatch(/Use when/i);
    });
  }

  const skillsRequiringProactive = [
    'qa', 'qa-only', 'ship', 'review', 'investigate', 'office-hours',
    'plan-ceo-review', 'plan-eng-review', 'plan-design-review',
    'design-review', 'design-consultation', 'retro', 'document-release',
  ];

  for (const skill of skillsRequiringProactive) {
    test(`${skill}/SKILL.md has proactive routing phrase`, () => {
      const skillPath = path.join(ROOT, skill, 'SKILL.md');
      if (!fs.existsSync(skillPath)) return;
      const content = fs.readFileSync(skillPath, 'utf-8');
      const frontmatterEnd = content.indexOf('---', 4);
      const frontmatter = content.slice(0, frontmatterEnd);
      expect(frontmatter).toMatch(/Proactively (suggest|invoke)/i);
    });
  }
});

describe('ohmystack-slug', () => {
  const SLUG_BIN = path.join(ROOT, 'bin', 'ohmystack-slug');

  test('binary exists and is executable', () => {
    expect(fs.existsSync(SLUG_BIN)).toBe(true);
    expect(fs.statSync(SLUG_BIN).mode & 0o111).toBeGreaterThan(0);
  });

  test('outputs SLUG and BRANCH lines in a git repo', () => {
    const result = Bun.spawnSync([SLUG_BIN], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString();
    expect(output).toContain('SLUG=');
    expect(output).toContain('BRANCH=');
  });

  test('output is eval-compatible and shell-safe', () => {
    const result = Bun.spawnSync([SLUG_BIN], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    const lines = result.stdout.toString().trim().split('\n');
    expect(lines).toHaveLength(2);
    const slug = lines[0].match(/^SLUG=(.+)$/)?.[1] ?? '';
    const branch = lines[1].match(/^BRANCH=(.+)$/)?.[1] ?? '';
    expect(slug).toMatch(/^[a-zA-Z0-9._-]+$/);
    expect(branch).toMatch(/^[a-zA-Z0-9._-]+$/);
  });

  test('templates do not use source process substitution for ohmystack-slug', () => {
    const result = Bun.spawnSync(
      ['grep', '-r', 'source <(.*ohmystack-slug', '--include=*.tmpl', '--include=ohmystack-review-*', '.'],
      { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' }
    );
    expect(result.stdout.toString().trim()).toBe('');
  });
});

describe('Repo mode preamble validation', () => {
  test('generated SKILL.md preamble contains REPO_MODE output', () => {
    const content = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf-8');
    expect(content).toContain('REPO_MODE:');
    expect(content).toContain('ohmystack-repo-mode');
  });
});

describe('no compiled binaries in git', () => {
  test('git tracks no Mach-O or ELF binaries', () => {
    const result = require('child_process').execSync(
      'git ls-files -z | xargs -0 file --mime-type 2>/dev/null | grep -E "application/(x-mach-binary|x-executable|x-pie-executable|x-sharedlib)" || true',
      { cwd: ROOT, encoding: 'utf-8' }
    ).trim();
    const files = result ? result.split('\n').map((l: string) => l.split(':')[0].trim()) : [];
    expect(files).toEqual([]);
  });

  test('git tracks no files larger than 2MB', () => {
    const result = require('child_process').execSync(
      `git ls-files -z | xargs -0 -I{} sh -c 'size=$(wc -c < "$1" 2>/dev/null | tr -d " "); [ "$size" -gt 2097152 ] 2>/dev/null && echo "$1:$size"' _ {} || true`,
      { cwd: ROOT, encoding: 'utf-8' }
    ).trim();
    const files = result ? result.split('\n').filter(Boolean) : [];
    expect(files).toEqual([]);
  });
});

describe('sidebar agent', () => {
  test('sidebar-agent.ts allowedTools includes Write', () => {
    const content = fs.readFileSync(path.join(ROOT, 'browse', 'src', 'sidebar-agent.ts'), 'utf-8');
    const match = content.match(/--allowedTools['"]\s*,\s*['"]([^'"]+)['"]/);
    expect(match).not.toBeNull();
    expect(match![1]).toContain('Write');
  });

  test('server.ts sidebar allowedTools excludes Write', () => {
    const content = fs.readFileSync(path.join(ROOT, 'browse', 'src', 'server.ts'), 'utf-8');
    const match = content.match(/--allowedTools['"]\s*,\s*['"]([^'"]+)['"]/);
    expect(match).not.toBeNull();
    expect(match![1]).toContain('Bash');
    expect(match![1]).not.toContain('Write');
  });

  test('sidebar-agent.ts stderr handler is not empty', () => {
    const content = fs.readFileSync(path.join(ROOT, 'browse', 'src', 'sidebar-agent.ts'), 'utf-8');
    expect(content).not.toContain("proc.stderr.on('data', () => {})");
  });
});
