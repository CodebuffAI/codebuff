package taskruntoolcall

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/log"

	"github.com/google/uuid"
	kubechainv1alpha1 "github.com/humanlayer/smallchain/kubechain/api/v1alpha1"
	externalapi "github.com/humanlayer/smallchain/kubechain/internal/externalAPI"
	"github.com/humanlayer/smallchain/kubechain/internal/humanlayer"
	"github.com/humanlayer/smallchain/kubechain/internal/mcpmanager"
)

const (
	StatusReady               = "Ready"
	StatusError               = "Error"
	DetailToolExecutedSuccess = "Tool executed successfully"
	DetailInvalidArgsJSON     = "Invalid arguments JSON"
)

// +kubebuilder:rbac:groups=kubechain.humanlayer.dev,resources=taskruntoolcalls,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=kubechain.humanlayer.dev,resources=taskruntoolcalls/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=kubechain.humanlayer.dev,resources=tools,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch

// TaskRunToolCallReconciler reconciles a TaskRunToolCall object.
type TaskRunToolCallReconciler struct {
	client.Client
	Scheme     *runtime.Scheme
	recorder   record.EventRecorder
	server     *http.Server
	MCPManager *mcpmanager.MCPServerManager
}

func (r *TaskRunToolCallReconciler) webhookHandler(w http.ResponseWriter, req *http.Request) {
	logger := log.FromContext(context.Background())
	var webhook humanlayer.FunctionCall
	if err := json.NewDecoder(req.Body).Decode(&webhook); err != nil {
		logger.Error(err, "Failed to decode webhook payload")
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	logger.Info("Received webhook", "webhook", webhook)

	if webhook.Status != nil && webhook.Status.Approved != nil {
		if *webhook.Status.Approved {
			logger.Info("Email approved", "comment", webhook.Status.Comment)
		} else {
			logger.Info("Email request denied")
		}

		// Update TaskRunToolCall status
		if err := r.updateTaskRunToolCall(context.Background(), webhook); err != nil {
			logger.Error(err, "Failed to update TaskRunToolCall status")
			http.Error(w, "Failed to update status", http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
	if _, err := w.Write([]byte(`{"status": "ok"}`)); err != nil {
		http.Error(w, "Failed to write response", http.StatusInternalServerError)
		return
	}
}

func (r *TaskRunToolCallReconciler) updateTaskRunToolCall(ctx context.Context, webhook humanlayer.FunctionCall) error {
	logger := log.FromContext(ctx)
	var trtc kubechainv1alpha1.TaskRunToolCall

	if err := r.Get(ctx, client.ObjectKey{Namespace: "default", Name: webhook.RunID}, &trtc); err != nil {
		return fmt.Errorf("failed to get TaskRunToolCall: %w", err)
	}

	logger.Info("Webhook received",
		"runID", webhook.RunID,
		"status", webhook.Status,
		"approved", *webhook.Status.Approved,
		"comment", webhook.Status.Comment)

	if webhook.Status != nil && webhook.Status.Approved != nil {
		// Update the TaskRunToolCall status with the webhook data
		if *webhook.Status.Approved {
			trtc.Status.Result = "Approved"
			trtc.Status.Phase = kubechainv1alpha1.TaskRunToolCallPhaseSucceeded
			trtc.Status.Status = StatusReady
			trtc.Status.StatusDetail = DetailToolExecutedSuccess
		} else {
			trtc.Status.Result = "Rejected"
			trtc.Status.Phase = kubechainv1alpha1.TaskRunToolCallPhaseFailed
			trtc.Status.Status = StatusError
			trtc.Status.StatusDetail = "Tool execution rejected"
		}

		// if webhook.Status.RespondedAt != nil {
		// 		trtc.Status.RespondedAt = &metav1.Time{Time: *webhook.Status.RespondedAt}
		// }

		// if webhook.Status.Approved != nil {
		// 		trtc.Status.Approved = webhook.Status.Approved
		// }

		if err := r.Status().Update(ctx, &trtc); err != nil {
			return fmt.Errorf("failed to update TaskRunToolCall status: %w", err)
		}
		logger.Info("TaskRunToolCall status updated", "name", trtc.Name, "phase", trtc.Status.Phase)
	}

	return nil
}

// Helper function to convert various value types to float64
func convertToFloat(val interface{}) (float64, error) {
	switch v := val.(type) {
	case float64:
		return v, nil
	case int:
		return float64(v), nil
	case string:
		return strconv.ParseFloat(v, 64)
	default:
		return 0, fmt.Errorf("cannot convert %T to float64", val)
	}
}

// checkIfMCPTool checks if a tool name follows the MCPServer tool pattern (serverName__toolName)
// and returns the serverName, toolName, and whether it's an MCP tool
func isMCPTool(toolName string) (serverName string, actualToolName string, isMCP bool) {
	parts := strings.Split(toolName, "__")
	if len(parts) == 2 {
		return parts[0], parts[1], true
	}
	return "", toolName, false
}

// executeMCPTool executes a tool call on an MCP server
func (r *TaskRunToolCallReconciler) executeMCPTool(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall, serverName, toolName string, args map[string]interface{}) error {
	logger := log.FromContext(ctx)

	if r.MCPManager == nil {
		return fmt.Errorf("MCPManager is not initialized")
	}

	// Call the MCP tool
	result, err := r.MCPManager.CallTool(ctx, serverName, toolName, args)
	if err != nil {
		logger.Error(err, "Failed to call MCP tool",
			"serverName", serverName,
			"toolName", toolName)
		return err
	}

	// Update TaskRunToolCall status with the MCP tool result
	trtc.Status.Result = result
	trtc.Status.Phase = kubechainv1alpha1.TaskRunToolCallPhaseSucceeded
	trtc.Status.Status = StatusReady
	trtc.Status.StatusDetail = "MCP tool executed successfully"

	return nil
}

// initializeTRTC initializes the TaskRunToolCall status if not already set
// Returns true if initialization was done, false otherwise
func (r *TaskRunToolCallReconciler) initializeTRTC(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall) (bool, error) {
	logger := log.FromContext(ctx)

	if trtc.Status.Phase == "" {
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

// checkCompletedOrExisting checks if the TRTC is already complete or has a child TaskRun
func (r *TaskRunToolCallReconciler) checkCompletedOrExisting(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall) (bool, error) {
	logger := log.FromContext(ctx)

	// Check if already completed
	if trtc.Status.Phase == kubechainv1alpha1.TaskRunToolCallPhaseSucceeded || trtc.Status.Phase == kubechainv1alpha1.TaskRunToolCallPhaseFailed {
		logger.Info("TaskRunToolCall already completed, nothing to do", "phase", trtc.Status.Phase)
		return true, nil
	}

	// Check if a child TaskRun already exists for this tool call
	var taskRunList kubechainv1alpha1.TaskRunList
	if err := r.List(ctx, &taskRunList, client.InNamespace(trtc.Namespace), client.MatchingLabels{"kubechain.humanlayer.dev/taskruntoolcall": trtc.Name}); err != nil {
		logger.Error(err, "Failed to list child TaskRuns")
		return true, err
	}
	if len(taskRunList.Items) > 0 {
		logger.Info("Child TaskRun already exists", "childTaskRun", taskRunList.Items[0].Name)
		// Optionally, sync status from child to parent.
		return true, nil
	}

	return false, nil
}

// parseArguments parses the tool call arguments
func (r *TaskRunToolCallReconciler) parseArguments(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall) (map[string]interface{}, error) {
	logger := log.FromContext(ctx)

	// Parse the arguments string as JSON (needed for both MCP and traditional tools)
	var args map[string]interface{}
	if err := json.Unmarshal([]byte(trtc.Spec.Arguments), &args); err != nil {
		logger.Error(err, "Failed to parse arguments")
		trtc.Status.Status = StatusError
		trtc.Status.StatusDetail = DetailInvalidArgsJSON
		trtc.Status.Error = err.Error()
		r.recorder.Event(trtc, corev1.EventTypeWarning, "ExecutionFailed", err.Error())
		if err := r.Status().Update(ctx, trtc); err != nil {
			logger.Error(err, "Failed to update status")
			return nil, err
		}
		return nil, err
	}

	return args, nil
}

// processMCPTool handles execution of an MCP tool
func (r *TaskRunToolCallReconciler) processMCPTool(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall, serverName, mcpToolName string, args map[string]interface{}) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	logger.Info("Executing MCP tool", "serverName", serverName, "toolName", mcpToolName)

	// Execute the MCP tool
	if err := r.executeMCPTool(ctx, trtc, serverName, mcpToolName, args); err != nil {
		trtc.Status.Status = StatusError
		trtc.Status.StatusDetail = fmt.Sprintf("MCP tool execution failed: %v", err)
		trtc.Status.Error = err.Error()
		trtc.Status.Phase = kubechainv1alpha1.TaskRunToolCallPhaseFailed
		r.recorder.Event(trtc, corev1.EventTypeWarning, "ExecutionFailed", err.Error())

		if updateErr := r.Status().Update(ctx, trtc); updateErr != nil {
			logger.Error(updateErr, "Failed to update status")
			return ctrl.Result{}, updateErr
		}
		return ctrl.Result{}, err
	}

	// Save the result
	if err := r.Status().Update(ctx, trtc); err != nil {
		logger.Error(err, "Failed to update TaskRunToolCall status after execution")
		return ctrl.Result{}, err
	}
	logger.Info("MCP tool execution completed", "result", trtc.Status.Result)
	r.recorder.Event(trtc, corev1.EventTypeNormal, "ExecutionSucceeded",
		fmt.Sprintf("MCP tool %q executed successfully", trtc.Spec.ToolRef.Name))
	return ctrl.Result{}, nil
}

// getTraditionalTool retrieves and validates the Traditional Tool resource
func (r *TaskRunToolCallReconciler) getTraditionalTool(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall) (*kubechainv1alpha1.Tool, string, error) {
	logger := log.FromContext(ctx)

	// Get the Tool resource
	var tool kubechainv1alpha1.Tool
	if err := r.Get(ctx, client.ObjectKey{Namespace: trtc.Namespace, Name: trtc.Spec.ToolRef.Name}, &tool); err != nil {
		logger.Error(err, "Failed to get Tool", "tool", trtc.Spec.ToolRef.Name)
		trtc.Status.Status = StatusError
		trtc.Status.StatusDetail = fmt.Sprintf("Failed to get Tool: %v", err)
		trtc.Status.Error = err.Error()
		r.recorder.Event(trtc, corev1.EventTypeWarning, "ValidationFailed", err.Error())
		if err := r.Status().Update(ctx, trtc); err != nil {
			logger.Error(err, "Failed to update status")
			return nil, "", err
		}
		return nil, "", err
	}

	// Determine tool type from the Tool resource
	var toolType string
	if tool.Spec.Execute.Builtin != nil {
		toolType = "function"
	} else if tool.Spec.AgentRef != nil {
		toolType = "delegateToAgent"
	} else if tool.Spec.Execute.ExternalAPI != nil {
		toolType = "externalAPI"
	} else if tool.Spec.ToolType != "" {
		toolType = tool.Spec.ToolType
	} else {
		err := fmt.Errorf("unknown tool type: tool doesn't have valid execution configuration")
		logger.Error(err, "Invalid tool configuration")
		trtc.Status.Status = StatusError
		trtc.Status.StatusDetail = err.Error()
		trtc.Status.Error = err.Error()
		r.recorder.Event(trtc, corev1.EventTypeWarning, "ValidationFailed", err.Error())
		if err := r.Status().Update(ctx, trtc); err != nil {
			logger.Error(err, "Failed to update status")
			return nil, "", err
		}
		return nil, "", err
	}

	return &tool, toolType, nil
}

// processDelegateToAgent handles agent delegation (not yet implemented)
func (r *TaskRunToolCallReconciler) processDelegateToAgent(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	err := fmt.Errorf("delegation is not implemented yet; only direct execution is supported")
	logger.Error(err, "Delegation not implemented")
	trtc.Status.Status = StatusError
	trtc.Status.StatusDetail = err.Error()
	trtc.Status.Error = err.Error()
	r.recorder.Event(trtc, corev1.EventTypeWarning, "ValidationFailed", err.Error())
	if err := r.Status().Update(ctx, trtc); err != nil {
		logger.Error(err, "Failed to update status")
		return ctrl.Result{}, err
	}
	return ctrl.Result{}, err
}

// processBuiltinFunction handles built-in function execution
func (r *TaskRunToolCallReconciler) processBuiltinFunction(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall, tool *kubechainv1alpha1.Tool, args map[string]interface{}) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	logger.Info("Tool call arguments", "toolName", tool.Name, "arguments", args)

	var res float64
	// Determine which function to execute based on the builtin name
	switch tool.Spec.Execute.Builtin.Name {
	case "add":
		a, err1 := convertToFloat(args["a"])
		b, err2 := convertToFloat(args["b"])
		if err1 != nil {
			logger.Error(err1, "Failed to parse first argument")
			return ctrl.Result{}, err1
		}
		if err2 != nil {
			logger.Error(err2, "Failed to parse second argument")
			return ctrl.Result{}, err2
		}
		res = a + b
	case "subtract":
		a, err1 := convertToFloat(args["a"])
		b, err2 := convertToFloat(args["b"])
		if err1 != nil {
			logger.Error(err1, "Failed to parse first argument")
			return ctrl.Result{}, err1
		}
		if err2 != nil {
			logger.Error(err2, "Failed to parse second argument")
			return ctrl.Result{}, err2
		}
		res = a - b
	case "multiply":
		a, err1 := convertToFloat(args["a"])
		b, err2 := convertToFloat(args["b"])
		if err1 != nil {
			logger.Error(err1, "Failed to parse first argument")
			return ctrl.Result{}, err1
		}
		if err2 != nil {
			logger.Error(err2, "Failed to parse second argument")
			return ctrl.Result{}, err2
		}
		res = a * b
	case "divide":
		a, err1 := convertToFloat(args["a"])
		b, err2 := convertToFloat(args["b"])
		if err1 != nil {
			logger.Error(err1, "Failed to parse first argument")
			return ctrl.Result{}, err1
		}
		if err2 != nil {
			logger.Error(err2, "Failed to parse second argument")
			return ctrl.Result{}, err2
		}
		if b == 0 {
			err := fmt.Errorf("division by zero")
			logger.Error(err, "Division by zero")
			trtc.Status.Status = StatusError
			trtc.Status.StatusDetail = "Division by zero"
			trtc.Status.Error = err.Error()
			r.recorder.Event(trtc, corev1.EventTypeWarning, "ExecutionFailed", err.Error())
			if err := r.Status().Update(ctx, trtc); err != nil {
				logger.Error(err, "Failed to update status")
				return ctrl.Result{}, err
			}
			return ctrl.Result{}, err
		}
		res = a / b
	default:
		err := fmt.Errorf("unsupported builtin function %q", tool.Spec.Execute.Builtin.Name)
		logger.Error(err, "Unsupported builtin")
		trtc.Status.Status = StatusError
		trtc.Status.StatusDetail = err.Error()
		trtc.Status.Error = err.Error()
		r.recorder.Event(trtc, corev1.EventTypeWarning, "ExecutionFailed", err.Error())
		if err := r.Status().Update(ctx, trtc); err != nil {
			logger.Error(err, "Failed to update status")
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, err
	}

	// Update TaskRunToolCall status with the function result
	trtc.Status.Result = fmt.Sprintf("%v", res)
	trtc.Status.Phase = kubechainv1alpha1.TaskRunToolCallPhaseSucceeded
	trtc.Status.Status = StatusReady
	trtc.Status.StatusDetail = DetailToolExecutedSuccess
	if err := r.Status().Update(ctx, trtc); err != nil {
		logger.Error(err, "Failed to update TaskRunToolCall status after execution")
		return ctrl.Result{}, err
	}
	logger.Info("Direct execution completed", "result", res)
	r.recorder.Event(trtc, corev1.EventTypeNormal, "ExecutionSucceeded", fmt.Sprintf("Tool %q executed successfully", tool.Name))
	return ctrl.Result{}, nil
}

// getExternalAPICredentials fetches and validates credentials for external API
func (r *TaskRunToolCallReconciler) getExternalAPICredentials(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall, tool *kubechainv1alpha1.Tool) (string, error) {
	logger := log.FromContext(ctx)

	if tool.Spec.Execute.ExternalAPI == nil {
		err := fmt.Errorf("externalAPI tool missing execution details")
		logger.Error(err, "Missing execution details")
		trtc.Status.Status = StatusError
		trtc.Status.StatusDetail = err.Error()
		trtc.Status.Error = err.Error()
		r.recorder.Event(trtc, corev1.EventTypeWarning, "ValidationFailed", err.Error())
		if err := r.Status().Update(ctx, trtc); err != nil {
			logger.Error(err, "Failed to update status")
			return "", err
		}
		return "", err
	}

	// Get API key from secret
	var apiKey string
	if tool.Spec.Execute.ExternalAPI.CredentialsFrom != nil {
		var secret corev1.Secret
		err := r.Get(ctx, client.ObjectKey{
			Namespace: trtc.Namespace,
			Name:      tool.Spec.Execute.ExternalAPI.CredentialsFrom.Name,
		}, &secret)
		if err != nil {
			logger.Error(err, "Failed to get API credentials")
			trtc.Status.Status = StatusError
			trtc.Status.StatusDetail = fmt.Sprintf("Failed to get API credentials: %v", err)
			trtc.Status.Error = err.Error()
			r.recorder.Event(trtc, corev1.EventTypeWarning, "ValidationFailed", err.Error())
			if err := r.Status().Update(ctx, trtc); err != nil {
				logger.Error(err, "Failed to update status")
				return "", err
			}
			return "", err
		}

		apiKey = string(secret.Data[tool.Spec.Execute.ExternalAPI.CredentialsFrom.Key])
		logger.Info("Retrieved API key", "key", apiKey)
		if apiKey == "" {
			err := fmt.Errorf("empty API key in secret")
			logger.Error(err, "Empty API key")
			trtc.Status.Status = StatusError
			trtc.Status.StatusDetail = err.Error()
			trtc.Status.Error = err.Error()
			r.recorder.Event(trtc, corev1.EventTypeWarning, "ValidationFailed", err.Error())
			if err := r.Status().Update(ctx, trtc); err != nil {
				logger.Error(err, "Failed to update status")
				return "", err
			}
			return "", err
		}
	}

	return apiKey, nil
}

// processExternalAPI executes a call to an external API
func (r *TaskRunToolCallReconciler) processExternalAPI(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall, tool *kubechainv1alpha1.Tool) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	// Get API credentials
	_, err := r.getExternalAPICredentials(ctx, trtc, tool)
	if err != nil {
		return ctrl.Result{}, err
	}

	// Parse arguments
	var argsMap map[string]interface{}
	if err := json.Unmarshal([]byte(trtc.Spec.Arguments), &argsMap); err != nil {
		logger.Error(err, "Failed to parse arguments")
		trtc.Status.Status = StatusError
		trtc.Status.StatusDetail = DetailInvalidArgsJSON
		trtc.Status.Error = err.Error()
		trtc.Status.Phase = kubechainv1alpha1.TaskRunToolCallPhaseFailed
		r.recorder.Event(trtc, corev1.EventTypeWarning, "ExecutionFailed", err.Error())
		if err := r.Status().Update(ctx, trtc); err != nil {
			logger.Error(err, "Failed to update status")
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, err
	}

	// Special handling for HumanLayer function calls
	if len(argsMap) == 0 && tool.Name == "humanlayer-function-call" {
		humanlayer.RegisterClient()

		// Create kwargs map first to ensure it's properly initialized
		kwargs := map[string]interface{}{
			"tool_name": trtc.Spec.ToolRef.Name,
			"task_run":  trtc.Spec.TaskRunRef.Name,
			"namespace": trtc.Namespace,
		}

		// Default function call for HumanLayer with verified kwargs
		argsMap = map[string]interface{}{
			"fn":     "approve_tool_call",
			"kwargs": kwargs,
		}

		// Log to verify
		logger.Info("Created humanlayer function call args",
			"argsMap", argsMap,
			"kwargs", kwargs)
	}

	// Get the external client
	externalClient, err := externalapi.DefaultRegistry.GetClient(
		tool.Name,
		r.Client,
		trtc.Namespace,
		tool.Spec.Execute.ExternalAPI.CredentialsFrom,
	)
	if err != nil {
		logger.Error(err, "Failed to get external client")
		trtc.Status.Status = StatusError
		trtc.Status.StatusDetail = fmt.Sprintf("Failed to get external client: %v", err)
		trtc.Status.Error = err.Error()
		trtc.Status.Phase = kubechainv1alpha1.TaskRunToolCallPhaseFailed
		r.recorder.Event(trtc, corev1.EventTypeWarning, "ExecutionFailed", err.Error())
		if err := r.Status().Update(ctx, trtc); err != nil {
			logger.Error(err, "Failed to update status")
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, err
	}

	var fn string
	var kwargs map[string]interface{}

	// Extract function name
	if fnVal, fnExists := argsMap["fn"]; fnExists && fnVal != nil {
		fn, _ = fnVal.(string)
	}

	// Extract kwargs
	if kwargsVal, kwargsExists := argsMap["kwargs"]; kwargsExists && kwargsVal != nil {
		kwargs, _ = kwargsVal.(map[string]interface{})
	}

	// Generate call ID
	callID := "call-" + uuid.New().String()

	// Prepare function call spec
	functionSpec := map[string]interface{}{
		"fn":     fn,
		"kwargs": kwargs,
	}

	// Make the API call
	_, err = externalClient.Call(ctx, trtc.Name, callID, functionSpec)
	if err != nil {
		logger.Error(err, "External API call failed")
		return ctrl.Result{}, err
	}

	// Update TaskRunToolCall with the result
	trtc.Status.Phase = kubechainv1alpha1.TaskRunToolCallPhaseSucceeded
	trtc.Status.Status = StatusReady
	trtc.Status.StatusDetail = DetailToolExecutedSuccess
	if err := r.Status().Update(ctx, trtc); err != nil {
		logger.Error(err, "Failed to update TaskRunToolCall status")
		return ctrl.Result{}, err
	}
	logger.Info("TaskRunToolCall completed", "phase", trtc.Status.Phase)
	return ctrl.Result{}, nil
}

// handleUnsupportedToolType handles the fallback for unrecognized tool types
func (r *TaskRunToolCallReconciler) handleUnsupportedToolType(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	err := fmt.Errorf("unsupported tool configuration")
	logger.Error(err, "Unsupported tool configuration")
	trtc.Status.Status = StatusError
	trtc.Status.StatusDetail = err.Error()
	trtc.Status.Error = err.Error()
	r.recorder.Event(trtc, corev1.EventTypeWarning, "ExecutionFailed", err.Error())
	if err := r.Status().Update(ctx, trtc); err != nil {
		logger.Error(err, "Failed to update status")
		return ctrl.Result{}, err
	}
	return ctrl.Result{}, err
}

// getMCPServer gets the MCPServer for a tool and checks if it requires approval
func (r *TaskRunToolCallReconciler) getMCPServer(ctx context.Context, trtc *kubechainv1alpha1.TaskRunToolCall) (*kubechainv1alpha1.MCPServer, bool, error) {
	logger := log.FromContext(ctx)

	// Check if this is an MCP tool
	serverName, _, isMCP := isMCPTool(trtc.Spec.ToolRef.Name)
	if !isMCP {
		return nil, false, nil
	}

	// Get the MCPServer
	var mcpServer kubechainv1alpha1.MCPServer
	if err := r.Get(ctx, client.ObjectKey{
		Namespace: trtc.Namespace,
		Name:      serverName,
	}, &mcpServer); err != nil {
		logger.Error(err, "Failed to get MCPServer", "serverName", serverName)
		return nil, false, err
	}

	return &mcpServer, mcpServer.Spec.ApprovalContactChannel != nil, nil
}

// Reconcile processes TaskRunToolCall objects.
func (r *TaskRunToolCallReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	var trtc kubechainv1alpha1.TaskRunToolCall
	if err := r.Get(ctx, req.NamespacedName, &trtc); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}
	logger.Info("Reconciling TaskRunToolCall", "name", trtc.Name)

	// Step 1: Initialize status if not set
	if initialized, err := r.initializeTRTC(ctx, &trtc); initialized || err != nil {
		if err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Step 2: Check if already completed or has child TaskRun
	if done, err := r.checkCompletedOrExisting(ctx, &trtc); done || err != nil {
		if err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	serverName, mcpToolName, isMCP := isMCPTool(trtc.Spec.ToolRef.Name)

	if isMCP {
		// Step 3: Check if this is an MCP tool and needs approval
		mcpServer, needsApproval, err := r.getMCPServer(ctx, &trtc)
		if err != nil {
			return ctrl.Result{}, err
		}

		if needsApproval {
			trtc.Status.Status = "AwaitingHumanApproval"
			trtc.Status.StatusDetail = fmt.Sprintf("Waiting for human approval via contact channel %s", mcpServer.Spec.ApprovalContactChannel.Name)
			r.recorder.Event(&trtc, corev1.EventTypeNormal, "AwaitingHumanApproval",
				fmt.Sprintf("Tool execution requires approval via contact channel %s", mcpServer.Spec.ApprovalContactChannel.Name))

			if err := r.Status().Update(ctx, &trtc); err != nil {
				logger.Error(err, "Failed to update TaskRunToolCall status")
				return ctrl.Result{}, err
			}
			return ctrl.Result{}, nil
		}
	}

	// Step 4: Parse arguments
	args, err := r.parseArguments(ctx, &trtc)
	if err != nil {
		return ctrl.Result{}, err
	}

	// Step 5: Handle MCP tool execution if applicable
	if isMCP && r.MCPManager != nil {
		return r.processMCPTool(ctx, &trtc, serverName, mcpToolName, args)
	}

	// Step 6: Get traditional Tool resource
	tool, toolType, err := r.getTraditionalTool(ctx, &trtc)
	if err != nil {
		return ctrl.Result{}, err
	}

	// Step 7: Process based on tool type
	switch toolType {
	case "delegateToAgent":
		return r.processDelegateToAgent(ctx, &trtc)
	case "function":
		return r.processBuiltinFunction(ctx, &trtc, tool, args)
	case "externalAPI":
		return r.processExternalAPI(ctx, &trtc, tool)
	default:
		return r.handleUnsupportedToolType(ctx, &trtc)
	}
}

func (r *TaskRunToolCallReconciler) SetupWithManager(mgr ctrl.Manager) error {
	r.recorder = mgr.GetEventRecorderFor("taskruntoolcall-controller")
	r.server = &http.Server{Addr: ":8080"} // Choose a port
	http.HandleFunc("/webhook/inbound", r.webhookHandler)

	// Initialize MCPManager if it hasn't been initialized yet
	if r.MCPManager == nil {
		r.MCPManager = mcpmanager.NewMCPServerManager()
	}

	go func() {
		if err := r.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Log.Error(err, "Failed to start HTTP server")
		}
	}()

	return ctrl.NewControllerManagedBy(mgr).
		For(&kubechainv1alpha1.TaskRunToolCall{}).
		Complete(r)
}

func (r *TaskRunToolCallReconciler) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := r.server.Shutdown(ctx); err != nil {
		log.Log.Error(err, "Failed to shut down HTTP server")
	}
}
