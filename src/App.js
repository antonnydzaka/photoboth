import './App.css';
import React from "react";
import Photobooth from "./components/Photobooth";
import "./styles/global.css"
import ErrorBoundary from "./components/ErrorBoundary";
function App() {
  return (
    <ErrorBoundary>
      <Photobooth />
    </ErrorBoundary>
  );
}

export default App;
