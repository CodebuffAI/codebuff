import WebSocket from 'ws'
import { EventEmitter } from '../events/emitter'
import { ClientAction, ClientMessage, getNextTxId } from './types'

export class ActionDispatcher {
  private ws: WebSocket;
  private events: EventEmitter;
  private clientSessionId: string;

  constructor(ws: WebSocket, events: EventEmitter) {
    this.ws = ws;
    this.events = events;
    this.clientSessionId = Math.random().toString(36).slice(2);
  }

  send(action: ClientAction): void {
    const message: ClientMessage = {
      type: 'action',
      txid: getNextTxId(),
      data: action
    };
    this.ws.send(JSON.stringify(message));
  }

  sendToolResult(result: {
    id: string;
    name: string;
    result: string;
  }): void {
    this.send({
      type: 'tool-result',
      ...result
    });
  }

  identify(): void {
    const message: ClientMessage = {
      type: 'identify',
      txid: getNextTxId(),
      clientSessionId: this.clientSessionId
    };
    this.ws.send(JSON.stringify(message));
  }

  ping(): void {
    const message: ClientMessage = {
      type: 'ping',
      txid: getNextTxId()
    };
    this.ws.send(JSON.stringify(message));
  }

  subscribe(topics: string[]): void {
    const message: ClientMessage = {
      type: 'subscribe',
      txid: getNextTxId(),
      topics
    };
    this.ws.send(JSON.stringify(message));
  }

  unsubscribe(topics: string[]): void {
    const message: ClientMessage = {
      type: 'unsubscribe',
      txid: getNextTxId(),
      topics
    };
    this.ws.send(JSON.stringify(message));
  }
}