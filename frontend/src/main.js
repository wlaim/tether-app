import './app.css';
import { GetConfig, StartSession, EndSession } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';

// ── State ─────────────────────────────────────────────────────────────────────
let config = { helperName: 'your helper', os: 'windows' };
let term = null;
let fitAddon = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    config = await GetConfig();
  } catch (_) {}

  renderApp();
  showScreen('idle');

  // Backend tells us when the session ends (helper disconnects / upterm dies)
  EventsOn('session:ended', () => {
    showScreen('ended');
    if (term) { term.dispose(); term = null; }
  });

  // Emit pty output to xterm (Mac/Linux only — Windows shows status panel)
  EventsOn('pty:data', (chunk) => {
    if (term) term.write(chunk);
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderApp() {
  document.getElementById('app').innerHTML = `
    <!-- Idle -->
    <div class="screen" id="screen-idle">
      <div class="logo">Tether</div>
      <div class="tagline">Remote help from someone you trust.</div>
      <button class="btn-primary" id="btn-get-help">Get Help</button>
    </div>

    <!-- Consent -->
    <div class="screen" id="screen-consent">
      <div class="consent-title">Allow remote access?</div>
      <div class="consent-sub">
        <span class="helper-name">${esc(config.helperName)}</span> wants to help
        you fix something on this computer.
      </div>

      <div class="permissions">
        <p>They will be able to:</p>
        <ul>
          <li>Run programs on your computer</li>
          <li>Read and edit files in your home folder</li>
          <li>See your terminal in real time</li>
        </ul>
      </div>

      <div class="consent-note">
        You can end the session at any time. This only started because
        you clicked "Get Help" — Tether never connects without your action.
        Read this code to <strong>${esc(config.helperName)}</strong> to confirm
        it's them: <span id="session-code">—</span>
      </div>

      <div class="error-banner" id="consent-error"></div>

      <div class="consent-buttons">
        <button class="btn-decline" id="btn-decline">Decline</button>
        <button class="btn-allow" id="btn-allow">Allow</button>
      </div>
    </div>

    <!-- Loading (allow clicked, waiting for upterm) -->
    <div class="screen" id="screen-loading">
      <div class="spinner"></div>
      <div class="loading-text">Starting secure session…</div>
    </div>

    <!-- Live -->
    <div class="screen" id="screen-live">
      <div class="live-header">
        <div class="live-indicator">
          <div class="dot"></div>
          <span>Live — <strong>${esc(config.helperName)}</strong> is helping</span>
        </div>
        <button class="btn-end" id="btn-end">End Session</button>
      </div>

      ${ config.os === 'windows'
        ? `<div class="win-status">
             <div class="spinner"></div>
             <p>${esc(config.helperName)} is connected and working on your computer.<br>
             Close this window or click End Session at any time to stop.</p>
           </div>`
        : `<div class="terminal-wrap" id="terminal"></div>`
      }
    </div>

    <!-- Ended -->
    <div class="screen" id="screen-ended">
      <div class="ended-icon">✓</div>
      <div class="ended-title">Session ended</div>
      <div class="ended-sub">The connection has been closed.</div>
      <button class="btn-primary" id="btn-new-session">Done</button>
    </div>
  `;

  bindEvents();
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('btn-get-help').addEventListener('click', () => {
    // Generate a simple 4-digit display code for verbal confirmation
    const code = String(Math.floor(1000 + Math.random() * 9000));
    document.getElementById('session-code').textContent = code;
    showScreen('consent');
  });

  document.getElementById('btn-decline').addEventListener('click', () => {
    showScreen('idle');
  });

  document.getElementById('btn-allow').addEventListener('click', onAllow);

  document.getElementById('btn-end').addEventListener('click', onEnd);

  document.getElementById('btn-new-session').addEventListener('click', () => {
    showScreen('idle');
  });
}

async function onAllow() {
  const errorEl = document.getElementById('consent-error');
  errorEl.classList.remove('visible');
  showScreen('loading');

  try {
    const result = await StartSession();

    if (result.error) {
      showScreen('consent');
      errorEl.textContent = result.error;
      errorEl.classList.add('visible');
      return;
    }

    showScreen('live');

    // Mac/Linux: init xterm
    if (config.os !== 'windows') {
      initTerminal();
    }
  } catch (err) {
    showScreen('consent');
    errorEl.textContent = String(err);
    errorEl.classList.add('visible');
  }
}

async function onEnd() {
  await EndSession();
  if (term) { term.dispose(); term = null; }
  showScreen('ended');
}

// ── xterm.js (Mac/Linux) ──────────────────────────────────────────────────────
function initTerminal() {
  const container = document.getElementById('terminal');
  if (!container || !window.Terminal) return;

  term = new window.Terminal({
    disableStdin: true,           // read-only — helpee cannot type into the session
    cursorBlink: false,
    fontSize: 13,
    fontFamily: 'Menlo, Consolas, "Courier New", monospace',
    theme: {
      background: '#0d0d0d',
      foreground: '#e8e8e8',
      cursor: '#e8e8e8',
    },
    scrollback: 1000,
  });

  fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  fitAddon.fit();

  // Resize terminal when window resizes
  window.addEventListener('resize', () => {
    if (fitAddon) fitAddon.fit();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Go ────────────────────────────────────────────────────────────────────────
boot();
