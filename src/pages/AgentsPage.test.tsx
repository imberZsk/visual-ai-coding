import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentsPage from "./AgentsPage";
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

vi.mock("../components/ConfigEditor", () => ({
  default: ({ spec }: { spec: ConfigFileSpec }) => (
    <div data-testid={`config-${spec.id}`}>{spec.title}</div>
  ),
}));

describe("AgentsPage", () => {
  it("renders Claude and Codex agent instructions and configuration entry points", () => {
    render(<AgentsPage />);

    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByTestId("config-claude-md")).toHaveTextContent("CLAUDE.md");
    expect(screen.getByTestId("config-codex-agents")).toHaveTextContent("AGENTS.md");
    expect(screen.getByText("Claude Agents")).toBeInTheDocument();
    expect(screen.getByText("Codex Agents")).toBeInTheDocument();
    // claudeAgentsCard 存储 Claude Agents 能力配置卡片的 mock 输出。
    const claudeAgentsCard = screen.getByTestId("capability-Claude Agents");
    // codexAgentsCard 存储 Codex Agents 能力配置卡片的 mock 输出。
    const codexAgentsCard = screen.getByTestId("capability-Codex Agents");
    expect(within(claudeAgentsCard).getByText(/agent/)).toBeInTheDocument();
    expect(within(claudeAgentsCard).getByText(/teammateDefaultModel/)).toBeInTheDocument();
    expect(within(codexAgentsCard).getByText(/agents/)).toBeInTheDocument();
    expect(within(codexAgentsCard).getByText(/show_raw_agent_reasoning/)).toBeInTheDocument();
  });
});
