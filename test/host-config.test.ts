/**
 * Host config system tests for the OpenCode-only registry.
 */

import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { validateHostConfig, validateAllConfigs, type HostConfig } from '../scripts/host-config';
import {
  ALL_HOST_CONFIGS,
  ALL_HOST_NAMES,
  HOST_CONFIG_MAP,
  getHostConfig,
  resolveHostArg,
  getExternalHosts,
  opencode,
} from '../hosts/index';
import { HOST_PATHS } from '../scripts/resolvers/types';

const ROOT = path.resolve(import.meta.dir, '..');

describe('hosts/index.ts', () => {
  test('ALL_HOST_CONFIGS has only opencode host', () => {
    expect(ALL_HOST_CONFIGS.length).toBe(1);
    expect(ALL_HOST_CONFIGS[0]).toBe(opencode);
  });

  test('ALL_HOST_NAMES matches config names', () => {
    expect(ALL_HOST_NAMES).toEqual(['opencode']);
  });

  test('HOST_CONFIG_MAP keys match names', () => {
    expect(HOST_CONFIG_MAP.opencode).toBe(opencode);
  });

  test('individual config re-export matches registry', () => {
    expect(opencode.name).toBe('opencode');
  });

  test('getHostConfig returns correct config', () => {
    const config = getHostConfig('opencode');
    expect(config.name).toBe('opencode');
    expect(config.displayName).toBe('OpenCode');
  });

  test('getHostConfig throws on unknown host', () => {
    expect(() => getHostConfig('nonexistent')).toThrow('Unknown host');
  });

  test('resolveHostArg resolves direct host name', () => {
    expect(resolveHostArg('opencode')).toBe('opencode');
  });

  test('resolveHostArg throws on unknown alias', () => {
    expect(() => resolveHostArg('agents')).toThrow('Unknown host');
  });

  test('getExternalHosts returns the opencode host', () => {
    expect(getExternalHosts()).toEqual([opencode]);
  });

  test('host name, hostSubdir, and globalRoot are unique', () => {
    expect(new Set(ALL_HOST_NAMES).size).toBe(1);
    expect(new Set(ALL_HOST_CONFIGS.map(c => c.hostSubdir)).size).toBe(1);
    expect(new Set(ALL_HOST_CONFIGS.map(c => c.globalRoot)).size).toBe(1);
  });
});

