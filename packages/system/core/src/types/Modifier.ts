// borrowed from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/meteor/mongo.d.ts

type Dictionary<T> = Record<string, T>
type PartialMapTo<T, M> = Partial<Record<keyof T, M>>
type OnlyElementsOfArrays<T> = T extends any[] ? Partial<T[0]> : never
type ElementsOf<T> = {
  [P in keyof T]?: OnlyElementsOfArrays<T[P]>
}
type PushModifier<T> = {
  [P in keyof T]?:
  | OnlyElementsOfArrays<T[P]>
  | {
    $each?: T[P] | undefined,
    $position?: number | undefined,
    $slice?: number | undefined,
    $sort?: 1 | -1 | Dictionary<number> | undefined,
  }
}
type ArraysOrEach<T> = {
  [P in keyof T]?: OnlyElementsOfArrays<T[P]> | { $each: T[P] }
}
type CurrentDateModifier = { $type: 'timestamp' | 'date' } | true

type Modifier<T extends Dictionary<any> = Dictionary<any>> =
  | {
    $currentDate?:
    | (Partial<Record<keyof T, CurrentDateModifier>> & Dictionary<CurrentDateModifier>)
    | undefined,
    $inc?: (PartialMapTo<T, number> & Dictionary<number>) | undefined,
    $min?: (PartialMapTo<T, Date | number> & Dictionary<Date | number>) | undefined,
    $max?: (PartialMapTo<T, Date | number> & Dictionary<Date | number>) | undefined,
    $mul?: (PartialMapTo<T, number> & Dictionary<number>) | undefined,
    $rename?: (PartialMapTo<T, string> & Dictionary<string>) | undefined,
    $set?: (Partial<T> & Dictionary<any>) | undefined,
    $setOnInsert?: (Partial<T> & Dictionary<any>) | undefined,
    $unset?: (PartialMapTo<T, string | boolean | 1 | 0> & Dictionary<any>) | undefined,
    $addToSet?: (ArraysOrEach<T> & Dictionary<any>) | undefined,
    $push?: (PushModifier<T> & Dictionary<any>) | undefined,
    $pull?: (ElementsOf<T> & Dictionary<any>) | undefined,
    $pullAll?: (Partial<T> & Dictionary<any>) | undefined,
    $pop?: (PartialMapTo<T, 1 | -1> & Dictionary<1 | -1>) | undefined,
  }

export default Modifier
