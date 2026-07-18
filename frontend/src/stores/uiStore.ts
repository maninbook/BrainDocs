import { create } from 'zustand'

interface IngestionProgress {
  paperId: string
  stage: string
  progress: number
  message: string
}

interface UIStore {
  sidebarOpen: boolean
  detailPanelOpen: boolean
  activeWorkspaceId: string | null
  ingestionQueue: Record<string, IngestionProgress>

  toggleSidebar: () => void
  toggleDetailPanel: () => void
  openDetailPanel: () => void
  closeDetailPanel: () => void
  setActiveWorkspace: (id: string) => void
  updateIngestionProgress: (progress: IngestionProgress) => void
  removeIngestionProgress: (paperId: string) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  detailPanelOpen: false,
  activeWorkspaceId: null,
  ingestionQueue: {},

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
  openDetailPanel: () => set({ detailPanelOpen: true }),
  closeDetailPanel: () => set({ detailPanelOpen: false }),
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  updateIngestionProgress: (progress) =>
    set((s) => ({
      ingestionQueue: { ...s.ingestionQueue, [progress.paperId]: progress },
    })),

  removeIngestionProgress: (paperId) =>
    set((s) => {
      const q = { ...s.ingestionQueue }
      delete q[paperId]
      return { ingestionQueue: q }
    }),
}))
