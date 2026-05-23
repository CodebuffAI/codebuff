# oo-ascii-tree

Renders ASCII trees from an object-oriented object graph.

Features:

 * Multiline text
 * Multiple root nodes

Roadmap:

 * Customization of tree formatting and indentation size

## Install

```console
$ npm i oo-ascii-tree
```

## Basic Example

```ts
import { AsciiTree } from '../lib';

const tree = new AsciiTree('root');

tree.add(new AsciiTree('child1'));

tree.add(new AsciiTree('child2',
  new AsciiTree('grandchild1'),
  new AsciiTree('grandchild2')
));

tree.add(new AsciiTree('child3'));

tree.printTree();
```

Prints the following tree to stdout:

```
root
 ├── child1
 ├─┬ child2
 │ ├── grandchild1
 │ └── grandchild2
 └── child3
```

## Advanced Usage

You can also subclass `AsciiTree` to encapsulate some model. The following
example declares a `TitleNode` which formats a title with "====" underline and a
`KeyValueNode` which formats text as `key: value`:

```ts
class TitleNode extends AsciiTree {
  constructor(title: string, ...children: AsciiTree[]) {
    super([
      title.toLocaleUpperCase(),
      '='.repeat(title.length)
    ].join('\n'), ...children);
  }
}

class KeyValueNode extends AsciiTree {
  constructor(key: string, value: string) {
    super(`${key}: ${value}`);
  }
}

const tree = new AsciiTree();

tree.add(new TitleNode('props',
  new KeyValueNode('shape', 'circle'),
  new KeyValueNode('color', 'red'),
  new KeyValueNode('background', 'blue')
));

tree.add(new TitleNode('dimensions',
  new KeyValueNode('width', '30px'),
  new KeyValueNode('height', '40px')
));
```

Will emit the following output:

```
PROPS
=====
 ├── shape: circle
 ├── color: red
 └── background: blue
DIMENSIONS
==========
 ├── width: 30px
 └── height: 40px
```

## API

The `AsciiTree` class represents a tree/node/subtree. Each node in the tree
includes `text` and `children` and can be printed to a `Writable` via
`printTree(stream)`.

### `new AsciiTree([text[, children...]])`

Creates a new node with the specified text and optionally adds child nodes to it.

If `text` is not specified, the children of this node will all be considered
roots (level 0) and the root node will get level -1. This allows modeling trees
with a single root or with multiple roots.

### `asciiTree.add(children...)`

Adds one or more children to the node.

### `asciiTree.printTree([writableStream])`

Emits an ASCII print out of the tree to the specified `Writable` stream. The
default is `process.stdout`.

### `asciiTree.toString()`

Returns a string representation of the tree.

### `asciiTree.text`

The node's text. If the text contains multiple line separated by `\n`, new lines
will be aligned to the node's indentation.

### `asciiTree.children`

Returns a copy of the array of children of this node. Use `asciiTree.add` to add
children.

### `asciiTree.root`

Returns `true` if this is the root node.

### `asciiTree.last`

Returns `true` if this is the last child of a node.

### `asciiTree.level`

Returns the node level. Root node(s) will have a level of 0.

If the root `AsciiTree` has text, it's level will be 0 and its children will get
level 1. If the root `AsciiTree` does not have text, it's level will be -1 and
all it's children will get level 0.

### `asciiTree.empty`

Returns `true` if this node does not have any children.

### `asciiTree.ancestors`

Returns all the nodes that are ancestors of this node ordered from root to the
direct parent.

## License

Distributed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).

See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for more information.
