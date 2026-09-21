import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import * as api from "../../api";

vi.mock("../../api", () => ({ createTemplate: vi.fn() }));

const drawing = {
  id: "drawing-1",
  name: "Agent diagram",
  collectionId: null,
  createdAt: 100,
  updatedAt: 200,
  version: 1,
};

describe("SaveTemplateDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("takes a named snapshot of the source drawing", async () => {
    vi.mocked(api.createTemplate).mockResolvedValue({ id: "template-1", name: "My template", preview: null, createdAt: 100, updatedAt: 200 });
    const onSaved = vi.fn();
    render(<SaveTemplateDialog drawing={drawing} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "My template" } });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() => expect(api.createTemplate).toHaveBeenCalledWith("drawing-1", "My template"));
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open when saving fails", async () => {
    vi.mocked(api.createTemplate).mockRejectedValue(new Error("offline"));
    const onSaved = vi.fn();
    render(<SaveTemplateDialog drawing={drawing} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save this template");
    expect(onSaved).not.toHaveBeenCalled();
  });
});
