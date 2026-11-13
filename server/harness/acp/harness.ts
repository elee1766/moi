// The Harness object every ACP provider shares. A provider folder supplies its
// AcpProviderConfig and overrides only what differs (discovery, availability,
// skills location); the session, list, model and process wiring lives here.
import type { Harness, HarnessCapabilities } from '../types'
import type { HarnessType } from '@/lib/types'

import { acpWorkspacePreview, listAcpModels, listAcpSessions } from './discovery'
import {
  type AcpProviderConfig,
  ensureAcpSessionLive,
  forgetAcpWorkspaceSessions,
  forgetAcpSession,
  forgetAllAcpSessions,
  getAcpActiveSessions,
  getLiveAcpEvents,
  interruptAcpRun,
  sendAcpMessage
} from './session'
import { archiveAcpSession } from './archived'
import { getAcpProcessInfo, killAcpWorkspace, killAllAcpClients } from './client'
import { findHarnessExecutable, pathHarnessAvailability } from '../executable'

export type AcpHarnessOptions = {
  config: AcpProviderConfig & { id: HarnessType }
  // Name used in `moi status` lines.
  label: string
  capabilities?: Partial<HarnessCapabilities>
  overrides?: Partial<Harness>
}

function ctxOf(ws: { id: string; path: string; agentId?: string }) {
  return { workspaceId: ws.id, workspacePath: ws.path, agentId: ws.agentId }
}

export function createAcpHarness({
  config,
  label,
  capabilities,
  overrides
}: AcpHarnessOptions): Harness {
  const stop = (workspacePath: string) => {
    forgetAcpWorkspaceSessions(workspacePath)
    killAcpWorkspace(workspacePath)
  }
  return {
    id: config.id,
    capabilities: {
      supportsStreaming: true, // ACP always streams deltas; moi gates forwarding
      imagesInline: 'base64',
      liveModelSwitch: true,
      liveEffortSwitch: false, // ACP has no reasoning-effort concept
      nativeUserEcho: false, // ACP never echoes the send; moi synthesizes the turn
      ...capabilities
    },

    sendMessage: input => sendAcpMessage(config, input),
    interrupt: (workspaceId, sessionId) => interruptAcpRun(config, { workspaceId, sessionId }),
    // Archiving is moi-side (see ./archived.ts): agents differ on whether they
    // implement `session/delete`, and moi only needs to hide the chat.
    archiveSession: async (ws, sessionId) => {
      await archiveAcpSession(ws.path, sessionId)
      forgetAcpSession(ws.id, sessionId)
    },
    activeSessions: () => getAcpActiveSessions(),

    listSessions: ws => listAcpSessions(config, ctxOf(ws)),
    workspacePreview: (ws, includeFirstUserMessage) =>
      acpWorkspacePreview(config, ctxOf(ws), includeFirstUserMessage),
    // Prefer the live view when one exists; otherwise resume the session so WS
    // frames upsert into the same view.
    sessionEvents: async (ws, sessionId) => {
      const live = getLiveAcpEvents(ws.id, sessionId)
      if (live) return live
      try {
        return await ensureAcpSessionLive(config, { ...ctxOf(ws), sessionId })
      } catch {
        return []
      }
    },
    listModels: ws => listAcpModels(config, ctxOf(ws)),

    availability: () => pathHarnessAvailability(config.id),

    onEnvChanged: stop,
    stopWorkspace: stop,
    shutdown: () => {
      forgetAllAcpSessions()
      killAllAcpClients()
    },
    skillsDir: workspaceRoot => `${workspaceRoot}/.agents/skills`,
    debugInfo: ws => getAcpProcessInfo(ws.path, findHarnessExecutable(config.id)),
    wireScope: ws => ws.path,

    statusLines: () => {
      const active = getAcpActiveSessions()
      return [
        `${config.id} executable  ${findHarnessExecutable(config.id) ?? '(not found)'}`,
        `live ${label} runs  ${active.length}`,
        ...active.map(r => `  ▶ busy  ws=${r.workspaceId}  session=${r.sessionId}`)
      ]
    },
    ...overrides
  }
}
