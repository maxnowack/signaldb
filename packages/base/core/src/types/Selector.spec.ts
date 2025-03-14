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
  expectTypeOf<Selector<TestUser>>().toExtend<{
    name?: string | RegExp | FieldExpression<string>,
    age?: number | FieldExpression<number>,
  }>()
})

it('should allow nested object queries', () => {
  expectTypeOf<Selector<TestUser>>().toExtend<{
    'address.street'?: string | RegExp | FieldExpression<string>,
    'address.city'?: string | RegExp | FieldExpression<string>,
  }>()
})

it('should allow array queries', () => {
  expectTypeOf<Selector<TestUser>>().toExtend<{
    'tags'?: string | RegExp | FieldExpression<string> | string[] | FieldExpression<string[]>,
    'tags.$'?: string | RegExp | FieldExpression<string>,
  }>()
  expectTypeOf<FlatSelector<TestUser>['tags']>().toEqualTypeOf<string | RegExp | FieldExpression<string> | string[] | FieldExpression<string[]> | undefined>()
})

it('should allow array of objects queries', () => {
  expectTypeOf<Selector<TestUser>>().toExtend<{
    'scores.math'?: number | FieldExpression<number>,
    'scores.$.math'?: number | FieldExpression<number>,
  }>()
})

it('should allow logical operators', () => {
  expectTypeOf<Selector<TestUser>>().toExtend<{
    $or?: Selector<TestUser>[],
    $and?: Selector<TestUser>[],
    $nor?: Selector<TestUser>[],
  }>()
})

it('should allow deep nested queries', () => {
  expectTypeOf<Selector<TestUser>>().toExtend<{
    'deep.nested.value'?: boolean | FieldExpression<false> | FieldExpression<true>,
  }>()
  expectTypeOf<Selector<TestUser>>().toExtend<{
    'scores.deep.nested'?: boolean | FieldExpression<false> | FieldExpression<true>,
    'scores.$.deep.nested'?: boolean | FieldExpression<false> | FieldExpression<true>,
  }>()
})
