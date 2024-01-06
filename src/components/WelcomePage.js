import React, { useEffect,useState } from "react";
import Select from "react-select";
import { useLocation } from "react-router-dom";

const WelcomePage = () => {

    const location = useLocation()
    const searchParams = new URLSearchParams(location.search)
    const redirectUrl = searchParams.get('redirectUrl')

    const handleProceed = () => {
        window.open(redirectUrl)
    }

    return (
        <div className="welcome-page">
            <div className="welcome-container">
                <div className="text">
                    <h1>Instalace dokončena</h1>
                    <p>
                        Děkujeme za instalaci aplikace. Aplikace byla úspěšně nainstalována <br/>
                        Pro správné fungování je nutné nastavit, do kterého z polí se bude doplňovat oslovení. Bez toho bychom nevěděli, do kterého pole hodnotu doplnit
                        a aplikace nebude správně fungovat.
                    </p>
                </div>  
                <div className="iframe-container">
                    <iframe
                    title="iframe" 
                    webkitallowfullscreen 
                    mozallowfullscreen 
                    allowfullscreen
                    src="https://www.loom.com/embed/d32473f0f77646ec93d26dba9da2df0e?sid=62a70dfe-28ef-4bf1-9199-a250191a22d7">
                    </iframe>
                </div>
                <button onClick={handleProceed}>Pokračovat do pipedrive</button>
            </div>
        </div>
    )
}

export default WelcomePage;