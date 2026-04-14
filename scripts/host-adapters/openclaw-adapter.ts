/**
 * OpenClaw host adapter — post-processing content transformer.
 *
 * Runs AFTER generic frontmatter/path/tool rewrites from the config system.
 * Handles semantic transformations that string-replace can't cover:
 *
 * 1. AskUserQuestion → prose instructions (tool call → "ask the user")
 * 2. Agent spawning → sessions_spawn patterns
 * 3. Browse binary patterns ($B → browser/exec)
 * 4. Preamble binary references → strip or map
 *
 * Interface: transform(content, config) → transformed content
 */

import type { HostConfig } from '../host-config';

/**
 * Transform generated SKILL.md content for OpenClaw compatibility.
 * Called after all generic rewrites (paths, tools, frontmatter) have been applied.
 */
export function transform(content: string, _config: HostConfig): string {
  let result = content;
  const replaceAll = (source: string, search: string, replacement: string): string =>
    source.split(search).join(replacement);

  // 1. AskUserQuestion references → prose
  result = replaceAll(result, 'AskUserQuestion', 'ask the user directly in chat');
  result = replaceAll(result, 'Use AskUserQuestion', 'Ask the user directly');
  result = replaceAll(result, 'use AskUserQuestion', 'ask the user directly');

  // 2. Agent tool references → sessions_spawn
  result = replaceAll(result, 'the Agent tool', 'sessions_spawn');
  result = replaceAll(result, 'Agent tool', 'sessions_spawn');
  result = replaceAll(result, 'subagent_type', 'task parameter');

  // 3. Browse binary patterns
  result = replaceAll(result, '`$B ', '`exec $B ');

  // 4. Strip OhMyStack binary references that won't exist on OpenClaw
  // These are preamble utilities — OpenClaw doesn't use them
  result = result.replace(/~\/\.openclaw\/skills\/ohmystack\/bin\/ohmystack-[\w-]+/g, (match) => {
    // Keep the reference but note it as exec-based
    return match;
  });

  return result;
}
