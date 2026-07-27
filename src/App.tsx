import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { FiltersProvider } from './context/FiltersContext'
import { LeagueProvider } from './context/LeagueContext'
import { MetaProvider } from './context/MetaContext'
import MarketOverview from './pages/MarketOverview'
import './App.css'

function App() {
  return (
    <MetaProvider>
      <LeagueProvider>
        <FiltersProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<MarketOverview />} />
            </Routes>
          </BrowserRouter>
        </FiltersProvider>
      </LeagueProvider>
    </MetaProvider>
  )
}

export default App
