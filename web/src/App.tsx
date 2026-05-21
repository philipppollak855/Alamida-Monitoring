import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { BoardPage } from './pages/BoardPage';
import { WallPage } from './pages/WallPage';

export function App() {
  const location = useLocation();
  const isWall = location.pathname.startsWith('/wall');

  return (
    <>
      {!isWall && (
        <header className="app-header">
          <h1>Alamida Monitoring</h1>
          <nav className="nav-links">
            <Link to="/">Disposition</Link>
            <Link to="/wall">Wandmonitor</Link>
          </nav>
        </header>
      )}
      <main style={isWall ? { padding: 0, maxWidth: 'none' } : undefined}>
        <Routes>
          <Route path="/" element={<BoardPage />} />
          <Route path="/wall" element={<WallPage />} />
        </Routes>
      </main>
    </>
  );
}
