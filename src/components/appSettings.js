import React from "react";
import IframeComponent from "./IframeComponent";
import WelcomePage from "./WelcomePage";
import '../style.css';
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";


function AppSettings() {

  return  (
    <Router>
      <Routes>
        <Route path="/" element={ <IframeComponent/> } />
        <Route path="/welcome" element={ <WelcomePage/>} />
      </Routes>
    </Router>
    );
  }

export default AppSettings