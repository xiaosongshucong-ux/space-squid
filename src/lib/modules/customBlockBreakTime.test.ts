import { EventEmitter } from 'node:events'
import { expect, test, vi } from 'vitest'
import { player as setupPlayer, server as setupServer } from './customBlockBreakTime'

const makePlayer = (uuid: string) => {
  const p: any = new EventEmitter()
  p.uuid = uuid
  p.heldItemSlot = 0
  p.inventory = { slots: {} }
  p._client = { registerChannel: vi.fn(), writeChannel: vi.fn() }
  return p
}

const makeServer = () => {
  const serv: any = { uuidToPlayer: {} }
  setupServer(serv)
  return serv
}

const connect = async (serv: any, p: any) => {
  serv.uuidToPlayer[p.uuid] = p
  await setupPlayer(p, serv)
  return p
}

test('a partial config that omits toolNames is usable instead of throwing', async () => {
  const serv = makeServer()
  const p = await connect(serv, makePlayer('u1'))

  serv.customSetPlayerBreakTime('u1', { blocks: { 1: 0.25 } })

  expect(() => p.customGetBreakTime({ stateId: 1 })).not.toThrow()
  expect(p.customGetBreakTime({ stateId: 1 })).toBe(0.25)
})

test('an explicit tool restriction is still enforced', async () => {
  const serv = makeServer()
  const p = await connect(serv, makePlayer('u1'))
  serv.customSetPlayerBreakTime('u1', { blocks: { 1: 0.25 }, toolNames: ['stone_pickaxe'] })

  p.inventory.slots[36] = { name: 'wooden_pickaxe' }
  expect(p.customGetBreakTime({ stateId: 1 })).toBeUndefined()

  p.inventory.slots[36] = { name: 'stone_pickaxe' }
  expect(p.customGetBreakTime({ stateId: 1 })).toBe(0.25)
})

test('wildcard times apply to any block state', async () => {
  const serv = makeServer()
  const p = await connect(serv, makePlayer('u1'))

  serv.customSetPlayerBreakTime('u1', { blocks: { '*': 1.5 } })
  expect(p.customGetBreakTime({ stateId: 42 })).toBe(1.5)
  expect(p.customGetBreakTime({ stateId: 7 })).toBe(1.5)

  serv.customSetPlayerBreakTime('u1', { blocks: { 42: 0.5 } })
  expect(p.customGetBreakTime({ stateId: 42 })).toBe(0.5)
})

test('a partial update only touching one field keeps the other fields', async () => {
  const serv = makeServer()
  const p = await connect(serv, makePlayer('u1'))

  serv.customSetPlayerBreakTime('u1', { blocks: { 1: 0.25 } })
  serv.customSetPlayerBreakTime('u1', { toolNames: ['stone_pickaxe'] })

  p.inventory.slots[36] = { name: 'stone_pickaxe' }
  expect(p.customGetBreakTime({ stateId: 1 })).toBe(0.25)

  p.inventory.slots[36] = { name: 'wooden_pickaxe' }
  expect(p.customGetBreakTime({ stateId: 1 })).toBeUndefined()
})

test('removal sends the empty configuration so the client drops the override', async () => {
  const serv = makeServer()
  const p = await connect(serv, makePlayer('u1'))
  serv.customSetPlayerBreakTime('u1', { blocks: { 1: 0.25 }, toolNames: ['stone_pickaxe'] })
  p._client.writeChannel.mockClear()

  serv.customRemovePlayerBreakTime('u1')

  expect(p._client.writeChannel).toHaveBeenCalledTimes(1)
  const payload = p._client.writeChannel.mock.calls[0][1]
  expect(JSON.parse(payload.newConfiguration)).toEqual({
    customBreakTime: {},
    customBreakTimeToolAllowance: []
  })
  expect(p.customGetBreakTime({ stateId: 1 })).toBeUndefined()
})

test('an unconfigured login still sends nothing', async () => {
  const serv = makeServer()
  const p = await connect(serv, makePlayer('u1'))

  p.emit('login')

  expect(p._client.writeChannel).not.toHaveBeenCalled()
})

test('a configured login sends its configuration', async () => {
  const serv = makeServer()
  const p = await connect(serv, makePlayer('u1'))
  serv.customSetPlayerBreakTime('u1', { blocks: { 1: 0.25 } })
  p._client.writeChannel.mockClear()

  p.emit('login')

  expect(p._client.writeChannel).toHaveBeenCalledTimes(1)
  const payload = p._client.writeChannel.mock.calls[0][1]
  expect(JSON.parse(payload.newConfiguration).customBreakTime).toEqual({ 1: 0.25 })
})
