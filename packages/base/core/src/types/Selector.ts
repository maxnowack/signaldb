// original from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/meteor/mongo.d.ts

export interface FieldExpression<T> {
  $eq?: T,
  $gt?: T,
  $gte?: T,
  $lt?: T,
  $lte?: T,
  $in?: T[] | undefined,
  $nin?: T[],
  $ne?: T,
  $exists?: boolean,
  $not?: FieldExpression<T>,
  $expr?: FieldExpression<T>,
  $jsonSchema?: any,
  $mod?: number[],
  $regex?: RegExp | string,
  $options?: string,
  $text?: {
    $search: string,
    $language?: string,
    $caseSensitive?: boolean,
    $diacriticSensitive?: boolean,
  },
  $where?: string | ((item: T) => boolean),
  $all?: T[],
  $elemMatch?: T extends object ? Query<T> : FieldExpression<T>,
  $size?: number,
  $bitsAllClear?: any,
  $bitsAllSet?: any,
  $bitsAnyClear?: any,
  $bitsAnySet?: any,
}

// Recursive type to generate dot-notation keys
export type DotNotation<T> = {
  [K in keyof T & string]: T[K] extends Array<infer U>
    // If it's an array, include both the index and the $ wildcard
    ? `${K}` | `${K}.$` | `${K}.${DotNotation<U>}`
    // If it's an object, recurse into it
    : T[K] extends object
      ? `${K}` | `${K}.${DotNotation<T[K]>}`
      : `${K}` // Base case: Just return the key
}[keyof T & string]

export type GetType<T, P extends string>
  = P extends `${infer H}.${infer R}`
    ? H extends keyof T
      ? T[H] extends Array<infer U>
        ? GetType<U, R>
        : GetType<T[H], R>
      : H extends '$'
        ? T extends Array<infer U>
          ? GetType<U, R>
          : never
        : never
    : P extends keyof T
      ? T[P]
      : never

type FlatQuery<T> = {
  [P in DotNotation<T>]?: FlatQueryValue<T, P>
}

type FieldValue<U> = U extends string
  ? string | RegExp | FieldExpression<string>
  : U | FieldExpression<U>

type FlatQueryValue<T, P extends string> = GetType<T, P> extends never
  ? never
  : GetType<T, P> extends Array<infer U>
    ? FieldValue<U> | FieldValue<U[]>
    : FieldValue<GetType<T, P>>

type Query<T> = FlatQuery<T> & {
  $or?: Query<T>[],
  $and?: Query<T>[],
  $nor?: Query<T>[],
}

export type FlatSelector<T extends Record<string, any>> = FlatQuery<T> & {
  $or?: never,
  $and?: never,
  $nor?: never,
}
type Selector<T extends Record<string, any>> = Query<T>
export default Selector
