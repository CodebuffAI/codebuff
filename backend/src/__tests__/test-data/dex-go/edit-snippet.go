package taskruntoolcall

import (
	// ... existing imports ...
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

// ... existing code ...

// initializeTRTC initializes the TaskRunToolCall status if not already set
// Returns true if initialization was done, false otherwise
func (r *TaskRunToolCallReconciler) initializeTRTC(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall) (bool, error) {
	logger := log.FromContext(ctx)

	if trtc.Status.Phase == "" {
		// Start tracing the TaskRunToolCall
		tracer := otel.GetTracerProvider().Tracer("taskruntoolcall")
		ctx, span := tracer.Start(ctx, "TaskRunToolCall")

		// Store span context in status
		spanCtx := span.SpanContext()
		trtc.Status.SpanContext = &kubechainv1alpha1.SpanContext{
			TraceID: spanCtx.TraceID().String(),
			SpanID:  spanCtx.SpanID().String(),
		}

		trtc.Status.Phase = kubechainv1alpha1.TaskRunToolCallPhasePending
		trtc.Status.Status = "Pending"
		trtc.Status.StatusDetail = "Initializing"
		trtc.Status.StartTime = &metav1.Time{Time: time.Now()}
		if err := r.Status().Update(ctx, trtc); err != nil {
			logger.Error(err, "Failed to update initial status on TaskRunToolCall")
			return true, err
		}
		return true, nil
	}

	return false, nil
}

// endTaskRunToolCallRootSpan ends the root span of a TaskRunToolCall using its stored span context
func (r *TaskRunToolCallReconciler) endTaskRunToolCallRootSpan(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall) {
	if trtc.Status.SpanContext == nil {
		return
	}

	// Create a new span context from the stored trace and span IDs
	parentTraceID, _ := trace.TraceIDFromHex(trtc.Status.SpanContext.TraceID)
	parentSpanID, _ := trace.SpanIDFromHex(trtc.Status.SpanContext.SpanID)
	parentSpanCtx := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    parentTraceID,
		SpanID:     parentSpanID,
		Remote:     true,
		TraceFlags: trace.FlagsSampled,
	})

	// Create a new span with the parent context to end it
	tracer := otel.GetTracerProvider().Tracer("taskruntoolcall")
	_, span := tracer.Start(trace.ContextWithSpanContext(ctx, parentSpanCtx), "TaskRunToolCall")
	span.End()
}

// initializeTaskRunToolCallChildSpan creates a new span for tool execution using the parent span context
func (r *TaskRunToolCallReconciler) initializeTaskRunToolCallChildSpan(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall, name string) (context.Context, trace.Span) {
	if trtc.Status.SpanContext == nil {
		return ctx, nil
	}

	// Create a new span context from the stored trace and span IDs
	parentTraceID, _ := trace.TraceIDFromHex(trtc.Status.SpanContext.TraceID)
	parentSpanID, _ := trace.SpanIDFromHex(trtc.Status.SpanContext.SpanID)
	parentSpanCtx := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    parentTraceID,
		SpanID:     parentSpanID,
		Remote:     true,
		TraceFlags: trace.FlagsSampled,
	})

	// Create a new span with the parent context
	tracer := otel.GetTracerProvider().Tracer("taskruntoolcall")
	return tracer.Start(trace.ContextWithSpanContext(ctx, parentSpanCtx), name)
}

// ... existing code ...

// processBuiltinFunction handles built-in function execution
func (r *TaskRunToolCallReconciler) processBuiltinFunction(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall, tool *kubechainv1alpha1.Tool, args map[string]interface{}) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	// Create a child span for function execution
	ctx, span := r.initializeTaskRunToolCallChildSpan(ctx, trtc, "ExecuteBuiltinFunction")
	if span != nil {
		defer span.End()
	}

	logger.Info("Tool call arguments", "toolName", tool.Name, "arguments", args)

	var res float64
	// ... existing function execution code ...

	// Update TaskRunToolCall status with the function result
	trtc.Status.Result = fmt.Sprintf("%v", res)
	trtc.Status.Phase = kubechainv1alpha1.TaskRunToolCallPhaseSucceeded
	trtc.Status.Status = StatusReady
	trtc.Status.StatusDetail = DetailToolExecutedSuccess
	trtc.Status.CompletionTime = &metav1.Time{Time: time.Now()}
	
	// End the root span since execution is complete
	r.endTaskRunToolCallRootSpan(ctx, trtc)

	if err := r.Status().Update(ctx, trtc); err != nil {
		logger.Error(err, "Failed to update TaskRunToolCall status after execution")
		return ctrl.Result{}, err
	}
	logger.Info("Direct execution completed", "result", res)
	r.recorder.Event(trtc, corev1.EventTypeNormal, "ExecutionSucceeded", fmt.Sprintf("Tool %q executed successfully", tool.Name))
	return ctrl.Result{}, nil
}

// ... rest of existing code ...