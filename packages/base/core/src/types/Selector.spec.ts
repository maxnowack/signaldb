import { it, expectTypeOf } from 'vitest'
import type Selector from './Selector'
import type { FieldExpression, FlatSelector } from './Selector'

interface TestUser {
  name: string,
  age: number,
  tags: string[],
  address: {
    street: string,
    city: string,
  },
  scores: {
    math: number,
    science: number,
    deep: {
      nested: boolean,
    },
  }[],
  deep: {
    nested: {
      value: boolean,
    },
  },
}

it('should allow basic field queries', () => {
  expectTypeOf<Selector<TestUser>>().toMatchTypeOf<{
    name?: string | RegExp | FieldExpression<string>,
    age?: number | FieldExpression<number>,
  }>()
})

it('should allow nested object queries', () => {
  expectTypeOf<Selector<TestUser>>().toMatchTypeOf<{
    'address.street'?: string | RegExp | FieldExpression<string>,
    'address.city'?: string | RegExp | FieldExpression<string>,
  }>()
})

it('should allow array queries', () => {
  expectTypeOf<Selector<TestUser>>().toMatchTypeOf<{
    'tags'?: string | RegExp | FieldExpression<string> | string[] | FieldExpression<string[]>,
    'tags.$'?: string | RegExp | FieldExpression<string>,
  }>()
  expectTypeOf<FlatSelector<TestUser>['tags']>().toEqualTypeOf<string | RegExp | FieldExpression<string> | string[] | FieldExpression<string[]> | undefined>()
})

it('should allow array of objects queries', () => {
  expectTypeOf<Selector<TestUser>>().toMatchTypeOf<{
    'scores.math'?: number | FieldExpression<number>,
    'scores.$.math'?: number | FieldExpression<number>,
  }>()
})

it('should allow logical operators', () => {
  expectTypeOf<Selector<TestUser>>().toMatchTypeOf<{
    $or?: Selector<TestUser>[],
    $and?: Selector<TestUser>[],
    $nor?: Selector<TestUser>[],
  }>()
})

it('should allow deep nested queries', () => {
  expectTypeOf<Selector<TestUser>>().toMatchTypeOf<{
    'deep.nested.value'?: boolean | FieldExpression<false> | FieldExpression<true>,
  }>()
  expectTypeOf<Selector<TestUser>>().toMatchTypeOf<{
    'scores.deep.nested'?: boolean | FieldExpression<false> | FieldExpression<true>,
    'scores.$.deep.nested'?: boolean | FieldExpression<false> | FieldExpression<true>,
  }>()
})
