@@ -36,91 +36,6 @@ export class Client {
     this.checkNpmVersion()
   }
 
-  private setupSubscriptions() {
-    this.webSocket.subscribe('tool-call', async (a) => {
-      const { response, changes, data, userInputId } = a
-      if (userInputId !== this.currentUserInputId) {
-        return
-      }
-
-      const filesChanged = uniq(changes.map((change) => change.filePath))
-      this.chatStorage.saveFilesChanged(filesChanged)
-
-      applyChanges(getProjectRoot(), changes)
-
-      const { id, name, input } = data
-
-      const currentChat = this.chatStorage.getCurrentChat()
-      const messages = currentChat.messages
-      if (messages[messages.length - 1].role === 'assistant') {
-        // Probably the last response from the assistant was cancelled and added immediately.
-        return
-      }
-
-      const assistantMessage: Message = {
-        role: 'assistant',
-        content: [
-          {
-            type: 'text',
-            text: response,
-          },
-          {
-            type: 'tool_use',
-            id,
-            name,
-            input,
-          },
-        ],
-      }
-      this.chatStorage.addMessage(
-        this.chatStorage.getCurrentChat(),
-        assistantMessage
-      )
-
-      const handler = toolHandlers[name]
-      if (handler) {
-        const content = await handler(input, id)
-        const toolResultMessage: Message = {
-          role: 'user',
-          content: [
-            {
-              type: 'tool_result',
-              tool_use_id: id,
-              content,
-            },
-          ],
-        }
-        this.chatStorage.addMessage(
-          this.chatStorage.getCurrentChat(),
-          toolResultMessage
-        )
-        await this.sendUserInput(changes, userInputId)
-      } else {
-        console.error(`No handler found for tool: ${name}`)
-      }
-    })
-
-    this.webSocket.subscribe('read-files', (a) => {
-      const { filePaths } = a
-      const files = getFiles(filePaths)
-
-      this.webSocket.sendAction({
-        type: 'read-files-response',
-        files,
-      })
-    })
-
-    this.webSocket.subscribe('npm-version-status', (action) => {
-      const { isUpToDate, latestVersion } = action
-      if (!isUpToDate) {
-        console.warn(
-          green(
-            `\nThere's a new version of Manicode! Please update to ensure proper functionality.\nUpdate now by running: npm install -g manicode`
-          )
-        )
-      }
-    })
-  }
-
   private checkNpmVersion() {
     this.webSocket.sendAction({
       type: 'check-npm-version',
@@ -266,4 +181,89 @@ export class Client {
       }, 15_000)
     })
   }
+
+  private setupSubscriptions() {
+    this.webSocket.subscribe('tool-call', async (a) => {
+      const { response, changes, data, userInputId } = a
+      if (userInputId !== this.currentUserInputId) {
+        return
+      }
+
+      const filesChanged = uniq(changes.map((change) => change.filePath))
+      this.chatStorage.saveFilesChanged(filesChanged)
+
+      applyChanges(getProjectRoot(), changes)
+
+      const { id, name, input } = data
+
+      const currentChat = this.chatStorage.getCurrentChat()
+      const messages = currentChat.messages
+      if (messages[messages.length - 1].role === 'assistant') {
+        // Probably the last response from the assistant was cancelled and added immediately.
+        return
+      }
+
+      const assistantMessage: Message = {
+        role: 'assistant',
+        content: [
+          {
+            type: 'text',
+            text: response,
+          },
+          {
+            type: 'tool_use',
+            id,
+            name,
+            input,
+          },
+        ],
+      }
+      this.chatStorage.addMessage(
+        this.chatStorage.getCurrentChat(),
+        assistantMessage
+      )
+
+      const handler = toolHandlers[name]
+      if (handler) {
+        const content = await handler(input, id)
+        const toolResultMessage: Message = {
+          role: 'user',
+          content: [
+            {
+              type: 'tool_result',
+              tool_use_id: id,
+              content,
+            },
+          ],
+        }
+        this.chatStorage.addMessage(
+          this.chatStorage.getCurrentChat(),
+          toolResultMessage
+        )
+        await this.sendUserInput(changes, userInputId)
+      } else {
+        console.error(`No handler found for tool: ${name}`)
+      }
+    })
+
+    this.webSocket.subscribe('read-files', (a) => {
+      const { filePaths } = a
+      const files = getFiles(filePaths)
+
+      this.webSocket.sendAction({
+        type: 'read-files-response',
+        files,
+      })
+    })
+
+    this.webSocket.subscribe('npm-version-status', (action) => {
+      const { isUpToDate, latestVersion } = action
+      if (!isUpToDate) {
+        console.warn(
+          green(
+            `\nThere's a new version of Manicode! Please update to ensure proper functionality.\nUpdate now by running: npm install -g manicode`
+          )
+        )
+      }
+    })
+  }
 }