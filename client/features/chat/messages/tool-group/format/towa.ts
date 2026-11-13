// towa vocabulary. towa sends a display-ready ACP title ("Run command") and the
// raw tool arguments as `rawInput`, so the label is the title and the brief
// comes from the argument that names the target.
import type { ToolCall } from '@/lib/types'

import { prettifyShellCommand } from './shell'
import { getInputValue, toolInput, type Shorten, type ToolFormatter } from './shared'

function displayName(call: ToolCall): string {
  const name = call.name.replace(/_/g, ' ')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

const BRIEF_KEYS = ['path', 'file_path', 'pattern', 'query', 'url', 'description'] as const

function brief(call: ToolCall, shorten: Shorten): string {
  const input = toolInput(call)
  const command = getInputValue(input, 'command')
  if (command) return `$ ${prettifyShellCommand(command)}`
  for (const key of BRIEF_KEYS) {
    const value = getInputValue(input, key)
    if (value) return shorten(value)
  }
  return ''
}

export const towaFormatter: ToolFormatter = { displayName, brief }
