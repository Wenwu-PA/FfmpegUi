import { describe, expect, it } from 'vitest'
import { calculateTargetVideoBitrateKbps } from './targetSize'

describe('calculateTargetVideoBitrateKbps', () => {
  it('reserves audio and container overhead', () => expect(calculateTargetVideoBitrateKbps(25, 60)).toBe(3_072))
  it('rejects a zero duration', () => expect(() => calculateTargetVideoBitrateKbps(25, 0)).toThrow(RangeError))
  it('rejects a target that cannot fit the audio stream', () => expect(() => calculateTargetVideoBitrateKbps(0.1, 60)).toThrow(RangeError))
})
