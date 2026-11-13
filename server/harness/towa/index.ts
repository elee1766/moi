// towa (github.com/gfx-labs/towa) as a Harness, over ACP. towa has no UI and
// no profiles: one `towa serve` process per workspace, configured by towa's
// own config files and environment. Everything else is ../acp/.
//
// towa speaks the current ACP revision: models are a `model`-category session
// config option switched with `session/set_config_option`, which ../acp/
// handles for any agent that advertises one.
import { createAcpHarness } from '../acp/harness'
import { findHarnessExecutable } from '../executable'

export const towaHarness = createAcpHarness({
  label: 'towa',
  config: {
    id: 'towa',
    provider: 'towa',
    // `auto` runs every tool call without asking, matching moi's
    // bypass-permissions trust model.
    noPromptModeId: 'auto',
    supportsImages: true,
    async spawn(ctx) {
      const bin = findHarnessExecutable('towa')
      if (!bin) throw new Error('towa executable not found')
      return { provider: 'towa', command: bin, args: ['serve'], workspacePath: ctx.workspacePath }
    }
  }
})
