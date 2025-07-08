import { it, expectTypeOf } from 'vitest'
import type Modifier from './Modifier'

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

it('should allow dot notation in $set', () => {
  expectTypeOf<Modifier<TestUser>>().toExtend<{
    $set?: {
      'address.street'?: string,
      'deep.nested.value'?: boolean,
      'scores.$.math'?: number,
    },
    $inc?: {
      age?: number,
    },
  }>()
})

it('should allow array modifications', () => {
  expectTypeOf<Modifier<TestUser>>().toExtend<{
    $push?: {
      'tags'?: string | { $each?: string[] | undefined },
      'scores.$.math'?: number | { $each?: number[] | undefined },
    },
    $pushAll?: {
      scores?: {
        math?: number,
        science?: number,
        deep?: {
          nested?: boolean,
        },
      },
    },
  }>()
})
