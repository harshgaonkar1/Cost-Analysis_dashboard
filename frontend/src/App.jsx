import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./Navbar";
import Home from "./Home";
import Compilation from "./Compilation";

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-0 flex-1 flex-col">
        <Navbar />
        <main className="flex min-h-0 flex-1 flex-col">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/compilation" element={<Compilation />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
