import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core'

import { logger } from './logger'

import type {
  QuickJSContext,
  QuickJSWASMModule,
  QuickJSRuntime,
} from 'quickjs-emscripten-core'

// Initialize QuickJS module once
let QuickJS: QuickJSWASMModule | null = null

async function initQuickJS(): Promise<QuickJSWASMModule> {
  if (!QuickJS) {
    const variant = (await import('@jitl/quickjs-wasmfile-release-sync'))
      .default
    QuickJS = await newQuickJSWASMModuleFromVariant(variant)
  }
  return QuickJS
}

/**
 * Configuration options for the QuickJS sandbox
 */
export interface SandboxConfig {
  /** Memory limit in bytes (default: 50MB) */
  memoryLimit?: number
  /** Stack size limit in bytes (default: 512KB) */
  maxStackSize?: number
  /** Whether to enable interrupt handler for infinite loops (default: false) */
  enableInterruptHandler?: boolean
}

/**
 * A secure QuickJS sandbox for executing JavaScript generator functions
 */
export class QuickJSSandbox {
  private context: QuickJSContext
  private runtime: QuickJSRuntime
  private initialized = false

  constructor(context: QuickJSContext, runtime: QuickJSRuntime) {
    this.context = context
    this.runtime = runtime
  }

  /**
   * Create a new QuickJS sandbox with the specified configuration
   */
  static async create(
    generatorCode: string,
    initialInput: any,
    config: SandboxConfig = {},
  ): Promise<QuickJSSandbox> {
    const {
      memoryLimit = 1024 * 1024 * 20, // 20MB
      maxStackSize = 1024 * 512, // 512KB
      enableInterruptHandler = false,
    } = config

    const quickjs = await initQuickJS()

    // Create new runtime with memory limits
    const runtime = quickjs.newRuntime()

    // Set memory limit
    runtime.setMemoryLimit(memoryLimit)

    // Set max stack size
    runtime.setMaxStackSize(maxStackSize)

    // Set up interrupt handler for infinite loops
    runtime.setInterruptHandler(() => {
      // Return false to allow execution to continue
      // This could be enhanced to detect actual infinite loops
      return enableInterruptHandler
    })

    const context = runtime.newContext()

    // [storage] Log sandbox creation details
    try {
      logger.info(
        {
          tag: 'storage',
          memoryLimit,
          maxStackSize,
          enableInterruptHandler,
          generatorCodeBytes: Buffer.byteLength(generatorCode, 'utf8'),
          initialInputBytes: Buffer.byteLength(
            JSON.stringify(initialInput ?? {}),
            'utf8',
          ),
        },
        '[storage] QuickJS sandbox create',
      )
    } catch (_) {
      // ignore size logging errors
    }

    try {
      // Inject safe globals and the generator function
      const setupCode = `
        // Safe console implementation
        const console = {
          log: (...args) => undefined,
          error: (...args) => undefined,
          warn: (...args) => undefined
        };
        
        // Agent function
        const handleSteps = ${generatorCode};
        
        // Create generator instance
        let generator = handleSteps(${JSON.stringify(initialInput)});
        
        // Generator management
        globalThis._generator = generator;
        
        // Helper to advance generator
        globalThis._nextStep = function(input) {
          const result = generator.next(input);
          return JSON.stringify({
            value: result.value,
            done: result.done
          });
        };
        
        true; // Return success
      `

      const setupResult = context.evalCode(setupCode)

      if (setupResult.error) {
        const error = context.dump(setupResult.error)
        setupResult.error.dispose()
        context.dispose()
        runtime.dispose()
        throw new Error(
          `Failed to setup QuickJS generator: ${JSON.stringify(error)}`,
        )
      }

      // Only dispose if the value exists and is not null/undefined
      if (setupResult.value) {
        setupResult.value.dispose()
      }

      const sandbox = new QuickJSSandbox(context, runtime)
      sandbox.initialized = true
      return sandbox
    } catch (error) {
      try {
        context.dispose()
        runtime.dispose()
      } catch (disposeError) {
        // Ignore disposal errors in catch block
      }
      throw error
    }
  }

  /**
   * Execute a single step of the generator
   */
  async executeStep(input: any): Promise<IteratorResult<any, void>> {
    if (!this.initialized) {
      throw new Error('Sandbox not initialized')
    }

    const inputJson = JSON.stringify(input)

    const result = this.context.evalCode(`globalThis._nextStep(${inputJson})`)

    if (result.error) {
      const error = this.context.dump(result.error)
      result.error.dispose()
      throw new Error(`QuickJS generator step failed: ${JSON.stringify(error)}`)
    }

    const stepResultJson = this.context.getString(result.value)

    // Only dispose if the value exists and is not null/undefined
    if (result.value) {
      result.value.dispose()
    }

    const stepResult = JSON.parse(stepResultJson)

    return {
      done: stepResult.done,
      value: stepResult.value,
    }
  }

  /**
   * Dispose of the sandbox and clean up resources
   */
  dispose(): void {
    if (!this.initialized) {
      return
    }

    try {
      this.context.dispose()
      this.runtime.dispose()
      this.initialized = false
      // [storage]
      logger.info({ tag: 'storage' }, '[storage] QuickJS sandbox disposed')
    } catch (error) {
      logger.warn({ error }, 'Failed to dispose QuickJS sandbox')
    }
  }

  /**
   * Check if the sandbox is still initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

/**
 * Manages multiple QuickJS sandboxes with automatic cleanup
 */
export class SandboxManager {
  private sandboxes = new Map<string, QuickJSSandbox>()

  /**
   * Create or get a sandbox for the given agent ID
   */
  async getOrCreateSandbox(
    agentId: string,
    generatorCode: string,
    initialInput: any,
    config?: SandboxConfig,
  ): Promise<QuickJSSandbox> {
    const existing = this.sandboxes.get(agentId)
    if (existing && existing.isInitialized()) {
      // [storage]
      logger.info(
        { tag: 'storage', agentId, sandboxCount: this.sandboxes.size },
        '[storage] SandboxManager reuse sandbox',
      )
      return existing
    }

    // Clean up any existing sandbox
    if (existing) {
      existing.dispose()
    }

    // Create new sandbox
    const sandbox = await QuickJSSandbox.create(
      generatorCode,
      initialInput,
      config,
    )
    this.sandboxes.set(agentId, sandbox)
    // [storage]
    logger.info(
      { tag: 'storage', agentId, sandboxCount: this.sandboxes.size },
      '[storage] SandboxManager create sandbox',
    )
    return sandbox
  }

  /**
   * Get an existing sandbox
   */
  getSandbox(agentId: string): QuickJSSandbox | undefined {
    return this.sandboxes.get(agentId)
  }

  /**
   * Remove and dispose a sandbox
   */
  removeSandbox(agentId: string): void {
    const sandbox = this.sandboxes.get(agentId)
    if (sandbox) {
      sandbox.dispose()
      this.sandboxes.delete(agentId)
      // [storage]
      logger.info(
        { tag: 'storage', agentId, sandboxCount: this.sandboxes.size },
        '[storage] SandboxManager remove sandbox',
      )
    }
  }

  /**
   * Clean up all sandboxes
   */
  dispose(): void {
    for (const [agentId, sandbox] of this.sandboxes) {
      try {
        sandbox.dispose()
      } catch (error) {
        logger.warn(
          { error, agentId },
          'Failed to dispose sandbox during cleanup',
        )
      }
    }
    this.sandboxes.clear()
    // [storage]
    logger.info({ tag: 'storage' }, '[storage] SandboxManager disposed all')
  }
}
