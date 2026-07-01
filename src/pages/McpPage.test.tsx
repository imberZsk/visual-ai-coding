import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import McpPage from "./McpPage";
import type { ConfigFileSpec } from "../config";
import type { VisualConfigSchema } from "../components/visual-config/schemaTypes";

vi.mock("../components/CapabilityConfigEditor", () => ({
  default: ({
    title,
    fieldPaths,
  }: {
    title: string;
    fieldPaths: string[];
    spec: ConfigFileSpec;
    schema: VisualConfigSchema;
  }) => (
    <div data-testid={`capability-${title}`}>
      <div>{title}</div>
      <div>{fieldPaths.join(",")}</div>
    </div>
  ),
}));

describe("McpPage", () => {
  it("renders Claude and Codex MCP configuration entry points", () => {
    render(<McpPage />);

    expect(screen.getByRole("heading", { name: "MCP" })).toBeInTheDocument();
    expect(screen.getByText("Claude MCP")).toBeInTheDocument();
    expect(screen.getByText("Codex MCP")).toBeInTheDocument();
    expect(screen.getByText(/mcpServers/)).toBeInTheDocument();
    expect(screen.getByText(/enableAllProjectMcpServers/)).toBeInTheDocument();
    expect(screen.getByText(/allowedMcpServers/)).toBeInTheDocument();
    expect(screen.getByText(/mcp_servers/)).toBeInTheDocument();
    expect(screen.getByText(/mcp_oauth_credentials_store/)).toBeInTheDocument();
  });
});
