import './App.css';
import React from "react";
import Photobooth from "./components/Photobooth";
import "./styles/global.css"
const logoSrc = "/assets/logo/jiggleduo-logo.png";

function App() {
  return (
    <div className="App" style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    }}>
      <div style={{
        width: "100%",
        maxWidth: 1200,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "20px 32px"
      }}>
        <img src={logoSrc} alt="JiggleDuo Logo" style={{ width: 80 }} />
        <h1 style={{
          fontFamily: "CantikaCute",
          color: "#8c5b4a",
          margin: 0,
          fontSize: 56,
          letterSpacing: 1,
        }}>
          Antonny Photobooth
        </h1>
      </div>

      <div style={{
        flex: 1,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: "40px"
      }}
      >

        <Photobooth />

      </div>
    </div>
  );
}

export default App;
