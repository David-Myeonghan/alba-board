import { Route, Routes } from 'react-router-dom'
import { JobDetail } from './pages/JobDetail'
import { JobList } from './pages/JobList'

function App() {
  return (
    <Routes>
      <Route path="/" element={<JobList />} />
      <Route path="/jobs/:id" element={<JobDetail />} />
    </Routes>
  )
}

export default App
