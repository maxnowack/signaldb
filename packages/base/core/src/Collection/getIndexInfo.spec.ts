import { describe, it, expect } from 'vitest'
import getIndexInfo from './getIndexInfo'
import createIndex from './createIndex'

describe('getIndexInfo', () => {
  it('should not match when selector is an empty object', () => {
    expect(getIndexInfo([], {})).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {},
    })
  })

  it('should not match if there are no index providers', () => {
    expect(getIndexInfo([], {
      name: 'John',
      age: 30,
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        name: 'John',
        age: 30,
      },
    })

    expect(getIndexInfo([], {
      $and: [
        { name: 'John' },
        { age: 30 },
      ],
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        $and: [
          { name: 'John' },
          { age: 30 },
        ],
      },
    })

    expect(getIndexInfo([], {
      $or: [
        { name: 'John' },
        { age: 30 },
      ],
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        $or: [
          { name: 'John' },
          { age: 30 },
        ],
      },
    })
  })

  it('should return the correct result when using single index provider', () => {
    const idIndex = createIndex('id')
    idIndex.rebuild([{ id: '0' }, { id: '1' }, { id: '2' }])

    // without match, flat selector
    expect(getIndexInfo([idIndex.query], {
      name: 'John',
      age: 30,
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        name: 'John',
        age: 30,
      },
    })

    // without match, $and selector
    expect(getIndexInfo([idIndex.query], {
      $and: [
        { name: 'John' },
        { age: 30 },
      ],
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        $and: [
          { name: 'John' },
          { age: 30 },
        ],
      },
    })

    // without match, $or selector
    expect(getIndexInfo([idIndex.query], {
      $or: [
        { name: 'John' },
        { age: 30 },
      ],
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        $or: [
          { name: 'John' },
          { age: 30 },
        ],
      },
    })

    // with match, flat selector
    expect(getIndexInfo([idIndex.query], {
      id: '0',
    })).toEqual({
      matched: true,
      positions: [0],
      optimizedSelector: {},
    })

    // with $in, flat selector
    expect(getIndexInfo([idIndex.query], {
      id: { $in: ['0', '1'] },
    })).toEqual({
      matched: true,
      positions: [0, 1],
      optimizedSelector: {},
    })

    // with $nin, flat selector
    expect(getIndexInfo([idIndex.query], {
      id: { $nin: ['0', '1'] },
    })).toEqual({
      matched: true,
      positions: [2],
      optimizedSelector: {},
    })

    // with match, $and selector
    expect(getIndexInfo([idIndex.query], {
      $and: [
        { id: '0' },
        { id: '1' },
      ],
    })).toEqual({
      matched: true,
      positions: [],
      optimizedSelector: {},
    })
    expect(getIndexInfo([idIndex.query], {
      $and: [
        { id: '0' },
        { name: 'John' },
        { age: 30 },
      ],
    })).toEqual({
      matched: true,
      positions: [0],
      optimizedSelector: {
        $and: [
          { name: 'John' },
          { age: 30 },
        ],
      },
    })

    // with match, $or selector
    expect(getIndexInfo([idIndex.query], {
      $or: [
        { id: '0' },
        { id: '1' },
      ],
    })).toEqual({
      matched: true,
      positions: [0, 1],
      optimizedSelector: {},
    })
    expect(getIndexInfo([idIndex.query], {
      $or: [
        { id: '0' },
        { name: 'John' },
        { age: 30 },
      ],
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        $or: [
          { id: '0' },
          { name: 'John' },
          { age: 30 },
        ],
      },
    })

    const nameIndex = createIndex<{ id: string, name?: string | null }>('name')
    nameIndex.rebuild([
      { id: '0', name: '0' },
      { id: '1', name: '1' },
      { id: '2', name: null },
      { id: '3', name: undefined },
      { id: '4' },
    ])
    expect(getIndexInfo([nameIndex.query], {
      $and: [{
        $or: [
          { name: null },
          { name: { $exists: false } },
        ],
      }],
    })).toEqual({
      matched: true,
      positions: [2, 3, 4],
      optimizedSelector: {
        $and: [{
          $or: [
            { name: null },
            { name: { $exists: false } },
          ],
        }],
      },
    })
  })

  it('should return the correct result when using multiple index providers', () => {
    const comments = [{
      id: '0',
      authorId: '0',
      postId: '1',
      text: 'Lorem ipsum',
    }, {
      id: '1',
      authorId: '0',
      postId: '0',
      text: 'Lorem ipsum',
    }, {
      id: '2',
      authorId: '1',
      postId: '0',
      text: 'Lorem ipsum',
    }]
    const authorIndex = createIndex('authorId')
    const postIndex = createIndex('postId')
    authorIndex.rebuild(comments)
    postIndex.rebuild(comments)

    // without match, flat selector
    expect(getIndexInfo([authorIndex.query, postIndex.query], {
      title: 'Lorem ipsum',
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        title: 'Lorem ipsum',
      },
    })

    // without match, $and selector
    expect(getIndexInfo([authorIndex.query, postIndex.query], {
      $and: [
        { title: 'Lorem ipsum' },
        { id: '0' },
      ],
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        $and: [
          { title: 'Lorem ipsum' },
          { id: '0' },
        ],
      },
    })

    // without match, $or selector
    expect(getIndexInfo([authorIndex.query, postIndex.query], {
      $or: [
        { title: 'Lorem ipsum' },
        { id: '0' },
      ],
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        $or: [
          { title: 'Lorem ipsum' },
          { id: '0' },
        ],
      },
    })

    // with match, flat selector
    expect(getIndexInfo([authorIndex.query, postIndex.query], {
      authorId: '0',
      postId: '0',
    })).toEqual({
      matched: true,
      positions: [1],
      optimizedSelector: {},
    })

    // with match, $and selector
    expect(getIndexInfo([authorIndex.query, postIndex.query], {
      $and: [
        { authorId: '0' },
        { postId: '1' },
      ],
    })).toEqual({
      matched: true,
      positions: [0],
      optimizedSelector: {},
    })
    expect(getIndexInfo([authorIndex.query, postIndex.query], {
      $and: [
        { postId: '0' },
        { title: 'Lorem ipsum' },
        { id: '0' },
      ],
    })).toEqual({
      matched: true,
      positions: [1, 2],
      optimizedSelector: {
        $and: [
          { title: 'Lorem ipsum' },
          { id: '0' },
        ],
      },
    })

    // with match, $or selector
    expect(getIndexInfo([authorIndex.query, postIndex.query], {
      $or: [
        { postId: '0' },
        { authorId: '1' },
      ],
    })).toEqual({
      matched: true,
      positions: [1, 2],
      optimizedSelector: {},
    })
    expect(getIndexInfo([authorIndex.query, postIndex.query], {
      $or: [
        { authorId: '0' },
        { name: 'John' },
        { age: 30 },
      ],
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        $or: [
          { authorId: '0' },
          { name: 'John' },
          { age: 30 },
        ],
      },
    })

    // with match, $and and $or selector
    expect(getIndexInfo([authorIndex.query, postIndex.query], {
      $or: [
        {
          $and: [
            { id: '0', postId: '0' },
            { id: '1' },
          ],
        },
        { postId: '0', authorId: '0' },
        { authorId: '0' },
      ],
      $and: [
        {
          $or: [
            { id: '0' },
            { id: '1' },
          ],
        },
        { authorId: '0' },
        { postId: '0' },
      ],
    })).toEqual({
      matched: true,
      positions: [1, 2, 0],
      optimizedSelector: {
        $and: [
          {
            $or: [
              { id: '0' },
              { id: '1' },
            ],
          },
        ],
        $or: [
          {
            $and: [
              { id: '0' },
              { id: '1' },
            ],
          },
        ],
      },
    })
  })

  it('should return unique positions', () => {
    const idIndex = createIndex('id')
    idIndex.rebuild([{ id: '0' }, { id: '1' }, { id: '2' }])

    // without match, flat selector
    expect(getIndexInfo([idIndex.query], {
      id: { $in: ['0', '0', '0'] },
    })).toEqual({
      matched: true,
      positions: [0],
      optimizedSelector: {},
    })
  })

  it('should handle mixed index/non-index fields in $or', () => {
    const idIndex = createIndex('id')
    idIndex.rebuild([{ id: '0' }, { id: '1' }, { id: '2' }])

    expect(getIndexInfo([idIndex.query], {
      $or: [
        { id: '0' },
        { name: 'John' },
        { age: 30 },
      ],
    })).toEqual({
      matched: false,
      positions: [],
      optimizedSelector: {
        $or: [
          { id: '0' },
          { name: 'John' },
          { age: 30 },
        ],
      },
    })
  })
})
