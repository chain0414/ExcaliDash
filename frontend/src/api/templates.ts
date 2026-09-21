import { api } from "./client";
import type { Drawing, DrawingTemplate } from "../types";

export const getTemplates = async (): Promise<DrawingTemplate[]> => {
  const response = await api.get<{ templates: DrawingTemplate[] }>("/templates");
  return response.data.templates;
};

export const createTemplate = async (drawingId: string, name: string): Promise<DrawingTemplate> => {
  const response = await api.post<{ template: DrawingTemplate }>("/templates", { drawingId, name });
  return response.data.template;
};

export const createDrawingFromTemplate = async (templateId: string, name?: string): Promise<Drawing> => {
  const response = await api.post<Drawing>(`/templates/${templateId}/create-drawing`, { name });
  return response.data;
};

export const deleteTemplate = async (templateId: string): Promise<void> => {
  await api.delete(`/templates/${templateId}`);
};
