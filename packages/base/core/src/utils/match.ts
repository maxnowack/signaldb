import { Query } from 'mingo'
import type Selector from '../types/Selector'

type BaseItem = Record<string, any>

const maxRegexSourceLength = 512
const quantifier = String.raw`(?:[*+?]|\{\d+(?:,\d*)?\})`
const groupChunk = String.raw`(?:\\.|[^\\()[\]])`
const nestedQuantifierPattern = new RegExp(
  String.raw`\(${groupChunk}*${quantifier}${groupChunk}*\)${quantifier}`,
)

/**
 * Throws when a regex pattern is likely unsafe to evaluate against user data.
 */
function assertSafeRegex(pattern: RegExp | string) {
  const source = typeof pattern === 'string' ? pattern : pattern.source
  if (source.length > maxRegexSourceLength || nestedQuantifierPattern.test(source)) {
    throw new TypeError(`Unsafe $regex pattern rejected: ${source}`)
  }
}

/**
 * Walks a selector tree and validates every regex value before mingo sees it.
 */
function assertSafeRegexSelectors(value: unknown) {
  if (value instanceof RegExp) {
    assertSafeRegex(value)
    return
  }

  if (Array.isArray(value)) {
    value.forEach(assertSafeRegexSelectors)
    return
  }

  if (value == null || typeof value !== 'object') return

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === '$regex' && (typeof nestedValue === 'string' || nestedValue instanceof RegExp)) {
      assertSafeRegex(nestedValue)
      continue
    }
    assertSafeRegexSelectors(nestedValue)
  }
}

/**
 * Tests whether a given item matches a specified selector.
 * Uses the `mingo` library to evaluate the query.
 * @template T - The type of the item being tested.
 * @param item - The item to test against the selector.
 * @param selector - The query selector used to match the item.
 * @returns A boolean indicating whether the item matches the selector.
 */
export default function match<T extends BaseItem = BaseItem>(
  item: T,
  selector: Selector<T>,
) {
  assertSafeRegexSelectors(selector)
  const query = new Query(selector)
  return query.test(item)
}
