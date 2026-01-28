import { describe, it, expect } from 'vitest'
import randomId from './randomId'

describe('randomId', () => {
  it('should return a string of length 16', () => {
    const id = randomId()
    expect(id).toHaveLength(16)
  })

  it('should generate unique ids across multiple calls', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) ids.add(randomId())
    expect(ids.size).toBe(1000)
  })
})
