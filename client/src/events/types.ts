import { AgentState } from 'common/types/agent-state'
import { FileChange } from 'common/actions'
import { RawToolCall } from 'common/types/tools'
import { ConnectionStatus } from '../connection/status'

export interface ClientEventMap {
  // Main output stream - includes AI text and rendered tool output
  'text': { 
    type: 'text';
    content: string;
    source: 'ai' | 'tool-call' | 'tool-result';
  };
  
  // Tool lifecycle events (for observation only)
  'tool-start': { 
    type: 'tool-start';
    tool: RawToolCall;
  };
  'tool-end': { 
    type: 'tool-end';
    result: {
      id: string;
      name: string;
      result: string;
    };
  };
  
  // File changes from tool execution
  'file-change': {
    type: 'file-change';
    change: FileChange;
  };
  
  // Connection status
  'status': { 
    type: 'status';
    status: ConnectionStatus;
    message?: string;
  };
  
  // Errors
  'error': {
    type: 'error';
    error: Error;
  };
  
  // Stream completion
  'complete': {
    type: 'complete';
    agentState: AgentState;
  };
}

export type ClientEventType = keyof ClientEventMap;
export type ClientEvent = ClientEventMap[ClientEventType];