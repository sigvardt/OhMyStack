import type { HostConfig } from '../scripts/host-config';

const LEGACY_SKILL_ROOT = ['~/.claude/skills/', 'g', 'stack'].join('');
const LEGACY_LOCAL_SKILL_ROOT = ['.claude/skills/', 'g', 'stack'].join('');

const opencode: HostConfig = {
  name: 'opencode',
  displayName: 'OpenCode',
  cliCommand: 'opencode',
  cliAliases: [],

  globalRoot: '.config/opencode/skills/ohmystack',
  localSkillRoot: '.opencode/skills/ohmystack',
  hostSubdir: 'opencode',
  usesEnvVars: true,

  frontmatter: {
    mode: 'allowlist',
    keepFields: ['name', 'description'],
    descriptionLimit: null,
  },

  generation: {
    generateMetadata: false,
    skipSkills: ['codex'],
  },

  pathRewrites: [
    { from: LEGACY_SKILL_ROOT, to: '~/.config/opencode/skills/ohmystack' },
    { from: LEGACY_LOCAL_SKILL_ROOT, to: '.opencode/skills/ohmystack' },
    { from: '.claude/skills', to: '.opencode/skills' },
  ],

  runtimeRoot: {
    globalSymlinks: ['bin', 'browse/dist', 'browse/bin', 'ohmystack-upgrade', 'ETHOS.md'],
    globalFiles: {
      'review': ['checklist.md', 'TODOS-format.md'],
    },
  },

  install: {
    prefixable: false,
    linkingStrategy: 'symlink-generated',
  },

  learningsMode: 'basic',
};

export default opencode;
