import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToolbarAssetButton } from "./ToolbarAssetButton";

const roots: HTMLDivElement[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => root.remove());
});

describe("ToolbarAssetButton", () => {
  it("places the icon trigger immediately after the eraser and opens the existing panel", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="App-toolbar"><div><label><input data-testid="toolbar-eraser" /></label><div class="App-toolbar__divider"></div></div></div>';
    document.body.append(root);
    roots.push(root);
    const onToggle = vi.fn();

    const view = render(
      <ToolbarAssetButton editorContainerRef={{ current: root }} isOpen={false} onToggle={onToggle} />,
    );

    const eraser = root.querySelector('[data-testid="toolbar-eraser"]')!.closest("label")!;
    const button = await screen.findByRole("button", { name: "手绘图标库" });
    expect(eraser.nextElementSibling?.contains(button)).toBe(true);
    expect(eraser.nextElementSibling?.nextElementSibling?.className).toBe("App-toolbar__divider");

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();

    const replacement = document.createElement("label");
    replacement.innerHTML = '<input data-testid="toolbar-eraser" />';
    eraser.replaceWith(replacement);
    await waitFor(() => expect(replacement.nextElementSibling?.contains(button)).toBe(true));

    view.unmount();
    expect(root.querySelector(".excalidash-asset-toolbar-slot")).toBeNull();
  });
});
