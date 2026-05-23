const {isArray} = require('core-util-is')
const {sort} = require('array-timsort')

const {
  PROP_SYMBOL_PREFIXES,

  UNDEFINED,

  symbol,
  copy_comments,
  swap_comments
} = require('./common')

const reverse_comments = array => {
  const {length} = array
  let i = 0
  const max = length / 2

  for (; i < max; i ++) {
    swap_comments(array, i, length - i - 1)
  }
}

const move_comment = (target, source, i, offset, remove) => {
  copy_comments(target, source, i + offset, i, remove)
}

const move_comments = (
  // `Array` target array
  target,
  // `Array` source array
  source,
  // `number` start index
  start,
  // `number` number of indexes to move
  count,
  // `number` offset to move
  offset,
  // `boolean` whether should remove the comments from source
  remove
) => {
  if (offset > 0) {
    let i = count
    //         |   count   | offset |
    // source: -------------
    // target:          -------------
    //         | remove |
    // => remove === offset

    // From [count - 1, 0]
    while (i -- > 0) {
      move_comment(target, source, start + i, offset, remove)
    }
    return
  }

  let i = 0
  // | remove  |  count    |
  //           -------------
  // -------------
  //             | offset  |

  // From [0, count - 1]
  while (i < count) {
    const ii = i ++
    move_comment(target, source, start + ii, offset, remove)
  }
}

const remove_comments = (array, key) => {
  PROP_SYMBOL_PREFIXES.forEach(prefix => {
    const prop = symbol(prefix, key)
    delete array[prop]
  })
}

const get_mapped = (map, key) => {
  let mapped = key

  while (mapped in map) {
    mapped = map[mapped]
  }

  return mapped
}

/**
 * An Array subclass that preserves comments when array operations are performed.
 *
 * CommentArray extends the native Array class and automatically handles comment
 * preservation during array mutations like splice, slice, push, pop, etc.
 * Comments are stored as symbol properties and are moved/copied appropriately
 * when the array structure changes.
 *
 * @extends Array
 *
 * @example
 * const arr = parse('[1, 2, 3]') // with comments
 * // arr is a CommentArray instance
 * arr.splice(1, 1) // Comments are preserved and repositioned correctly
 */
class CommentArray extends Array {
  // - deleteCount + items.length

  // We should avoid `splice(begin, deleteCount, ...items)`,
  // because `splice(0, undefined)` is not equivalent to `splice(0)`,
  // as well as:
  // - slice
  /**
   * Changes the contents of an array by removing or replacing existing
   *   elements and/or adding new elements in place.
   * Comments are automatically preserved and repositioned during the operation.
   *
   * @param {...*} args Arguments passed to Array.prototype.splice
   * @returns {CommentArray} A new CommentArray containing the deleted elements.
   */
  splice (...args) {
    const {length} = this
    const ret = super.splice(...args)

    // #16
    // If no element removed, we might still need to move comments,
    //   because splice could add new items

    // if (!ret.length) {
    //   return ret
    // }

    // JavaScript syntax is silly
    // eslint-disable-next-line prefer-const
    let [begin, deleteCount, ...items] = args

    if (begin < 0) {
      begin += length
    }

    if (arguments.length === 1) {
      deleteCount = length - begin
    } else {
      deleteCount = Math.min(length - begin, deleteCount)
    }

    const {
      length: item_length
    } = items

    // itemsToDelete: -
    // itemsToAdd: +
    //        |    dc      |  count   |
    // =======-------------============
    // =======++++++============
    //        | il |
    const offset = item_length - deleteCount
    const start = begin + deleteCount
    const count = length - start

    move_comments(this, this, start, count, offset, true)

    return ret
  }

  /**
   * Returns a shallow copy of a portion of an array into a new CommentArray object.
   * Comments are copied to the appropriate positions in the new array.
   *
   * @param {...*} args Arguments passed to Array.prototype.slice
   * @returns {CommentArray} A new CommentArray containing the extracted
   *   elements with their comments.
   */
  slice (...args) {
    const {length} = this
    const array = super.slice(...args)
    if (!array.length) {
      return new CommentArray()
    }

    let [begin, before] = args

    // Ref:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice
    if (before === UNDEFINED) {
      before = length
    } else if (before < 0) {
      before += length
    }

    if (begin < 0) {
      begin += length
    } else if (begin === UNDEFINED) {
      begin = 0
    }

    move_comments(array, this, begin, before - begin, - begin)

    return array
  }

  unshift (...items) {
    const {length} = this
    const ret = super.unshift(...items)
    const {
      length: items_length
    } = items

    if (items_length > 0) {
      move_comments(this, this, 0, length, items_length, true)
    }

    return ret
  }

  shift () {
    const ret = super.shift()
    const {length} = this

    remove_comments(this, 0)
    move_comments(this, this, 1, length, - 1, true)

    return ret
  }

  reverse () {
    super.reverse()

    reverse_comments(this)

    return this
  }

  pop () {
    const ret = super.pop()

    // Removes comments
    remove_comments(this, this.length)

    return ret
  }

  concat (...items) {
    let {length} = this
    const ret = super.concat(...items)

    if (!items.length) {
      return ret
    }

    move_comments(ret, this, 0, this.length, 0)

    items.forEach(item => {
      const prev = length
      length += isArray(item)
        ? item.length
        : 1

      if (!(item instanceof CommentArray)) {
        return
      }

      move_comments(ret, item, 0, item.length, prev)
    })

    return ret
  }

  sort (...args) {
    const result = sort(
      this,
      // Make sure there is no more than one argument
      ...args.slice(0, 1)
    )

    // For example,
    // if we sort ['b', 'd', 'c', 'a'],
    // then `result` will be [3, 0, 2, 1], and the array is ['a', 'b', 'c', 'd']

    // First, we swap index 0 (b) and index 3 (a), then the array comments are
    // ['a.comments', 'd.comments', 'c.comments', 'b.comments']
    // index 0 is finalized
    // index 3 is actually mapped to original index 0, we present as 0 -> 3

    // Then swap index 1 (d) and index 0 (-> 3, b)
    // 1 (index) -> 0 (new index) -> 3 (real_index)
    // ['d.comments', 'b.comments', 'c.comments', 'd.comments']
    // index 1 is finalized
    // index 3 is contains the item of original index 1
    // - we present as 1 -> 3
    // - it is ok that we don't remove mapping 0 -> 3

    // Then index 2 should be skipped

    // Then swap index 3 (d) and index 1 (-> 3, b), skipped

    const map = Object.create(null)

    result.forEach((source_index, index) => {
      if (source_index === index) {
        return
      }

      const real_source_index = get_mapped(map, source_index)

      if (real_source_index === index) {
        return
      }

      // The item of index `index` gets the final value
      // delete map[index]
      map[index] = real_source_index

      swap_comments(this, index, real_source_index)
    })

    return this
  }
}

module.exports = {
  CommentArray
}
