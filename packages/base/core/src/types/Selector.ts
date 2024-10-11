// original from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/meteor/mongo.d.ts

export interface FieldExpression<T> {
  $eq?: T | undefined,
  $gt?: T | undefined,
  $gte?: T | undefined,
  $lt?: T | undefined,
  $lte?: T | undefined,
  $in?: T[] | undefined,
  $nin?: T[] | undefined,
  $ne?: T | undefined,
  $exists?: boolean | undefined,
  $not?: FieldExpression<T> | undefined,
  $expr?: FieldExpression<T> | undefined,
  $jsonSchema?: any,
  $mod?: number[] | undefined,
  $regex?: RegExp | string | undefined,
  $options?: string | undefined,
  $text?:
    | {
      $search: string,
      $language?: string | undefined,
      $caseSensitive?: boolean | undefined,
      $diacriticSensitive?: boolean | undefined,
    }
    | undefined,
  $where?: string | ((item: T) => boolean) | undefined,
  $all?: T[] | undefined,

  $elemMatch?: T extends object ? Query<T> : FieldExpression<T> | undefined,
  $size?: number | undefined,
  $bitsAllClear?: any,
  $bitsAllSet?: any,
  $bitsAnyClear?: any,
  $bitsAnySet?: any,
}

// Utility type to check if a type is an array or object.
type IsObject<T> = T extends object ? (T extends Array<any> ? false : true) : false

// Recursive type to generate dot-notation keys
type DotNotationKeys<T> = {
  [K in keyof T & (string | number)]:
  T[K] extends Array<infer U>
  // If it's an array, include both the index and the $ wildcard
    ? `${K}` | `${K}.$` | `${K}.${DotNotationKeys<U>}`
  // If it's an object, recurse into it
    : IsObject<T[K]> extends true
      ? `${K}` | `${K}.${DotNotationKeys<T[K]>}`
      : `${K}` // Base case: Just return the key
}[keyof T & (string | number)]

type Split<S extends string, Delimiter extends string> =
  S extends `${infer Head}${Delimiter}${infer Tail}`
    ? [Head, ...Split<Tail, Delimiter>]
    : [S]

type GetTypeByParts<T, Parts extends readonly string[]> =
  Parts extends [infer Head, ...infer Tail]
    ? Head extends keyof T
      ? GetTypeByParts<T[Head], Extract<Tail, string[]>>
      : Head extends '$'
        ? T extends Array<infer U>
          ? GetTypeByParts<U, Extract<Tail, string[]>>
          : never
        : never
    : T

type Get<T, Path extends string> =
  GetTypeByParts<T, Split<Path, '.'>>

type Flatten<T> = T extends any[] ? T[0] : T

type FlatQuery<T> = {
  [P in DotNotationKeys<T>]?: Flatten<Get<T, P>> | RegExp | FieldExpression<Flatten<Get<T, P>>>
}
type Query<T> = FlatQuery<T> & {
  $or?: Query<T>[] | undefined,
  $and?: Query<T>[] | undefined,
  $nor?: Query<T>[] | undefined,
}

export type FlatSelector<T extends Record<string, any> = Record<string, any>> = FlatQuery<T> & {
  $or?: never,
  $and?: never,
  $nor?: never,
}

type Selector<T extends Record<string, any> = Record<string, any>> = Query<T>
export default Selector
