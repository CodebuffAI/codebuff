export declare class SimpleEventEmitter {
    private _events;
    on(event: string, listener: (...args: any[]) => void): () => void;
    emit(event: string, payload: any): void;
}