describe('validateHostConfig', () => {
  function makeValid(): HostConfig {
    return {
      name: 'test-host',
      displayName: 'Test Host',
      cliCommand: 'testcli',
      globalRoot: '.test/skills/ohmystack',
      localSkillRoot: '.test/skills/ohmystack',
      hostSubdir: '.test',
      usesEnvVars: true,
      frontmatter: { mode: 'allowlist', keepFields: ['name', 'description'] },
      generation: { generateMetadata: false },
      pathRewrites: [],
      runtimeRoot: { globalSymlinks: ['bin'] },
      install: { prefixable: false, linkingStrategy: 'symlink-generated' },
    };
  }

  test('valid config passes', () => {
    expect(validateHostConfig(makeValid())).toEqual([]);
  });

  test('invalid name is caught', () => {
    const c = makeValid();
    c.name = 'UPPER_CASE';
    expect(validateHostConfig(c).some(e => e.includes('name'))).toBe(true);
  });

  test('name with spaces is caught', () => {
    const c = makeValid();
    c.name = 'has spaces';
    expect(validateHostConfig(c).length).toBeGreaterThan(0);
  });

  test('empty displayName is caught', () => {
    const c = makeValid();
    c.displayName = '';
    expect(validateHostConfig(c).some(e => e.includes('displayName'))).toBe(true);
  });

  test('invalid cliCommand is caught', () => {
    const c = makeValid();
    c.cliCommand = 'has spaces';
    expect(validateHostConfig(c).some(e => e.includes('cliCommand'))).toBe(true);
  });

  test('invalid cliAlias is caught', () => {
    const c = makeValid();
    c.cliAliases = ['good', 'BAD!'];
    expect(validateHostConfig(c).some(e => e.includes('cliAlias'))).toBe(true);
  });

  test('valid cliAliases pass', () => {
    const c = makeValid();
    c.cliAliases = ['alias-one', 'alias-two'];
    expect(validateHostConfig(c)).toEqual([]);
  });

  test('invalid globalRoot is caught', () => {
    const c = makeValid();
    c.globalRoot = 'path with spaces';
    expect(validateHostConfig(c).some(e => e.includes('globalRoot'))).toBe(true);
  });

  test('invalid localSkillRoot is caught', () => {
    const c = makeValid();
    c.localSkillRoot = 'invalid<path>';
    expect(validateHostConfig(c).some(e => e.includes('localSkillRoot'))).toBe(true);
  });

  test('invalid hostSubdir is caught', () => {
    const c = makeValid();
    c.hostSubdir = 'no spaces allowed';
    expect(validateHostConfig(c).some(e => e.includes('hostSubdir'))).toBe(true);
  });

  test('invalid frontmatter.mode is caught', () => {
    const c = makeValid();
    (c.frontmatter as any).mode = 'invalid';
    expect(validateHostConfig(c).some(e => e.includes('frontmatter.mode'))).toBe(true);
  });

  test('invalid linkingStrategy is caught', () => {
    const c = makeValid();
    (c.install as any).linkingStrategy = 'invalid';
    expect(validateHostConfig(c).some(e => e.includes('linkingStrategy'))).toBe(true);
  });

  test('paths with $ and ~ are valid', () => {
    const c = makeValid();
    c.globalRoot = '$HOME/.test/skills/ohmystack';
    c.localSkillRoot = '~/.test/skills/ohmystack';
    expect(validateHostConfig(c)).toEqual([]);
  });

  test('shell injection attempt in cliCommand is caught', () => {
    const c = makeValid();
    c.cliCommand = 'opencode;rm -rf /';
    expect(validateHostConfig(c).some(e => e.includes('cliCommand'))).toBe(true);
  });
});

describe('validateAllConfigs', () => {
  test('real config passes validation', () => {
    expect(validateAllConfigs(ALL_HOST_CONFIGS)).toEqual([]);
  });

  test('duplicate name detected', () => {
    const dup = { ...opencode } as HostConfig;
    expect(validateAllConfigs([opencode, dup]).some(e => e.includes('Duplicate name'))).toBe(true);
  });

  test('duplicate hostSubdir detected', () => {
    const dup = { ...opencode, name: 'dup-host' } as HostConfig;
    expect(validateAllConfigs([opencode, dup]).some(e => e.includes('Duplicate hostSubdir'))).toBe(true);
  });

  test('duplicate globalRoot detected', () => {
    const dup = { ...opencode, name: 'dup-host', hostSubdir: '.dup', globalRoot: opencode.globalRoot } as HostConfig;
    expect(validateAllConfigs([opencode, dup]).some(e => e.includes('Duplicate globalRoot'))).toBe(true);
  });

  test('per-config validation errors are prefixed with host name', () => {
    const bad = { ...opencode, name: 'BAD', cliCommand: 'also bad' } as HostConfig;
    const errors = validateAllConfigs([bad]);
    expect(errors.every(e => e.startsWith('[BAD]'))).toBe(true);
  });
});

describe('HOST_PATHS derivation from configs', () => {
  test('opencode uses env var paths', () => {
    expect(HOST_PATHS.opencode.skillRoot).toBe('$OHMYSTACK_ROOT');
    expect(HOST_PATHS.opencode.binDir).toBe('$OHMYSTACK_BIN');
    expect(HOST_PATHS.opencode.browseDir).toBe('$OHMYSTACK_BROWSE');
    expect(HOST_PATHS.opencode.designDir).toBe('$OHMYSTACK_DESIGN');
    expect(HOST_PATHS.opencode.localSkillRoot).toBe(opencode.localSkillRoot);
  });

  test('HOST_PATHS has entry for every registered host', () => {
    expect(Object.keys(HOST_PATHS)).toEqual(['opencode']);
  });
});

