// Hermes Agent as a Harness, over ACP. Thin wiring: the protocol lives in
// ../acp/, this folder holds only what is Hermes-specific — profile discovery
// (the importable "agents"), the spawn command, and availability.
//
// See ./NOTES.md for the protocol research and the two backend quirks the ACP
// layer works around.
import type { DiscoveredWorkspaceCandidate } from '../types'
import { join } from 'node:path'

import type { HarnessAvailability } from '@/lib/types'

import { type AcpProviderConfig } from '../acp/session'
import { createAcpHarness } from '../acp/harness'
import {
  DEFAULT_PROFILE,
  discoverHermesProfiles,
  hermesConfigFingerprint,
  profileHomeFromWorkspace,
  resolveHermesProfile
} from './discovery'
import { hermesModels } from './models'
import { findHarnessExecutable, pathHarnessAvailability } from '../executable'

// Hermes ships three session modes; `dont_ask` is the one that auto-allows
// file edits without an approval round-trip, matching moi's
// bypass-permissions trust model (NOTES.md §3.5).
const NO_PROMPT_MODE = 'dont_ask'

const config: AcpProviderConfig = {
  id: 'hermes',
  provider: 'hermes',
  noPromptModeId: NO_PROMPT_MODE,
  mapModels: hermesModels,
  // The profile's default model (`currentModelId` on `session/new`) follows
  // config.yaml, which `hermes model` and hand edits change while moi runs.
  // Stamp the cache with the config mtimes so such a change is picked up on
  // the next snapshot without opening a throwaway session every time.
  modelStateFingerprint: async ctx => {
    const profile = await resolveHermesProfile(ctx.workspacePath, ctx.agentId)
    return hermesConfigFingerprint(profile?.home ?? profileHomeFromWorkspace(ctx.workspacePath))
  },
  supportsImages: true,
  async spawn(ctx) {
    const bin = findHarnessExecutable('hermes')
    if (!bin) throw new Error('hermes executable not found')
    // Profiles are separate agent identities; `-p` selects one. The default
    // profile takes no flag.
    const profile = await resolveHermesProfile(ctx.workspacePath, ctx.agentId)
    const agentId = profile?.agentId ?? ctx.agentId ?? DEFAULT_PROFILE
    const args = agentId === DEFAULT_PROFILE ? ['acp'] : ['-p', agentId, 'acp']
    return {
      provider: 'hermes',
      command: bin,
      args,
      workspacePath: ctx.workspacePath
    }
  }
}

export const hermesHarness = createAcpHarness({
  label: 'Hermes',
  config,
  capabilities: {
    // `session/set_model` works mid-session, but drops session-scoped MCP
    // servers (NOTES.md §3.10). Safe today because moi attaches none.
    liveModelSwitch: true
  },
  overrides: {
    // Profiles moi has not imported yet. Like OpenClaw, agents are only ever
    // imported — `moi hermes init <profile>` is the install path, and there is
    // no create-from-UI flow.
    discoverWorkspaces: async registeredPaths => {
      const profiles = await discoverHermesProfiles()
      return profiles
        .filter(p => !registeredPaths.has(p.path))
        .map((p): DiscoveredWorkspaceCandidate => ({ path: p.path, harness: 'hermes' }))
    },

    availability: async (ws): Promise<HarnessAvailability> => {
      const runtime = await pathHarnessAvailability('hermes')
      if (runtime.status !== 'available' || !ws) return runtime
      const profile = await resolveHermesProfile(ws.path, ws.agentId)
      if (profile) return { status: 'available' }
      return {
        status: 'unavailable',
        reason: 'Hermes profile not found — run moi hermes init to re-import it'
      }
    },

    // Hermes reads skills from the PROFILE home (`$HERMES_HOME/skills`) and has
    // no cwd-relative skill path, so installing into the workspace would leave
    // them invisible to `skill view` / `skills list` — see NOTES.md §13. That
    // makes moi's skills profile-global: every session on this profile sees
    // them, including plain `hermes` runs and gateway chats.
    skillsDir: workspaceRoot =>
      join(profileHomeFromWorkspace(workspaceRoot) ?? workspaceRoot, 'skills')
  }
})
