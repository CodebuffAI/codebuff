/**
 * A tree of nodes that can be ASCII visualized.
 */
export declare class AsciiTree {
    readonly text?: string | undefined;
    /**
     * The parent node.
     */
    parent?: AsciiTree;
    private readonly _children;
    /**
     * Creates a node.
     * @param text The node's text content
     * @param children Children of this node (can also be added via "add")
     */
    constructor(text?: string | undefined, ...children: AsciiTree[]);
    /**
     * Prints the tree to an output stream.
     */
    printTree(output?: Printer): void;
    /**
     * Returns a string representation of the tree.
     */
    toString(): string;
    /**
     * Adds children to the node.
     */
    add(...children: AsciiTree[]): void;
    /**
     * Returns a copy of the children array.
     */
    get children(): AsciiTree[];
    /**
     * @returns true if this is the root node
     */
    get root(): boolean;
    /**
     * @returns true if this is the last child
     */
    get last(): boolean;
    /**
     * @returns the node level (0 is the root node)
     */
    get level(): number;
    /**
     * @returns true if this node does not have any children
     */
    get empty(): boolean;
    /**
     * @returns an array of parent nodes (from the root to this node, exclusive)
     */
    get ancestors(): AsciiTree[];
}
export type Printer = Pick<NodeJS.WritableStream, 'write'>;
//# sourceMappingURL=ascii-tree.d.ts.map