describe('host-config-export.ts CLI', () => {
  const EXPORT_SCRIPT = path.join(ROOT, 'scripts', 'host-config-export.ts');

  function run(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
    const result = Bun.spawnSync(['bun', 'run', EXPORT_SCRIPT, ...args], {
      cwd: ROOT, stdout: 'pipe', stderr: 'pipe',
    });
    return {
      stdout: result.stdout.toString().trim(),
      stderr: result.stderr.toString().trim(),
      exitCode: result.exitCode,
    };
  }

  test('list prints all host names', () => {
    const { stdout, exitCode } = run('list');
    expect(exitCode).toBe(0);
    expect(stdout.split('\n')).toEqual(['opencode']);
  });

  test('get returns string field', () => {
    const { stdout, exitCode } = run('get', 'opencode', 'globalRoot');
    expect(exitCode).toBe(0);
    expect(stdout).toBe('.config/opencode/skills/ohmystack');
  });

  test('get returns boolean as 1/0', () => {
    const { stdout } = run('get', 'opencode', 'usesEnvVars');
    expect(stdout).toBe('1');
  });

  test('get with missing args exits 1', () => {
    expect(run('get', 'opencode').exitCode).toBe(1);
  });

  test('get with unknown field exits 1', () => {
    expect(run('get', 'opencode', 'nonexistent').exitCode).toBe(1);
  });

  test('get with unknown host exits 1', () => {
    expect(run('get', 'nonexistent', 'name').exitCode).not.toBe(0);
  });

  test('validate passes for real config', () => {
    const { stdout, exitCode } = run('validate');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('configs valid');
  });

  test('symlinks returns asset list', () => {
    const { stdout, exitCode } = run('symlinks', 'opencode');
    expect(exitCode).toBe(0);
    const lines = stdout.split('\n');
    expect(lines).toContain('bin');
    expect(lines).toContain('ETHOS.md');
    expect(lines).toContain('review/checklist.md');
  });

  test('symlinks with missing host exits 1', () => {
    expect(run('symlinks').exitCode).toBe(1);
  });

  test('detect includes opencode when available', () => {
    const { stdout, exitCode } = run('detect');
    expect(exitCode).toBe(0);
    expect(stdout.split('\n')).toContain('opencode');
  });

  test('unknown command exits 1', () => {
    expect(run('badcommand').exitCode).toBe(1);
  });
});

describe('golden-file regression', () => {
  const GOLDEN_DIR = path.join(ROOT, 'test', 'fixtures', 'golden');

  test('only opencode golden file remains', () => {
    expect(fs.readdirSync(GOLDEN_DIR).sort()).toEqual(['opencode-ship-SKILL.md']);
  });

  test('opencode ship skill matches golden baseline', () => {
    const golden = fs.readFileSync(path.join(GOLDEN_DIR, 'opencode-ship-SKILL.md'), 'utf-8');
    const current = fs.readFileSync(path.join(ROOT, 'opencode', 'skills', 'ohmystack-ship', 'SKILL.md'), 'utf-8');
    expect(current).toBe(golden);
  });
});

describe('host config correctness', () => {
  test('opencode is the only registered host', () => {
    expect(ALL_HOST_CONFIGS).toEqual([opencode]);
  });

  test('opencode install strategy is non-prefixable symlink-generated', () => {
    expect(opencode.install.prefixable).toBe(false);
    expect(opencode.install.linkingStrategy).toBe('symlink-generated');
  });

  test('opencode uses env vars and basic learnings mode', () => {
    expect(opencode.usesEnvVars).toBe(true);
    expect(opencode.learningsMode).toBe('basic');
  });

  test('opencode skips codex skill and keeps path rewrites', () => {
    expect(opencode.generation.skipSkills).toContain('codex');
    expect(opencode.pathRewrites.length).toBeGreaterThan(0);
  });

  test('opencode runtime root includes expected shared assets', () => {
    expect(opencode.runtimeRoot.globalSymlinks).toContain('bin');
    expect(opencode.runtimeRoot.globalSymlinks).toContain('ETHOS.md');
  });
});
