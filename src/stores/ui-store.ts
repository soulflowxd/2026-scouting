import { create } from "zustand"

type UiState = {
  activeTab: string
  isSidebarOpen: boolean
  selectedItemId: string | null
  setActiveTab: (activeTab: string) => void
  setSelectedItemId: (selectedItemId: string | null) => void
  toggleSidebar: () => void
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "default",
  isSidebarOpen: false,
  selectedItemId: null,
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedItemId: (selectedItemId) => set({ selectedItemId }),
  toggleSidebar: () =>
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}))
