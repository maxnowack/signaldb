// borrowed from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/meteor/mongo.d.ts

import type { DotNotation, GetType } from './Selector'

type Dictionary<T> = Record<string, T>
type PartialMapTo<T, M> = Partial<Record<DotNotation<T>, M>> & Dictionary<M>
type OnlyElementsOfArrays<T> = T extends any[] ? Partial<T[0]> : never
type ElementsOf<T> = {
  [P in DotNotation<T>]?: OnlyElementsOfArrays<GetType<T, P>>
}
type PushModifier<T> = {
  [P in DotNotation<T>]?:
    | OnlyElementsOfArrays<GetType<T, P>>
    | {
      $each?: GetType<T, P> | undefined,
      $position?: number | undefined,
      $slice?: number | undefined,
      $sort?: 1 | -1 | Dictionary<number> | undefined,
    }
}
type ArraysOrEach<T> = {
  [P in DotNotation<T>]?: OnlyElementsOfArrays<GetType<T, P>> | { $each: GetType<T, P> }
}
type CurrentDateModifier = { $type: 'timestamp' | 'date' } | true

type Modifier<T extends Dictionary<any> = Dictionary<any>>
  = | {
    $currentDate?:
    | (Partial<Record<DotNotation<T>, CurrentDateModifier>> & Dictionary<CurrentDateModifier>)
    | undefined,
    $inc?: (PartialMapTo<T, number> & Dictionary<number>) | undefined,
    $min?: (PartialMapTo<T, Date | number> & Dictionary<Date | number>) | undefined,
    $max?: (PartialMapTo<T, Date | number> & Dictionary<Date | number>) | undefined,
    $mul?: (PartialMapTo<T, number> & Dictionary<number>) | undefined,
    $rename?: (PartialMapTo<T, string> & Dictionary<string>) | undefined,
    $set?: ({ [P in DotNotation<T>]?: GetType<T, P> } & Dictionary<any>) | undefined,
    $setOnInsert?: ({ [P in DotNotation<T>]?: GetType<T, P> } & Dictionary<any>) | undefined,
    $unset?: (PartialMapTo<T, string | boolean | 1 | 0> & Dictionary<any>) | undefined,
    $addToSet?: (ArraysOrEach<T> & Dictionary<any>) | undefined,
    $push?: (PushModifier<T> & Dictionary<any>) | undefined,
    $pull?: (ElementsOf<T> & Dictionary<any>) | undefined,
    $pullAll?: ({ [P in DotNotation<T>]?: GetType<T, P> } & Dictionary<any>) | undefined,
    $pop?: (PartialMapTo<T, 1 | -1> & Dictionary<1 | -1>) | undefined,
  }

export default Modifier
