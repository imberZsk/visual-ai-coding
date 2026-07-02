import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inferPluginName, listSkills, parseSkillMarkdown, refineSource } from "../../src/core/skills.js";

// makeTempRoot 创建隔离扫描根目录，供 Skill 扫描测试使用。
function makeTempRoot() {
  // dir 存储当前测试使用的唯一临时目录。
  const dir = join(tmpdir(), `visual-aicoding-skills-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("core skills", () => {
  // 验证 front matter 中的 name 与 description 会被正确提取。
  it("parses skill front matter", () => {
    expect(parseSkillMarkdown("---\nname: brainstorming\ndescription: \"Explore ideas.\"\n---\n# Body", "fallback")).toEqual({
      name: "brainstorming",
      description: "Explore ideas.",
    });
  });

  // 验证缺少 name 时使用目录名兜底。
  it("falls back to the directory name when skill name is missing", () => {
    expect(parseSkillMarkdown("# Skill\n\nBody", "local-skill")).toEqual({
      name: "local-skill",
      description: "",
    });
  });

  // 验证 Codex 插件缓存路径能推断出 plugin@marketplace。
  it("infers Codex plugin names from cache paths", () => {
    // root 存储 Codex 插件缓存根目录。
    const root = "/Users/test/.codex/plugins/cache";
    // skillFile 存储某个插件 Skill 的典型路径。
    const skillFile = `${root}/superpowers-dev/superpowers/6.0.3/skills/brainstorming/SKILL.md`;

    expect(inferPluginName(root, "Codex 插件", skillFile)).toBe("superpowers@superpowers-dev");
  });

  // 验证 Codex system skill 来源会被细化显示。
  it("refines Codex system skill sources", () => {
    expect(refineSource("Codex 用户", "/Users/test/.codex/skills/.system/openai-docs/SKILL.md")).toBe("Codex 系统");
  });

  // 验证列表扫描能读取用户 skill 并返回稳定字段。
  it("lists skills from configured roots", () => {
    // claudeHome 存储测试专属 Claude home。
    const claudeHome = makeTempRoot();
    // skillDir 存储测试 Skill 目录。
    const skillDir = join(claudeHome, "skills", "writer");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillDir + "/SKILL.md", "---\nname: writer\ndescription: Write docs.\n---\n");

    // result 存储扫描结果。
    const result = listSkills(claudeHome, "");
    // writerSkill 存储测试创建的 Skill，避免真实 Agents skill 影响排序位置。
    const writerSkill = result.skills.find((skill) => skill.name === "writer");

    expect(writerSkill).toMatchObject({
      name: "writer",
      description: "Write docs.",
      source: "Claude 用户",
      tool: "claude",
      plugin: "",
    });
    rmSync(claudeHome, { recursive: true, force: true });
  });
});
