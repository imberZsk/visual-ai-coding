import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HooksPage from "./HooksPage";
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

describe("HooksPage", () => {
  it("renders Claude and Codex hook configuration entry points", () => {
    render(<HooksPage />);

    expect(screen.getByRole("heading", { name: "Hooks" })).toBeInTheDocument();
    expect(screen.getByText("Claude Hooks")).toBeInTheDocument();
    expect(screen.getByText("Codex Hooks")).toBeInTheDocument();
    expect(screen.getByText(/hooks,disableAllHooks/)).toBeInTheDocument();
    expect(screen.getByText(/allowManagedHooksOnly/)).toBeInTheDocument();
    expect(screen.getByText(/^hooks$/)).toBeInTheDocument();
    expect(screen.getByTestId("config-codex-hooks")).toHaveTextContent("hooks.json");
  });
});
