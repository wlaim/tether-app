package main

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx       context.Context
	mu        sync.Mutex
	uptermCmd *exec.Cmd
	active    bool
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// GetConfig returns app config to the frontend.
func (a *App) GetConfig() map[string]string {
	return map[string]string{
		"helperName": HelperName,
		"os":         goruntime.GOOS,
	}
}

// StartSession starts the upterm tunnel and notifies the helper.
// Returns {"joinURL": "...", "os": "windows"|"darwin"|"linux"} on success,
// or {"error": "..."} on failure.
func (a *App) StartSession() map[string]string {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.active {
		return map[string]string{"error": "session already active"}
	}

	uptermPath, err := findUpterm()
	if err != nil {
		return map[string]string{"error": err.Error()}
	}

	// Shell to expose to the helper
	var shellCmd string
	var shellArgs []string
	switch goruntime.GOOS {
	case "windows":
		shellCmd = "powershell.exe"
		shellArgs = []string{"-NoLogo", "-NoExit"}
	default:
		shellCmd = os.Getenv("SHELL")
		if shellCmd == "" {
			shellCmd = "/bin/bash"
		}
	}

	// Log file — upterm prints the session URL here on startup
	logPath := filepath.Join(os.TempDir(), "tether-session.log")
	logFile, err := os.Create(logPath)
	if err != nil {
		return map[string]string{"error": "cannot create log file: " + err.Error()}
	}

	// Build upterm command
	args := []string{"host", "--server", UptermServer, "--"}
	args = append(args, shellCmd)
	args = append(args, shellArgs...)
	cmd := exec.Command(uptermPath, args...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return map[string]string{"error": "failed to start upterm: " + err.Error()}
	}

	a.uptermCmd = cmd
	a.active = true
	logFile.Close()

	// Read log until we find the SSH join URL (up to 20 seconds)
	joinURL := waitForJoinURL(logPath, 20*time.Second)

	// Notify helper in background
	if NotifyURL != "" {
		go notifyHelper(NotifyURL, joinURL)
	}

	// Watch for session end
	go func() {
		cmd.Wait()
		a.mu.Lock()
		a.active = false
		a.mu.Unlock()
		os.Remove(logPath)
		wailsruntime.EventsEmit(a.ctx, "session:ended")
	}()

	return map[string]string{
		"joinURL": joinURL,
		"os":      goruntime.GOOS,
	}
}

// EndSession kills the upterm process and cleans up.
func (a *App) EndSession() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.uptermCmd != nil && a.uptermCmd.Process != nil {
		a.uptermCmd.Process.Kill()
	}
	a.active = false
}

// waitForJoinURL polls the upterm log file until it finds an SSH URL or times out.
func waitForJoinURL(logPath string, timeout time.Duration) string {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(300 * time.Millisecond)
		f, err := os.Open(logPath)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()
			for _, word := range strings.Fields(line) {
				if strings.HasPrefix(word, "ssh://") {
					f.Close()
					return word
				}
			}
		}
		f.Close()
	}
	return ""
}

// notifyHelper POSTs the join URL to the configured notify endpoint.
func notifyHelper(notifyURL, joinURL string) {
	var body string
	if joinURL != "" {
		body = fmt.Sprintf("Tether session ready. Run this to attach:\n\nupterm join %s\n\nThen run: claude", joinURL)
	} else {
		body = "Tether session started (could not extract join URL — check the upterm log)."
	}
	req, err := http.NewRequest("POST", notifyURL, strings.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "text/plain")
	client := &http.Client{Timeout: 10 * time.Second}
	client.Do(req) //nolint:errcheck
}

// findUpterm looks for the upterm binary in PATH and next to the executable.
func findUpterm() (string, error) {
	if path, err := exec.LookPath("upterm"); err == nil {
		return path, nil
	}
	// Also check next to the running executable (for bundled deploys)
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		for _, name := range []string{"upterm", "upterm.exe"} {
			candidate := filepath.Join(exeDir, name)
			if _, err := os.Stat(candidate); err == nil {
				return candidate, nil
			}
		}
	}
	return "", fmt.Errorf("upterm not found — install from https://upterm.dev or place upterm.exe next to this app")
}
