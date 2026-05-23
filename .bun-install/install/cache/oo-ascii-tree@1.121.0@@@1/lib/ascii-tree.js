"use strict";
/**
 * A tree of nodes that can be ASCII visualized.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsciiTree = void 0;
class AsciiTree {
    /**
     * Creates a node.
     * @param text The node's text content
     * @param children Children of this node (can also be added via "add")
     */
    constructor(text, ...children) {
        this.text = text;
        this._children = new Array();
        for (const child of children) {
            this.add(child);
        }
    }
    /**
     * Prints the tree to an output stream.
     */
    printTree(output = process.stdout) {
        let ancestorsPrefix = '';
        for (const parent of this.ancestors) {
            // -1 represents a "hidden" root, and so it's children
            // will all appear as roots (level 0).
            if (parent.level <= 0) {
                continue;
            }
            if (parent.last) {
                ancestorsPrefix += '  ';
            }
            else {
                ancestorsPrefix += ' │';
            }
        }
        let myPrefix = '';
        let multilinePrefix = '';
        if (this.level > 0) {
            if (this.last) {
                if (!this.empty) {
                    myPrefix += ' └─┬ ';
                    multilinePrefix += ' └─┬ ';
                }
                else {
                    myPrefix += ' └── ';
                    multilinePrefix = '     ';
                }
            }
            else {
                if (!this.empty) {
                    myPrefix += ' ├─┬ ';
                    multilinePrefix += ' │ │ ';
                }
                else {
                    myPrefix += ' ├── ';
                    multilinePrefix += ' │   ';
                }
            }
        }
        if (this.text) {
            output.write(ancestorsPrefix);
            output.write(myPrefix);
            const lines = this.text.split('\n');
            output.write(lines[0]);
            output.write('\n');
            for (const line of lines.splice(1)) {
                output.write(ancestorsPrefix);
                output.write(multilinePrefix);
                output.write(line);
                output.write('\n');
            }
        }
        for (const child of this._children) {
            child.printTree(output);
        }
    }
    /**
     * Returns a string representation of the tree.
     */
    toString() {
        let out = '';
        const printer = {
            write: (data) => {
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                out += data;
                return true;
            },
        };
        this.printTree(printer);
        return out;
    }
    /**
     * Adds children to the node.
     */
    add(...children) {
        for (const child of children) {
            child.parent = this;
            this._children.push(child);
        }
    }
    /**
     * Returns a copy of the children array.
     */
    get children() {
        return this._children.map((x) => x);
    }
    /**
     * @returns true if this is the root node
     */
    get root() {
        return !this.parent;
    }
    /**
     * @returns true if this is the last child
     */
    get last() {
        if (!this.parent) {
            return true;
        }
        return (this.parent.children.indexOf(this) === this.parent.children.length - 1);
    }
    /**
     * @returns the node level (0 is the root node)
     */
    get level() {
        if (!this.parent) {
            // if the root node does not have text, it will be considered level -1
            // so that all it's children will be roots.
            return this.text ? 0 : -1;
        }
        return this.parent.level + 1;
    }
    /**
     * @returns true if this node does not have any children
     */
    get empty() {
        return this.children.length === 0;
    }
    /**
     * @returns an array of parent nodes (from the root to this node, exclusive)
     */
    get ancestors() {
        if (!this.parent) {
            return [];
        }
        return [...this.parent.ancestors, this.parent];
    }
}
exports.AsciiTree = AsciiTree;
//# sourceMappingURL=ascii-tree.js.map