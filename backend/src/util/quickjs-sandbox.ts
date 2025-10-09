import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core'

import type { Logger } from '@codebuff/common/types/contracts/logger'
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
  static async create(params: {
    generatorCode: string
    initialInput: any
    config?: SandboxConfig
    sandboxLogger?: Logger
  }): Promise<QuickJSSandbox> {
    const { generatorCode, initialInput, config = {}, sandboxLogger } = params
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

    try {
      // Set up logger handler
      const loggerHandler = context.newFunction(
        '_loggerHandler',
        (level, data, msg) => {
          try {
            const levelStr = context.getString(level)
            let dataObj: any
            let msgStr: string | undefined

            try {
              dataObj = data ? JSON.parse(context.getString(data)) : undefined
            } catch {
              dataObj = context.getString(data)
            }

            msgStr = msg ? context.getString(msg) : undefined

            // Call the appropriate logger method if available
            if (sandboxLogger?.[levelStr as keyof typeof sandboxLogger]) {
              sandboxLogger[levelStr as keyof typeof sandboxLogger](
                dataObj,
                msgStr,
              )
            }
          } catch (err) {
            // Fallback for logging errors
            if (sandboxLogger?.error) {
              sandboxLogger.error({ error: err }, 'Logger handler error')
            }
          }
        },
      )

      context.setProp(context.global, '_loggerHandler', loggerHandler)
      loggerHandler.dispose()
      // Inject safe globals and the generator function
      const setupCode = `
        // Safe console implementation
        const console = {
          log: (...args) => undefined,
          error: (...args) => undefined,
          warn: (...args) => undefined
        };
        
        // Logger implementation
        const createLogMethod = (level) => (data, msg) => 
          globalThis._loggerHandler(level, 
            typeof data === 'object' ? JSON.stringify(data) : String(data), 
            msg ? String(msg) : undefined);
        
        const logger = {
          debug: createLogMethod('debug'),
          info: createLogMethod('info'),
          warn: createLogMethod('warn'),
          error: createLogMethod('error')
        };
        
        // Agent function
        const handleSteps = ${generatorCode};
        
        // Create generator instance with logger injected into context
        const context = ${JSON.stringify(initialInput)};
        context.logger = logger;
        let generator = handleSteps(context);
        
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
  dispose(params: { logger: Logger }): void {
    const { logger } = params
    if (!this.initialized) {
      return
    }

    try {
      this.context.dispose()
      this.runtime.dispose()
      this.initialized = false
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
  async getOrCreateSandbox(params: {
    runId: string
    generatorCode: string
    initialInput: any
    config?: SandboxConfig
    sandboxLogger?: Logger
    logger: Logger
  }): Promise<QuickJSSandbox> {
    const {
      runId,
      generatorCode,
      initialInput,
      config,
      sandboxLogger,
      logger,
    } = params
    const existing = this.sandboxes.get(runId)
    if (existing && existing.isInitialized()) {
      return existing
    }

    // Clean up any existing sandbox
    if (existing) {
      existing.dispose({
        logger,
      })
    }

    // Create new sandbox
    const sandbox = await QuickJSSandbox.create({
      generatorCode,
      initialInput,
      config,
      sandboxLogger,
    })
    this.sandboxes.set(runId, sandbox)
    return sandbox
  }

  /**
   * Get an existing sandbox
   */
  getSandbox(params: { runId: string }): QuickJSSandbox | undefined {
    const { runId } = params
    return this.sandboxes.get(runId)
  }

  /**
   * Remove and dispose a sandbox
   */
  removeSandbox(params: { runId: string; logger: Logger }): void {
    const { runId, logger } = params
    const sandbox = this.sandboxes.get(runId)
    if (sandbox) {
      sandbox.dispose({ logger })
      this.sandboxes.delete(runId)
    }
  }

  /**
   * Clean up all sandboxes
   */
  dispose(params: { logger: Logger }): void {
    const { logger } = params
    for (const [runId, sandbox] of this.sandboxes) {
      try {
        sandbox.dispose({ logger })
      } catch (error) {
        logger.warn(
          { error, runId },
          'Failed to dispose sandbox during cleanup',
        )
      }
    }
    this.sandboxes.clear()
  }
}
