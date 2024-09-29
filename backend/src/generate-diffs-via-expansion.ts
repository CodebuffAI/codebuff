import { debugLog } from './util/debug'
import { Message } from 'common/actions'
import { createFileBlock } from 'common/util/file'
import { promptOpenAI } from './openai-api'
import { openaiModels } from 'common/constants'

export async function expandNewContent(
  userId: string,
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[],
  fullResponse: string
): Promise<string> {
  const prompt = `
The following is a conversation with a user leading up to your task:
  
<message_history>${messageHistory.map((msg) => `<${msg.role}>${msg.content}</${msg.role}>`).join('\n')}</message_history>

<assistant_message_partial_response>${fullResponse}</assistant_message_partial_response>

Your task: You are an expert programmer tasked with expanding a shortened version of a file into its full content. The shortened file to be expanded will be provided at the end of this message. This shortened version uses comments like "// ... existing code ..." or "# ... rest of the function ..." or "// keep existing code ..." to indicate unchanged sections. Your task is to replace these comments with the actual code from the old version of the file.

Consider the intent of the user: if only one function or code block is shown, don't delete everything else that was not shown.

Your response should follow the following format:
A. Please discuss the changes in the new file content compared to the old file content in a <discussion> block.

B. In a <sections-to-expand> block, please list the comments that should be expanded and where they are. If there are none, please say that the new content is already expanded.

C1. If there are no comments to expand, write: ${createFileBlock(filePath, '[ALREADY_EXPANDED]')}

C2. Otherwise, in a <file> block, please expand each comment listed in <sections-to-expand> with the appropriate code from the old file to create the full expanded content of the new file.
This requires you to compose the resulting file with exact lines from the old file and new file only. You are just copying whole lines character for character. Maintain the exact indentation and formatting of both the old and new content. Do not add any extra comments or explanations.

Output the full content of the new file within a <file> block, using the provided file path as an attribute.

If comments are being added that describe the change that is being made, such as "# Add this import" or "// Add this function" or "// Update this log", then please ommit these lines from the new file.

Here are four examples to illustrate the task:

Example 1 (Simple change):

<example>
Old file content:
${createFileBlock(
  'example1.ts',
  `import React from 'react'

const Button = () => {
  return <button>Click me</button>
}
`
)}

New file content (with placeholders):
${createFileBlock(
  'example1.ts',
  `import React from 'react'

const FunButton = () => {
  return <button>Fun Button</button>
}
`
)}

Expected response:
A. <discussion>
The changes in this file include:
1. Renaming the component from 'Button' to 'FunButton'.
2. Changing the button text from 'Click me' to 'Fun Button'.
</discussion>

B. <sections-to-expand>
There's nothing to expand from the new content. It is already expanded.
</sections-to-expand>

C. ${createFileBlock('example1.ts', `[ALREADY_EXPANDED]`)}
</example>

Example 2 (Partial change with existing code):

<example>
Old file content:
${createFileBlock(
  'example2.ts',
  `import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { ProjectFileContext } from 'common/util/file'
import {
  applyChanges,
  getProjectFileContext,
  getFileBlocks,
  getFiles,
} from './project-files'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { Message } from 'common/actions'
import { STOP_MARKER } from 'common/constants'
import { ChatStorage } from './chat-storage'

const displayMenu = () => {
  console.clear()
  console.log('Chat History:')
  const chats = chatStorage.listChats()
  const totalItems = chats.length + 1 // +1 for the "New Chat" option
  const startIndex = menuOffset
  const endIndex = Math.min(startIndex + CHATS_PER_PAGE, totalItems)

  for (let i = startIndex; i < endIndex; i++) {
    if (i < chats.length) {
      const chat = chats[i]
      const isSelected = i === menuSelectedIndex
      const marker = isSelected ? '>' : ' '
      console.log(\`\${marker} \${chat.id} (\${new Date(chat.updatedAt).toLocaleString()})\`)
    } else {
      const isSelected = i === menuSelectedIndex
      const marker = isSelected ? '>' : ' '
      console.log(\`\${marker} \${NEW_CHAT_OPTION}\`)
    }
  }

  if (totalItems > CHATS_PER_PAGE) {
    console.log(\`\nShowing \${startIndex + 1}-\${endIndex} of \${totalItems} items\`)
  }

  console.log('\nUse arrow keys to navigate, SPACE to select, ESC to exit')
}

const resetMenu = () => {
  chatStorage.clear()
  menuSelectedIndex = 0
  menuOffset = 0
}
`
)}

New file content (with placeholders):
${createFileBlock(
  'example2.ts',
  `// ... existing code ...

const displayMenu = () => {
  console.clear()
  console.log('Chat History:')
  const chats = chatStorage.listChats()
  const totalChats = chats.length

  if (totalChats === 0) {
    console.log('No chats available.')
    console.log(\`\n\${NEW_CHAT_OPTION}\`)
    return
  }

  const visibleRange = 5 // Total number of chats to display (2 on each side + 1 selected)
  const halfRange = Math.floor(visibleRange / 2)

  let startIndex = Math.max(0, menuSelectedIndex - halfRange)
  let endIndex = Math.min(totalChats - 1, startIndex + visibleRange - 1)

  // Adjust startIndex if we're near the end of the list
  if (endIndex - startIndex < visibleRange - 1) {
    startIndex = Math.max(0, endIndex - visibleRange + 1)
  }

  if (startIndex > 0) {
    console.log('...')
  }

  for (let i = startIndex; i <= endIndex; i++) {
    const chat = chats[i]
    const isSelected = i === menuSelectedIndex
    const marker = isSelected ? '>' : ' '
    console.log(\`\${marker} \${chat.id} (\${new Date(chat.updatedAt).toLocaleString()})\`)
  }

  if (endIndex < totalChats - 1) {
    console.log('...')
  }

  console.log(\`\n\${NEW_CHAT_OPTION}\`)
  console.log('\nUse arrow keys to navigate, SPACE to select, ESC to exit')
}

// ... existing code ...
`
)}

Expected response:
A. <discussion>
The changes in this file include:
1. Updating the displayMenu function to handle empty chat lists and improve the display of chat history
2. Implementing a new scrolling mechanism for the chat list
3. Removing the CHATS_PER_PAGE and totalItems variables
4. Adding checks for empty chat lists and displaying appropriate messages
</discussion>

B. <sections-to-expand>
1. Before the \`const displayMenu\` function, there's the comment "// ... existing code ..." which should be replaced and expanded.
2. After the \`const displayMenu\` function, there's the comment "// ... existing code ..." which should be replaced and expanded.
</sections-to-expand>

C. ${createFileBlock(
    'example2.ts',
    `import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { ProjectFileContext } from 'common/util/file'
import {
  applyChanges,
  getProjectFileContext,
  getFileBlocks,
  getFiles,
} from './project-files'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { Message } from 'common/actions'
import { STOP_MARKER } from 'common/constants'
import { ChatStorage } from './chat-storage'

const displayMenu = () => {
  console.clear()
  console.log('Chat History:')
  const chats = chatStorage.listChats()
  const totalChats = chats.length

  if (totalChats === 0) {
    console.log('No chats available.')
    console.log(\`\n\${NEW_CHAT_OPTION}\`)
    return
  }

  const visibleRange = 5 // Total number of chats to display (2 on each side + 1 selected)
  const halfRange = Math.floor(visibleRange / 2)

  let startIndex = Math.max(0, menuSelectedIndex - halfRange)
  let endIndex = Math.min(totalChats - 1, startIndex + visibleRange - 1)

  // Adjust startIndex if we're near the end of the list
  if (endIndex - startIndex < visibleRange - 1) {
    startIndex = Math.max(0, endIndex - visibleRange + 1)
  }

  if (startIndex > 0) {
    console.log('...')
  }

  for (let i = startIndex; i <= endIndex; i++) {
    const chat = chats[i]
    const isSelected = i === menuSelectedIndex
    const marker = isSelected ? '>' : ' '
    console.log(\`\${marker} \${chat.id} (\${new Date(chat.updatedAt).toLocaleString()})\`)
  }

  if (endIndex < totalChats - 1) {
    console.log('...')
  }

  console.log(\`\n\${NEW_CHAT_OPTION}\`)
  console.log('\nUse arrow keys to navigate, SPACE to select, ESC to exit')
}

const resetMenu = () => {
  chatStorage.clear()
  menuSelectedIndex = 0
  menuOffset = 0
}
`
  )}
</example>

Example 3 (Complex changes throughout the file):

<example>
Old file content:
${createFileBlock(
  'src/UserProfile.tsx',
  `import React, { useState } from 'react';
import { User } from './types';

const UserProfile: React.FC<{ user: User }> = ({ user }) => {
  const [isEditing, setIsEditing] = useState(false);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    // TODO: Implement save functionality
    setIsEditing(false);
  };

  return (
    <div className="user-profile">
      <h2>{user.name}</h2>
      <p>Email: {user.email}</p>
      <p>Age: {user.age}</p>
      {isEditing ? (
        <button onClick={handleSave}>Save</button>
      ) : (
        <button onClick={handleEdit}>Edit</button>
      )}
    </div>
  );
};

export default UserProfile;
`
)}

New file content:
${createFileBlock(
  'src/UserProfile.tsx',
  `import React, { useState, useEffect } from 'react';
import { User, Address } from './types';
import { fetchUserAddress } from './api';

interface UserProfileProps {
  user: User;
  onUpdate: (updatedUser: User) => void; // Add this prop
}

const UserProfile: React.FC<UserProfileProps> = ({ user, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState(user);
  const [address, setAddress] = useState<Address | null>(null);

  useEffect(() => {
    const loadAddress = async () => {
      const userAddress = await fetchUserAddress(user.id);
      setAddress(userAddress);
    };
    loadAddress();
  }, [user.id]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    onUpdate(editedUser);
    setIsEditing(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditedUser(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="user-profile">
      <h2>{isEditing ? 'Edit Profile' : user.name}</h2>
      {isEditing ? (
        <>
          <input
            name="name"
            value={editedUser.name}
            onChange={handleChange}
          />
          <input
            name="email"
            value={editedUser.email}
            onChange={handleChange}
          />
          <input
            name="age"
            type="number"
            value={editedUser.age}
            onChange={handleChange}
          />
        </>
      ) : (
        <>
          <p>Email: {user.email}</p>
          <p>Age: {user.age}</p>
          {address && (
            <p>Address: {address.street}, {address.city}, {address.country}</p>
          )}
        </>
      )}
      {isEditing ? (
        <button onClick={handleSave}>Save</button>
      ) : (
        <button onClick={handleEdit}>Edit</button>
      )}
    </div>
  );
};

export default UserProfile;
`
)}

Expected response:
A. <discussion>
The changes in this file include:
1. Adding import for useEffect and updating imports from './types' and './api'.
2. Defining a new UserProfileProps interface with user and onUpdate props.
3. Adding state for editedUser and address using useState.
4. Implementing useEffect to fetch and set the user's address.
5. Updating handleSave to use the onUpdate prop.
6. Adding a new handleChange function for form input changes.
7. Modifying the JSX to include editable inputs when in editing mode.
8. Adding display for the user's address when not in editing mode.
9. Updating type annotations and adding proper event handling.
</discussion>

B. <sections-to-expand>
There's nothing to expand from the new content. It is already expanded.
</sections-to-expand>

C. ${createFileBlock('src/UserProfile.tsx', '[ALREADY_EXPANDED]')}
</example>

Example 4 (Complex changes with multiple existing code comments):

<example>
Old file content:
${createFileBlock(
  'src/TaskManager.tsx',
  `import React, { useState, useEffect } from 'react';
import { Task, User } from './types';
import { fetchTasks, updateTask } from './api';

interface TaskManagerProps {
  user: User;
}

const TaskManager: React.FC<TaskManagerProps> = ({ user }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTasks = async () => {
      const userTasks = await fetchTasks(user.id);
      setTasks(userTasks);
      setLoading(false);
    };
    loadTasks();
  }, [user.id]);

  const handleTaskCompletion = async (taskId: string, completed: boolean) => {
    const updatedTask = await updateTask(taskId, { completed });
    setTasks(tasks.map(task => task.id === taskId ? updatedTask : task));
  };

  if (loading) {
    return <div>Loading tasks...</div>;
  }

  return (
    <div className="task-manager">
      <h2>{user.name}'s Tasks</h2>
      <ul>
        {tasks.map(task => (
          <li key={task.id}>
            <input
              type="checkbox"
              checked={task.completed}
              onChange={(e) => handleTaskCompletion(task.id, e.target.checked)}
            />
            {task.title}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TaskManager;
`
)}

New file content (with placeholders):
${createFileBlock(
  'src/TaskManager.tsx',
  `import React, { useState, useEffect } from 'react';
import { Task, User, Priority } from './types';
import { fetchTasks, updateTask, createTask } from './api'; // Update this import

// ... existing code ...

const TaskManager: React.FC<TaskManagerProps> = ({ user }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  // ... existing code ...

  const handleTaskCompletion = async (taskId: string, completed: boolean) => {
    // ... rest of the function ...
  };

  const handleCreateTask = async () => {
    if (newTaskTitle.trim()) {
      const newTask = await createTask({
        userId: user.id,
        title: newTaskTitle,
        completed: false,
        priority: Priority.Medium,
      });
      setTasks([...tasks, newTask]);
      setNewTaskTitle('');
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (filter === 'active') return !task.completed;
    if (filter === 'completed') return task.completed;
    return true;
  });

  if (loading) {
    return <div>Loading tasks...</div>;
  }

  return (
    <div className="task-manager">
      <h2>{user.name}'s Tasks</h2>
      <div>
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="New task title"
        />
        <button onClick={handleCreateTask}>Add Task</button>
      </div>
      <div>
        <button onClick={() => setFilter('all')}>All</button>
        <button onClick={() => setFilter('active')}>Active</button>
        <button onClick={() => setFilter('completed')}>Completed</button>
      </div>
      <ul>
        {filteredTasks.map(task => (
          <li key={task.id}>
            <input
              type="checkbox"
              checked={task.completed}
              onChange={(e) => handleTaskCompletion(task.id, e.target.checked)}
            />
            {task.title} - Priority: {task.priority}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ... rest of the file ...
`
)}

Expected response:
A. <discussion>
The changes in this file include:
1. Adding Priority to the imports from './types'.
2. Adding createTask to the imports from './api'.
3. Adding new state variables for newTaskTitle and filter.
4. Implementing a new handleCreateTask function for adding new tasks.
5. Adding a filteredTasks constant to filter tasks based on the current filter state.
6. Updating the JSX to include:
   - An input field and button for creating new tasks
   - Buttons for filtering tasks
   - Displaying the task priority in the list
7. Modifying the task list to use filteredTasks instead of all tasks.
</discussion>

B. <sections-to-expand>
1. At the beginning of the file, there's a comment "// ... existing code ..." which should be expanded.
2. Inside the TaskManager component, there's a comment "// ... existing code ..." which should be expanded.
3. Inside the handleTaskCompletion function, there's a comment "// ... rest of the function ..." which should be expanded.
4. At the end of the file, there's a comment "// ... rest of the file ..." which should be expanded.
</sections-to-expand>

C. ${createFileBlock(
    'src/TaskManager.tsx',
    `import React, { useState, useEffect } from 'react';
import { Task, User, Priority } from './types';
import { fetchTasks, updateTask, createTask } from './api';

interface TaskManagerProps {
  user: User;
}

const TaskManager: React.FC<TaskManagerProps> = ({ user }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  useEffect(() => {
    const loadTasks = async () => {
      const userTasks = await fetchTasks(user.id);
      setTasks(userTasks);
      setLoading(false);
    };
    loadTasks();
  }, [user.id]);

  const handleTaskCompletion = async (taskId: string, completed: boolean) => {
    const updatedTask = await updateTask(taskId, { completed });
    setTasks(tasks.map(task => task.id === taskId ? updatedTask : task));
  };

  const handleCreateTask = async () => {
    if (newTaskTitle.trim()) {
      const newTask = await createTask({
        userId: user.id,
        title: newTaskTitle,
        completed: false,
        priority: Priority.Medium,
      });
      setTasks([...tasks, newTask]);
      setNewTaskTitle('');
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (filter === 'active') return !task.completed;
    if (filter === 'completed') return task.completed;
    return true;
  });

  if (loading) {
    return <div>Loading tasks...</div>;
  }

  return (
    <div className="task-manager">
      <h2>{user.name}'s Tasks</h2>
      <div>
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="New task title"
        />
        <button onClick={handleCreateTask}>Add Task</button>
      </div>
      <div>
        <button onClick={() => setFilter('all')}>All</button>
        <button onClick={() => setFilter('active')}>Active</button>
        <button onClick={() => setFilter('completed')}>Completed</button>
      </div>
      <ul>
        {filteredTasks.map(task => (
          <li key={task.id}>
            <input
              type="checkbox"
              checked={task.completed}
              onChange={(e) => handleTaskCompletion(task.id, e.target.checked)}
            />
            {task.title} - Priority: {task.priority}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TaskManager;
`
  )}
</example>

Now, please provide your response for the following old and new file contents, following the format shown in the examples above.

Old file content:
${createFileBlock(filePath, oldContent)}

New file content (with placeholders):
${createFileBlock(filePath, newContent)}
`.trim()
  const expandedContentResponse = await promptOpenAI(
    userId,
    [
      {
        role: 'user',
        content: prompt,
      },
    ],
    openaiModels.gpt4o
  )

  debugLog('New file (unexpanded) for filePath', filePath, newContent)
  debugLog(
    'Expanded content response for filePath',
    filePath,
    expandedContentResponse
  )

  // Extract the content from the <file> block
  const fileContentMatch = expandedContentResponse.match(
    /<file[^>]*>([\s\S]*)<\/file>/
  )
  if (fileContentMatch) {
    const content = fileContentMatch[1].trim()
    if (content === '[ALREADY_EXPANDED]') {
      return newContent
    }
    return content + '\n'
  } else {
    console.error(
      'Failed to extract file content from expanded content response'
    )
    debugLog('!Failed to extract file content from expanded content response!')
    return oldContent
  }
}
