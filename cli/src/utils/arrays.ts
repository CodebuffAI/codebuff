/** Python-style range function */
export function* range(start: number, stop?: number, step: number = 1) {
  if (stop === undefined) {
    stop = start
    start = 0
  }

  if (step === 0) {
    throw new Error('Step cannot be zero')
  }

  if (step > 0) {
    for (let i = start; i < stop; i += step) {
      yield i
    }
  } else {
    for (let i = start; i > stop; i += step) {
      yield i
    }
  }
}

export function repeated<T>(value: T, count: number): T[] {
  return Array.from({ length: count }, () => value)
}

export class Queue<T> {
  private _items: T[]
  private _head: number
  private _length: number
  private _defaultCapacity: number

  constructor(items: T[] | undefined = undefined, capacity: number = 100) {
    this._defaultCapacity = capacity
    if (!items) {
      items = []
    }
    this._items = items.length
      ? [
          ...items,
          ...repeated(undefined as T, Math.max(0, capacity - items.length)),
        ]
      : [undefined as T]
    this._head = 0
    this._length = items.length
  }

  static from<T>(iterable: Iterable<T>): Queue<T> {
    return new Queue<T>([...iterable])
  }

  enqueue(...items: T[]) {
    if (this._items.length < this._length + items.length) {
      const newItems = [
        ...repeated(undefined as T, this._length),
        ...items,
        ...repeated(undefined as T, this._length),
      ]
      for (let i = 0; i < this._length; i++) {
        newItems[i] = this.at(i)!
      }

      this._items = newItems
      this._head = 0
      this._length += items.length
      return
    }

    let index = (this._head + this._length) % this._items.length
    for (const item of items) {
      this._items[index] = item
      index = (index + 1) % this._items.length
    }
    this._length += items.length
  }

  dequeue(): T | undefined {
    if (this._length === 0) {
      return undefined
    }

    const item = this._items[this._head]
    this._items[this._head] = undefined as T
    this._head = (this._head + 1) % this._items.length
    this._length--
    return item
  }

  peek(): T | undefined {
    if (this._length === 0) {
      return undefined
    }
    return this._items[this._head]
  }

  at(index: number): T | undefined {
    if (index >= this._length || index < -this.length) {
      return undefined
    }
    if (index < 0) {
      return this._items[
        (this._head + this._length + index) % this._items.length
      ]
    }
    return this._items[(this._head + index) % this._items.length]
  }

  clear(): void {
    this._items = repeated(undefined as T, this._defaultCapacity)
    this._head = 0
    this._length = 0
  }

  get length() {
    return this._length
  }
}
