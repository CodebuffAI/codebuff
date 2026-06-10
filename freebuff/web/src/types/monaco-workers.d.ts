declare module "monaco-editor/esm/vs/editor/editor.worker.js?worker" {
  const EditorWorker: {
    new (): Worker;
  };
  export default EditorWorker;
}

declare module "@codingame/monaco-vscode-api/workers/editor.worker?worker" {
  const EditorWorker: {
    new (): Worker;
  };
  export default EditorWorker;
}
