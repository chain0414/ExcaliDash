import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateGallery } from "./TemplateGallery";
import * as api from "../../api";

vi.mock("../../api", () => ({
  getTemplates: vi.fn(),
  createDrawingFromTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

const template = {
  id: "template-1",
  name: "Article diagram",
  preview: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const renderGallery = () => render(
  <MemoryRouter initialEntries={["/templates"]}>
    <Routes>
      <Route path="/templates" element={<TemplateGallery />} />
      <Route path="/editor/:id" element={<p>Independent drawing opened</p>} />
      <Route path="/templates/:id/edit" element={<p>Template editor opened</p>} />
    </Routes>
  </MemoryRouter>,
);

describe("TemplateGallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getTemplates).mockResolvedValue([template]);
  });

  it("creates a new drawing from a template and opens its editor", async () => {
    vi.mocked(api.createDrawingFromTemplate).mockResolvedValue({ id: "drawing-2" } as Awaited<ReturnType<typeof api.createDrawingFromTemplate>>);
    renderGallery();
    expect(await screen.findByText("Article diagram")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /use template/i }));

    expect(await screen.findByText("Independent drawing opened")).toBeInTheDocument();
    expect(api.createDrawingFromTemplate).toHaveBeenCalledWith("template-1");
  });

  it("deletes only the template after confirmation", async () => {
    vi.mocked(api.deleteTemplate).mockResolvedValue(undefined);
    renderGallery();
    expect(await screen.findByText("Article diagram")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete template Article diagram" }));
    expect(screen.getByText(/drawings created from it will remain available/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Template" }));

    await waitFor(() => expect(api.deleteTemplate).toHaveBeenCalledWith("template-1"));
    expect(await screen.findByText("No templates yet")).toBeInTheDocument();
  });

  it("opens the template itself for editing", async () => {
    renderGallery();
    expect(await screen.findByText("Article diagram")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit template Article diagram" }));
    expect(await screen.findByText("Template editor opened")).toBeInTheDocument();
    expect(api.createDrawingFromTemplate).not.toHaveBeenCalled();
  });
});
