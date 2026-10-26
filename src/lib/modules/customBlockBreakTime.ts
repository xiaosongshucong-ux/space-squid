import { Block } from 'prismarine-block'

// related to custom channels, everything starts with 'custom'

const CHANNEL_NAME = 'minecraft-web-client:block-interactions-customization'

export const server = (serv: Server) => {
  serv.customPlayersBreakTime ??= {}

  serv.customSetPlayerBreakTime = (uuid: string, config: Partial<BreakTimeConfig>) => {
    serv.customPlayersBreakTime[uuid] = {
      ...serv.customPlayersBreakTime[uuid],
      ...config
    }

    // Send update to the player if they're online
    const player = serv.uuidToPlayer[uuid]
    if (player) {
      player.sendBreakTimeConfig()
    }
  }

  serv.customRemovePlayerBreakTime = (uuid: string) => {
    delete serv.customPlayersBreakTime[uuid]

    // Send the empty configuration to the player if they're online,
    // even though the server-side entry has just been removed
    const player = serv.uuidToPlayer[uuid]
    if (player) {
      player.sendBreakTimeConfig(true)
    }
  }
}

export const player = async (player: Player, serv: Server) => {
  player.customGetBreakTime = (block: Block) => {
    const config = serv.customPlayersBreakTime[player.uuid]
    if (!config) return undefined

    // An omitted tool list means "any tool", mirroring the client serializer
    const toolNames = config.toolNames ?? []
    const heldItemName = player.inventory.slots[36 + player.heldItemSlot]?.name
    if (toolNames.length > 0 && !toolNames.includes(heldItemName ?? '')) {
      return undefined
    }

    return config.blocks?.[block.stateId] ?? config.blocks?.['*']
  }

  // Register the channel
  player._client.registerChannel(
    CHANNEL_NAME,
    ['container', [
      {
        name: 'newConfiguration',
        type: ['pstring', { countType: 'i16' }]
      }
    ]]
  )

  // Send initial configuration if it exists
  player.on('login', () => {
    player.sendBreakTimeConfig()
  })

  player.sendBreakTimeConfig = (force = false) => {
    const config = serv.customPlayersBreakTime[player.uuid]
    // Unconfigured logins send nothing; a forced send (removal) still emits the
    // empty payload so the client drops the override it was running with
    if (!config && !force) return

    const data = {
      customBreakTime: config?.blocks ?? {},
      customBreakTimeToolAllowance: config?.toolNames ?? [],
      ...config?.rawConfig
    }

    player._client.writeChannel(
      CHANNEL_NAME,
      {
        newConfiguration: JSON.stringify(data)
      }
    )
  }
}

export type BreakTimeConfig = {
  toolNames: string[]
  blocks: {
    [stateId: number]: number
    '*'?: number
  }
  rawConfig?: any
}

declare global {
  interface Server {
    customPlayersBreakTime: {
      [uuid: string]: BreakTimeConfig
    }
    customSetPlayerBreakTime: (uuid: string, config: Partial<BreakTimeConfig>) => void
    customRemovePlayerBreakTime: (uuid: string) => void
  }

  interface Player {
    customGetBreakTime: (block: Block) => number | undefined
    /** @internal */
    sendBreakTimeConfig: (force?: boolean) => void
  }
}
