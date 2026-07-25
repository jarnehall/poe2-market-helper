import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { CategoryProvider } from './context/CategoryContext'
import { CurrentDayProvider } from './context/CurrentDayContext'
import { LeagueProvider } from './context/LeagueContext'
import { PairCurrencyProvider } from './context/PairCurrencyContext'
import { TrendWindowProvider } from './context/TrendWindowContext'
import MarketOverview from './pages/MarketOverview'
import './App.css'

function App() {
  return (
    <LeagueProvider>
      <CategoryProvider>
        <PairCurrencyProvider>
          <CurrentDayProvider>
            <TrendWindowProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<MarketOverview />} />
                </Routes>
              </BrowserRouter>
            </TrendWindowProvider>
          </CurrentDayProvider>
        </PairCurrencyProvider>
      </CategoryProvider>
    </LeagueProvider>
  )
}

export default App
