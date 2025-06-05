// src/utils/storage.ts

export const STORAGE_KEYS = {
  PRODUCT_CATEGORIES: "product_categories",
  RESOLUTION_TYPES: "resolution_types"
};

export const saveToLocal = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error("Error saving to localStorage:", err);
  }
};

export const loadFromLocal = (key: string): any[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Error loading from localStorage:", err);
    return [];
  }
};
