package tutor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"time"
)

// LlamaEngine spawns llama-server as a subprocess and talks to it over its
// OpenAI-compatible /v1/chat/completions endpoint. This is the concrete implementation
// behind the Engine interface (brief §8's explicit seam) -- everything here is specific
// to "how do I run a GGUF file with llama.cpp"; nothing about it should leak into
// callers, who only ever see Engine.
type LlamaEngine struct {
	cmd     *exec.Cmd
	baseURL string
	tier    TierInfo
	client  *http.Client
}

type StartOptions struct {
	BinPath   string
	ModelPath string
	Ctx       int
	Threads   int
	Port      int
	Tier      TierInfo
	// LogWriter receives llama-server's own stdout/stderr -- surfaced rather than
	// discarded so a startup failure (e.g. model file missing, port in use) shows up
	// somewhere a person debugging on stage can actually see it.
	LogWriter io.Writer
}

// StartLlamaEngine spawns the process, waits for /health, and pre-warms with a small
// dummy request (brief's queue item 1: "so the first real hint isn't slow") before
// returning. If pre-warming fails, that's logged but not fatal -- a slow first hint is
// a much smaller problem than refusing to start over it.
func StartLlamaEngine(ctx context.Context, opts StartOptions) (*LlamaEngine, error) {
	if _, err := os.Stat(opts.ModelPath); err != nil {
		return nil, fmt.Errorf("tutor: model file not found at %s: %w", opts.ModelPath, err)
	}

	args := []string{
		"-m", opts.ModelPath,
		"-c", strconv.Itoa(opts.Ctx),
		"-t", strconv.Itoa(opts.Threads),
		"--port", strconv.Itoa(opts.Port),
		"--host", "127.0.0.1",
		"--reasoning", "off", // Qwen3 thinking mode would blow through the hint task's
		// small max_tokens budget without ever reaching an answer -- verified this flag
		// exists and does what it says via --help, not assumed.
	}
	cmd := exec.Command(opts.BinPath, args...)
	if opts.LogWriter != nil {
		cmd.Stdout = opts.LogWriter
		cmd.Stderr = opts.LogWriter
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("tutor: starting llama-server: %w", err)
	}

	e := &LlamaEngine{
		cmd:     cmd,
		baseURL: fmt.Sprintf("http://127.0.0.1:%d", opts.Port),
		tier:    opts.Tier,
		client:  &http.Client{Timeout: 60 * time.Second},
	}

	if err := e.waitReady(ctx, 60*time.Second); err != nil {
		_ = cmd.Process.Kill()
		return nil, err
	}

	warmCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if _, err := e.Complete(warmCtx, CompletionRequest{Task: "hint", Prompt: "Say hi in three words.", MaxTokens: 16}); err != nil {
		if opts.LogWriter != nil {
			fmt.Fprintf(opts.LogWriter, "tutor: pre-warm request failed (continuing anyway): %v\n", err)
		}
	}

	return e, nil
}

func (e *LlamaEngine) waitReady(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, e.baseURL+"/health", nil)
		resp, err := e.client.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(300 * time.Millisecond):
		}
	}
	return fmt.Errorf("tutor: llama-server did not become healthy within %s", timeout)
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Messages    []chatMessage `json:"messages"`
	MaxTokens   int           `json:"max_tokens"`
	Temperature float64       `json:"temperature"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

func (e *LlamaEngine) Complete(ctx context.Context, req CompletionRequest) (CompletionResult, error) {
	body, err := json.Marshal(chatRequest{
		Messages:    []chatMessage{{Role: "user", Content: req.Prompt}},
		MaxTokens:   req.MaxTokens,
		Temperature: 0.7,
	})
	if err != nil {
		return CompletionResult{}, fmt.Errorf("tutor: encoding request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, e.baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return CompletionResult{}, fmt.Errorf("tutor: building request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	start := time.Now()
	resp, err := e.client.Do(httpReq)
	if err != nil {
		return CompletionResult{}, fmt.Errorf("tutor: request to llama-server failed: %w", err)
	}
	defer resp.Body.Close()
	latency := time.Since(start).Milliseconds()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return CompletionResult{}, fmt.Errorf("tutor: llama-server returned %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return CompletionResult{}, fmt.Errorf("tutor: decoding llama-server response: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return CompletionResult{}, fmt.Errorf("tutor: llama-server returned no choices")
	}

	return CompletionResult{Text: parsed.Choices[0].Message.Content, LatencyMs: latency}, nil
}

func (e *LlamaEngine) TierInfo() TierInfo { return e.tier }

func (e *LlamaEngine) Close() error {
	if e.cmd == nil || e.cmd.Process == nil {
		return nil
	}
	return e.cmd.Process.Kill()
}
