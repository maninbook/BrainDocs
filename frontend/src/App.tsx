import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import WorkspacePage from '@/pages/WorkspacePage'
import HomePage from '@/pages/HomePage'
import PaperPage from '@/pages/PaperPage'
import ExplorePage from '@/pages/ExplorePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workspace/:workspaceId" element={<WorkspacePage />} />
        <Route path="/workspace/:workspaceId/paper/:paperId" element={<PaperPage />} />
        <Route path="/workspace/:workspaceId/explore" element={<ExplorePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
