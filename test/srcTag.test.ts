import { describe, expect, it } from "vitest";
import { srcTag } from "../src/srcTag";

describe("srcTag", () => {
  it("reads a listing slug and lowercases it", () => {
    expect(srcTag("https://mcp.getstorra.com/creators?src=Smithery")).toBe(
      "smithery",
    );
    expect(srcTag("https://brands-mcp.getstorra.com/?src=pulse.mcp_1")).toBe(
      "pulse.mcp_1",
    );
  });
  it("is empty when absent, blank or malformed", () => {
    expect(srcTag("https://mcp.getstorra.com/brands")).toBe("");
    expect(srcTag("https://mcp.getstorra.com/brands?src=")).toBe("");
    expect(srcTag("https://mcp.getstorra.com/brands?src=a%20b")).toBe("");
    expect(
      srcTag(`https://mcp.getstorra.com/brands?src=${"x".repeat(33)}`),
    ).toBe("");
  });
});
