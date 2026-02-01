import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import { BookList } from './pages/BookList';
import { BookReader } from './pages/BookReader';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookList />} />
        <Route path="/book/:id" element={<BookReader />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
