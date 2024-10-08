// borrowed from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/meteor/mongo.d.ts

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
  // eslint-disable-next-line no-use-before-define
  $elemMatch?: T extends object ? Query<T> : FieldExpression<T> | undefined,
  $size?: number | undefined,
  $bitsAllClear?: any,
  $bitsAllSet?: any,
  $bitsAnyClear?: any,
  $bitsAnySet?: any,
}

type Flatten<T> = T extends any[] ? T[0] : T

type FlatQuery<T> = {
  [P in keyof T]?: Flatten<T[P]> | RegExp | FieldExpression<Flatten<T[P]>>
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
