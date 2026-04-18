import { create } from "zustand";
import { getTags, type Tag } from "../lib/tauri";

interface CategoryStore {
  categories: Tag[];
  /** tag.name → Tag, for O(1) lookup */
  categoryMap: Map<string, Tag>;
  loadCategories: () => Promise<void>;
}

export const useCategoryStore = create<CategoryStore>((set) => ({
  categories: [],
  categoryMap: new Map(),
  loadCategories: async () => {
    try {
      const tags = await getTags();
      set({
        categories: tags,
        categoryMap: new Map(tags.map((t) => [t.name, t])),
      });
    } catch {
      // vault not open yet — ignore
    }
  },
}));

