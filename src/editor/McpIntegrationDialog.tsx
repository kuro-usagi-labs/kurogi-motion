import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../ui/Icon";

interface McpIntegrationDialogProps {
  open: boolean;
  onClose: () => void;
}

interface McpInfo {
  bridgeRunning: boolean;
  bridgeFile: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  packaged: boolean;
}

export function McpIntegrationDialog({ open, onClose }: McpIntegrationDialogProps) {
  const [info, setInfo] = useState<McpInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void window.kurogi?.getMcpInfo?.().then((value) => {
      if (!cancelled) setInfo(value);
    });
    const listener = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", listener);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", listener);
    };
  }, [open, onClose]);

  const configuration = useMemo(() => {
    if (!info) return "";
    return JSON.stringify({
      mcpServers: {
        "kurogi-motion": {
          command: info.command,
          args: info.args,
          env: info.env,
        },
      },
    }, null, 2);
  }, [info]);

  if (!open) return null;

  const copyConfiguration = async () => {
    if (!configuration) return;
    await navigator.clipboard.writeText(configuration);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="mcp-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="mcp-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="mcp-dialog-eyebrow">MODEL CONTEXT PROTOCOL V3</span>
            <h2 id="mcp-dialog-title">Let AI agents build videos in Kurogi Motion</h2>
          </div>
          <button type="button" className="mcp-dialog-close" onClick={onClose} aria-label="Close MCP integration"><Icon name="close" size={16} /></button>
        </header>

        <div className="mcp-dialog-body">
          <div className={`mcp-status-card ${info?.bridgeRunning ? "is-online" : ""}`}>
            <span className="mcp-status-dot" />
            <div>
              <strong>{info?.bridgeRunning ? "Local bridge is running" : "Checking local bridge…"}</strong>
              <small>The bridge only listens on 127.0.0.1 and uses a new random token each launch.</small>
            </div>
          </div>

          <div className="mcp-dialog-copy">
            <h3>MCP client configuration</h3>
            <p>Add this server entry to Claude Code, Codex, or another MCP-compatible client. Keep Kurogi Motion open with a project loaded.</p>
            <pre>{configuration || "Loading configuration…"}</pre>
            <button type="button" className="mcp-copy-button" disabled={!configuration} onClick={() => void copyConfiguration()}>
              <Icon name={copied ? "check" : "copy"} size={15} />{copied ? "Copied" : "Copy configuration"}
            </button>
          </div>

          <div className="mcp-permission-note">
            <Icon name="sparkles" size={16} />
            <span><strong>Autonomous mode is enabled.</strong> MCP edits, media imports, saves, and exports execute immediately without Kurogi confirmation dialogs. The one-call workflow exports to a unique file under Videos; the MCP client may still apply its own host-level policy.</span>
          </div>

          <div className="mcp-tools-summary">
            <h3>Available in V3</h3>
            <div>
              <span>Read full project context</span>
              <span>Scene CRUD and variations</span>
              <span>Text, shapes, and assets</span>
              <span>Action-based animation</span>
              <span>Import audio and images</span>
              <span>Trim and mix audio</span>
              <span>Transactional edit plans</span>
              <span>One-call autonomous video</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
